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
CREATE INDEX IF NOT EXISTS idx_invitations_trip ON invitations(trip_id);
CREATE INDEX IF NOT EXISTS idx_locations_trip ON location_options(trip_id);
CREATE INDEX IF NOT EXISTS idx_live_events_trip_start ON live_events(trip_id, starts_at);
