PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Crewmitglied',
  status TEXT NOT NULL DEFAULT 'Dabei',
  color TEXT NOT NULL DEFAULT '#8f5bd7',
  avatar_key TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  flies INTEGER NOT NULL DEFAULT 0,
  login_name TEXT,
  password_hash TEXT,
  password_salt TEXT,
  session_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Crewmitglied',
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS availability (
  profile_id TEXT NOT NULL,
  available_date TEXT NOT NULL,
  PRIMARY KEY (profile_id, available_date),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_options (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  place TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_votes (
  option_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  PRIMARY KEY (option_id, profile_id),
  FOREIGN KEY (option_id) REFERENCES location_options(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS live_events (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  artist TEXT NOT NULL,
  venue TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profiles_trip ON profiles(trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_login_name ON profiles(login_name COLLATE NOCASE) WHERE login_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_trip ON invitations(trip_id);
CREATE INDEX IF NOT EXISTS idx_locations_trip ON location_options(trip_id);
CREATE INDEX IF NOT EXISTS idx_live_events_trip_start ON live_events(trip_id, starts_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL,
  image_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS past_trips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_trip_created ON chat_messages(trip_id, created_at);
CREATE INDEX IF NOT EXISTS idx_highlights_trip_created ON highlights(trip_id, created_at);
CREATE INDEX IF NOT EXISTS idx_past_trips_start ON past_trips(start_date);
