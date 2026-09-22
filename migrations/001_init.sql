-- Workboard schema v1 (2026-09-22). Apply with Migrate.cmd; never edit a migration after it has run.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  next_num INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'person',
  email TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#56636E', ord INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), num INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'Idea' CHECK (stage IN ('Idea','Parked','Plan','Do next','Doing','Done')),
  workstream_id TEXT NOT NULL DEFAULT '', owner_id TEXT NOT NULL DEFAULT '',
  start TEXT NOT NULL DEFAULT '', due TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '' CHECK (impact IN ('','H','M','L')),
  effort TEXT NOT NULL DEFAULT '' CHECK (effort IN ('','H','M','L')),
  priority TEXT NOT NULL DEFAULT '' CHECK (priority IN ('','do','plan','fill','park')),
  notes TEXT NOT NULL DEFAULT '', src_json TEXT NOT NULL DEFAULT '[]',
  blocked INTEGER NOT NULL DEFAULT 0, blocked_reason TEXT NOT NULL DEFAULT '',
  blocked_on TEXT NOT NULL DEFAULT '', blocked_since TEXT NOT NULL DEFAULT '',
  bundle_id TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (project_id, num));
CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY, action_id TEXT NOT NULL REFERENCES actions(id), text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, ord INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS updates (
  id TEXT PRIMARY KEY, action_id TEXT NOT NULL REFERENCES actions(id), at TEXT NOT NULL,
  who TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'change', text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_actions_project ON actions(project_id, deleted);
CREATE INDEX IF NOT EXISTS ix_updates_action ON updates(action_id, at);
CREATE INDEX IF NOT EXISTS ix_checklist_action ON checklist_items(action_id);
CREATE VIEW IF NOT EXISTS v_open AS SELECT * FROM actions WHERE deleted=0 AND stage<>'Done';
CREATE VIEW IF NOT EXISTS v_blocked AS SELECT * FROM v_open WHERE blocked=1;
CREATE VIEW IF NOT EXISTS v_overdue AS SELECT * FROM v_open WHERE due<>'' AND due<date('now');
INSERT OR REPLACE INTO meta(key,value) VALUES ('schema_version','1');
