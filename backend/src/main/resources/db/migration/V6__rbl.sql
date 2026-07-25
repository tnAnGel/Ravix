-- ===========================================================================
-- V6 — RBL / DNSBL blacklist monitoring results.
-- ===========================================================================

CREATE TABLE rbl_check (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ip          TEXT NOT NULL,
    zone        TEXT NOT NULL,        -- the DNSBL zone queried
    listed      BOOLEAN NOT NULL DEFAULT false,
    result      TEXT,                 -- the A record returned (e.g. 127.0.0.2)
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ip, zone)
);
CREATE INDEX idx_rbl_check_ip ON rbl_check(ip);
