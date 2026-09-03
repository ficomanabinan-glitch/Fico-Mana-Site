-- RLS policies for bookings (updated — see also 014_tighten_bookings_rls.sql)
-- Public creates MUST go through Next.js + service role. Do not re-open anon INSERT/SELECT.

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookings_anon_insert" ON bookings;
DROP POLICY IF EXISTS "bookings_anon_select_availability" ON bookings;

DROP POLICY IF EXISTS "bookings_staff_all" ON bookings;
CREATE POLICY "bookings_staff_all"
  ON bookings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Notifications: staff read/write; service role bypasses RLS for server inserts
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_staff_all" ON notifications;
CREATE POLICY "notifications_staff_all"
  ON notifications FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
