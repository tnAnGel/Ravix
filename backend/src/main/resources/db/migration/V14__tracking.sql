-- Band 4: campaign open/click tracking.

ALTER TABLE campaign_recipient ADD COLUMN tracking_id     TEXT;
ALTER TABLE campaign_recipient ADD COLUMN opened_at       TIMESTAMPTZ;
ALTER TABLE campaign_recipient ADD COLUMN open_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_recipient ADD COLUMN click_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_recipient ADD COLUMN last_clicked_at TIMESTAMPTZ;
CREATE INDEX idx_campaign_recipient_tracking ON campaign_recipient(tracking_id);

ALTER TABLE campaign ADD COLUMN opens  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0;

-- Raw tracking events for auditing / future per-link analytics.
CREATE TABLE tracking_event (
    id            TEXT PRIMARY KEY,
    campaign_id   TEXT,
    recipient_id  BIGINT,
    type          TEXT NOT NULL,   -- open | click
    url           TEXT,
    user_agent    TEXT,
    ip            TEXT,
    at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracking_event_campaign ON tracking_event(campaign_id);
