import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

const PERIOD_MINUTES = { P0: 25, P1: 45, P2: 45, P3: 45, P4: 45, P5: 45, P6: 60 }
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const fmt = (m) => `${m >= 0 ? '+' : ''}${m}m`
const agreedTotal = (row) => (row.agreedExtras ?? []).reduce((a, e) => a + e.minutes, 0)
const aboveAgreed = (row) => row.weeklyDott - row.entitlement - agreedTotal(row)

function isoDate(d) {
  return d.toLocaleDateString('en-CA')
}

function termDates(term) {
  // weeks x Mon-Fri, from the term's first Monday
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

function timetableLink(key) {
  const t = key.startsWith('spec:') ? key.slice(5) : key
  return './timetable/?v=teacher&t=' + encodeURIComponent(t)
}

/* Editor for one day: create, change, annotate or remove that day's entry */
function DayEditor({ row, term, date, existing, onDone }) {
  const { session } = useAuth()
  const [direction, setDirection] = useState(existing && Number(existing.minutes) >= 0 ? 'gained' : 'lost')
  const [period, setPeriod] = useState(
    existing && existing.period !== null && existing.period !== undefined ? 'P' + existing.period : 'custom',
  )
  const [minutes, setMinutes] = useState(existing ? Math.abs(Number(existing.minutes)) : 45)
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const mins = Math.abs(Number(minutes)) * (direction === 'lost' ? -1 : 1)
    const { error: err } = await supabase.from('dott_entries').upsert(
      {
        staff_id: row.dbId,
        term_id: term.id,
        date,
        minutes: mins,
        period: period === 'custom' ? null : Number(period.slice(1)),
        note: note.trim() || null,
        created_by: session.user.id,
      },
      { onConflict: 'staff_id,date,term_id' },
    )
    setBusy(false)
    if (err) setError(err.message)
    else onDone()
  }

  async function remove() {
    if (!existing) return
    setBusy(true)
    const { error: err } = await supabase.from('dott_entries').delete().eq('id', existing.id)
    setBusy(false)
    if (err) setError(err.message)
    else onDone()
  }

  const prettyDate = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <form className="entry-form day-editor" onSubmit={save}>
      <strong>
        {row.name} · {prettyDate}
      </strong>
      <span className="day-editor-sub">{existing ? 'Edit or annotate this entry' : 'Record lost or gained DOTT'}</span>
      <div className="entry-fields">
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
          Annotation
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="why - e.g. covered LA8 while Bell at PD"
          />
        </label>
      </div>
      {error && <p className="dott-error">{error}</p>}
      <div className="entry-actions">
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {existing && (
          <button className="btn-link danger" type="button" onClick={remove} disabled={busy}>
            Remove this entry
          </button>
        )}
        <button className="btn-link" type="button" onClick={onDone}>
          Close
        </button>
      </div>
    </form>
  )
}

