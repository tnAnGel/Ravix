-- ===========================================================================
-- Ravix schema (V1) — full schema for a clean install.
-- All objects live in the "ravix" schema (configured via Flyway).
-- Status / enum-like columns are stored as text so the JSON contract matches
-- the frontend exactly (e.g. 'healthy', 'lets-encrypt').
--
-- This migration contains NO demo/mock data. The only rows inserted are
-- structural defaults the application requires to run on a fresh install
-- (the anti-spam singleton, the mail-service registry, and base settings).
-- All operational data — domains, mailboxes, messages, queue, certificates —
-- is created at runtime by the panel.
-- ===========================================================================

-- --- Domains ---------------------------------------------------------------
CREATE TABLE domain (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL UNIQUE,
    status           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_mx         TEXT NOT NULL DEFAULT 'unknown',
    check_spf        TEXT NOT NULL DEFAULT 'unknown',
    check_dkim       TEXT NOT NULL DEFAULT 'unknown',
    check_dmarc      TEXT NOT NULL DEFAULT 'unknown',
    check_ssl        TEXT NOT NULL DEFAULT 'unknown',
    dkim_selector    TEXT NOT NULL,
    dkim_public_key  TEXT NOT NULL,
    dkim_private_key TEXT,
    ssl_issuer       TEXT,
    ssl_expires_at   TIMESTAMPTZ,
    ssl_auto_renew   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE dns_record (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain_id   TEXT NOT NULL REFERENCES domain(id) ON DELETE CASCADE,
    sort_order  INT  NOT NULL DEFAULT 0,
    type        TEXT NOT NULL,
    host        TEXT NOT NULL,
    expected    TEXT NOT NULL,
    detected    TEXT,
    status      TEXT NOT NULL,
    ttl         INT,
    priority    INT
);
CREATE INDEX idx_dns_record_domain ON dns_record(domain_id);

-- --- Mailboxes -------------------------------------------------------------
CREATE TABLE mailbox (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    domain        TEXT NOT NULL,
    quota_mb      INT  NOT NULL,
    used_mb       INT  NOT NULL DEFAULT 0,
    status        TEXT NOT NULL,
    password_hash TEXT,
    last_login    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mailbox_domain ON mailbox(domain);

-- --- Aliases ---------------------------------------------------------------
CREATE TABLE alias (
    id         TEXT PRIMARY KEY,
    source     TEXT NOT NULL,
    domain     TEXT NOT NULL,
    status     TEXT NOT NULL,
    catch_all  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alias_destination (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alias_id    TEXT NOT NULL REFERENCES alias(id) ON DELETE CASCADE,
    destination TEXT NOT NULL
);
CREATE INDEX idx_alias_destination_alias ON alias_destination(alias_id);

-- --- Campaigns -------------------------------------------------------------
CREATE TABLE campaign (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    status        TEXT NOT NULL,
    sender        TEXT NOT NULL,
    subject       TEXT NOT NULL,
    recipients    INT  NOT NULL DEFAULT 0,
    sent          INT  NOT NULL DEFAULT 0,
    delivered     INT  NOT NULL DEFAULT 0,
    bounced       INT  NOT NULL DEFAULT 0,
    failed        INT  NOT NULL DEFAULT 0,
    unsubscribe   BOOLEAN NOT NULL DEFAULT true,
    rate_per_hour INT  NOT NULL DEFAULT 500,
    scheduled_at  TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Events ----------------------------------------------------------------
CREATE TABLE event (
    id       TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    message  TEXT NOT NULL,
    at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_at ON event(at DESC);

-- --- Mail queue ------------------------------------------------------------
CREATE TABLE queue_item (
    id        TEXT PRIMARY KEY,
    sender    TEXT NOT NULL,
    recipient TEXT NOT NULL,
    domain    TEXT NOT NULL,
    subject   TEXT NOT NULL,
    size_kb   INT  NOT NULL,
    attempts  INT  NOT NULL DEFAULT 1,
    state     TEXT NOT NULL,
    reason    TEXT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Logs ------------------------------------------------------------------
CREATE TABLE log_line (
    id         TEXT PRIMARY KEY,
    source     TEXT NOT NULL,
    level      TEXT NOT NULL,
    ts         TIMESTAMPTZ NOT NULL,
    process    TEXT NOT NULL,
    message    TEXT NOT NULL
);
CREATE INDEX idx_log_line_source ON log_line(source);

-- --- Certificates ----------------------------------------------------------
CREATE TABLE certificate (
    id                  TEXT PRIMARY KEY,
    domain              TEXT NOT NULL,
    issuer              TEXT NOT NULL,
    type                TEXT NOT NULL,
    status              TEXT NOT NULL,
    issued_at           TIMESTAMPTZ NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    auto_renew          BOOLEAN NOT NULL DEFAULT true,
    last_renewal_at     TIMESTAMPTZ,
    last_renewal_status TEXT,
    last_renewal_detail TEXT
);

-- --- Backups ---------------------------------------------------------------
CREATE TABLE backup (
    id         TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    size_mb    INT  NOT NULL,
    type       TEXT NOT NULL,
    status     TEXT NOT NULL
);

CREATE TABLE backup_content (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    backup_id TEXT NOT NULL REFERENCES backup(id) ON DELETE CASCADE,
    item      TEXT NOT NULL
);
CREATE INDEX idx_backup_content_backup ON backup_content(backup_id);

-- --- Services --------------------------------------------------------------
CREATE TABLE service_status (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    state       TEXT NOT NULL,
    uptime      TEXT NOT NULL,
    version     TEXT NOT NULL,
    memory_mb   INT  NOT NULL,
    sort_order  INT  NOT NULL DEFAULT 0
);

-- --- Anti-spam -------------------------------------------------------------
CREATE TABLE antispam_setting (
    id               INT PRIMARY KEY DEFAULT 1,
    status           TEXT NOT NULL,
    spam_threshold   NUMERIC(4,1) NOT NULL,
    reject_threshold NUMERIC(4,1) NOT NULL,
    greylisting      BOOLEAN NOT NULL DEFAULT true,
    dkim_signing     BOOLEAN NOT NULL DEFAULT true,
    bayes_learned    INT NOT NULL DEFAULT 0,
    CONSTRAINT antispam_singleton CHECK (id = 1)
);

CREATE TABLE sender_list_entry (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    list_type TEXT NOT NULL,        -- 'whitelist' | 'blacklist'
    value     TEXT NOT NULL
);

CREATE TABLE spam_decision (
    id      TEXT PRIMARY KEY,
    ts      TIMESTAMPTZ NOT NULL,
    sender  TEXT NOT NULL,
    action  TEXT NOT NULL,
    score   NUMERIC(4,1) NOT NULL,
    symbols TEXT NOT NULL          -- comma-separated symbol list
);

-- --- Deliverability checklist ----------------------------------------------
CREATE TABLE deliverability_check (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    status     TEXT NOT NULL,
    detail     TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- --- Settings (key/value) --------------------------------------------------
CREATE TABLE app_setting (
    skey  TEXT PRIMARY KEY,
    sval  TEXT
);

-- --- System / installation -------------------------------------------------
CREATE TABLE package_status (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT NOT NULL,
    version    TEXT NOT NULL,
    status     TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE command_check (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cmd        TEXT NOT NULL,
    result     TEXT NOT NULL,
    ok         BOOLEAN NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE install_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at_offset  TEXT NOT NULL,
    message    TEXT NOT NULL,
    ok         BOOLEAN NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- --- Webmail: per-mailbox messages -----------------------------------------
CREATE TABLE message (
    id              TEXT PRIMARY KEY,
    mailbox_id      TEXT NOT NULL REFERENCES mailbox(id) ON DELETE CASCADE,
    folder          TEXT NOT NULL,            -- inbox|sent|drafts|spam|trash|archive
    from_addr       TEXT NOT NULL,
    from_name       TEXT,
    to_addr         TEXT NOT NULL,
    subject         TEXT NOT NULL,
    preview         TEXT NOT NULL DEFAULT '',
    body            TEXT NOT NULL DEFAULT '',
    unread          BOOLEAN NOT NULL DEFAULT false,
    starred         BOOLEAN NOT NULL DEFAULT false,
    has_attachments BOOLEAN NOT NULL DEFAULT false,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_message_mailbox_folder ON message(mailbox_id, folder);
CREATE INDEX idx_message_received ON message(received_at DESC);

-- --- Auth: admin accounts & sessions ---------------------------------------
CREATE TABLE admin_user (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    role          TEXT NOT NULL DEFAULT 'Administrator',
    password_hash TEXT NOT NULL,
    two_factor    BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_session (
    token         TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_auth_session_user ON auth_session(admin_user_id);

-- ===========================================================================
-- Structural defaults (NOT mock data) — required for a fresh install to run.
-- ===========================================================================

-- Anti-spam singleton (id=1). AntiSpamResource reads this row directly.
INSERT INTO antispam_setting (id, status, spam_threshold, reject_threshold, greylisting, dkim_signing, bayes_learned)
VALUES (1, 'inactive', 6.0, 15.0, true, true, 0);

-- Mail-service registry. The dashboard lists these and overlays the real
-- systemd state at request time; ids match the systemd unit names. Versions,
-- uptime and memory are left blank until live data is available.
INSERT INTO service_status (id, name, description, state, uptime, version, memory_mb, sort_order) VALUES
('postfix','Postfix','SMTP / mail transfer agent','unknown','','',0,0),
('dovecot','Dovecot','IMAP / POP3 delivery','unknown','','',0,1),
('rspamd','Rspamd','Spam filtering & scoring','unknown','','',0,2),
('opendkim','OpenDKIM','DKIM signing','unknown','','',0,3),
('nginx','Nginx','Reverse proxy / web','unknown','','',0,4),
('redis-server','Redis','Rspamd cache backend','unknown','','',0,5);

-- Base settings (real install defaults; overridable from the Settings page).
INSERT INTO app_setting (skey, sval) VALUES
('version','0.1.0'),
('timezone','UTC'),
('update_channel','stable'),
('install_mode','bare-metal'),
('system_user','ravix'),
('path_app','/opt/ravix'),
('path_config','/etc/ravix'),
('path_data','/var/lib/ravix'),
('path_logs','/var/log/ravix');
