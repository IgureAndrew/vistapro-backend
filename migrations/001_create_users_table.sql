-- 001_create_users_table.sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  unique_id VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  gender VARCHAR(10) CHECK (gender IN ('male','female')),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  bank_name VARCHAR(100),
  account_number VARCHAR(50),
  account_name VARCHAR(100),
  role VARCHAR(50) NOT NULL,

  business_name VARCHAR(255),
  business_address TEXT,
  cac_document VARCHAR(255),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);