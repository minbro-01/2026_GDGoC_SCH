import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function JudgmentHub() {
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/judgment/scenarios')
      .then((data) => setScenarios(data.scenarios))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="judgment-page">
      <header className="page-header">
        <Link to="/">←</Link>
        <div>
          <h1>투자 판단 훈련</h1>
          <p className="hint">결과를 맞히는 대신 좋은 판단 과정을 반복합니다.</p>
        </div>
      </header>

      <section className="training-intro">
        <strong>미래 가격은 제출 전까지 공개되지 않습니다.</strong>
        <p>
          당시 차트·뉴스·재무지표만 보고 사업 모델, 근거, 경쟁력, 리스크,
          판단 변경 기준을 기록하세요.
        </p>
      </section>

      <div className="training-actions">
        <span>{scenarios.length}개 역사적 스냅샷</span>
        <Link to="/judgment/history">내 훈련 기록</Link>
      </div>

      {loading && <p className="hint">시나리오를 불러오는 중…</p>}
      {error && <p className="error">{error}</p>}

      <div className="scenario-list">
        {scenarios.map((scenario) => (
          <Link className="scenario-card" to={`/judgment/${scenario.id}`} key={scenario.id}>
            <div className="scenario-card-top">
              <span className="ticker-badge">{scenario.ticker}</span>
              <span className={`event-badge ${scenario.period.eventType}`}>
                {scenario.period.eventLabel}
              </span>
            </div>
            <h2>{scenario.stock.nameKr}</h2>
            <p>{scenario.period.dateLabel} · {scenario.stock.sector}</p>
            <div className="scenario-price-row">
              <strong>${scenario.currentPrice}</strong>
              <span className={scenario.changeFromPrevYear >= 0 ? 'positive' : 'negative'}>
                {scenario.changeFromPrevYear >= 0 ? '+' : ''}{scenario.changeFromPrevYear}% 전년 대비
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
