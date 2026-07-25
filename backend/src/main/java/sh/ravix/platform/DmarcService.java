package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.zip.GZIPInputStream;
import java.util.zip.ZipInputStream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.jboss.logging.Logger;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import sh.ravix.entity.DmarcRecord;
import sh.ravix.entity.DmarcReport;
import sh.ravix.util.Ids;

/**
 * Parses DMARC aggregate (RUA) reports — RFC 7489 XML, optionally gzip- or
 * zip-compressed — and stores them. Dependency-free (JDK XML + java.util.zip).
 */
@ApplicationScoped
public class DmarcService {

    private static final Logger LOG = Logger.getLogger(DmarcService.class);

    /** Decompress if needed, parse, and persist. Returns the stored report or null. */
    @Transactional
    public DmarcReport ingest(byte[] raw) {
        try {
            byte[] xml = decompress(raw);
            return parseAndStore(new String(xml, java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) {
            LOG.warnf("Failed to ingest DMARC report: %s", e.getMessage());
            return null;
        }
    }

    private byte[] decompress(byte[] data) throws Exception {
        if (data.length > 2 && (data[0] & 0xff) == 0x1f && (data[1] & 0xff) == 0x8b) {
            try (GZIPInputStream gz = new GZIPInputStream(new ByteArrayInputStream(data))) {
                return gz.readAllBytes();
            }
        }
        if (data.length > 1 && data[0] == 'P' && data[1] == 'K') {
            try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(data))) {
                if (zip.getNextEntry() != null) {
                    return zip.readAllBytes();
                }
            }
        }
        return data; // plain XML
    }

    @Transactional
    public DmarcReport parseAndStore(String xml) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        Document doc;
        try (InputStream in = new ByteArrayInputStream(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            doc = dbf.newDocumentBuilder().parse(in);
        }
        doc.getDocumentElement().normalize();

        String orgName = text(doc, "org_name");
        String reportId = text(doc, "report_id");
        String domain = first(doc, "policy_published") instanceof Element pp
                ? childText(pp, "domain") : null;
        OffsetDateTime begin = epoch(text(doc, "begin"));
        OffsetDateTime end = epoch(text(doc, "end"));

        // Dedup by (org_name, report_id).
        if (reportId != null && DmarcReport.count("orgName = ?1 and reportId = ?2", orgName, reportId) > 0) {
            return null;
        }

        DmarcReport report = new DmarcReport();
        report.id = Ids.generate("dmarc");
        report.domain = domain == null ? "unknown" : domain;
        report.orgName = orgName;
        report.reportId = reportId;
        report.dateBegin = begin;
        report.dateEnd = end;
        report.receivedAt = OffsetDateTime.now();
        report.persist();

        int total = 0, pass = 0, fail = 0;
        NodeList records = doc.getElementsByTagName("record");
        for (int i = 0; i < records.getLength(); i++) {
            Element rec = (Element) records.item(i);
            Element row = child(rec, "row");
            Element policy = row == null ? null : child(row, "policy_evaluated");
            Element ident = child(rec, "identifiers");

            int count = parseInt(row == null ? null : childText(row, "count"));
            String dkim = policy == null ? null : childText(policy, "dkim");
            String spf = policy == null ? null : childText(policy, "spf");
            String disposition = policy == null ? null : childText(policy, "disposition");
            boolean aligned = "pass".equalsIgnoreCase(dkim) || "pass".equalsIgnoreCase(spf);

            DmarcRecord r = new DmarcRecord();
            r.reportId = report.id;
            r.sourceIp = row == null ? "" : childText(row, "source_ip");
            r.count = count;
            r.disposition = disposition;
            r.dkimResult = dkim;
            r.spfResult = spf;
            r.headerFrom = ident == null ? null : childText(ident, "header_from");
            r.aligned = aligned;
            r.persist();

            total += count;
            if (aligned) pass += count; else fail += count;
        }
        report.totalCount = total;
        report.passCount = pass;
        report.failCount = fail;
        return report;
    }

    // --- XML helpers -------------------------------------------------------

    private static Node first(Document doc, String tag) {
        NodeList n = doc.getElementsByTagName(tag);
        return n.getLength() > 0 ? n.item(0) : null;
    }

    private static String text(Document doc, String tag) {
        NodeList n = doc.getElementsByTagName(tag);
        return n.getLength() > 0 ? n.item(0).getTextContent().trim() : null;
    }

    private static Element child(Element parent, String tag) {
        NodeList n = parent.getElementsByTagName(tag);
        return n.getLength() > 0 ? (Element) n.item(0) : null;
    }

    private static String childText(Element parent, String tag) {
        Element c = child(parent, tag);
        return c == null ? null : c.getTextContent().trim();
    }

    private static int parseInt(String s) {
        try { return s == null ? 0 : Integer.parseInt(s.trim()); }
        catch (NumberFormatException e) { return 0; }
    }

    private static OffsetDateTime epoch(String s) {
        try {
            return s == null ? null
                    : OffsetDateTime.ofInstant(Instant.ofEpochSecond(Long.parseLong(s.trim())), ZoneOffset.UTC);
        } catch (Exception e) {
            return null;
        }
    }
}
