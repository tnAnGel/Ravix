-- ===========================================================================
-- V10 — API keys for the transactional send API (SendGrid/Mailgun-compatible).
-- Only a bcrypt hash of the key is stored; the plaintext is shown once on
-- creation. last4 lets the UI display a recognisable suffix.
-- ===========================================================================

CREATE TABLE api_key (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    key_hash    TEXT NOT NULL,
    last4       TEXT NOT NULL,
    scopes      TEXT NOT NULL DEFAULT 'send',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used   TIMESTAMPTZ,
    sent_count  BIGINT NOT NULL DEFAULT 0,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE
);
