import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'

const QUESTIONS = [
  ['businessModel', '이 회사는 누구에게 무엇을 팔아 돈을 버나요?'],
  ['thesis', '화면에 제시된 수치와 뉴스 중 판단 근거는 무엇인가요?'],
  ['moat', '경쟁사가 쉽게 따라 하기 어려운 강점은 무엇인가요?'],
  ['risks', '내 판단이 틀릴 수 있는 가장 중요한 이유는 무엇인가요?'],
  ['exitPlan', '언제, 어떤 조건에서 이 판단을 바꾸겠나요?'],
]

export default function JudgmentChecklist() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [scenario, setScenario] = useState(null)
  const [answers, setAnswers] = useState(Object.fromEntries(QUESTIONS.map(([key]) => [key, ''])))
  const [action, setAction] = useState('hold')
  const [holdingPeriod, setHoldingPeriod] = useState('3M')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/judgment/scenarios/${id}`)
      .then((data) => setScenario(data.scenario))
      .catch((err) => setError(err.message))
  }, [id])

  const complete = QUESTIONS.every(([key]) => answers[key].trim().length >= 20)

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/judgment/attempts', {
        method: 'POST',
        body: { scenarioId: id, action, holdingPeriod, answers },
      })
      navigate(`/judgment/results/${result.attemptId}`)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="judgment-page">
      <header className="page-header">
        <Link to={`/judgment/${id}`}>←</Link>
        <div>
          <h1>판단 체크리스트</h1>
          <p className="hint">
            {scenario ? `${scenario.stock.nameKr} · ${scenario.period.dateLabel}` : '불러오는 중…'}
          </p>
        </div>
      </header>

      <form className="judgment-form" onSubmit={submit}>
        {QUESTIONS.map(([key, question], index) => (
          <label key={key}>
            <span><b>Q{index + 1}</b> {question}</span>
            <textarea
              value={answers[key]}
              onChange={(event) => setAnswers({ ...answers, [key]: event.target.value })}
              maxLength={1200}
              rows={5}
              required
            />
            <small className={answers[key].trim().length >= 20 ? 'ok' : 'hint'}>
              {answers[key].trim().length}/20자 이상
            </small>
          </label>
        ))}

        <div className="decision-grid">
          <label>
            <span>현재 판단</span>
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="buy">매수 판단</option>
              <option value="hold">관망·보류</option>
              <option value="avoid">매수하지 않음</option>
            </select>
          </label>
          <label>
            <span>복기 기간</span>
            <select value={holdingPeriod} onChange={(event) => setHoldingPeriod(event.target.value)}>
              <option value="1M">1개월</option>
              <option value="3M">3개월</option>
              <option value="6M">6개월</option>
              <option value="1Y">1년</option>
            </select>
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        <button disabled={!complete || submitting} type="submit">
          {submitting ? '채점하고 저장하는 중…' : '판단 제출하고 미래 결과 보기'}
        </button>
      </form>
    </div>
  )
}
