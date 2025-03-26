-- 001_create_users_table.sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  unique_id VARCHAR(50) UNIQUE, -- Optional extra unique identifier
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  role VARCHAR(50) NOT NULL, -- e.g., MasterAdmin, SuperAdmin, Admin, Dealer, Marketer
  gender VARCHAR(20),
  admin_id INTEGER,         -- For marketers: the admin they're assigned to
  super_admin_id INTEGER,   -- For admins: the super admin they report to
  warning_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
