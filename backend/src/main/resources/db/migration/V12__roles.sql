-- Phase C — Team RBAC: normalise free-text roles to the canonical set
-- (owner / admin / viewer). Earlier installs seeded role = 'Owner' and the
-- admin-users endpoint wrote 'Administrator'.

UPDATE admin_user SET role = 'owner'  WHERE lower(role) = 'owner';
UPDATE admin_user SET role = 'viewer' WHERE lower(role) IN ('viewer', 'read-only', 'readonly', 'read');
UPDATE admin_user SET role = 'admin'  WHERE role IS NULL
   OR lower(role) NOT IN ('owner', 'admin', 'viewer');

-- Safety net: if somehow no owner exists, promote the earliest account so the
-- panel always has someone who can manage the team.
UPDATE admin_user SET role = 'owner'
 WHERE id = (SELECT id FROM admin_user ORDER BY created_at ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM admin_user WHERE role = 'owner');
