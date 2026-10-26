-- Contact-support submissions.
--
-- The form emails amaro@near-gear.com, and that inbox is the support desk; this
-- table is not a ticketing system. It exists so a message survives when the
-- email does not: the route writes the row FIRST, then sends, then records how
-- the send went. A Resend outage or a bad key leaves rows with
-- email_status <> 'sent' that can be read back and answered by hand.
--
-- Holds PII: name, email, free-text message, and the account it came from.
--
-- ACCESS MODEL: SERVICE ROLE ONLY, the same as sweepstakes_entries (022). RLS is
-- enabled with NO policies and table grants are revoked, so anon and
-- authenticated can neither read nor write. Every insert goes through
-- POST /api/support, which uses the service-role client. Granting anon INSERT
-- would let anyone holding the public anon key skip the route's validation and
-- throttle by POSTing straight to PostgREST.
--
-- Additive: apply BEFORE the code that writes it deploys.

CREATE TABLE IF NOT EXISTS support_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name       TEXT NOT NULL,
  -- Stored normalized (trimmed + lowercased). The per-address throttle counts
  -- on this column, so it has to be normalized before insert.
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,

  -- Path the visitor came from ("/listings/…"), validated as same-site by the
  -- route. NULL when they opened /support directly.
  page_path  TEXT,

  -- Taken from the session cookie on the server, never from the request body.
  -- SET NULL so deleting an account keeps the message it sent.
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,

  -- How the email went. 'pending' until the send returns; a row stuck there
  -- means the function died between insert and send.
  email_status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_provider_id TEXT,
  email_error       TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Throttle lookups (same address, recent window) and read-back in order.
CREATE INDEX IF NOT EXISTS support_messages_email_created_idx
  ON support_messages (email, created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_created_idx
  ON support_messages (created_at DESC);

-- RLS on, no policies: deny by default. service_role bypasses RLS.
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON support_messages FROM anon, authenticated;

COMMENT ON TABLE support_messages IS
  'Contact-support submissions. PII. Service-role access only: no RLS policies '
  'exist and table grants are revoked from anon/authenticated. Written by '
  '/api/support before the email to amaro@near-gear.com is sent.';

NOTIFY pgrst, 'reload schema';
