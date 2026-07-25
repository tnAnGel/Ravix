package sh.ravix.rest;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.jboss.logging.Logger;
import sh.ravix.entity.ApiKey;
import sh.ravix.platform.ApiKeyService;
import sh.ravix.platform.MailComposer;
import sh.ravix.platform.ReputationService;

/**
 * SendGrid-compatible transactional send API. A client that already speaks
 * SendGrid's {@code POST /v3/mail/send} works against Ravix unchanged: point
 * its base URL here and use a Ravix API key as the Bearer token.
 *
 * Auth is the API key (NOT the panel session), so this is allow-listed in
 * AuthFilter and validates the Bearer key itself.
 *
 * Mounted under /api so it rides the existing nginx /api/ proxy. A SendGrid
 * client just sets its host/base-URL to {@code https://<your-host>/api} and
 * keeps the standard {@code /v3/mail/send} path + Bearer auth.
 */
@Path("/api/v3/mail")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class TransactionalApiResource {

    private static final Logger LOG = Logger.getLogger(TransactionalApiResource.class);

    @Inject ApiKeyService keys;
    @Inject MailComposer composer;
    @Inject ReputationService reputation;

    @POST
    @Path("/send")
    public Response send(@Context HttpHeaders headers, JsonNode body) {
        // --- auth: Bearer <api key> ---
        String auth = headers.getHeaderString("Authorization");
        String presented = auth != null && auth.startsWith("Bearer ")
                ? auth.substring(7).trim() : null;
        Optional<ApiKey> keyOpt = keys.verify(presented);
        if (keyOpt.isEmpty()) {
            return Response.status(401)
                    .entity(err("authorization required", "Provide a valid Ravix API key as a Bearer token."))
                    .build();
        }
        ApiKey key = keyOpt.get();

        // --- rate limit: respect the warm-up / reputation daily cap ---
        int cap = reputation.currentDailyCap();
        if (cap > 0 && reputation.sentToday() >= cap) {
            return Response.status(429)
                    .entity(err("daily sending limit reached",
                            "Today's cap of " + cap + " messages has been hit (warm-up / reputation). "
                          + "Raise it in Reputation settings or wait until tomorrow."))
                    .build();
        }

        try {
            // --- parse the SendGrid payload ---
            JsonNode from = body.get("from");
            String fromAddr = from != null ? text(from, "email") : null;
            String fromName = from != null ? text(from, "name") : null;
            String topSubject = text(body, "subject");

            // content[]: prefer text/html, fall back to text/plain.
            String html = null, textBody = null;
            JsonNode content = body.get("content");
            if (content != null && content.isArray()) {
                for (JsonNode c : content) {
                    String type = text(c, "type");
                    String value = text(c, "value");
                    if ("text/html".equalsIgnoreCase(type)) html = value;
                    else if ("text/plain".equalsIgnoreCase(type)) textBody = value;
                }
            }

            JsonNode personalizations = body.get("personalizations");
            if (personalizations == null || !personalizations.isArray() || personalizations.isEmpty()) {
                return Response.status(400)
                        .entity(err("personalizations required", "Provide at least one personalization with a 'to'."))
                        .build();
            }
            if (fromAddr == null || fromAddr.isBlank()) {
                return Response.status(400)
                        .entity(err("from.email required", "Set the sender address.")).build();
            }

            int accepted = 0;
            for (JsonNode pers : personalizations) {
                String to = joinAddrs(pers.get("to"));
                String cc = joinAddrs(pers.get("cc"));
                String bcc = joinAddrs(pers.get("bcc"));
                String subject = pers.has("subject") ? text(pers, "subject") : topSubject;
                if (to == null || to.isBlank()) continue;

                // Suppress addresses on the bounce/complaint list.
                List<String> recipients = new ArrayList<>();
                for (String r : to.split(",")) {
                    String addr = r.trim();
                    if (!addr.isEmpty() && !reputation.isSuppressed(addr)) recipients.add(addr);
                }
                if (recipients.isEmpty()) continue;

                var draft = new MailComposer.Draft(
                        fromAddr, fromName,
                        String.join(", ", recipients), cc, bcc,
                        subject, html, textBody,
                        null, List.of(), List.of());
                boolean ok = composer.send(draft);
                if (ok) accepted++;
            }

            keys.recordSend(key.id);
            // SendGrid returns 202 Accepted with an X-Message-Id header.
            return Response.status(202)
                    .header("X-Message-Id", java.util.UUID.randomUUID().toString())
                    .entity(Map.of("accepted", accepted))
                    .build();
        } catch (Exception e) {
            LOG.warnf("transactional send failed: %s", e.getMessage());
            return Response.status(500).entity(err("send failed", e.getMessage())).build();
        }
    }

    // --- helpers -----------------------------------------------------------

    private static Map<String, Object> err(String message, String detail) {
        // SendGrid error envelope shape: { errors: [{ message, ... }] }.
        return Map.of("errors", List.of(Map.of("message", message, "help", detail)));
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static String joinAddrs(JsonNode arr) {
        if (arr == null || !arr.isArray()) return null;
        List<String> out = new ArrayList<>();
        for (JsonNode a : arr) {
            String email = text(a, "email");
            if (email != null && !email.isBlank()) out.add(email.trim());
        }
        return out.isEmpty() ? null : String.join(", ", out);
    }
}
