-- Session 12: messages.meetup_id + relaxed RLS so both meetup parties
-- can read every message on their meetup, regardless of which user is
-- recorded as sender/receiver on each row.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS meetup_id UUID
    REFERENCES meetups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_meetup_id_idx
  ON messages(meetup_id, created_at);

-- Backfill: when a meetup row exists with the same listing_id and the
-- sender/receiver pair matches the meetup's buyer/seller pair, attach it.
UPDATE messages msg
   SET meetup_id = m.id
  FROM meetups m
 WHERE msg.meetup_id IS NULL
   AND msg.listing_id = m.listing_id
   AND (
     (msg.sender_id = m.buyer_id AND msg.receiver_id = m.seller_id) OR
     (msg.sender_id = m.seller_id AND msg.receiver_id = m.buyer_id)
   );

-- Replace the legacy SELECT policy with one that admits any meetup
-- participant.
DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
DROP POLICY IF EXISTS "Meetup participants can read messages" ON messages;

CREATE POLICY "Meetup participants can read messages"
  ON messages FOR SELECT
  USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR EXISTS (
      SELECT 1 FROM meetups m
       WHERE m.id = messages.meetup_id
         AND (m.buyer_id = auth.uid() OR m.seller_id = auth.uid())
    )
  );
