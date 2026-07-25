package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import sh.ravix.entity.CampaignRecipient;
import sh.ravix.entity.FblComplaint;
import sh.ravix.entity.WarmupConfig;

/**
 * Sending reputation: a warm-up ramp that caps daily volume for new IPs, plus
 * a live reputation score derived from real delivery, bounce and complaint
 * rates over the trailing 30 days. FBL complaints double as a suppression list.
 */
@ApplicationScoped
public class ReputationService {

    /** Standard 30-day warm-up multipliers (fraction of the daily target). */
    private static final double[] RAMP = {
        0.002, 0.004, 0.006, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07,
        0.10, 0.13, 0.16, 0.20, 0.25, 0.30, 0.36, 0.43, 0.50, 0.58,
        0.66, 0.74, 0.82, 0.90, 0.95, 0.97, 0.98, 0.99, 0.995, 1.0
    };

    public record Warmup(boolean enabled, LocalDate startDate, int targetDaily,
                         int day, int dailyCap, boolean complete) {}

    public record Reputation(int score, String grade, long sent30d, long bounced30d,
                             long complaints30d, double bounceRate, double complaintRate,
                             long suppressed) {}

    // --- Warm-up -----------------------------------------------------------

    @Transactional
    public WarmupConfig config() {
        WarmupConfig c = WarmupConfig.findById(1);
        if (c == null) {
            c = new WarmupConfig();
            c.id = 1;
            c.enabled = false;
            c.targetDaily = 10000;
            c.persist();
        }
        return c;
    }

    @Transactional
    public Warmup warmup() {
        WarmupConfig c = config();
        if (!c.enabled || c.startDate == null) {
            return new Warmup(c.enabled, c.startDate, c.targetDaily, 0, c.targetDaily, false);
        }
        long elapsed = ChronoUnit.DAYS.between(c.startDate, LocalDate.now());
        int day = (int) Math.max(0, elapsed) + 1; // day 1 on the start date
        boolean complete = day > RAMP.length;
        double factor = complete ? 1.0 : RAMP[day - 1];
        int cap = complete ? c.targetDaily : (int) Math.max(50, Math.round(c.targetDaily * factor));
        return new Warmup(true, c.startDate, c.targetDaily, Math.min(day, RAMP.length), cap, complete);
    }

    /** The daily send cap currently in force (Integer.MAX_VALUE if warm-up off). */
    public int currentDailyCap() {
        Warmup w = warmup();
        return w.enabled() ? w.dailyCap() : Integer.MAX_VALUE;
    }

    /** Messages already sent today (across all campaigns), for cap enforcement. */
    @Transactional
    public long sentToday() {
        OffsetDateTime startOfDay = LocalDate.now().atStartOfDay().atOffset(OffsetDateTime.now().getOffset());
        return CampaignRecipient.count("status <> 'pending' and sentAt >= ?1", startOfDay);
    }

    @Transactional
    public Warmup updateWarmup(Boolean enabled, String startDate, Integer targetDaily) {
        WarmupConfig c = config();
        if (enabled != null) {
            c.enabled = enabled;
            if (enabled && c.startDate == null) c.startDate = LocalDate.now();
        }
        if (startDate != null && !startDate.isBlank()) c.startDate = LocalDate.parse(startDate);
        if (targetDaily != null && targetDaily > 0) c.targetDaily = targetDaily;
        return warmup();
    }

    // --- Reputation score --------------------------------------------------

    @Transactional
    public Reputation reputation() {
        OffsetDateTime since = OffsetDateTime.now().minusDays(30);
        long sent = CampaignRecipient.count("status <> 'pending' and sentAt >= ?1", since);
        long bounced = CampaignRecipient.count("status = 'bounced' and sentAt >= ?1", since);
        long complaints = FblComplaint.count("receivedAt >= ?1", since);
        long suppressed = FblComplaint.count();

        double bounceRate = sent == 0 ? 0 : (double) bounced / sent;
        double complaintRate = sent == 0 ? 0 : (double) complaints / sent;

        // Score: start at 100, penalise bounces and (heavily) complaints.
        // Industry danger thresholds: bounce > 5%, complaints > 0.1%.
        int score = 100;
        score -= (int) Math.round(Math.min(50, bounceRate * 100 * 6));      // 5% bounce ≈ -30
        score -= (int) Math.round(Math.min(50, complaintRate * 1000 * 40)); // 0.1% complaints ≈ -40
        score = Math.max(0, Math.min(100, score));

        String grade = score >= 90 ? "excellent"
                : score >= 75 ? "good"
                : score >= 50 ? "fair" : "poor";

        return new Reputation(score, grade, sent, bounced, complaints,
                round(bounceRate * 100), round(complaintRate * 100), suppressed);
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    // --- FBL complaints / suppression --------------------------------------

    @Transactional
    public boolean isSuppressed(String email) {
        return email != null && FblComplaint.count("email", email.trim().toLowerCase()) > 0;
    }

    @Transactional
    public FblComplaint recordComplaint(String email, String source) {
        if (email == null || !email.contains("@")) return null;
        String addr = email.trim().toLowerCase();
        FblComplaint existing = FblComplaint.find("email", addr).firstResult();
        if (existing != null) return existing;
        FblComplaint c = new FblComplaint();
        c.email = addr;
        c.source = source;
        c.receivedAt = OffsetDateTime.now();
        c.persist();
        return c;
    }

    @Transactional
    public List<FblComplaint> complaints(int limit) {
        return FblComplaint.findAll(io.quarkus.panache.common.Sort.by("receivedAt").descending())
                .page(0, limit).list();
    }
}
