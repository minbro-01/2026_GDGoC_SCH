-- 모의투자(라이브) 시연용 종목 시드 — BTC/ETH/XRP만 사용한다.
-- 적용: mysql -u root -p gdgoc_sch < database/seed_sim.sql

USE gdgoc_sch;

INSERT INTO instruments (mode, symbol, display_name) VALUES
  ('live', 'KRW-BTC', '비트코인'),
  ('live', 'KRW-ETH', '이더리움'),
  ('live', 'KRW-XRP', '리플')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);
