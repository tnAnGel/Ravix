package sh.ravix.rest;

import io.quarkus.panache.common.Sort;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import sh.ravix.entity.DmarcRecord;
import sh.ravix.entity.DmarcReport;
import sh.ravix.entity.Event;
import sh.ravix.platform.DmarcService;

/** DMARC aggregate-report ingestion and analytics. */
@Path("/api/dmarc")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DmarcResource {

    @Inject
    DmarcService dmarc;

    public record IngestRequest(String filename, String contentBase64) {}

    /** Upload a report file (xml / .gz / .zip) as base64. */
    @POST
    @Path("/ingest")
    @Transactional
    public Response ingest(IngestRequest req) {
        if (req == null || req.contentBase64() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "no_content")).build();
        }
        byte[] raw = Base64.getDecoder().decode(req.contentBase64().replaceAll("\\s", ""));
        DmarcReport report = dmarc.ingest(raw);
        if (report == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "parse_failed_or_duplicate")).build();
        }
        Event.persist(DomainResource.event("domain", "info",
                "DMARC report ingested for " + report.domain + " (" + report.totalCount + " messages)"));
        return Response.ok(report).build();
    }

    @GET
    @Path("/reports")
    @Transactional
    public List<DmarcReport> reports(@QueryParam("domain") String domain) {
        if (domain != null && !domain.isBlank()) {
            return DmarcReport.list("domain", Sort.by("receivedAt").descending(), domain);
        }
        return DmarcReport.listAll(Sort.by("receivedAt").descending());
    }

    @GET
    @Path("/reports/{id}/records")
    @Transactional
    public List<DmarcRecord> records(@PathParam("id") String id) {
        return DmarcRecord.list("reportId", Sort.by("count").descending(), id);
    }

    /** Per-domain aggregate summary: totals and DMARC pass rate. */
    @GET
    @Path("/summary")
    @Transactional
    public List<Map<String, Object>> summary() {
        List<DmarcReport> all = DmarcReport.listAll();
        Map<String, long[]> byDomain = new LinkedHashMap<>(); // domain -> [total, pass, fail, reports]
        for (DmarcReport r : all) {
            long[] agg = byDomain.computeIfAbsent(r.domain, k -> new long[4]);
            agg[0] += r.totalCount;
            agg[1] += r.passCount;
            agg[2] += r.failCount;
            agg[3] += 1;
        }
        return byDomain.entrySet().stream().map(e -> {
            long[] a = e.getValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("domain", e.getKey());
            m.put("total", a[0]);
            m.put("pass", a[1]);
            m.put("fail", a[2]);
            m.put("reports", a[3]);
            m.put("passRate", a[0] == 0 ? 100 : Math.round(a[1] * 100.0 / a[0]));
            return m;
        }).toList();
    }

    /** Top sending sources across all reports, with pass/fail split. */
    @GET
    @Path("/sources")
    @Transactional
    public List<Map<String, Object>> sources() {
        Map<String, long[]> byIp = new LinkedHashMap<>(); // ip -> [count, pass, fail]
        for (DmarcRecord r : DmarcRecord.<DmarcRecord>listAll()) {
            long[] agg = byIp.computeIfAbsent(r.sourceIp, k -> new long[3]);
            agg[0] += r.count;
            if (r.aligned) agg[1] += r.count; else agg[2] += r.count;
        }
        return byIp.entrySet().stream()
                .sorted((x, y) -> Long.compare(y.getValue()[0], x.getValue()[0]))
                .limit(50)
                .map(e -> {
                    long[] a = e.getValue();
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("sourceIp", e.getKey());
                    m.put("count", a[0]);
                    m.put("pass", a[1]);
                    m.put("fail", a[2]);
                    return m;
                }).toList();
    }
}
