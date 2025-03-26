-- migrations/006_add_is_verified_to_users.sql
-- This migration adds an "is_verified" column to the "users" table.
-- The column is of type BOOLEAN and defaults to false.

ALTER TABLE users
ADD COLUMN is_verified BOOLEAN DEFAULT false;
