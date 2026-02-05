-- PostgreSQL init script for GI education assistant
-- Creates users and user_profiles tables

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account text NOT NULL,
  account_lower text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_month char(7) NOT NULL CHECK (birth_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  gender text NOT NULL,
  education text NOT NULL,
  phone text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_account_lower ON users(account_lower);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON user_profiles(phone);
