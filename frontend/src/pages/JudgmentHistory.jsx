import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function JudgmentHistory() {
  const [attempts, setAttempts] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api('/judgment/history')
      .then((data) => setAttempts(data.attempts))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="judgment-page">
      <header className="page-header">
        <Link to="/judgment">←</Link>
        <div><h1>판단 훈련 기록</h1><p className="hint">최근 50회</p></div>
      </header>
      {error && <p className="error">{error}</p>}
      {!error && attempts.length === 0 && <p className="hint">아직 완료한 훈련이 없습니다.</p>}
      <div className="history-list">
        {attempts.map((attempt) => (
          <Link to={`/judgment/results/${attempt.id}`} key={attempt.id}>
            <div><strong>{attempt.scenarioId}</strong><span>{attempt.holdingPeriod}</span></div>
            <div><b>{attempt.totalScore}점</b><span className={attempt.afterReturn >= 0 ? 'positive' : 'negative'}>
              {attempt.afterReturn >= 0 ? '+' : ''}{attempt.afterReturn}%
            </span></div>
          </Link>
        ))}
      </div>
    </div>
  )
}
