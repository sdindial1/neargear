-- SportSwap Database Schema
-- Run this in the Supabase SQL Editor

-- ===========================================
-- TABLES
-- ===========================================

CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT CHECK (role IN ('parent', 'coach', 'both')),
  city TEXT,
  avatar_url TEXT,
  avg_rating FLOAT DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  strikes INTEGER DEFAULT 0,
  strike_status TEXT DEFAULT 'active' CHECK (strike_status IN
    ('active', 'warned', 'blackout_30', 'blackout_60', 'banned')),
  blackout_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE children (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  primary_sport TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sport TEXT NOT NULL,
  category TEXT NOT NULL,
  condition TEXT CHECK (condition IN ('like_new', 'good', 'fair', 'poor')),
  price INTEGER NOT NULL,
  description TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN
    ('active', 'sold', 'removed', 'pending')),
  ai_suggested_price INTEGER,
  ai_condition_grade TEXT,
  ai_identified_item TEXT,
  ai_age_range TEXT,
  ai_size TEXT,
  ai_brand TEXT,
  ai_confidence FLOAT,
  views INTEGER DEFAULT 0,
  city TEXT,
  age_min INTEGER,
  age_max INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE saved_listings (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE meetups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
  deposit_amount INTEGER NOT NULL,
  deposit_payment_intent_id TEXT,
  final_payment_intent_id TEXT,
  status TEXT DEFAULT 'deposit_pending' CHECK (status IN (
    'deposit_pending', 'scheduled', 'buyer_confirmed',
    'seller_confirmed', 'completed', 'cancelled_buyer',
    'cancelled_seller', 'no_show_buyer',
    'no_show_seller', 'disputed'
  )),
  meetup_location TEXT,
  meetup_time TIMESTAMP WITH TIME ZONE,
  buyer_confirmed_at TIMESTAMP WITH TIME ZONE,
  seller_confirmed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE strikes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  meetup_id UUID REFERENCES meetups(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE strikes ENABLE ROW LEVEL SECURITY;

-- USERS: public read, owner update
CREATE POLICY "Users are viewable by everyone"
  ON users FOR SELECT USING (true);

CREATE POLICY "Users can update their own row"
  ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own row"
  ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- CHILDREN: owner read/write only
CREATE POLICY "Parents can view their own children"
  ON children FOR SELECT USING (auth.uid() = parent_id);

CREATE POLICY "Parents can insert their own children"
  ON children FOR INSERT WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "Parents can update their own children"
  ON children FOR UPDATE USING (auth.uid() = parent_id);

CREATE POLICY "Parents can delete their own children"
  ON children FOR DELETE USING (auth.uid() = parent_id);

-- LISTINGS: public read active, authenticated insert, owner update/delete
CREATE POLICY "Active listings are viewable by everyone"
  ON listings FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid());

CREATE POLICY "Authenticated users can insert listings"
  ON listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their own listings"
  ON listings FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete their own listings"
  ON listings FOR DELETE
  USING (auth.uid() = seller_id);

-- MESSAGES: sender and receiver read, authenticated insert
CREATE POLICY "Users can read their own messages"
  ON messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Authenticated users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- REVIEWS: public read, authenticated insert
CREATE POLICY "Reviews are viewable by everyone"
  ON reviews FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- SAVED LISTINGS: owner read/write only
CREATE POLICY "Users can view their own saved listings"
  ON saved_listings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save listings"
  ON saved_listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave listings"
  ON saved_listings FOR DELETE
  USING (auth.uid() = user_id);

-- MEETUPS: buyer and seller read, authenticated insert
CREATE POLICY "Meetup participants can view their meetups"
  ON meetups FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Authenticated users can create meetups"
  ON meetups FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Meetup participants can update their meetups"
  ON meetups FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- STRIKES: owner read only (service role inserts)
CREATE POLICY "Users can view their own strikes"
  ON strikes FOR SELECT
  USING (auth.uid() = user_id);

-- ===========================================
-- STORAGE BUCKETS
-- ===========================================
-- Run these in Supabase Dashboard > Storage, or via SQL:

-- CREATE BUCKET: listings (public)
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('listings', 'listings', true);

-- CREATE BUCKET: avatars (public)
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('avatars', 'avatars', true);

-- STORAGE POLICIES:

-- Anyone can view listing photos
-- CREATE POLICY "Public listing photos"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'listings');

-- Authenticated users can upload listing photos
-- CREATE POLICY "Auth users upload listing photos"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'listings' AND auth.role() = 'authenticated');

-- Users can delete their own listing photos
-- CREATE POLICY "Users delete own listing photos"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'listings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Anyone can view avatars
-- CREATE POLICY "Public avatars"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'avatars');

-- Authenticated users can upload avatars
-- CREATE POLICY "Auth users upload avatars"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Users can delete their own avatars
-- CREATE POLICY "Users delete own avatars"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
