-- migrations/002_create_orders_table.sql
-- This migration creates the "orders" table used to track sales/orders made by marketers.
-- Adjust foreign key constraints as needed based on your actual schema.

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL,
  device_name TEXT NOT NULL,
  device_model TEXT NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  dealer_cost_price NUMERIC(10,2) NOT NULL,
  marketer_selling_price NUMERIC(10,2) NOT NULL,
  number_of_devices INTEGER NOT NULL,
  sold_amount NUMERIC(10,2) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  customer_address TEXT NOT NULL,
  bnpl_platform VARCHAR(50),
  sale_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