export default function TeacherSheet({ row, term, entries, canEdit, reload }) {
  const [editingDate, setEditingDate] = useState(null)
  const { session } = useAuth()

  const agreed = agreedTotal(row)
  const above = aboveAgreed(row)
  const adjust = entries.reduce((a, e) => a + Number(e.minutes), 0)

  const byDate = Object.fromEntries(entries.map((e) => [e.date, e]))
  const today = isoDate(new Date())

  let weeksElapsed = 0
  if (term) {
    const start = new Date(term.start_date + 'T00:00:00')
    const now = new Date()
    if (now >= start) weeksElapsed = Math.min(term.week_count, Math.floor((now - start) / 86400000 / 7) + 1)
  }
  const balance = term ? above * weeksElapsed + adjust : null

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div>
          <h3>{row.name}</h3>
          <p className="sheet-role">
            {row.label} · FTE {row.fteLabel ?? row.fte.toFixed(1)}
          </p>
        </div>
        <a className="btn-secondary" href={timetableLink(row.key)} target="_blank" rel="noreferrer">
          View weekly timetable
        </a>
      </div>

      <div className="sheet-cards">
        <div className="card">
          <span className="lab">Entitlement</span>
          <span className="val">{row.entitlement}m</span>
        </div>
        <div className="card">
          <span className="lab">Timetabled</span>
          <span className="val">{row.weeklyDott}m</span>
        </div>
        <div className="card">
          <span className="lab">Agreed extras</span>
          <span className="val">
            {agreed > 0 ? (row.agreedExtras ?? []).map((e) => `+${e.minutes} ${e.label}`).join(' · ') : '—'}
          </span>
        </div>
        <div className="card">
          <span className="lab">Leadership</span>
          <span className="val">{row.lead > 0 ? `${row.lead}m ${row.leadRole ?? ''}` : '—'}</span>
        </div>
        <div className="card">
          <span className="lab">Above agreed / week</span>
          <span className={`val ${above > 0 ? 'pos' : above < 0 ? 'neg' : ''}`}>{fmt(above)}</span>
        </div>
        {term && (
          <>
            <div className="card">
              <span className="lab">Adjustments this term</span>
              <span className={`val ${adjust > 0 ? 'pos' : adjust < 0 ? 'neg' : ''}`}>{fmt(adjust)}</span>
            </div>
            <div className="card card-balance">
              <span className="lab">Term balance (week {weeksElapsed})</span>
              <span className={`val ${balance >= 0 ? 'pos' : 'neg'}`}>{fmt(balance)}</span>
            </div>
          </>
        )}
      </div>

      {row.note && <p className="detail-note">{row.note}</p>}

      {!term && (
        <p className="dott-error">
          {session ? 'No term is set up yet, so there is no calendar to show.' : 'Sign in to see the term calendar and ledger.'}
        </p>
      )}

      {term && (
        <>
          <h4 className="sheet-calhead">
            {term.year} Term {term.term_number} · every day, week by week
            {canEdit ? ' · click any day to record or annotate' : ''}
          </h4>
          <div className="dott-tablewrap">
            <table className="sheet-cal">
              <thead>
                <tr>
                  <th>Week</th>
                  {DAY_NAMES.map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                  <th className="num">Week total</th>
                </tr>
              </thead>
              <tbody>
                {termDates(term).map((days, w) => {
                  const weekSum = days.reduce((a, d) => a + (byDate[isoDate(d)] ? Number(byDate[isoDate(d)].minutes) : 0), 0)
                  return (
                    <tr key={w}>
                      <td className="sheet-week">W{w + 1}</td>
                      {days.map((d) => {
                        const iso = isoDate(d)
                        const entry = byDate[iso]
                        const classes = [
                          'sheet-day',
                          entry ? (Number(entry.minutes) >= 0 ? 'day-gain' : 'day-loss') : '',
                          iso === today ? 'day-today' : '',
                          canEdit && row.dbId ? 'day-editable' : '',
                        ].join(' ')
                        return (
                          <td
                            key={iso}
                            className={classes}
                            title={entry?.note ? `${fmt(Number(entry.minutes))} · ${entry.note}` : entry ? fmt(Number(entry.minutes)) : iso}
                            onClick={() => canEdit && row.dbId && setEditingDate(iso)}
                          >
                            <span className="day-date">{d.getDate()}</span>
                            {entry && <span className="day-val">{fmt(Number(entry.minutes))}</span>}
                            {entry?.note && <span className="day-note">{entry.note}</span>}
                          </td>
                        )
                      })}
                      <td className={`num strong ${weekSum > 0 ? 'pos' : weekSum < 0 ? 'neg' : 'zero'}`}>
                        {weekSum !== 0 ? fmt(weekSum) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {canEdit && !row.dbId && (
            <p className="dott-error">This teacher is not in the staff registry yet - run the staff sync first.</p>
          )}

          {editingDate && (
            <div
              className="modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setEditingDate(null)
              }}
            >
              <div className="modal">
                <DayEditor
                  row={row}
                  term={term}
                  date={editingDate}
                  existing={byDate[editingDate] ?? null}
                  onDone={() => {
                    setEditingDate(null)
                    reload()
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
