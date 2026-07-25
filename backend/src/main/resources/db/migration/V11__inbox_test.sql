-- ===========================================================================
-- V11 — Inbox-placement tests. Each run scores the domain's own deliverability
-- (auth/content/RBL — computed locally) and optionally delivers a tagged probe
-- to operator-owned seed mailboxes, then reads each over IMAP to see whether it
-- landed in Inbox or Spam.
-- ===========================================================================

CREATE TABLE inbox_seed (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,        -- "Gmail", "Yandex", …
    email       TEXT NOT NULL,
    imap_host   TEXT NOT NULL,
    imap_port   INT  NOT NULL DEFAULT 993,
    imap_user   TEXT NOT NULL,
    imap_pass   TEXT NOT NULL,        -- app password
    enabled     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE inbox_test (
    id          TEXT PRIMARY KEY,
    domain      TEXT,
    from_addr   TEXT NOT NULL,
    score       INT,                  -- 0..10 self-score
    grade       TEXT,                 -- excellent | good | fair | poor
    summary     TEXT,
    report_json TEXT NOT NULL DEFAULT '[]',  -- per-check findings
    seed_json   TEXT NOT NULL DEFAULT '[]',  -- per-seed placement results
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inbox_test_created ON inbox_test(created_at DESC);
