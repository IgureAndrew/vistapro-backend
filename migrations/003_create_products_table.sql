-- migrations/003_create_products_table.sql
-- This migration creates the "products" table with the required fields.
-- Columns include details about the product, its quantities, and pricing.

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  dealer_id INTEGER NOT NULL,                       -- ID of the dealer who sold or provided the product
  dealer_business_name VARCHAR(255),                -- Business name of the dealer
  device_name VARCHAR(255) NOT NULL,                -- Name of the device/product
  device_model VARCHAR(255) NOT NULL,               -- Model of the device/product
  product_quantity INTEGER NOT NULL,                -- Quantity of the product for a specific order or batch
  overall_product_quantity INTEGER NOT NULL,        -- Total quantity available for the product
  product_base_price NUMERIC(10,2) NOT NULL,          -- Base price of the product
  cost_price NUMERIC(10,2) NOT NULL,                  -- Cost price of the product
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,   -- When the product record was created
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP      -- When the product record was last updated
);
