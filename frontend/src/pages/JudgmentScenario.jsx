import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'

function PriceChart({ values }) {
  const points = useMemo(() => {
    if (!values?.length) return ''
    const prices = values.map((item) => item.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const range = max - min || 1
    return values
      .map((item, index) => {
        const x = 10 + (index / Math.max(1, values.length - 1)) * 300
        const y = 125 - ((item.price - min) / range) * 105
        return `${x},${y}`
      })
      .join(' ')
  }, [values])

  return (
    <div className="price-chart">
      <svg viewBox="0 0 320 140" role="img" aria-label="제시 시점까지의 가격 추이">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <div className="chart-labels">
        <span>{values?.[0]?.date}</span>
        <span>{values?.at(-1)?.date}</span>
      </div>
    </div>
  )
}

export default function JudgmentScenario() {
  const { id } = useParams()
  const [scenario, setScenario] = useState(null)
  const [tab, setTab] = useState('chart')
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/judgment/scenarios/${id}`)
      .then((data) => setScenario(data.scenario))
      .catch((err) => setError(err.message))
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!scenario) return <p className="hint center">시나리오를 불러오는 중…</p>

  const { snapshot, stock, period } = scenario
  const metrics = snapshot.financials

  return (
    <div className="judgment-page scenario-detail">
      <header className="page-header">
        <Link to="/judgment">←</Link>
        <div>
          <h1>{scenario.ticker} · {stock.nameKr}</h1>
          <p className="hint">{period.dateLabel} · 정보 기준일 {period.cutoffDate}</p>
        </div>
      </header>

      <section className="price-hero">
        <strong>${snapshot.priceAtTime}</strong>
        <span className={snapshot.changeFromPrevYear >= 0 ? 'positive' : 'negative'}>
          {snapshot.changeFromPrevYear >= 0 ? '+' : ''}{snapshot.changeFromPrevYear}% 전년 대비
        </span>
      </section>

      <section className={`event-panel ${period.eventType}`}>
        <strong>{period.eventLabel}</strong>
        <p>{period.description}</p>
      </section>

      <div className="detail-tabs" role="tablist" aria-label="시나리오 자료">
        {[
          ['chart', '차트'],
          ['news', '뉴스'],
          ['metrics', '재무지표'],
        ].map(([key, label]) => (
          <button
            className={tab === key ? 'active' : ''}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'chart' && (
        <section className="detail-card">
          <PriceChart values={snapshot.priceHistory} />
          <p className="future-hidden">이 시점 이후의 가격은 판단 제출 후 공개됩니다.</p>
        </section>
      )}

      {tab === 'news' && (
        <section className="news-list">
          {snapshot.news.map((news) => (
            <article className="news-card" key={`${news.date}-${news.headline}`}>
              <div><span>{news.category}</span><time>{news.date}</time></div>
              <h2>{news.headline}</h2>
              <p>{news.summary}</p>
            </article>
          ))}
        </section>
      )}

      {tab === 'metrics' && (
        <section className="metric-grid">
          <div><span>기준 분기</span><strong>{metrics.quarter}</strong></div>
          <div><span>매출</span><strong>{metrics.revenue}</strong></div>
          <div><span>EPS</span><strong>{metrics.eps}</strong></div>
          <div><span>PER</span><strong>{metrics.per}배</strong></div>
          <div><span>PBR</span><strong>{metrics.pbr}배</strong></div>
          <div><span>ROE</span><strong>{metrics.roe}%</strong></div>
          <div><span>영업이익률</span><strong>{metrics.operatingMargin}%</strong></div>
          <div><span>매출 성장률</span><strong>{metrics.revenueGrowthYoY}%</strong></div>
        </section>
      )}

      <section className="source-box">
        <h2>근거 자료</h2>
        {period.sources.map((source) => (
          <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
            {source.label} ↗
          </a>
        ))}
        <p>{scenario.dataNotice} · 구조 검토일 {scenario.reviewedAt}</p>
      </section>

      <Link className="primary-link" to={`/judgment/${id}/checklist`}>
        매수 전 체크리스트 시작하기
      </Link>
    </div>
  )
}
