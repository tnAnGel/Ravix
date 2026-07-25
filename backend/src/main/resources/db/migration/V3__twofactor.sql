-- ===========================================================================
-- V3 — Real two-factor auth (TOTP) secret storage for admin accounts.
-- ===========================================================================

ALTER TABLE admin_user ADD COLUMN two_factor_secret TEXT;
