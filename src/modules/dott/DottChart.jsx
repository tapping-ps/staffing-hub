// School-at-a-glance diverging bar chart. Direction carries the sign
// (deficit left, surplus right of the zero line); colour reinforces it;
// every bar carries its signed value, so nothing relies on colour alone.
// Long bars carry their label INSIDE the bar end so labels can never
// spill out of the track into the name column.

const NICE_STEPS = [15, 30, 45, 60, 90, 120, 180, 240, 300]

function niceMax(maxAbs) {
  for (const s of NICE_STEPS) if (maxAbs <= s) return s
  return Math.ceil(maxAbs / 60) * 60
}

function Bar({ row, scaleMax, onSelect }) {
  const v = row.value
  const half = Math.min(Math.abs(v) / scaleMax, 1) * 50
  const pos = v > 0
  const zero = v === 0
  const inside = half > 32 // long bar: label sits inside the coloured end
  const label = `${v > 0 ? '+' : ''}${v}m`
  const valStyle = zero
    ? { left: '50%', transform: 'translateX(8px)' }
    : inside
      ? pos
        ? { left: `calc(${50 + half}% - 6px)`, transform: 'translateX(-100%)' }
        : { left: `calc(${50 - half}% + 6px)` }
      : pos
        ? { left: `calc(${50 + half}% + 6px)` }
        : { left: `calc(${50 - half}% - 6px)`, transform: 'translateX(-100%)' }
  return (
    <div className="chart-row" title={row.title}>
      <button className="chart-name" onClick={() => onSelect?.(row.key)} title={`Open ${row.name}'s term sheet`}>
        {row.name}
      </button>
      <div className="chart-track">
        <span className="chart-zeroline" />
        {!zero && (
          <span
            className={`chart-bar ${pos ? 'chart-bar-pos' : 'chart-bar-neg'}`}
            style={pos ? { left: '50%', width: half + '%' } : { left: 50 - half + '%', width: half + '%' }}
          />
        )}
        {zero && <span className="chart-zerodot" />}
        <span
          className={`chart-val ${zero ? '' : inside ? 'chart-val-inside' : pos ? 'chart-val-pos' : 'chart-val-neg'}`}
          style={valStyle}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

export default function DottChart({ groups, measureLabel, onSelect }) {
  const all = groups.flatMap((g) => g.rows)
  if (!all.length) return null
  const scaleMax = niceMax(Math.max(30, ...all.map((r) => Math.abs(r.value))))
  const ticks = [-scaleMax, -scaleMax / 2, 0, scaleMax / 2, scaleMax]
  return (
    <div className="dott-chart">
      <div className="chart-head">
        <h3>The whole school at a glance</h3>
        <span className="chart-measure">{measureLabel}</span>
      </div>
      <div className="chart-axis">
        <span className="chart-name-spacer" />
        <div className="chart-track chart-axis-track">
          {ticks.map((t) => (
            <span key={t} className="chart-tick" style={{ left: 50 + (t / scaleMax) * 50 + '%' }}>
              {t > 0 ? '+' : ''}
              {t}
            </span>
          ))}
        </div>
      </div>
      {groups.map(
        (g) =>
          g.rows.length > 0 && (
            <div key={g.key} className="chart-group">
              <div className="chart-grouplabel">{g.label}</div>
              {g.rows.map((r) => (
                <Bar key={r.key} row={r} scaleMax={scaleMax} onSelect={onSelect} />
              ))}
            </div>
          ),
      )}
      <p className="chart-hint">Click a name for their full term sheet.</p>
    </div>
  )
}
