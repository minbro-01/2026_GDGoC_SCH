USE gdgoc_sch;

CREATE TABLE IF NOT EXISTS judgment_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  scenario_id VARCHAR(80) NOT NULL,
  action ENUM('buy','hold','avoid') NOT NULL,
  holding_period ENUM('1M','3M','6M','1Y') NOT NULL,
  answers JSON NOT NULL,
  total_score TINYINT UNSIGNED NOT NULL,
  dimension_scores JSON NOT NULL,
  narrative TEXT NOT NULL,
  ai_used BOOLEAN NOT NULL DEFAULT FALSE,
  after_return DECIMAL(8,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_judgment_user_created (user_id, created_at),
  INDEX idx_judgment_scenario (scenario_id)
);
