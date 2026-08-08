import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import SignInPanel from './SignInPanel.jsx'
import DottChart from './DottChart.jsx'
import './dott.css'

const PERIOD_MINUTES = { P0: 25, P1: 45, P2: 45, P3: 45, P4: 45, P5: 45, P6: 60 }
const GROUP_LABELS = {
  classroom: 'Classroom teachers (Years 1-6)',
  specialist: 'Specialists',
  ece: 'Kindy and Pre-Primary',
}

const todayISO = () => new Date().toLocaleDateString('en-CA')

function weeksElapsed(term) {
  if (!term) return 0
  const start = new Date(term.start_date + 'T00:00:00')
  const now = new Date()
  if (now < start) return 0
  const days = Math.floor((now - start) / 86400000)
  return Math.min(term.week_count, Math.floor(days / 7) + 1)
}

const fmt = (m) => `${m >= 0 ? '+' : ''}${m}m`
const agreedTotal = (row) => (row.agreedExtras ?? []).reduce((a, e) => a + e.minutes, 0)
const aboveAgreed = (row) => row.weeklyDott - row.entitlement - agreedTotal(row)

/* ---------- add / edit entry form ---------- */
function EntryForm({ staffRow, term, onSaved, onCancel }) {
  const { session } = useAuth()
  const [date, setDate] = useState(todayISO())
  const [direction, setDirection] = useState('lost')
  const [period, setPeriod] = useState('custom')
  const [minutes, setMinutes] = useState(45)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const mins = Math.abs(Number(minutes)) * (direction === 'lost' ? -1 : 1)
    const row = {
      staff_id: staffRow.dbId,
      term_id: term.id,
      date,
      minutes: mins,
      period: period === 'custom' ? null : Number(period.slice(1)),
      note: note.trim() || null,
      created_by: session.user.id,
    }
    const { error: err } = await supabase
      .from('dott_entries')
      .upsert(row, { onConflict: 'staff_id,date,term_id' })
    setBusy(false)
    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <form className="entry-form" onSubmit={save}>
      <div className="entry-fields">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          DOTT was
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="lost">Lost</option>
            <option value="gained">Gained</option>
          </select>
        </label>
        <label>
          Period
          <select
            value={period}
            onChange={(e) => {
              const p = e.target.value
              setPeriod(p)
              if (p !== 'custom') setMinutes(PERIOD_MINUTES[p])
            }}
          >
            <option value="custom">Custom</option>
            {Object.keys(PERIOD_MINUTES).map((p) => (
              <option key={p} value={p}>
                {p} ({PERIOD_MINUTES[p]}m)
              </option>
            ))}
          </select>
        </label>
        <label>
          Minutes
          <input
            type="number"
            min="5"
            step="5"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            disabled={period !== 'custom'}
            required
          />
        </label>
        <label className="entry-note">
          Note
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. covered LA8, specialist away"
          />
        </label>
      </div>
      {error && <p className="dott-error">{error}</p>}
      <div className="entry-actions">
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save entry'}
        </button>
        <button className="btn-link" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="entry-hint">One entry per person per day; saving again on the same date replaces it.</p>
    </form>
  )
}

