CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  content_type TEXT DEFAULT 'free',
  tags TEXT DEFAULT '[]',
  word_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_lists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  list_id TEXT REFERENCES todo_lists(id),
  session_id TEXT REFERENCES sessions(id),
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  color TEXT NOT NULL,
  comment TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_injections (
  id TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,
  skills TEXT NOT NULL,
  docs TEXT NOT NULL,
  target_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  injected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recent_inject_paths (
  path TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS compose_defaults (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tipo TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
