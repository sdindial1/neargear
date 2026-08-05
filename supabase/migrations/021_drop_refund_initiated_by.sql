-- Drop orders.refund_initiated_by — resolving the last orphan column.
--
-- It arrived in the dev database with no backing migration, was declared
-- retroactively by 017 so the files would match dev, and aligned to uuid by
-- 019. At no point has any code read or written it.
--
-- The audit trail it would have served is already covered:
--   dispute_resolved_by  -- who resolved a held order, written atomically with
--                           the status flip by refundOrder/resolveDispute
--   refund_reason        -- why the refund happened
-- A second "who" column with no writer is a trap: it reads as an audit field
-- while always being null.
--
-- Deliberately a NEW migration rather than an edit to 017. Those files have
-- been applied and verified against a fresh database; rewriting applied history
-- would invalidate that, and the point of the reconciliation was to make the
-- ordered set trustworthy.
--
-- Verified before writing: zero rows have a non-null value.
--
-- Run in the Supabase SQL Editor, after 020.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refund_initiated_by_fkey;
ALTER TABLE orders DROP COLUMN IF EXISTS refund_initiated_by;

NOTIFY pgrst, 'reload schema';
