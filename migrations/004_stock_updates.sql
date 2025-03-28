-- migrations/004_create_stocks_table.sql
-- This migration creates the "stocks" table.
-- The table tracks products picked up by marketers along with a timestamp (pickup_time).
-- The application can compute the countdown using the pickup_time to determine if 4 days have passed.
-- Optionally, foreign key constraints can be added if needed.

CREATE TABLE stock_updates (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL,
  dealer_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  device_category VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  pickup_date TIMESTAMP NOT NULL DEFAULT NOW(),
  deadline TIMESTAMP NOT NULL,
  sold BOOLEAN NOT NULL DEFAULT false,
  sold_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Optionally, you can add foreign key constraints if your users and products tables exist:
-- ALTER TABLE stocks
--   ADD CONSTRAINT fk_marketer
--   FOREIGN KEY (marketer_id) REFERENCES users(id);
--
-- ALTER TABLE stocks
--   ADD CONSTRAINT fk_product
--   FOREIGN KEY (product_id) REFERENCES products(id);
