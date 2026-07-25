-- ===========================================================================
-- V9 — Webmail v2: contacts (autocomplete), per-mailbox signatures, and
-- server-side mail filters (compiled to Sieve). Messages themselves now live
-- in each mailbox's Maildir on disk and are read live — the V1 `message`
-- table is no longer the source of truth, so we leave it untouched but unused.
-- ===========================================================================

CREATE TABLE contact (
    id          TEXT PRIMARY KEY,
    mailbox_id  TEXT NOT NULL,
    email       TEXT NOT NULL,
    name        TEXT,
    seen_count  INT  NOT NULL DEFAULT 1,
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (mailbox_id, email)
);
CREATE INDEX idx_contact_mailbox ON contact(mailbox_id, last_seen DESC);

CREATE TABLE mail_signature (
    id          TEXT PRIMARY KEY,
    mailbox_id  TEXT NOT NULL UNIQUE,
    html        TEXT NOT NULL DEFAULT '',
    enabled     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE mail_filter (
    id          TEXT PRIMARY KEY,
    mailbox_id  TEXT NOT NULL,
    ord         INT  NOT NULL DEFAULT 0,
    name        TEXT,
    field       TEXT NOT NULL,   -- from | to | subject
    op          TEXT NOT NULL,   -- contains | is
    value       TEXT NOT NULL,
    action      TEXT NOT NULL,   -- fileinto | discard | mark_read | star
    target      TEXT,            -- destination folder for fileinto
    enabled     BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_mail_filter_mailbox ON mail_filter(mailbox_id, ord);
