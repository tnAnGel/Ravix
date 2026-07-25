package sh.ravix.dto;

import java.time.OffsetDateTime;

public record QueueSummaryDto(
        long active,
        long deferred,
        long hold,
        long failed,
        long total,
        OffsetDateTime oldestDeferred) {}
