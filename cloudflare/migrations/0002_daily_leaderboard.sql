CREATE TABLE daily_leaderboard (
  day TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  name TEXT NOT NULL,
  meters INTEGER NOT NULL CHECK (meters >= 0),
  reached_at INTEGER NOT NULL,
  PRIMARY KEY (day, driver_id)
);

CREATE INDEX daily_leaderboard_rank
  ON daily_leaderboard (day, meters DESC, reached_at ASC, driver_id ASC);