/* ---------- one staff row ---------- */
function StaffRow({ row, term, entries, canEdit, onChanged }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const agreed = agreedTotal(row)
  const above = aboveAgreed(row)
  const adjust = entries.reduce((a, e) => a + Number(e.minutes), 0)
  const weeks = weeksElapsed(term)
  const balance = term ? above * weeks + adjust : null

  async function remove(entry) {
    await supabase.from('dott_entries').delete().eq('id', entry.id)
    onChanged()
  }

  return (
    <>
      <tr className={open ? 'row-open' : ''} onClick={() => setOpen(!open)}>
        <td>
          <span className="staff-name">{row.name}</span>
          <span className="staff-label">{row.label}</span>
        </td>
        <td className="num">{row.fteLabel ?? row.fte.toFixed(1)}</td>
        <td className="num">{row.entitlement}m</td>
        <td className="num">{row.weeklyDott}m</td>
        <td className="num agreed-cell">
          {agreed > 0
            ? (row.agreedExtras ?? []).map((e) => (
                <span key={e.label}>
                  +{e.minutes} {e.label}
                </span>
              ))
            : '—'}
        </td>
        <td className={`num strong ${above > 0 ? 'pos' : above < 0 ? 'neg' : 'zero'}`}>{fmt(above)}</td>
        {term && (
          <>
            <td className={`num ${adjust > 0 ? 'pos' : adjust < 0 ? 'neg' : ''}`}>
              {entries.length ? fmt(adjust) : '—'}
            </td>
            <td className={`num strong ${balance >= 0 ? 'pos' : 'neg'}`}>{fmt(balance)}</td>
          </>
        )}
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={term ? 8 : 6}>
            <div className="detail">
              {row.note && <p className="detail-note">{row.note}</p>}
              {row.lead > 0 && (
                <p className="detail-note">Leadership release: {row.lead}m per week, tracked separately from DOTT.</p>
              )}
              {term ? (
                <>
                  <h4>
                    {term.year} Term {term.term_number} ledger · week {weeksElapsed(term)} of {term.week_count}
                  </h4>
                  {entries.length === 0 && <p className="detail-empty">No lost or gained DOTT recorded this term.</p>}
                  {entries.length > 0 && (
                    <ul className="entry-list">
                      {entries.map((e) => (
                        <li key={e.id}>
                          <span className={Number(e.minutes) >= 0 ? 'pos' : 'neg'}>{fmt(Number(e.minutes))}</span>
                          <span>{e.date}</span>
                          {e.period !== null && e.period !== undefined && <span>P{e.period}</span>}
                          {e.note && <span className="entry-note-text">{e.note}</span>}
                          {canEdit && (
                            <button
                              className="btn-link danger"
                              onClick={(ev) => {
                                ev.stopPropagation()
                                remove(e)
                              }}
                            >
                              remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit && !adding && row.dbId && (
                    <button
                      className="btn-secondary"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setAdding(true)
                      }}
                    >
                      Record lost / gained DOTT
                    </button>
                  )}
                  {canEdit && !row.dbId && (
                    <p className="detail-empty">Not in the staff registry yet — run the staff sync first.</p>
                  )}
                  {adding && (
                    <div onClick={(ev) => ev.stopPropagation()}>
                      <EntryForm
                        staffRow={row}
                        term={term}
                        onSaved={() => {
                          setAdding(false)
                          onChanged()
                        }}
                        onCancel={() => setAdding(false)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="detail-empty">Sign in and set up a term to record lost or gained DOTT.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/* ---------- new term form (master keys) ---------- */
function TermForm({ onSaved }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [termNumber, setTermNumber] = useState(3)
  const [startDate, setStartDate] = useState('')
  const [weekCount, setWeekCount] = useState(10)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setError(null)
    const d = new Date(startDate + 'T00:00:00')
    if (d.getDay() !== 1) {
      setError('The start date must be a Monday.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.from('terms').insert({
      year: Number(year),
      term_number: Number(termNumber),
      start_date: startDate,
      week_count: Number(weekCount),
    })
    setBusy(false)
    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <form className="term-form" onSubmit={save}>
      <strong>Set up a term</strong>
      <label>
        Year
        <input type="number" min="2020" max="2040" value={year} onChange={(e) => setYear(e.target.value)} />
      </label>
      <label>
        Term
        <select value={termNumber} onChange={(e) => setTermNumber(e.target.value)}>
          {[1, 2, 3, 4].map((t) => (
            <option key={t} value={t}>
              Term {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        First Monday
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </label>
      <label>
        Weeks
        <input type="number" min="8" max="14" value={weekCount} onChange={(e) => setWeekCount(e.target.value)} />
      </label>
      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Create term'}
      </button>
      {error && <p className="dott-error">{error}</p>}
    </form>
  )
}

/* ---------- the module ---------- */
export default function DottModule({ onHome }) {
  const { session, tier, ready, signOut } = useAuth()
  const [baseline, setBaseline] = useState(null)
  const [baselineError, setBaselineError] = useState(null)
  const [registry, setRegistry] = useState([])
  const [terms, setTerms] = useState([])
  const [termId, setTermId] = useState(null)
  const [entries, setEntries] = useState([])
  const [reloadFlag, setReloadFlag] = useState(0)

  const canEdit = tier === 'master' || tier === 'minor'

  useEffect(() => {
    fetch('./dott-baseline.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(setBaseline)
      .catch((e) => setBaselineError(String(e)))
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      setRegistry([])
      setTerms([])
      setEntries([])
      return
    }
    Promise.all([
      supabase.from('staff').select('id, hub_key, full_name').eq('active', true),
      supabase.from('terms').select('*').order('year').order('term_number'),
    ]).then(([staffRes, termRes]) => {
      setRegistry(staffRes.data ?? [])
      const t = termRes.data ?? []
      setTerms(t)
      if (t.length && !termId) setTermId(t[t.length - 1].id)
    })
  }, [session, reloadFlag]) // eslint-disable-line react-hooks/exhaustive-deps

  const term = useMemo(() => terms.find((t) => t.id === termId) ?? null, [terms, termId])

  useEffect(() => {
    if (!supabase || !session || !term) {
      setEntries([])
      return
    }
    supabase
      .from('dott_entries')
      .select('*')
      .eq('term_id', term.id)
      .order('date')
      .then(({ data }) => setEntries(data ?? []))
  }, [session, term, reloadFlag])

  const rows = useMemo(() => {
    if (!baseline) return []
    const byKey = Object.fromEntries(registry.map((s) => [s.hub_key, s]))
    return baseline.staff.map((s) => ({ ...s, dbId: byKey[s.key]?.id ?? null }))
  }, [baseline, registry])

  const entriesByStaff = useMemo(() => {
    const m = {}
    for (const e of entries) (m[e.staff_id] = m[e.staff_id] ?? []).push(e)
    return m
  }, [entries])

  const groups = ['classroom', 'specialist', 'ece']
  const reload = () => setReloadFlag((n) => n + 1)

  const showTermMeasure = Boolean(session && term)
  const chartGroups = useMemo(() => {
    const weeks = weeksElapsed(term)
    return groups.map((g) => ({
      key: g,
      label: GROUP_LABELS[g],
      rows: rows
        .filter((r) => r.group === g)
        .map((r) => {
          const above = aboveAgreed(r)
          const adjust = r.dbId
            ? (entriesByStaff[r.dbId] ?? []).reduce((a, e) => a + Number(e.minutes), 0)
            : 0
          const value = showTermMeasure ? above * weeks + adjust : above
          const agreed = agreedTotal(r)
          const title =
            `${r.name} · entitlement ${r.entitlement}m · timetabled ${r.weeklyDott}m` +
            (agreed ? ` · agreed extras +${agreed}m` : '') +
            (showTermMeasure
              ? ` · adjustments ${fmt(adjust)} · balance ${fmt(value)}`
              : ` · above agreed ${fmt(above)}`)
          return { key: r.key, name: r.name, value, title }
        })
        .sort((a, b) => a.value - b.value),
    }))
  }, [rows, entriesByStaff, showTermMeasure, term]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dott">
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

      <h2>DOTT Tracker</h2>
      <p className="dott-sub">
        Baseline fed straight from the Semester 2 timetable
        {baseline && <> (timetable solved {baseline.meta.timetableGenerated}, baseline built {baseline.meta.baselineBuilt})</>}.
        When the timetable changes, these numbers follow it.
      </p>

      {!supabase && (
        <p className="dott-error">Database connection is not configured for this build; ledger features are off.</p>
      )}
      {baselineError && <p className="dott-error">Could not load the timetable baseline: {baselineError}</p>}

      {ready && !session && supabase && (
        <div className="dott-signin-wrap">
          <SignInPanel />
          <p className="dott-public-note">
            You can browse the timetabled DOTT baseline below without signing in. The term ledger (lost and
            gained DOTT) needs a staff sign-in.
          </p>
        </div>
      )}

      {session && (
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
            <span>No terms set up yet.</span>
          )}
          {term && (
            <span className="term-progress">
              Week {weeksElapsed(term)} of {term.week_count} · started {term.start_date}
            </span>
          )}
          {tier === 'master' && <TermForm onSaved={reload} />}
        </div>
      )}

      {session && registry.length === 0 && (
        <p className="dott-error">
          The staff registry is empty. A master key holder needs to run <code>supabase/002-staff-sync.sql</code> once.
        </p>
      )}

      {baseline && (
        <DottChart
          groups={chartGroups}
          measureLabel={
            showTermMeasure
              ? `${term.year} Term ${term.term_number} balance to week ${weeksElapsed(term)} (minutes)`
              : 'Weekly minutes above the agreed package'
          }
        />
      )}

      {baseline &&
        groups.map((g) => (
          <section key={g} className="dott-group">
            <h3>{GROUP_LABELS[g]}</h3>
            <div className="dott-tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th className="num">FTE</th>
                    <th className="num">Entitlement</th>
                    <th className="num">Timetabled</th>
                    <th className="num">Agreed extras</th>
                    <th className="num">Above agreed</th>
                    {term && session && (
                      <>
                        <th className="num">Adjustments</th>
                        <th className="num">Term balance</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) => r.group === g)
                    .map((r) => (
                      <StaffRow
                        key={r.key}
                        row={r}
                        term={session ? term : null}
                        entries={r.dbId ? (entriesByStaff[r.dbId] ?? []) : []}
                        canEdit={canEdit}
                        onChanged={reload}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      <p className="dott-foot">
        Agreed extras are negotiated, spoken-for time: the 15-minute collaboration top-up buys the co-lab
        session, and the graduate allocation is protected. They are shown as sub-numbers, not surplus.
        Above agreed is what a teacher truly runs over or under each week once the agreed package is
        honoured. Adjustments are DOTT lost (negative) or gained (positive) recorded by key holders. Term
        balance = above agreed × weeks so far + adjustments. Leadership release time is shown in each
        teacher's notes, never counted as DOTT.
      </p>
    </div>
  )
}
