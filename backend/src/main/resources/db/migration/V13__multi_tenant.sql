-- Multi-tenant phases B/A: organizations own a slice of the data; the mail
-- stack stays global. Isolation is enforced at the app layer via the
-- Hibernate orgFilter (org_id = :orgId). This migration is fully
-- backward-compatible: a single-tenant install ends up with one "Default" org
-- and one super-admin, behaving exactly as before.

-- 1. Tenant tables -----------------------------------------------------------
CREATE TABLE organization (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    slug             TEXT,
    status           TEXT NOT NULL DEFAULT 'active',
    quota_domains    INTEGER NOT NULL DEFAULT 0,
    quota_mailboxes  INTEGER NOT NULL DEFAULT 0,
    quota_storage_mb BIGINT  NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org_membership (
    id            TEXT PRIMARY KEY,
    org_id        TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    admin_user_id TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'admin',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_membership_user ON org_membership(admin_user_id);
CREATE INDEX idx_org_membership_org  ON org_membership(org_id);

-- 2. Operator flag on admin users -------------------------------------------
ALTER TABLE admin_user ADD COLUMN superadmin BOOLEAN NOT NULL DEFAULT false;

-- 3. org_id on every tenant-scoped table ------------------------------------
ALTER TABLE domain             ADD COLUMN org_id TEXT;
ALTER TABLE mailbox            ADD COLUMN org_id TEXT;
ALTER TABLE alias              ADD COLUMN org_id TEXT;
ALTER TABLE campaign           ADD COLUMN org_id TEXT;
ALTER TABLE campaign_recipient ADD COLUMN org_id TEXT;
ALTER TABLE segment            ADD COLUMN org_id TEXT;
ALTER TABLE contact            ADD COLUMN org_id TEXT;
ALTER TABLE email_template     ADD COLUMN org_id TEXT;
ALTER TABLE mail_filter        ADD COLUMN org_id TEXT;
ALTER TABLE mail_signature     ADD COLUMN org_id TEXT;
ALTER TABLE inbox_seed         ADD COLUMN org_id TEXT;
ALTER TABLE inbox_test         ADD COLUMN org_id TEXT;
ALTER TABLE api_key            ADD COLUMN org_id TEXT;

-- 4. Seed the default org and backfill ownership ----------------------------
INSERT INTO organization (id, name, slug, status, created_at)
VALUES ('org_default', 'Default', 'default', 'active', now());

UPDATE domain             SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE mailbox            SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE alias              SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE campaign           SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE campaign_recipient SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE segment            SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE contact            SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE email_template     SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE mail_filter        SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE mail_signature     SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE inbox_seed         SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE inbox_test         SET org_id = 'org_default' WHERE org_id IS NULL;
UPDATE api_key            SET org_id = 'org_default' WHERE org_id IS NULL;

-- Existing owners become super-admins (operators of this install).
UPDATE admin_user SET superadmin = true WHERE lower(role) = 'owner';

-- Every existing admin becomes a member of the default org with their role.
INSERT INTO org_membership (id, org_id, admin_user_id, role, created_at)
SELECT 'mbr_' || id, 'org_default', id,
       CASE WHEN lower(role) IN ('owner','admin','viewer') THEN lower(role) ELSE 'admin' END,
       now()
FROM admin_user;

CREATE INDEX idx_domain_org   ON domain(org_id);
CREATE INDEX idx_mailbox_org  ON mailbox(org_id);
CREATE INDEX idx_alias_org    ON alias(org_id);
CREATE INDEX idx_campaign_org ON campaign(org_id);
CREATE INDEX idx_contact_org  ON contact(org_id);
