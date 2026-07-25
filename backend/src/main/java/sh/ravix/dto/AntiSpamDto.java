package sh.ravix.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Combined anti-spam view: settings + sender lists + recent decisions. */
public record AntiSpamDto(
        String status,
        boolean rspamdRunning,
        boolean redisConnected,
        BigDecimal spamThreshold,
        BigDecimal rejectThreshold,
        boolean greylisting,
        boolean dkimSigning,
        int bayesLearned,
        long dkimSignedDomains,
        long totalDomains,
        List<String> whitelist,
        List<String> blacklist,
        List<Decision> recentDecisions) {

    public record Decision(
            String id,
            OffsetDateTime time,
            String from,
            String action,
            BigDecimal score,
            List<String> symbols) {}
}
