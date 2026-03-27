-- ⚠️ 先清理旧表（避免结构冲突）
DROP TABLE IF EXISTS presigned_url_cache CASCADE;
DROP TABLE IF EXISTS videos CASCADE;
DROP TABLE IF EXISTS video_sections CASCADE;
DROP TABLE IF EXISTS video_categories CASCADE;

-- ⚠️ 确保 UUID 函数可用
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Video categories table
CREATE TABLE video_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Video sections table
CREATE TABLE video_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES video_categories(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, code)
);

-- Videos table
CREATE TABLE videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES video_sections(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  original_filename text NOT NULL,
  file_hash text NOT NULL UNIQUE,
  cos_key text NOT NULL,
  file_size bigint NOT NULL,
  duration int,
  mime_type text NOT NULL DEFAULT 'video/mp4',
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, code)
);

-- Presigned URL cache table
CREATE TABLE presigned_url_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  url text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id)
);

-- Indexes
CREATE INDEX idx_videos_section_id ON videos(section_id);
CREATE INDEX idx_videos_file_hash ON videos(file_hash);
CREATE INDEX idx_presigned_url_video_id ON presigned_url_cache(video_id);
CREATE INDEX idx_presigned_url_expires ON presigned_url_cache(expires_at);

-- Trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER update_videos_updated_at
BEFORE UPDATE ON videos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
