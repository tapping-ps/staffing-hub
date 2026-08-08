import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

const REASON_SUGGESTIONS = [
  'LSL',
  'LWP',
  'Personal leave',
  'Sick leave',
  'PD',
  'Grad module',
  'Grad release day',
  'Induction payback',
]

const isoDate = (d) => d.toLocaleDateString('en-CA')

function schoolDays(fromISO, toISO) {
  const out = []
  const d = new Date(fromISO + 'T00:00:00')
  const end = new Date(toISO + 'T00:00:00')
  while (d <= end) {
    const day = d.getDay()
    if (day >= 1 && day <= 5) out.push(isoDate(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export default function AbsenceEditor({ date, existing, registry, reliefTeachers, onDone }) {
  const { session } = useAuth()
  const [staffId, setStaffId] = useState(existing?.staff_id ?? '')
  const [newStaffMode, setNewStaffMode] = useState(false)
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffType, setNewStaffType] = useState('ea')
  const [fromDate, setFromDate] = useState(date)
  const [toDate, setToDate] = useState(date)
  const [part, setPart] = useState(existing?.part ?? 'full')
  const [reason, setReason] = useState(existing?.reason ?? '')
  const [cover, setCover] = useState(existing?.cover ?? 'tbc')
  const [reliefName, setReliefName] = useState(
    existing?.relief_teacher_id
      ? (reliefTeachers.find((r) => r.id === existing.relief_teacher_id)?.full_name ?? '')
      : '',
  )
  const [coverNote, setCoverNote] = useState(existing?.cover_note ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const prettyDate = (iso) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

  async function resolveStaffId() {
    if (!newStaffMode) return staffId
    const name = newStaffName.trim()
    if (!name) throw new Error('Type the new staff member’s name.')
    const { data, error: err } = await supabase
      .from('staff')
      .insert({ full_name: name, staff_type: newStaffType, fte: 1.0 })
      .select()
      .single()
    if (err) throw new Error(err.message)
    return data.id
  }

  async function resolveReliefTeacherId() {
    if (cover !== 'relief') return null
    const name = reliefName.trim()
    if (!name) throw new Error('Type the relief teacher’s name (it will be remembered).')
    const match = reliefTeachers.find((r) => r.full_name.toLowerCase() === name.toLowerCase())
    if (match) return match.id
    const { data, error: err } = await supabase
      .from('relief_teachers')
      .insert({ full_name: name })
      .select()
      .single()
    if (err) throw new Error(err.message)
    return data.id
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const sid = await resolveStaffId()
      if (!sid) throw new Error('Choose a staff member.')
      const rid = await resolveReliefTeacherId()
      const base = {
        staff_id: sid,
        part,
        reason: reason.trim() || null,
        cover,
        relief_teacher_id: rid,
        cover_note: coverNote.trim() || null,
        notes: notes.trim() || null,
        created_by: session.user.id,
      }
      if (existing) {
        const { error: err } = await supabase.from('absences').update(base).eq('id', existing.id)
        if (err) throw new Error(err.message)
      } else {
        const days = schoolDays(fromDate, toDate < fromDate ? fromDate : toDate)
        if (!days.length) throw new Error('No school days in that range.')
        const rows = days.map((d) => ({ ...base, date: d }))
        const { error: err } = await supabase.from('absences').upsert(rows, { onConflict: 'staff_id,date' })
        if (err) throw new Error(err.message)
      }
      onDone(true)
    } catch (err) {
      setError(String(err.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing) return
    setBusy(true)
    const { error: err } = await supabase.from('absences').delete().eq('id', existing.id)
    setBusy(false)
    if (err) setError(err.message)
    else onDone(true)
  }

  return (
    <form className="entry-form day-editor" onSubmit={save}>
      <strong>
        {existing
          ? `Edit absence · ${prettyDate(existing.date)}`
          : `Record absence · ${prettyDate(fromDate)}${toDate !== fromDate ? ' to ' + prettyDate(toDate) : ''}`}
      </strong>
      <span className="day-editor-sub">
        {existing ? 'Change cover, reason or notes; or remove it.' : 'Weekends are skipped automatically for ranges.'}
      </span>

      <div className="entry-fields">
        {!existing && !newStaffMode && (
          <label>
            Who is away
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required={!newStaffMode}>
              <option value="">Choose…</option>
              {registry.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!existing && newStaffMode && (
          <>
            <label>
              New staff member
              <input
                type="text"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                placeholder="Full name"
              />
            </label>
            <label>
              Role
              <select value={newStaffType} onChange={(e) => setNewStaffType(e.target.value)}>
                <option value="ea">Education assistant</option>
                <option value="office">Office / admin</option>
                <option value="classroom">Classroom teacher</option>
                <option value="specialist">Specialist</option>
              </select>
            </label>
          </>
        )}
        {!existing && (
          <button className="btn-link" type="button" onClick={() => setNewStaffMode(!newStaffMode)}>
            {newStaffMode ? 'Back to staff list' : 'Not on the list? Add someone'}
          </button>
        )}

        {!existing && (
          <>
            <label>
              First day
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
            </label>
            <label>
              Last day
              <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </>
        )}

        <label>
          Day part
          <select value={part} onChange={(e) => setPart(e.target.value)}>
            <option value="full">Full day</option>
            <option value="am">Morning only</option>
            <option value="pm">Afternoon only</option>
          </select>
        </label>

        <label>
          Reason
          <input type="text" list="reasonSuggestions" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. LSL" />
          <datalist id="reasonSuggestions">
            {REASON_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>

        <label>
          Cover
          <select value={cover} onChange={(e) => setCover(e.target.value)}>
            <option value="tbc">Still to arrange (TBC)</option>
            <option value="relief">Relief teacher</option>
            <option value="internal">Covered internally</option>
            <option value="none">No replacement needed</option>
          </select>
        </label>

        {cover === 'relief' && (
          <label>
            Relief teacher
            <input
              type="text"
              list="reliefNames"
              value={reliefName}
              onChange={(e) => setReliefName(e.target.value)}
              placeholder="Type a name; it will be remembered"
            />
            <datalist id="reliefNames">
              {reliefTeachers.map((r) => (
                <option key={r.id} value={r.full_name} />
              ))}
            </datalist>
          </label>
        )}
        {cover === 'internal' && (
          <label>
            Covered by
            <input type="text" value={coverNote} onChange={(e) => setCoverNote(e.target.value)} placeholder="e.g. split between Y2 team" />
          </label>
        )}

        <label className="entry-note">
          Notes
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="anything Lauren-future needs to know" />
        </label>
      </div>

      {error && <p className="dott-error">{error}</p>}
      <div className="entry-actions">
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {existing && (
          <button className="btn-link danger" type="button" onClick={remove} disabled={busy}>
            Remove this absence
          </button>
        )}
        <button className="btn-link" type="button" onClick={() => onDone(false)}>
          Close
        </button>
      </div>
    </form>
  )
}
