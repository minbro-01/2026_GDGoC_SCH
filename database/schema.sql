-- 투자 교육 · 모의투자 플랫폼 스키마
-- 적용: mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS gdgoc_sch
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gdgoc_sch;

-- ---------------------------------------------------------------------------
-- 사용자 / 성향
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  birth_year SMALLINT NULL,
  gender ENUM('M','F','X') NULL,  -- X: 선택 안 함
  risk_type ENUM('안정형','안정추구형','위험중립형','적극투자형','공격투자형') NULL,
  xp INT NOT NULL DEFAULT 0,
  level TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  answers JSON NOT NULL,
  score INT NOT NULL,
  risk_type ENUM('안정형','안정추구형','위험중립형','적극투자형','공격투자형') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 교육 (챕터 → 레슨 → 퀴즈)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(50) NOT NULL UNIQUE,  -- economy | finance | stock | slang
  title VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content MEDIUMTEXT NOT NULL,  -- Markdown 개념 카드
  sort_order INT NOT NULL DEFAULT 0,
  xp_reward INT NOT NULL DEFAULT 10,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  lesson_id INT NULL,       -- NULL이면 챕터 종합퀴즈 문항
  material_id INT NULL,     -- 심화 교육 지문 문항 (adv_materials)
  qtype ENUM('MC','OX') NOT NULL,
  question TEXT NOT NULL,
  choices JSON NULL,        -- MC: ["보기1", ...]
  answer VARCHAR(255) NOT NULL,
  explanation TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_lesson_progress (
  user_id INT NOT NULL,
  lesson_id INT NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, lesson_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_quiz_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  question_id INT NOT NULL,
  chosen VARCHAR(255) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  term VARCHAR(100) NOT NULL,
  definition TEXT NOT NULL,
  example TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  INDEX idx_term (term)
);

-- ---------------------------------------------------------------------------
-- 심화 교육
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS adv_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mtype ENUM('article','report','financial_stmt') NOT NULL,
  title VARCHAR(200) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  meta JSON NULL,  -- 출처, 기업명, 기간 등
  min_level TINYINT NOT NULL DEFAULT 5
);

-- ---------------------------------------------------------------------------
-- 시뮬레이션 (코인 전용: live=업비트 미러링, historical=과거 리플레이)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS instruments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mode ENUM('historical','live') NOT NULL,
  symbol VARCHAR(30) NOT NULL,        -- live: KRW-BTC 등 업비트 마켓 코드
  display_name VARCHAR(100) NOT NULL, -- historical은 익명명 ("A코인")
  real_name VARCHAR(100) NULL,        -- 시나리오 종료 후 공개용
  UNIQUE KEY uq_mode_symbol (mode, symbol)
);

CREATE TABLE IF NOT EXISTS price_candles (
  instrument_id INT NOT NULL,
  ts DATETIME NOT NULL,
  open DECIMAL(18,4) NOT NULL,
  high DECIMAL(18,4) NOT NULL,
  low DECIMAL(18,4) NOT NULL,
  close DECIMAL(18,4) NOT NULL,
  volume DECIMAL(24,8) NULL,
  PRIMARY KEY (instrument_id, ts),
  FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

-- 과거 기사 (시나리오 진행 중 당시 뉴스로 제공)
CREATE TABLE IF NOT EXISTS articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  published_at DATETIME NOT NULL,
  title VARCHAR(300) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  source VARCHAR(100) NULL,
  instrument_ids JSON NULL,  -- 관련 종목
  INDEX idx_published (published_at)
);

CREATE TABLE IF NOT EXISTS scenarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  start_ts DATETIME NOT NULL,
  end_ts DATETIME NOT NULL,
  min_level TINYINT NOT NULL DEFAULT 3,
  instrument_ids JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS sim_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  mode ENUM('historical','live') NOT NULL,
  scenario_id INT NULL,
  seed_money DECIMAL(18,2) NOT NULL,
  cash DECIMAL(18,2) NOT NULL,
  status ENUM('active','ended') NOT NULL DEFAULT 'active',
  sim_clock DATETIME NULL,  -- 시나리오 모드의 가상 현재 시각
  final_return DECIMAL(8,4) NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sim_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  instrument_id INT NOT NULL,
  side ENUM('BUY','SELL') NOT NULL,
  order_type ENUM('MARKET','LIMIT') NOT NULL,
  qty DECIMAL(18,8) NOT NULL,
  price DECIMAL(18,4) NULL,  -- LIMIT 지정가
  status ENUM('filled','open','cancelled') NOT NULL,
  executed_price DECIMAL(18,4) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

CREATE TABLE IF NOT EXISTS sim_holdings (
  session_id INT NOT NULL,
  instrument_id INT NOT NULL,
  qty DECIMAL(18,8) NOT NULL,
  avg_price DECIMAL(18,4) NOT NULL,
  PRIMARY KEY (session_id, instrument_id),
  FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

-- ---------------------------------------------------------------------------
-- AI 어시스턴트 / XP
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  sim_session_id INT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sim_session_id) REFERENCES sim_sessions(id) ON DELETE SET NULL
);

-- 투자 판단 훈련: 미래 결과는 서버가 제출 후에만 공개한다.
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

CREATE TABLE IF NOT EXISTS xp_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(100) NOT NULL,  -- lesson_complete:12, quiz_pass:3, ...
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_xp_events_user_reason (user_id, reason)
);

-- ---------------------------------------------------------------------------
-- 기본 시드 데이터
-- ---------------------------------------------------------------------------

INSERT INTO chapters (slug, title, description, sort_order) VALUES
  ('economy', '경제', '금리, 인플레이션, 환율 등 경제의 큰 그림', 1),
  ('finance', '금융', '예적금부터 펀드/ETF까지 금융상품의 기초', 2),
  ('stock',   '주식', '시가총액, PER부터 재무제표 기초까지', 3),
  ('slang',   '투자 은어', '물타기, 존버, 숏… 커뮤니티 용어 해독', 4)
ON DUPLICATE KEY UPDATE title = VALUES(title);
