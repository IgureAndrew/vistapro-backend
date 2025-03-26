-- migrations/004_create_stocks_table.sql
-- This migration creates the "stocks" table.
-- The table tracks products picked up by marketers along with a timestamp (pickup_time).
-- The application can compute the countdown using the pickup_time to determine if 4 days have passed.
-- Optionally, foreign key constraints can be added if needed.

CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL,            -- ID of the marketer (should reference users(id))
  marketer_name VARCHAR(255),              -- Optional: duplicate of the marketer's name for quick reference
  product_id INTEGER NOT NULL,              -- ID of the product (should reference products(id))
  quantity INTEGER NOT NULL DEFAULT 1,      -- Number of products picked up
  pickup_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- When the product was picked up
  status VARCHAR(50) DEFAULT 'active',      -- Status: e.g., 'active', 'sold', 'stale', 'returned_to_store'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optionally, you can add foreign key constraints if your users and products tables exist:
-- ALTER TABLE stocks
--   ADD CONSTRAINT fk_marketer
--   FOREIGN KEY (marketer_id) REFERENCES users(id);
--
-- ALTER TABLE stocks
--   ADD CONSTRAINT fk_product
--   FOREIGN KEY (product_id) REFERENCES products(id);
