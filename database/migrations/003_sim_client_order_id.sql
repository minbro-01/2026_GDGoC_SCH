-- 모의투자 주문 중복 제출 차단용 client_order_id 추가.
-- 기존 P0~P1 DB에 sim_orders 테이블이 이미 있다면 1회 적용한다.

USE gdgoc_sch;

ALTER TABLE sim_orders
  ADD COLUMN client_order_id VARCHAR(64) NULL AFTER executed_price,
  ADD UNIQUE KEY uq_sim_orders_client (session_id, client_order_id);
