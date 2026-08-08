import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import AbsenceEditor from './AbsenceEditor.jsx'

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const isoDate = (d) => d.toLocaleDateString('en-CA')
const lastName = (full) => full.trim().split(/\s+/).slice(-1)[0]
const fmt = (m) => `${m >= 0 ? '+' : ''}${m}m`
const COVER_LABELS = { tbc: 'TBC', relief: 'Relief', internal: 'Internal', none: 'No replace' }

function termFor(terms, dateISO) {
  const d = new Date(dateISO + 'T00:00:00')
  return (
    terms.find((t) => {
      const start = new Date(t.start_date + 'T00:00:00')
      const end = new Date(start)
      end.setDate(start.getDate() + t.week_count * 7)
      return d >= start && d < end
    }) ?? null
  )
}

function weekNumber(term, dateISO) {
  const start = new Date(term.start_date + 'T00:00:00')
  const d = new Date(dateISO + 'T00:00:00')
  return Math.floor((d - start) / 86400000 / 7) + 1
}

export default function TodayView({ initialDate, registry, reliefTeachers, terms, canEdit, onBackToCalendar, refreshOuter }) {
  const { session } = useAuth()
  const [date, setDateState] = useState(initialDate ?? isoDate(new Date()))
  const setDate = (d) => {
    setDateState(d)
    window.history.replaceState(null, '', '#/relief/day/' + d)
  }
  useEffect(() => {
    if (initialDate && initialDate !== date) setDateState(initialDate)
  }, [initialDate]) // eslint-disable-line react-hooks/exhaustive-deps
  const [baseline, setBaseline] = useState(null)
  const [absences, setAbsences] = useState([])
  const [entries, setEntries] = useState([])
  const [editor, setEditor] = useState(null)
  const [pick, setPick] = useState({}) // allocation dropdown state per row key
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState(null)
  const [reloadFlag, setReloadFlag] = useState(0)
  const reload = () => setReloadFlag((n) => n + 1)

  useEffect(() => {
    fetch('./dott-baseline.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(setBaseline)
      .catch((e) => setError('Could not load the timetable baseline: ' + e))
  }, [])

  useEffect(() => {
    if (!supabase || !session) return
    supabase
      .from('absences')
      .select('*')
      .eq('date', date)
      .then(({ data }) => setAbsences(data ?? []))
    supabase
      .from('dott_entries')
      .select('*')
      .eq('date', date)
      .then(({ data }) => setEntries(data ?? []))
  }, [session, date, reloadFlag])

  const staffById = useMemo(() => Object.fromEntries(registry.map((s) => [s.id, s])), [registry])
  const staffByName = useMemo(() => Object.fromEntries(registry.map((s) => [s.full_name, s])), [registry])
  const reliefById = useMemo(() => Object.fromEntries(reliefTeachers.map((r) => [r.id, r])), [reliefTeachers])
  const baseByKey = useMemo(
    () => (baseline ? Object.fromEntries(baseline.staff.map((s) => [s.key, s])) : {}),
    [baseline],
  )

  const term = termFor(terms, date)
  const dayName = DAY_KEYS[new Date(date + 'T00:00:00').getDay()]
  const isSchoolDay = dayName !== 'Sat' && dayName !== 'Sun'
  const week = term ? weekNumber(term, date) : null
  const eceWeek = week !== null ? (week % 2 === 0 ? 'A' : 'B') : 'A'

  function dayDetail(base) {
    if (!base?.days) return []
    if (base.group === 'ece') return base.days[eceWeek]?.[dayName] ?? []
    return base.days[dayName] ?? []
  }

  // one merged ledger entry per person per day: add to it if it exists
  async function writeLedger(recipientId, minutes, note, absenceId) {
    if (!term) throw new Error('No term covers this date - set the term up first.')
    const { data: existing } = await supabase
      .from('dott_entries')
      .select('*')
      .eq('staff_id', recipientId)
      .eq('date', date)
      .eq('term_id', term.id)
      .maybeSingle()
    if (existing) {
      const { error: err } = await supabase
        .from('dott_entries')
        .update({
          minutes: Number(existing.minutes) + minutes,
          note: [existing.note, note].filter(Boolean).join('; '),
          period: null,
          absence_id: existing.absence_id ?? absenceId,
        })
        .eq('id', existing.id)
      if (err) throw new Error(err.message)
    } else {
      const { error: err } = await supabase.from('dott_entries').insert({
        staff_id: recipientId,
        term_id: term.id,
        date,
        minutes,
        note,
        absence_id: absenceId,
        created_by: session.user.id,
      })
      if (err) throw new Error(err.message)
    }
  }

  async function givePeriod(absence, slot, rowKey) {
    const recipientId = pick[rowKey]
    if (!recipientId) return
    setBusyKey(rowKey)
    setError(null)
    try {
      const absentName = staffById[absence.staff_id]?.full_name ?? 'absent staff'
      await writeLedger(
        recipientId,
        slot.min,
        `${slot.p} DOTT while ${lastName(absentName)} away (${slot.subj ?? 'DOTT'}${slot.with ? ' · ' + lastName(slot.with) : ''})`,
        absence.id,
      )
      reload()
    } catch (err) {
      setError(String(err.message ?? err))
    } finally {
      setBusyKey(null)
    }
  }

  async function markLost(absence, slot, rowKey) {
    const t = staffByName[slot.teacher]
    if (!t) {
      setError(`${slot.teacher} is not in the staff registry.`)
      return
    }
    setBusyKey(rowKey)
    setError(null)
    try {
      const absentName = staffById[absence.staff_id]?.full_name ?? 'specialist'
      await writeLedger(
        t.id,
        -slot.min,
        `${slot.p} ${slot.subj} lost - ${lastName(absentName)} away`,
        absence.id,
      )
      reload()
    } catch (err) {
      setError(String(err.message ?? err))
    } finally {
      setBusyKey(null)
    }
  }

  const linkedEntries = (absenceId) => entries.filter((e) => e.absence_id === absenceId)

  return (
    <div className="today">
      <div className="today-bar">
        <button className="btn-link" onClick={onBackToCalendar}>
          ← Term calendar
        </button>
        <label>
          Day
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {term && (
          <span className="term-progress">
            {term.year} Term {term.term_number} · Week {week} · Kindy/PP week {eceWeek}
          </span>
        )}
      </div>

      {error && <p className="dott-error">{error}</p>}
      {!isSchoolDay && <p className="dott-error">That's a weekend.</p>}
      {isSchoolDay && !term && <p className="dott-error">No term covers this date.</p>}

      {isSchoolDay && term && absences.length === 0 && (
        <p className="today-empty">
          Nobody is recorded absent on this day.{' '}
          {canEdit && (
            <button className="btn-link" onClick={() => setEditor({ date, existing: null })}>
              Record an absence
            </button>
          )}
        </p>
      )}

      {isSchoolDay &&
        term &&
        absences.map((a) => {
          const s = staffById[a.staff_id]
          const base = s?.hub_key ? baseByKey[s.hub_key] : null
          const slots = dayDetail(base)
          const linked = linkedEntries(a.id)
          const isSpecialist = base?.group === 'specialist'
          return (
            <div key={a.id} className="today-card">
              <div className="today-head">
                <div>
                  <strong>{s?.full_name ?? 'Unknown'}</strong>
                  <span className="today-role">
                    {base?.label ?? s?.notes ?? s?.staff_type}
                    {a.part !== 'full' ? ` · ${a.part === 'am' ? 'morning only' : 'afternoon only'}` : ''}
                    {a.reason ? ` · ${a.reason}` : ''}
                  </span>
                </div>
                <div className="today-cover">
                  <span className={`abs-chip chip-${a.cover}`}>
                    {a.cover === 'relief'
                      ? (reliefById[a.relief_teacher_id]?.full_name ?? 'Relief')
                      : a.cover === 'internal'
                        ? `Internal${a.cover_note ? ': ' + a.cover_note : ''}`
                        : COVER_LABELS[a.cover]}
                  </span>
                  {canEdit && (
                    <button className="btn-link" onClick={() => setEditor({ date, existing: a })}>
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {base && !isSpecialist && slots.length > 0 && (
                <div className="today-slots">
                  <span className="today-slots-label">
                    DOTT available (their class is with a specialist) - give each period to a staff member:
                  </span>
                  {slots.map((slot) => {
                    const rowKey = a.id + slot.p
                    return (
                      <div key={slot.p} className="slot-row">
                        <span className="slot-what">
                          {slot.p} · {slot.subj ?? 'DOTT'}
                          {slot.with ? ` with ${lastName(slot.with)}` : ''} · {slot.min}m
                        </span>
                        {canEdit && (
                          <>
                            <select
                              value={pick[rowKey] ?? ''}
                              onChange={(e) => setPick({ ...pick, [rowKey]: e.target.value })}
                            >
                              <option value="">Give to…</option>
                              {registry
                                .filter((r) => r.id !== a.staff_id)
                                .map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.full_name}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="btn-secondary"
                              disabled={!pick[rowKey] || busyKey === rowKey}
                              onClick={() => givePeriod(a, slot, rowKey)}
                            >
                              {busyKey === rowKey ? 'Saving…' : 'Give'}
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {base && isSpecialist && slots.length > 0 && (
                <div className="today-slots">
                  <span className="today-slots-label">
                    Lessons that won't run - record DOTT lost where the class teacher keeps their class:
                  </span>
                  {slots.map((slot) => {
                    const rowKey = a.id + slot.p
                    return (
                      <div key={slot.p} className="slot-row">
                        <span className="slot-what">
                          {slot.p} · {slot.subj} · {slot.cls} ({lastName(slot.teacher)}) · {slot.min}m
                        </span>
                        {canEdit && (
                          <button
                            className="btn-secondary"
                            disabled={busyKey === rowKey}
                            onClick={() => markLost(a, slot, rowKey)}
                          >
                            {busyKey === rowKey ? 'Saving…' : `DOTT lost for ${lastName(slot.teacher)}`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {linked.length > 0 && (
                <div className="today-recorded">
                  <span className="today-slots-label">Recorded against this absence:</span>
                  {linked.map((e) => (
                    <span key={e.id} className={`recorded-chip ${Number(e.minutes) >= 0 ? 'pos' : 'neg'}`}>
                      {lastName(staffById[e.staff_id]?.full_name ?? '?')} {fmt(Number(e.minutes))}
                    </span>
                  ))}
                  <span className="today-hint">Fix mistakes on the teacher's DOTT sheet.</span>
                </div>
              )}

              {a.notes && <p className="today-notes">Notes: {a.notes}</p>}
            </div>
          )
        })}

      {isSchoolDay && term && absences.length > 0 && canEdit && (
        <button className="btn-secondary today-add" onClick={() => setEditor({ date, existing: null })}>
          Record another absence
        </button>
      )}

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
                if (changed) {
                  reload()
                  refreshOuter()
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
