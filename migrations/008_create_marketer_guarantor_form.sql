-- migrations/008_create_marketer_guarantor_form_table.sql
-- This migration creates the "marketer_guarantor_form" table to store information from the guarantor form.
-- It includes fields for the guarantor's details and uploaded document URLs.

CREATE TABLE IF NOT EXISTS marketer_guarantor_form (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL,                      -- References the marketer (from the users table)
  is_candidate_well_known BOOLEAN,                   -- Indicates if the guarantor knows the candidate well (true/false)
  relationship TEXT,                                 -- The relationship between the guarantor and the candidate
  known_duration INTEGER,                            -- How many years the guarantor has known the candidate (should be at least 3)
  occupation TEXT,                                   -- Guarantor's occupation
  id_document_url TEXT,                              -- URL of the uploaded identity document image
  passport_photo_url TEXT,                           -- URL of the uploaded passport photograph
  signature_url TEXT,                                -- URL of the uploaded signature image
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    -- When the record was created
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP     -- When the record was last updated
);

-- Optionally, add a foreign key constraint if your users table exists:
-- ALTER TABLE marketer_guarantor_form
--   ADD CONSTRAINT fk_marketer_guarantor
--   FOREIGN KEY (marketer_id) REFERENCES users(id);
