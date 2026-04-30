-- Session 10: Notifications & Trust
-- - notifications table for in-app notification center
-- - reports table for user/listing flagging
-- - meetups.reminder_sent flag for SMS reminder cron
-- - users.phone for SMS opt-in (nullable; SMS no-ops when missing)

-- Phone number for SMS (nullable, opt-in only)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Reminder flag on meetups
ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- =========================================================
-- notifications
-- =========================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications(user_id) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- inserts come from server-side service role only
DROP POLICY IF EXISTS "No client inserts to notifications" ON notifications;
CREATE POLICY "No client inserts to notifications"
  ON notifications FOR INSERT
  WITH CHECK (false);

-- =========================================================
-- reports
-- =========================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES users(id),
  reported_listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT report_target_check CHECK (
    reported_listing_id IS NOT NULL OR reported_user_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS reports_status_created_idx
  ON reports(status, created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Reporter can see their own report
DROP POLICY IF EXISTS "Reporter sees own reports" ON reports;
CREATE POLICY "Reporter sees own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Authenticated users can file a report (only as themselves)
DROP POLICY IF EXISTS "Users can file reports" ON reports;
CREATE POLICY "Users can file reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Updates (status changes, resolution) happen server-side via service role.
