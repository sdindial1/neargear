-- Session 5 — tighten RLS now that AuthGate enforces sign-in for all writes.
-- Run in the Supabase SQL Editor.
--
-- Browsing stays public (active listings + storage SELECT). Every write or
-- private read requires authenticated as the appropriate participant.

-- ============================================================
-- listings
-- ============================================================
DROP POLICY IF EXISTS "Active listings are viewable by everyone" ON listings;
CREATE POLICY "Active listings are viewable by everyone"
  ON listings FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can insert listings" ON listings;
CREATE POLICY "Authenticated users can insert listings"
  ON listings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = seller_id);

DROP POLICY IF EXISTS "Sellers can update their own listings" ON listings;
CREATE POLICY "Sellers can update their own listings"
  ON listings FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Sellers can delete their own listings" ON listings;
CREATE POLICY "Sellers can delete their own listings"
  ON listings FOR DELETE
  USING (auth.uid() = seller_id);

-- ============================================================
-- meetups
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can create meetups" ON meetups;
CREATE POLICY "Authenticated users can create meetups"
  ON meetups FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Meetup participants can view their meetups" ON meetups;
CREATE POLICY "Meetup participants can view their meetups"
  ON meetups FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Meetup participants can update their meetups" ON meetups;
CREATE POLICY "Meetup participants can update their meetups"
  ON meetups FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- ============================================================
-- messages
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can send messages" ON messages;
CREATE POLICY "Authenticated users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
CREATE POLICY "Users can read their own messages"
  ON messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can mark their messages read" ON messages;
CREATE POLICY "Users can mark their messages read"
  ON messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- ============================================================
-- saved_listings
-- ============================================================
DROP POLICY IF EXISTS "Users can save listings" ON saved_listings;
CREATE POLICY "Users can save listings"
  ON saved_listings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own saved listings" ON saved_listings;
CREATE POLICY "Users can view their own saved listings"
  ON saved_listings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave listings" ON saved_listings;
CREATE POLICY "Users can unsave listings"
  ON saved_listings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- storage.objects (listings + avatars buckets)
-- ============================================================
DROP POLICY IF EXISTS "Public listing photos" ON storage.objects;
CREATE POLICY "Public listing photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listings');

DROP POLICY IF EXISTS "Auth users upload listing photos" ON storage.objects;
CREATE POLICY "Auth users upload listing photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'listings' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users delete own listing photos" ON storage.objects;
CREATE POLICY "Users delete own listing photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'listings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Public avatars" ON storage.objects;
CREATE POLICY "Public avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Auth users upload avatars" ON storage.objects;
CREATE POLICY "Auth users upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users delete own avatars" ON storage.objects;
CREATE POLICY "Users delete own avatars"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- users (already public for SELECT — owner update/insert)
-- ============================================================
DROP POLICY IF EXISTS "Users can update their own row" ON users;
CREATE POLICY "Users can update their own row"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
