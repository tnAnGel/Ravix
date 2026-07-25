-- ===========================================================================
-- V5 — DMARC aggregate (RUA) reports: ingestion + per-source rows.
-- ===========================================================================

CREATE TABLE dmarc_report (
    id           TEXT PRIMARY KEY,
    domain       TEXT NOT NULL,
    org_name     TEXT,
    report_id    TEXT,
    date_begin   TIMESTAMPTZ,
    date_end     TIMESTAMPTZ,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_count  INT NOT NULL DEFAULT 0,
    pass_count   INT NOT NULL DEFAULT 0,
    fail_count   INT NOT NULL DEFAULT 0,
    UNIQUE (org_name, report_id)
);
CREATE INDEX idx_dmarc_report_domain ON dmarc_report(domain);
CREATE INDEX idx_dmarc_report_received ON dmarc_report(received_at DESC);

CREATE TABLE dmarc_record (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_id    TEXT NOT NULL REFERENCES dmarc_report(id) ON DELETE CASCADE,
    source_ip    TEXT NOT NULL,
    count        INT NOT NULL DEFAULT 0,
    disposition  TEXT,              -- none | quarantine | reject
    dkim_result  TEXT,              -- pass | fail
    spf_result   TEXT,              -- pass | fail
    header_from  TEXT,
    aligned      BOOLEAN NOT NULL DEFAULT false  -- DKIM or SPF aligned + pass
);
CREATE INDEX idx_dmarc_record_report ON dmarc_record(report_id);
CREATE INDEX idx_dmarc_record_source ON dmarc_record(source_ip);
