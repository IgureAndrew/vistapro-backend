-- migrations/002_create_orders_table.sql
-- This migration creates the "orders" table used to track sales/orders made by marketers.
-- Adjust foreign key constraints as needed based on your actual schema.

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL,         -- ID of the marketer who made the sale (should reference users(id))
  dealer_id INTEGER,                    -- Optional: ID of the dealer involved (if applicable)
  product_id INTEGER NOT NULL,          -- ID of the product sold (should reference products(id))
  device_category VARCHAR(50),
  dealer_cost_price NUMERIC(10,2),
  marketer_selling_price NUMERIC(10,2),
  order_details TEXT,                   -- Additional details about the order (e.g., customer info, delivery address)
  status VARCHAR(50) DEFAULT 'pending', -- Order status (e.g., 'pending', 'confirmed', 'released_confirmed')
  price NUMERIC(10,2),                  -- Price at which the product was sold
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
