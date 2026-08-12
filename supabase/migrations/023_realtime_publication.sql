-- 023_realtime_publication.sql
--
-- Enable Postgres logical replication for the tables the client already
-- subscribes to.
--
-- WHY THIS EXISTS
-- Four realtime subscriptions were written and shipped long before this
-- migration: the meetup chat, the notification bell, the marketplace feed, and
-- the order-status transition on the completion screen. All four connected,
-- subscribed successfully, and received nothing, because Postgres only streams
-- changes for tables belonging to a publication and `supabase_realtime`
-- contained ZERO tables. The symptom was indistinguishable from the feature
-- never having been built: messages and notifications appeared only on refresh,
-- which for two people coordinating a meetup reads as "my message didn't send".
--
-- WHAT IS DELIBERATELY NOT HERE
--   listings  — the marketplace feed subscribes to it, but it is the only
--               subscription whose cost scales as (new listings x concurrent
--               viewers) rather than per-recipient, and it is the least
--               valuable of the four. Held back on purpose; add it in its own
--               migration if the feed is wanted, so the cost change is a
--               deliberate decision and not a side effect of this one.
--   users / public_profiles — never. Migration 020 locked `users` to own-row
--               reads through a view; publication membership is per-table, so
--               keeping these out means that lockdown is untouched here.
--
-- SECURITY
-- Realtime does NOT bypass RLS. For postgres_changes, policies are evaluated
-- per subscriber against the changed row before it is delivered. The `filter:`
-- in a client subscription is a convenience, not a boundary — a user may
-- subscribe to any listing_id they like; RLS decides what actually arrives.
-- The three tables added here are each scoped:
--   messages       SELECT -> sender, receiver, or the meetup's buyer/seller (009)
--   notifications  SELECT -> auth.uid() = user_id (007)
--   orders         SELECT -> auth.uid() = buyer_id OR seller_id
--
-- REPLICA IDENTITY is left at DEFAULT on purpose. FULL is only needed to
-- receive the OLD row on UPDATE/DELETE. These subscriptions are INSERTs plus
-- UPDATEs where row ownership never changes, so FULL would inflate WAL volume
-- for data nothing reads.

-- The publication is created by the Supabase platform, NOT by these migration
-- files. A bare scratch database — the one the reconciliation acceptance test
-- builds from 001 upward — therefore does not have it, and an unguarded
-- ALTER PUBLICATION would fail there and break the invariant that a fresh
-- database plus the ordered file set equals dev.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Guarded per table so re-applying is a no-op. ALTER PUBLICATION ... ADD TABLE
-- errors on an already-published table, and these files must be safely
-- re-runnable.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['messages', 'notifications', 'orders']) LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t
      );
    END IF;
  END LOOP;
END $$;
