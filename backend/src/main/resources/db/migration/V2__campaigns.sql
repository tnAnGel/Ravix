-- ===========================================================================
-- V2 — Enterprise campaigns: message body, audience, recipients, segments,
-- templates. Builds on the campaign table created in V1.
-- ===========================================================================

ALTER TABLE campaign ADD COLUMN body          TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign ADD COLUMN preheader     TEXT;
ALTER TABLE campaign ADD COLUMN reply_to      TEXT;
ALTER TABLE campaign ADD COLUMN audience_type TEXT NOT NULL DEFAULT 'all';  -- all | domain | segment | list
ALTER TABLE campaign ADD COLUMN audience_ref  TEXT;                          -- domain name / segment id
ALTER TABLE campaign ADD COLUMN template_id   TEXT;
ALTER TABLE campaign ADD COLUMN sent_at        TIMESTAMPTZ;                   -- when sending actually started

-- Per-recipient delivery tracking (the real audience a campaign is sent to).
CREATE TABLE campaign_recipient (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    name        TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | delivered | bounced | failed | unsubscribed
    error       TEXT,
    sent_at     TIMESTAMPTZ
);
CREATE INDEX idx_campaign_recipient_campaign ON campaign_recipient(campaign_id, status);

-- Reusable audience segments.
CREATE TABLE segment (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL,        -- all | domain | status | manual
    filter_value TEXT,                 -- domain name / mailbox status
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reusable message templates.
CREATE TABLE email_template (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    subject    TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
