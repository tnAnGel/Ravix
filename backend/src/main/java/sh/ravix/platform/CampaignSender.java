package sh.ravix.platform;

import io.quarkus.panache.common.Sort;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.OffsetDateTime;
import java.util.List;
import org.jboss.logging.Logger;
import sh.ravix.entity.Campaign;
import sh.ravix.entity.CampaignRecipient;
import sh.ravix.entity.Mailbox;
import sh.ravix.entity.Segment;

/**
 * Background worker that delivers campaigns at a throttled rate. Runs every
 * {@value #INTERVAL_SECONDS}s: promotes scheduled campaigns, materialises their
 * audience into per-recipient rows, and injects a rate-limited batch into the
 * host MTA via {@link MailSender}.
 */
@ApplicationScoped
public class CampaignSender {

    private static final Logger LOG = Logger.getLogger(CampaignSender.class);
    private static final int INTERVAL_SECONDS = 20;
    private static final int RUNS_PER_HOUR = 3600 / INTERVAL_SECONDS;

    @Inject
    MailSender mailSender;

    @Inject
    ReputationService reputation;

    @Scheduled(every = "20s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    void tick() {
        promoteScheduled();
        for (Campaign c : Campaign.<Campaign>list("status", "sending")) {
            processCampaign(c);
        }
    }

    /** Move scheduled campaigns whose time has come into the sending state. */
    private void promoteScheduled() {
        OffsetDateTime now = OffsetDateTime.now();
        List<Campaign> due = Campaign.list(
                "status = 'scheduled' and scheduledAt is not null and scheduledAt <= ?1", now);
        for (Campaign c : due) {
            startSending(c);
        }
    }

    /** Begin sending a campaign now: materialise recipients and flip status. */
    public void startSending(Campaign c) {
        materialiseRecipients(c);
        c.status = "sending";
        c.sentAt = OffsetDateTime.now();
        c.updatedAt = OffsetDateTime.now();
    }

    private void processCampaign(Campaign c) {
        long pending = CampaignRecipient.count("campaignId = ?1 and status = 'pending'", c.id);
        if (pending == 0) {
            c.status = "completed";
            c.updatedAt = OffsetDateTime.now();
            return;
        }

        int batch = Math.max(1, c.ratePerHour / RUNS_PER_HOUR);
        // Enforce the warm-up daily cap across all campaigns.
        long remainingToday = (long) reputation.currentDailyCap() - reputation.sentToday();
        if (remainingToday <= 0) {
            return; // daily warm-up cap reached; resume tomorrow
        }
        batch = (int) Math.min(batch, remainingToday);

        List<CampaignRecipient> rcpts = CampaignRecipient.<CampaignRecipient>find(
                "campaignId = ?1 and status = 'pending'", Sort.by("id"), c.id)
                .page(0, batch).list();

        boolean canSend = mailSender.isAvailable();
        for (CampaignRecipient r : rcpts) {
            // Never send to a known complainer (FBL suppression).
            if (reputation.isSuppressed(r.email)) {
                r.status = "unsubscribed";
                r.error = "suppressed (prior complaint)";
                r.sentAt = OffsetDateTime.now();
                continue;
            }
            boolean ok;
            if (canSend) {
                ok = mailSender.send(c.sender, r.email, c.subject, renderBody(c, r));
            } else {
                ok = true; // dev host without an MTA — record as sent (simulated)
            }
            r.status = ok ? "sent" : "failed";
            r.sentAt = OffsetDateTime.now();
            if (!ok) {
                r.error = "MTA injection failed";
                c.failed += 1;
            } else {
                c.sent += 1;
                c.delivered += 1; // accepted by the MTA; bounces update this later
            }
        }
        c.updatedAt = OffsetDateTime.now();

        if (CampaignRecipient.count("campaignId = ?1 and status = 'pending'", c.id) == 0) {
            c.status = "completed";
        }
    }

    private String renderBody(Campaign c, CampaignRecipient r) {
        String body = c.body == null ? "" : c.body;
        String name = r.name != null && !r.name.isBlank() ? r.name : r.email;
        body = body.replace("{{name}}", name).replace("{{email}}", r.email);
        return injectTracking(body, r.trackingId);
    }

    /** Public base URL for tracking links, e.g. https://mail.example.com. Empty
     *  when the panel doesn't know its hostname (then tracking is skipped). */
    private String trackingBase() {
        sh.ravix.entity.AppSetting h = sh.ravix.entity.AppSetting.findById("hostname");
        if (h == null || h.value == null || h.value.isBlank()) return "";
        return "https://" + h.value.trim();
    }

    private static final java.util.regex.Pattern HREF =
            java.util.regex.Pattern.compile("href=\"(https?://[^\"]+)\"",
                    java.util.regex.Pattern.CASE_INSENSITIVE);

    /** Rewrite links through the click tracker and append an open pixel. */
    private String injectTracking(String html, String trackingId) {
        String base = trackingBase();
        if (base.isEmpty() || trackingId == null) return html;

        java.util.regex.Matcher m = HREF.matcher(html);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String url = m.group(1);
            String enc = java.net.URLEncoder.encode(url, java.nio.charset.StandardCharsets.UTF_8);
            String tracked = base + "/api/t/c/" + trackingId + "?u=" + enc;
            m.appendReplacement(sb,
                    java.util.regex.Matcher.quoteReplacement("href=\"" + tracked + "\""));
        }
        m.appendTail(sb);

        String pixel = "<img src=\"" + base + "/api/t/o/" + trackingId
                + "\" width=\"1\" height=\"1\" alt=\"\" style=\"display:none\">";
        String out = sb.toString();
        int idx = out.toLowerCase().lastIndexOf("</body>");
        return idx >= 0 ? out.substring(0, idx) + pixel + out.substring(idx) : out + pixel;
    }

    /** Resolve a campaign's audience into recipient rows if not already present. */
    public void materialiseRecipients(Campaign c) {
        if (CampaignRecipient.count("campaignId", c.id) > 0) {
            return; // already materialised (e.g. an imported list)
        }
        List<Mailbox> targets = resolveAudience(c);
        for (Mailbox m : targets) {
            CampaignRecipient r = new CampaignRecipient();
            r.campaignId = c.id;
            r.email = m.email;
            r.name = m.displayName;
            r.status = "pending";
            r.trackingId = sh.ravix.util.Ids.generate("trk");
            r.persist();
        }
        c.recipients = targets.size();
    }

    private List<Mailbox> resolveAudience(Campaign c) {
        return audienceFor(c.audienceType, c.audienceRef);
    }

    /** Resolve the active mailboxes targeted by an audience type + reference. */
    public List<Mailbox> audienceFor(String type, String ref) {
        switch (type == null ? "all" : type) {
            case "domain":
                return Mailbox.list("domain = ?1 and status = 'active'", ref);
            case "segment": {
                Segment seg = Segment.findById(ref);
                if (seg == null) return List.of();
                return resolveSegment(seg);
            }
            case "all":
            default:
                return Mailbox.list("status", "active");
        }
    }

    private List<Mailbox> resolveSegment(Segment seg) {
        String type = seg.type == null ? "all" : seg.type;
        switch (type) {
            case "domain":
                return Mailbox.list("domain = ?1 and status = 'active'", seg.filterValue);
            case "status":
                return Mailbox.list("status", seg.filterValue);
            case "all":
            default:
                return Mailbox.list("status", "active");
        }
    }
}
