-- Drop duplicate notification trigger (API creates notifications on booking insert).
-- Run once in Supabase SQL Editor if you see duplicate admin notifications.

DROP TRIGGER IF EXISTS trg_booking_insert_notify ON bookings;
DROP FUNCTION IF EXISTS notify_on_booking_insert();
