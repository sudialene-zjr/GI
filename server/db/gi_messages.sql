-- 创建 gi_messages 表用于脱敏存储用户与AI的交互记录
-- 该表独立于 chat_messages 表，用户清空聊天记录不影响此表

CREATE TABLE IF NOT EXISTS gi_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_guest boolean NOT NULL DEFAULT false,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  title text,
  risk_level text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 添加索引用于查询优化
CREATE INDEX IF NOT EXISTS idx_gi_messages_session ON gi_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_gi_messages_user_time ON gi_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gi_messages_guest_time ON gi_messages(is_guest, created_at DESC);

-- 为 guest 用户添加备注字段，便于识别
ALTER TABLE gi_messages ADD COLUMN IF NOT EXISTS guest_identifier text;
