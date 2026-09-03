-- Migration: booking fields, packages table, creative package seed, notifications trigger
-- Run in Supabase SQL Editor after lib/schema.sql (or on existing project)

-- ── Bookings: columns required by the app ─────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS slot_id VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_time VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS shoot_time VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS school_name VARCHAR(200);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS course VARCHAR(200);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hood_color VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS toga_color VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tassel_color VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS background_color VARCHAR(100);

-- ── Packages catalog ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id VARCHAR(50) PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  price_display VARCHAR(50) NOT NULL,
  price_amount DECIMAL(10, 2) NOT NULL,
  duration VARCHAR(100),
  description TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  slot_type VARCHAR(20) NOT NULL DEFAULT 'standard',
  secondary_price_display VARCHAR(50),
  secondary_price_amount DECIMAL(10, 2),
  secondary_price_label TEXT,
  book_variants JSONB,
  note TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "packages_public_read" ON packages;
CREATE POLICY "packages_public_read"
  ON packages FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "packages_staff_write" ON packages;
CREATE POLICY "packages_staff_write"
  ON packages FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── Seed packages (incl. CREATIVE PACKAGE) ────────────────────────────────────
INSERT INTO packages (id, category, title, price_display, price_amount, duration, description, features, slot_type, sort_order) VALUES
  ('fico-package', 'graduation', 'FICO PACKAGE', '₱3,500', 3500, '30 mins (15m shoot / 15m select)', 'Without Hair and Makeup.', '["Free use of Toga & Cap","Professional Photographer","5 Edited/Enhanced Copies"]'::jsonb, 'standard', 1),
  ('mana-makeup', 'graduation', 'MANA PACKAGE', '₱6,500', 6500, '2 hours (1.5h makeup / 15m shoot / 15m select)', 'With Hair and Makeup.', '["Free use of Toga & Cap","Professional hair & makeup","5 Edited/Enhanced Copies"]'::jsonb, 'makeup', 2)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  price_display = EXCLUDED.price_display,
  price_amount = EXCLUDED.price_amount,
  duration = EXCLUDED.duration,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  slot_type = EXCLUDED.slot_type,
  sort_order = EXCLUDED.sort_order;

INSERT INTO packages (id, category, title, price_display, price_amount, duration, description, features, slot_type, secondary_price_display, secondary_price_amount, secondary_price_label, book_variants, note, sort_order) VALUES
  (
    'creative-package',
    'creative',
    'CREATIVE PACKAGE',
    '₱13,500',
    13500,
    '2–3 hours photoshoot',
    'Light Effects / Curtain / Simple Studio Setup',
    '["2–3 hours photoshoot","2 layouts (client''s peg & plain backdrop)","Professional photographer","Creative direction (for poses)","Professional light setup","20 ENHANCED photos (soft copies)","ALL RAW photos (soft copies)","2 pcs printed 4R photo of choice"]'::jsonb,
    'makeup',
    '₱15,500',
    15500,
    'With Hair & Make Up (2 pegs)',
    '[{"id":"creative-package","label":"Book — Without HMUA (₱13,500)"},{"id":"creative-package-makeup","label":"Book — With HMUA (₱15,500)"}]'::jsonb,
    '₱3,500/head for additional pax (with HMUA).',
    10
  ),
  (
    'creative-package-makeup',
    'creative',
    'CREATIVE PACKAGE (With Hair & Makeup)',
    '₱15,500',
    15500,
    '2–3 hours photoshoot (includes HMUA for 2 pegs)',
    'Light Effects / Curtain / Simple Studio Setup with Hair & Makeup',
    '["2–3 hours photoshoot","Hair & makeup for 2 pegs","20 ENHANCED photos (soft copies)","ALL RAW photos (soft copies)"]'::jsonb,
    'makeup',
    NULL,
    NULL,
    NULL,
    NULL,
    '₱3,500/head for additional pax (with HMUA).',
    11
  )
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  title = EXCLUDED.title,
  price_display = EXCLUDED.price_display,
  price_amount = EXCLUDED.price_amount,
  duration = EXCLUDED.duration,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  slot_type = EXCLUDED.slot_type,
  secondary_price_display = EXCLUDED.secondary_price_display,
  secondary_price_amount = EXCLUDED.secondary_price_amount,
  secondary_price_label = EXCLUDED.secondary_price_label,
  book_variants = EXCLUDED.book_variants,
  note = EXCLUDED.note,
  sort_order = EXCLUDED.sort_order;

-- ── Auto-notify admin on new booking (works without service role key) ───────────
CREATE OR REPLACE FUNCTION notify_on_booking_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (booking_id, type, message)
  VALUES (NEW.id, 'NEW_BOOKING', 'New booking ' || NEW.id || ' submitted by ' || NEW.customer_name || '.');

  IF NEW.receipt_url IS NOT NULL AND NEW.receipt_url <> '' THEN
    INSERT INTO notifications (booking_id, type, message)
    VALUES (NEW.id, 'RECEIPT_UPLOAD', NEW.customer_name || ' submitted a receipt for booking ' || NEW.id || '.');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_booking_insert_notify ON bookings;
CREATE TRIGGER trg_booking_insert_notify
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_booking_insert();

-- Allow anon to insert notifications via trigger only (trigger runs as definer)
-- Staff still read notifications via existing RLS policies
