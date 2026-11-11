CREATE TABLE IF NOT EXISTS oauth_flow (
  state TEXT PRIMARY KEY,
  browser_challenge TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_handoff (
  code_hash TEXT PRIMARY KEY,
  browser_challenge TEXT NOT NULL,
  account_id TEXT NOT NULL,
  credentials TEXT NOT NULL,
  access_expires INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_session (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  credentials TEXT NOT NULL,
  access_expires INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  refresh_started INTEGER
);

CREATE TABLE IF NOT EXISTS publish_batch (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_target (
  batch_id TEXT NOT NULL REFERENCES publish_batch(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  post_id TEXT,
  message TEXT,
  PRIMARY KEY (batch_id, channel_id)
);

CREATE TABLE IF NOT EXISTS publish_media (
  id TEXT PRIMARY KEY,
  contents BLOB NOT NULL,
  expires INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_flow_expiry ON oauth_flow(expires);
CREATE INDEX IF NOT EXISTS oauth_handoff_expiry ON oauth_handoff(expires);
CREATE INDEX IF NOT EXISTS studio_session_expiry ON studio_session(expires);
CREATE INDEX IF NOT EXISTS publish_batch_age ON publish_batch(created);
CREATE INDEX IF NOT EXISTS publish_media_expiry ON publish_media(expires);
