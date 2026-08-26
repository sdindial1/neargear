-- ============================================================
-- 032: A nudge status that means "deliberately not sent, and never will be"
--
-- 031 shipped three statuses and they cover the wrong three cases:
--
--   sent        delivered            -> consumes the step
--   failed      attempted, rejected  -> consumes the step
--   suppressed  sending was off      -> does NOT consume the step, on purpose,
--                                       so the email still goes out once
--                                       LISTING_NUDGES_ENABLED is set
--
-- There is no way to say "skip this specific step for this specific person,
-- permanently". Writing 'suppressed' to do it would leave the user eligible and
-- the email would send anyway — the row would look like a decision while
-- changing nothing. That is the same silent-no-op shape as a cancel that
-- cancels nothing, sitting in the schema rather than the code.
--
-- 'skipped' consumes the step exactly like 'sent', without an email existing.
-- The reason belongs in `error`, which is the only free-text column here.
--
-- The concrete need: users who signed up long before this sequence existed are
-- past all three thresholds, so the first enabled cron run would send them
-- three emails within one minute. On a young sending domain that reads as
-- broken software and earns spam complaints the domain cannot absorb —
-- complaints that would damage delivery of the transactional receipts too.
--
-- No data backfill here. Which accounts to skip is a judgement about real
-- people and their addresses, so it is applied by an operator script rather
-- than embedded in schema history where it would replay on every rebuild and
-- put an email address in the repository.
-- ============================================================

ALTER TABLE listing_nudges DROP CONSTRAINT IF EXISTS listing_nudges_status_check;
ALTER TABLE listing_nudges ADD CONSTRAINT listing_nudges_status_check
  CHECK (status IN ('sent', 'failed', 'suppressed', 'skipped'));

-- The slot-consuming set gains 'skipped'. Recreated rather than altered because
-- a partial index's predicate is not modifiable in place.
DROP INDEX IF EXISTS listing_nudges_user_step_idx;
CREATE UNIQUE INDEX listing_nudges_user_step_idx
  ON listing_nudges (user_id, step)
  WHERE status IN ('sent', 'failed', 'skipped');

COMMENT ON COLUMN listing_nudges.status IS
  'sent/failed/skipped consume the step and are covered by the unique index; '
  'suppressed does not, so a flag-off row still allows the real send later. '
  'skipped = deliberately never sending this step to this user; reason in error.';

NOTIFY pgrst, 'reload schema';
