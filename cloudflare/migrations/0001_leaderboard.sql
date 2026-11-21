CREATE TABLE leaderboard (
  driver_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  meters INTEGER NOT NULL CHECK (meters >= 0),
  reached_at INTEGER NOT NULL
);

CREATE INDEX leaderboard_rank ON leaderboard (meters DESC, reached_at ASC, driver_id ASC);
