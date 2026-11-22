CREATE TABLE IF NOT EXISTS bumper_leaderboard (
  board_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  scores LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO bumper_leaderboard (board_id, scores) VALUES (1, '[]');
