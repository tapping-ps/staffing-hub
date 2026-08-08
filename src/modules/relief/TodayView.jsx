import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import AbsenceEditor from './AbsenceEditor.jsx'

const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const isoDate = (d) => d.toLocaleDateString('en-CA')
const lastName = (full) => full.trim().split(/\s+/).slice(-1)[0]
const fmt = (m) => `${m >= 0 ? '+' : ''}${m}m`
const COVER_LABELS = { tbc: 'TBC', relief: 'Relief', internal: 'Internal', none: 'No replace' }

const agreedTotal = (b) => (b.agreedExtras ?? []).reduce((a, e) => a + e.minutes, 0)
const aboveAgreed = (b) => b.weeklyDott - b.entitlement - agreedTotal(b)

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

// What is this person doing at period p on this day?
// score: 0 = with their own class (ideal DOTT recipient), 1 = already on
// DOTT then, 2 = teaching a specialist lesson, 3 = not at work.
function statusAt(base, dayName, p, eceWeek) {
  if (base.group === 'classroom') {
    const rel = base.days?.[dayName] ?? []
    return rel.some((s) => s.p === p)
      ? { score: 1, label: 'already on DOTT then' }
      : { score: 0, label: 'with their class' }
  }
  if (base.group === 'specialist') {
    if (!base.workDays?.includes(dayName)) return { score: 3, label: 'not at work that day' }
    const lessons = base.days?.[dayName] ?? []
    const lesson = lessons.find((s) => s.p === p)
    if (lesson) return { score: 2, label: `teaching ${lesson.cls}` }
    return { score: 1, label: 'already free then' }
  }
  // ece
  if (base.offDays?.[eceWeek]?.includes(dayName)) return { score: 3, label: 'not at work that day' }
  const dott = base.days?.[eceWeek]?.[dayName] ?? []
  return dott.some((s) => s.p === p)
    ? { score: 1, label: 'already on DOTT then' }
    : { score: 0, label: 'with their class' }
}

