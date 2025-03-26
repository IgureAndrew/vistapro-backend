-- migrations/005_create_audit_logs_table.sql
-- This migration creates the "audit_logs" table to track system events for security and auditing purposes.

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,               -- Unique identifier for each log entry.
  user_id INTEGER,                     -- Optional: ID of the user who performed the action (should reference users(id) if applicable).
  action TEXT NOT NULL,                -- A short description of the action (e.g., "LOGIN", "UPDATE_PROFILE").
  details TEXT,                        -- Additional details or metadata about the action.
  ip_address VARCHAR(50),              -- Optional: The IP address from which the action was performed.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp when the log entry was created.
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- Timestamp when the log entry was last updated.
);

-- Optionally, you can add a foreign key constraint on user_id if your users table exists:
-- ALTER TABLE audit_logs
--   ADD CONSTRAINT fk_user
--   FOREIGN KEY (user_id) REFERENCES users(id);
