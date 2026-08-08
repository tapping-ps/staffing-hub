import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import SignInPanel from '../dott/SignInPanel.jsx'
import AbsenceEditor from './AbsenceEditor.jsx'
import '../dott/dott.css'
import './relief.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const isoDate = (d) => d.toLocaleDateString('en-CA')

function termDates(term) {
  const start = new Date(term.start_date + 'T00:00:00')
  const weeks = []
  for (let w = 0; w < term.week_count; w++) {
    const days = []
    for (let d = 0; d < 5; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      days.push(date)
    }
    weeks.push(days)
  }
  return weeks
}

const lastName = (full) => full.trim().split(/\s+/).slice(-1)[0]

const COVER_LABELS = { tbc: 'TBC', relief: 'Relief', internal: 'Internal', none: 'No replace' }

export default function ReliefModule({ onHome }) {
  const { session, tier, ready, signOut } = useAuth()
  const [registry, setRegistry] = useState([])
  const [terms, setTerms] = useState([])
  const [termId, setTermId] = useState(null)
  const [reliefTeachers, setReliefTeachers] = useState([])
  const [absences, setAbsences] = useState([])
  const [editor, setEditor] = useState(null) // { date, existing }
  const [reloadFlag, setReloadFlag] = useState(0)

  const canEdit = tier === 'master' || tier === 'minor'
  const reload = () => setReloadFlag((n) => n + 1)

  useEffect(() => {
    if (!supabase || !session) return
    Promise.all([
      supabase.from('staff').select('*').eq('active', true).order('full_name'),
      supabase.from('terms').select('*').order('year').order('term_number'),
      supabase.from('relief_teachers').select('*').eq('active', true).order('full_name'),
    ]).then(([staffRes, termRes, reliefRes]) => {
      setRegistry(staffRes.data ?? [])
      const t = termRes.data ?? []
      setTerms(t)
      if (t.length && !termId) setTermId(t[t.length - 1].id)
      setReliefTeachers(reliefRes.data ?? [])
    })
  }, [session, reloadFlag]) // eslint-disable-line react-hooks/exhaustive-deps

  const term = useMemo(() => terms.find((t) => t.id === termId) ?? null, [terms, termId])

  useEffect(() => {
    if (!supabase || !session || !term) {
      setAbsences([])
      return
    }
    const start = term.start_date
    const end = new Date(term.start_date + 'T00:00:00')
    end.setDate(end.getDate() + term.week_count * 7)
    supabase
      .from('absences')
      .select('*')
      .gte('date', start)
      .lt('date', isoDate(end))
      .order('date')
      .then(({ data }) => setAbsences(data ?? []))
  }, [session, term, reloadFlag])

  const staffById = useMemo(() => Object.fromEntries(registry.map((s) => [s.id, s])), [registry])
  const reliefById = useMemo(() => Object.fromEntries(reliefTeachers.map((r) => [r.id, r])), [reliefTeachers])
  const byDate = useMemo(() => {
    const m = {}
    for (const a of absences) (m[a.date] = m[a.date] ?? []).push(a)
    return m
  }, [absences])

  const tbcCount = absences.filter((a) => a.cover === 'tbc').length
  const today = isoDate(new Date())

  function chipTitle(a) {
    const s = staffById[a.staff_id]
    const parts = [
      s?.full_name ?? 'Unknown',
      a.part !== 'full' ? (a.part === 'am' ? 'morning only' : 'afternoon only') : null,
      a.reason ? `reason: ${a.reason}` : null,
      a.cover === 'relief'
        ? `relief: ${reliefById[a.relief_teacher_id]?.full_name ?? '?'}`
        : a.cover === 'internal'
          ? `internal: ${a.cover_note ?? ''}`
          : COVER_LABELS[a.cover],
      a.notes,
    ]
    return parts.filter(Boolean).join(' · ')
  }

  function chipCoverText(a) {
    if (a.cover === 'relief') {
      const r = reliefById[a.relief_teacher_id]
      return r ? lastName(r.full_name) : 'Relief'
    }
    return COVER_LABELS[a.cover]
  }

  return (
    <div className="dott relief">
      <div className="dott-bar">
        <button className="btn-link" onClick={onHome}>
          ← Hub home
        </button>
        {session && (
          <div className="dott-user">
            <span>
              {session.user.email} · {tier === 'master' ? 'master key' : tier === 'minor' ? 'minor key' : 'view only'}
            </span>
            <button className="btn-link" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </div>

      <h2>Relief Planner</h2>
      <p className="dott-sub">
        Every absence for the term, week by week: who is away, why, and who covers them. Relief teachers are
        remembered as you use them.
      </p>

      {!supabase && <p className="dott-error">Database connection is not configured for this build.</p>}

      {ready && !session && supabase && (
        <div className="dott-signin-wrap">
          <SignInPanel />
          <p className="dott-public-note">The Relief Planner is staff-only; sign in to see it.</p>
        </div>
      )}

      {session && (
        <>
          <div className="term-bar">
            {terms.length > 0 ? (
              <label>
                Term
                <select value={termId ?? ''} onChange={(e) => setTermId(e.target.value)}>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.year} Term {t.term_number}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>No terms set up yet - a master key holder creates them in the DOTT Tracker.</span>
            )}
            {term && (
              <span className="term-progress">
                {absences.length} absence day{absences.length === 1 ? '' : 's'} recorded
                {tbcCount > 0 ? (
                  <strong className="relief-tbc-flag"> · {tbcCount} still TBC</strong>
                ) : absences.length > 0 ? (
                  ' · all covered or resolved'
                ) : (
                  ''
                )}
              </span>
            )}
          </div>

          {term && (
            <div className="dott-tablewrap">
              <table className="sheet-cal relief-cal">
                <thead>
                  <tr>
                    <th>Week</th>
                    {DAY_NAMES.map((d) => (
                      <th key={d}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {termDates(term).map((days, w) => (
                    <tr key={w}>
                      <td className="sheet-week">W{w + 1}</td>
                      {days.map((d) => {
                        const iso = isoDate(d)
                        const list = byDate[iso] ?? []
                        const anyTbc = list.some((a) => a.cover === 'tbc')
                        const classes = [
                          'relief-day',
                          list.length ? (anyTbc ? 'rday-tbc' : 'rday-ok') : '',
                          iso === today ? 'day-today' : '',
                          canEdit ? 'day-editable' : '',
                        ].join(' ')
                        return (
                          <td
                            key={iso}
                            className={classes}
                            onClick={() => canEdit && setEditor({ date: iso, existing: null })}
                          >
                            <span className="day-date">{d.getDate()}</span>
                            {list.map((a) => (
                              <button
                                key={a.id}
                                className={`abs-chip chip-${a.cover}`}
                                title={chipTitle(a)}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (canEdit) setEditor({ date: iso, existing: a })
                                }}
                              >
                                <span className="abs-name">
                                  {lastName(staffById[a.staff_id]?.full_name ?? '?')}
                                  {a.part !== 'full' ? ` (${a.part})` : ''}
                                </span>
                                <span className="abs-cover">{chipCoverText(a)}</span>
                              </button>
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="dott-foot">
            Click a day to record an absence (ranges skip weekends automatically); click an entry to change
            its cover, annotate it or remove it. Amber means someone still needs cover arranged. Payment and
            HRMIS tracking stay outside this tool deliberately.
          </p>

          {editor && (
            <div
              className="modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setEditor(null)
              }}
            >
              <div className="modal">
                <AbsenceEditor
                  date={editor.date}
                  existing={editor.existing}
                  registry={registry}
                  reliefTeachers={reliefTeachers}
                  onDone={(changed) => {
                    setEditor(null)
                    if (changed) reload()
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
