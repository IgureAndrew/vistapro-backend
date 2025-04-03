-- migrations/007_create_marketer_biodata_table.sql
-- This migration creates the "marketer_biodata" table to store bio-data form information for marketers.
-- Adjust the data types and lengths as needed.

CREATE TABLE IF NOT EXISTS marketer_biodata (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL,                  -- Reference to the marketer (users table)
  name VARCHAR(255) NOT NULL,                      -- Full name of the marketer
  address TEXT,                                    -- Residential address
  phone VARCHAR(50),                               -- Phone number
  religion VARCHAR(100),                           -- Religion
  date_of_birth DATE,                              -- Date of birth
  marital_status VARCHAR(50),                      -- Marital status
  state_of_origin VARCHAR(100),                    -- State of origin
  state_of_residence VARCHAR(100),                 -- State of residence
  mothers_maiden_name VARCHAR(255),                -- Mother's maiden name
  school_attended TEXT,                            -- Schools attended (with dates) as free text
  means_of_identification VARCHAR(50),             -- e.g., 'Driver''s License', 'Voter''s Card', 'International Passport', 'National ID', 'NIN'
  id_document_url TEXT,                            -- URL to the uploaded ID document image
  last_place_of_work TEXT,                         -- Last place of work
  job_description TEXT,                            -- Job description from previous employment
  reason_for_quitting TEXT,                        -- Reason for quitting previous job
  medical_condition TEXT,                          -- Any medical conditions to be noted
  next_of_kin_name VARCHAR(255),                   -- Name of next of kin
  next_of_kin_phone VARCHAR(50),                   -- Phone number of next of kin
  next_of_kin_address TEXT,                        -- Address of next of kin
  next_of_kin_relationship VARCHAR(100),           -- Relationship with next of kin
  bank_name VARCHAR(100),                          -- Bank name for account details
  account_name VARCHAR(255),                       -- Account holder's name
  account_number VARCHAR(50),                      -- Bank account number
  passport_photo_url TEXT,                         -- URL to the uploaded passport photo
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Record creation time
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- Last update time
);

