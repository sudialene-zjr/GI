-- Video-related tables for COS storage
-- Used for video management system

-- Video categories table (chapters)
CREATE TABLE IF NOT EXISTS video_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,  -- Code like "1"
  title text NOT NULL,         -- Title like "1.无痛消化内镜诊疗概述"
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Video sections table (subsections)
CREATE TABLE IF NOT EXISTS video_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES video_categories(id) ON DELETE CASCADE,
  code text NOT NULL,         -- Code like "1.1"
  title text NOT NULL,         -- Title like "1.1 概念界定与术式区分"
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, code)
);

-- Video files table
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES video_sections(id) ON DELETE CASCADE,
  code text NOT NULL,                  -- Code like "1.1.1"
  title text NOT NULL,                  -- Title like "1.1.1胃镜、肠镜检查的区别"
  original_filename text NOT NULL,      -- Original filename
  file_hash text NOT NULL UNIQUE,       -- File hash for COS storage
  cos_key text NOT NULL,                -- COS storage key
  file_size bigint NOT NULL,            -- File size in bytes
  duration int,                         -- Video duration in seconds (optional)
  mime_type text NOT NULL DEFAULT 'video/mp4',
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, code)
);

-- Presigned URL cache table (optional, for performance)
CREATE TABLE IF NOT EXISTS presigned_url_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  url text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_videos_section_id ON videos(section_id);
CREATE INDEX IF NOT EXISTS idx_videos_file_hash ON videos(file_hash);
CREATE INDEX IF NOT EXISTS idx_presigned_url_video_id ON presigned_url_cache(video_id);
CREATE INDEX IF NOT EXISTS idx_presigned_url_expires ON presigned_url_cache(expires_at);

-- Update function: auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update time trigger for videos table
DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
