import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export default function Home() {
  const { user, logout } = useAuth()

  const xpPct = user
    ? Math.min(100, Math.round((user.xp / user.nextLevelXp) * 100))
    : 0

  return (
    <div className="home-page">
      <header className="home-header">
        <div>
          <h1>안녕하세요, {user?.name}님</h1>
          <p className="hint">
            {user?.risk_type
              ? `투자 성향: ${user.risk_type}`
              : '아직 성향 진단을 하지 않았어요'}
          </p>
        </div>
        <button className="ghost" onClick={logout}>
          로그아웃
        </button>
      </header>

      <section className="level-card">
        <p>
          Lv.{user?.level} · XP {user?.xp} / {user?.nextLevelXp}
        </p>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${xpPct}%` }} />
        </div>
      </section>

      <nav className="menu-grid">
        <Link className="menu-card highlight" to="/judgment">
          <h2>투자 판단 훈련</h2>
          <p>과거 시점에서 근거·리스크·판단 변경 기준 연습</p>
        </Link>
        <Link className="menu-card" to="/edu">
          <h2>투자 교육</h2>
          <p>경제 · 금융 · 주식 · 은어 4챕터</p>
        </Link>
        <Link className="menu-card" to="/sim">
          <h2>모의투자</h2>
          <p>가상 코인으로 실전 연습</p>
        </Link>
        <Link className="menu-card" to="/glossary">
          <h2>용어 사전</h2>
          <p>모르는 용어 바로 검색</p>
        </Link>
        {!user?.risk_type && (
          <Link className="menu-card highlight" to="/onboarding/survey">
            <h2>성향 진단</h2>
            <p>나에게 맞는 AI 어시스턴트 만나기</p>
          </Link>
        )}
      </nav>
    </div>
  )
}
