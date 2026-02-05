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

CREATE TABLE IF NOT EXISTS survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  satisfaction smallint NOT NULL CHECK (satisfaction BETWEEN 1 AND 5),
  understanding smallint NOT NULL CHECK (understanding BETWEEN 1 AND 5),
  anxiety text NOT NULL,
  compliance jsonb,
  helpful text NOT NULL,
  suggestion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_users_account_lower ON users(account_lower);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON user_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_survey_user_id ON survey_responses(user_id);
