import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'

const ACTION_LABEL = { buy: '매수 판단', hold: '관망·보류', avoid: '매수하지 않음' }

export default function JudgmentResult() {
  const { attemptId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/judgment/attempts/${attemptId}`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [attemptId])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="hint center">결과를 불러오는 중…</p>

  const { attempt, scenario } = data
  const positive = attempt.afterReturn >= 0

  return (
    <div className="judgment-page result-page">
      <header className="page-header">
        <Link to="/judgment">←</Link>
        <div>
          <h1>판단 복기</h1>
          <p className="hint">{scenario.stock.nameKr} · {scenario.period.dateLabel}</p>
        </div>
      </header>

      <section className="score-hero">
        <span>판단 과정 점수</span>
        <strong>{attempt.totalScore}<small>/100</small></strong>
        <p>{ACTION_LABEL[attempt.action]} · {attempt.holdingPeriod} 복기</p>
      </section>

      <section className="outcome-card">
        <span>제출 후 공개된 해당 기간 수익률</span>
        <strong className={positive ? 'positive' : 'negative'}>
          {positive ? '+' : ''}{attempt.afterReturn}%
        </strong>
        <p>수익률은 결과일 뿐 판단 점수에는 반영되지 않습니다.</p>
      </section>

      <section className="dimension-list">
        {attempt.dimensions.map((dimension) => (
          <article key={dimension.key}>
            <div>
              <strong>{dimension.label}</strong>
              <span>{dimension.score}/{dimension.max}</span>
            </div>
            <div className="dimension-bar">
              <i style={{ width: `${(dimension.score / dimension.max) * 100}%` }} />
            </div>
            <p>{dimension.feedback}</p>
          </article>
        ))}
      </section>

      <section className="coach-card">
        <h2>{attempt.aiUsed ? 'AI 코치 피드백' : '루브릭 코치 피드백'}</h2>
        <p>{attempt.narrative}</p>
      </section>

      <div className="result-actions">
        <Link className="primary-link" to="/judgment">다른 시나리오 훈련</Link>
        <Link className="secondary-link" to="/judgment/history">전체 기록 보기</Link>
      </div>
    </div>
  )
}
