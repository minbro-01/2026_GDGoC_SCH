// 시연 직전 실행: 시연 계정의 모의투자 세션(+주문/보유 내역)과 AI 코치 대화 기록을 초기화한다.
// 사용법: npm run prepare:demo   (backend/.env의 DEMO_ACCOUNT_EMAIL 계정을 초기화)

import dotenv from "dotenv";
import { pool } from "../src/config/db.js";

dotenv.config();

async function main() {
  const email = process.env.DEMO_ACCOUNT_EMAIL;
  if (!email) {
    console.error("DEMO_ACCOUNT_EMAIL이 .env에 설정되어 있지 않습니다.");
    process.exitCode = 1;
    return;
  }

  const [[user]] = await pool.query("SELECT id, name FROM users WHERE email = ?", [
    email.toLowerCase(),
  ]);
  if (!user) {
    console.error(`시연 계정을 찾을 수 없습니다: ${email}`);
    process.exitCode = 1;
    return;
  }

  // sim_sessions 삭제 시 sim_orders/sim_holdings는 ON DELETE CASCADE로 함께 정리된다.
  const [sessionResult] = await pool.query(
    "DELETE FROM sim_sessions WHERE user_id = ?",
    [user.id]
  );
  const [chatResult] = await pool.query(
    "DELETE FROM chat_messages WHERE user_id = ?",
    [user.id]
  );

  console.log(`[prepare:demo] ${user.name} (${email}) 초기화 완료`);
  console.log(`  - 모의투자 세션 ${sessionResult.affectedRows}건 삭제 (주문·보유 내역 포함)`);
  console.log(`  - AI 코치 대화 ${chatResult.affectedRows}건 삭제`);
}

main()
  .catch((err) => {
    console.error("[prepare:demo] 실패:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
