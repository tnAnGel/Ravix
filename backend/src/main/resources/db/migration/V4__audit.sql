-- ===========================================================================
-- V4 — Admin audit log: who did what, from where, and the outcome.
-- ===========================================================================

CREATE TABLE audit_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor      TEXT,                 -- admin email (null for unauthenticated attempts)
    action     TEXT NOT NULL,        -- e.g. "POST /api/domains"
    target     TEXT,                 -- affected resource path / id
    ip         TEXT,
    status     INT NOT NULL,         -- HTTP status of the action
    detail     TEXT
);
CREATE INDEX idx_audit_log_at ON audit_log(at DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor);