function AllocatorPanel({ slot, candidates, onGive, busy }) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const ideal = candidates.filter((c) => c.score === 0)
  const visible = showAll ? candidates : ideal.length ? ideal.slice(0, 6) : candidates.slice(0, 6)
  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Give this period…
      </button>
    )
  }
  return (
    <div className="alloc-list">
      {visible.map((c) => (
        <div key={c.staff.id} className={`alloc-row score-${c.score}`}>
          <span className="alloc-name">
            {c.staff.full_name}
            <span className="alloc-role">{c.base.label}</span>
          </span>
          <span className="alloc-status">{c.status}</span>
          <span className={`alloc-balance ${c.balance < 0 ? 'neg' : 'pos'}`} title="Term balance so far">
            {fmt(c.balance)}
          </span>
          <button className="btn-secondary" disabled={busy} onClick={() => onGive(c.staff.id)}>
            Give
          </button>
        </div>
      ))}
      <div className="alloc-foot">
        <button className="btn-link" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show best candidates only' : 'Show everyone'}
        </button>
        <button className="btn-link" onClick={() => setOpen(false)}>
          Close
        </button>
        <span className="alloc-hint">Most in deficit first; people free to receive DOTT at {slot.p} rank highest.</span>
      </div>
    </div>
  )
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
  const [termEntries, setTermEntries] = useState([])
  const [editor, setEditor] = useState(null)
  const [collapseArm, setCollapseArm] = useState(null)
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

  const term = termFor(terms, date)

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

  useEffect(() => {
    if (!supabase || !session || !term) {
      setTermEntries([])
      return
    }
    supabase
      .from('dott_entries')
      .select('staff_id, minutes')
      .eq('term_id', term.id)
      .then(({ data }) => setTermEntries(data ?? []))
  }, [session, term?.id, reloadFlag]) // eslint-disable-line react-hooks/exhaustive-deps

  const staffById = useMemo(() => Object.fromEntries(registry.map((s) => [s.id, s])), [registry])
  const staffByName = useMemo(() => Object.fromEntries(registry.map((s) => [s.full_name, s])), [registry])
  const reliefById = useMemo(() => Object.fromEntries(reliefTeachers.map((r) => [r.id, r])), [reliefTeachers])
  const baseByKey = useMemo(
    () => (baseline ? Object.fromEntries(baseline.staff.map((s) => [s.key, s])) : {}),
    [baseline],
  )

  const dayName = DAY_KEYS[new Date(date + 'T00:00:00').getDay()]
  const isSchoolDay = dayName !== 'Sat' && dayName !== 'Sun'
  const week = term ? weekNumber(term, date) : null
  const eceWeek = week !== null ? (week % 2 === 0 ? 'A' : 'B') : 'A'

  const adjustByStaff = useMemo(() => {
    const m = {}
    for (const e of termEntries) m[e.staff_id] = (m[e.staff_id] ?? 0) + Number(e.minutes)
    return m
  }, [termEntries])

  // ranked candidates for receiving a DOTT period at slot p
  function candidatesFor(p, excludeStaffId) {
    return registry
      .filter((s) => s.id !== excludeStaffId && s.hub_key && baseByKey[s.hub_key])
      .map((s) => {
        const base = baseByKey[s.hub_key]
        const st = statusAt(base, dayName, p, eceWeek)
        const balance =
          Number(s.carry_minutes ?? 0) + aboveAgreed(base) * (week ?? 0) + (adjustByStaff[s.id] ?? 0)
        return { staff: s, base, score: st.score, status: st.label, balance }
      })
      .sort((a, b) => a.score - b.score || a.balance - b.balance)
  }

  function dayDetail(base) {
    if (!base?.days) return []
    if (base.group === 'ece') return base.days[eceWeek]?.[dayName] ?? []
    return base.days[dayName] ?? []
  }

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

  async function givePeriod(absence, slot, rowKey, recipientId) {
    setBusyKey(rowKey)
    setError(null)
    try {
      const absentName = staffById[absence.staff_id]?.full_name ?? 'absent staff'
      await writeLedger(
        recipientId,
        slot.min,
        `${slot.p} DOTT while ${lastName(absentName)} away${slot.subj ? ` (${slot.subj}${slot.with ? ' · ' + lastName(slot.with) : ''})` : ''}`,
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
      await writeLedger(t.id, -slot.min, `${slot.p} ${slot.subj} lost - ${lastName(absentName)} away`, absence.id)
      reload()
    } catch (err) {
      setError(String(err.message ?? err))
    } finally {
      setBusyKey(null)
    }
  }

  // No relief found: the whole specialist programme is cut for the day and
  // every affected class teacher loses that DOTT, tracked in one click.
  async function collapseProgramme(absence, slots) {
    setBusyKey('collapse' + absence.id)
    setError(null)
    const absentName = staffById[absence.staff_id]?.full_name ?? 'specialist'
    const missing = []
    try {
      for (const slot of slots) {
        const t = staffByName[slot.teacher]
        if (!t) {
          missing.push(slot.teacher)
          continue
        }
        await writeLedger(
          t.id,
          -slot.min,
          `${slot.p} ${slot.subj} lost - ${lastName(absentName)} away, programme collapsed`,
          absence.id,
        )
      }
      if (missing.length) setError(`Not in the staff registry (record by hand): ${missing.join(', ')}`)
      setCollapseArm(null)
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
          const isSpecialist = base?.group === 'specialist'
          const slots = dayDetail(base)
          const frees = isSpecialist ? (base.freeDays?.[dayName] ?? []) : []
          const linked = linkedEntries(a.id)
          const hasCover = a.cover === 'relief' || a.cover === 'internal'
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
                  <button
                    className={`abs-chip chip-${a.cover} ${canEdit ? 'chip-clickable' : ''}`}
                    title={canEdit ? 'Change the cover for this absence' : undefined}
                    onClick={() => canEdit && setEditor({ date, existing: a })}
                  >
                    {a.cover === 'relief'
                      ? (reliefById[a.relief_teacher_id]?.full_name ?? 'Relief')
                      : a.cover === 'internal'
                        ? `Internal${a.cover_note ? ': ' + a.cover_note : ''}`
                        : a.cover === 'tbc' && canEdit
                          ? 'TBC · arrange cover'
                          : COVER_LABELS[a.cover]}
                  </button>
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
                    {hasCover
                      ? 'DOTT available (their class is with a specialist) - give each period out:'
                      : a.cover === 'tbc'
                        ? 'DOTT that will become available once cover is arranged:'
                        : 'Their class is with a specialist at these times (no cover, nothing to give out):'}
                  </span>
                  {slots.map((slot) => {
                    const rowKey = a.id + slot.p
                    return (
                      <div key={slot.p} className="slot-row">
                        <span className="slot-what">
                          {slot.p} · {slot.subj ?? 'DOTT'}
                          {slot.with ? ` with ${lastName(slot.with)}` : ''} · {slot.min}m
                        </span>
                        {canEdit && hasCover && (
                          <AllocatorPanel
                            slot={slot}
                            candidates={candidatesFor(slot.p, a.staff_id)}
                            busy={busyKey === rowKey}
                            onGive={(rid) => givePeriod(a, slot, rowKey, rid)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {base && isSpecialist && slots.length > 0 && (
                <div className="today-slots">
                  <span className="today-slots-label">
                    {a.cover === 'relief'
                      ? 'Relief is taking their timetable - these lessons run as normal:'
                      : "Lessons that won't run - record DOTT lost where the class teacher keeps their class:"}
                  </span>
                  {canEdit && a.cover !== 'relief' && slots.length > 1 && (
                    <div className="collapse-bar">
                      {collapseArm !== a.id ? (
                        <button className="btn-secondary" onClick={() => setCollapseArm(a.id)}>
                          Collapse the specialist programme (all {slots.length} lessons)
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn-primary"
                            disabled={busyKey === 'collapse' + a.id}
                            onClick={() => collapseProgramme(a, slots)}
                          >
                            {busyKey === 'collapse' + a.id
                              ? 'Recording…'
                              : `Confirm: record DOTT lost for ${slots.length} teachers`}
                          </button>
                          <button className="btn-link" onClick={() => setCollapseArm(null)}>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {slots.map((slot) => {
                    const rowKey = a.id + slot.p
                    return (
                      <div key={slot.p} className="slot-row">
                        <span className="slot-what">
                          {slot.p} · {slot.subj} · {slot.cls} ({lastName(slot.teacher)}) · {slot.min}m
                        </span>
                        {canEdit && a.cover !== 'relief' && (
                          <button
                            className="btn-secondary"
                            disabled={busyKey === rowKey}
                            onClick={() => markLost(a, slot, rowKey)}
                          >
                            {busyKey === rowKey ? 'Saving…' : `DOTT lost for ${lastName(slot.teacher)}`}
                          </button>
                        )}
                        {canEdit && a.cover === 'relief' && (
                          <button
                            className="btn-link"
                            disabled={busyKey === rowKey}
                            onClick={() => markLost(a, slot, rowKey)}
                          >
                            mark lost anyway
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {base && isSpecialist && a.cover === 'relief' && frees.length > 0 && (
                <div className="today-slots">
                  <span className="today-slots-label">
                    Their own DOTT that day (relief does not take DOTT) - give each period out:
                  </span>
                  {frees.map((slot) => {
                    const rowKey = a.id + 'free' + slot.p
                    return (
                      <div key={slot.p} className="slot-row">
                        <span className="slot-what">
                          {slot.p} · DOTT · {slot.min}m
                        </span>
                        {canEdit && (
                          <AllocatorPanel
                            slot={slot}
                            candidates={candidatesFor(slot.p, a.staff_id)}
                            busy={busyKey === rowKey}
                            onGive={(rid) => givePeriod(a, slot, rowKey, rid)}
                          />
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
