-- ===========================================================================
-- V8 — Background tasks (async software installs, apply-config, etc.)
-- ===========================================================================

CREATE TABLE background_task (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,         -- "software" | "apply" | ...
    target       TEXT,                  -- e.g. component id "postfix"
    action       TEXT,                  -- e.g. "install" | "uninstall"
    status       TEXT NOT NULL,         -- "running" | "ok" | "failed"
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    log          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_background_task_active ON background_task(status, started_at DESC);
