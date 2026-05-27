-- Track which version of the Terms / Privacy Policy each user accepted at
-- signup. Audit trail for legal compliance.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS terms_version TEXT;

COMMENT ON COLUMN users.terms_accepted_at IS
  'Server timestamp when the user agreed to the Terms + Privacy Policy at signup.';
COMMENT ON COLUMN users.terms_version IS
  'Effective date string of the policy version accepted (e.g. 2026-05-27).';
