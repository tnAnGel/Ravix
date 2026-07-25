-- ===========================================================================
-- V7 — Sending reputation: warm-up plan and FBL (feedback-loop) complaints.
-- Reputation metrics are computed live from campaign_recipient + fbl_complaint,
-- so no daily-aggregate table is needed.
-- ===========================================================================

CREATE TABLE warmup_config (
    id           INT PRIMARY KEY DEFAULT 1,
    enabled      BOOLEAN NOT NULL DEFAULT false,
    start_date   DATE,
    target_daily INT NOT NULL DEFAULT 10000,
    CONSTRAINT warmup_singleton CHECK (id = 1)
);
INSERT INTO warmup_config (id, enabled, target_daily) VALUES (1, false, 10000);

-- Spam complaints received via feedback loops (ARF reports). Used both as a
-- suppression list and as the complaint signal for the reputation score.
CREATE TABLE fbl_complaint (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       TEXT NOT NULL,
    source      TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fbl_complaint_received ON fbl_complaint(received_at DESC);
CREATE INDEX idx_fbl_complaint_email ON fbl_complaint(email);
