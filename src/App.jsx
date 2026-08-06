import { MODULES, STATUS_LABELS } from './modules.js'
import './App.css'

function ModuleTile({ module }) {
  const body = (
    <>
      <div className="tile-head">
        <h3>{module.name}</h3>
        <span className={`badge badge-${module.status}`}>
          {STATUS_LABELS[module.status]}
        </span>
      </div>
      <p>{module.description}</p>
    </>
  )
  if (module.href) {
    return (
      <a className={`tile tile-${module.status} tile-link`} href={module.href}>
        {body}
      </a>
    )
  }
  return <div className={`tile tile-${module.status}`}>{body}</div>
}

export default function App() {
  return (
    <div className="hub">
      <header className="hub-header">
        <img src="./tapping-logo.svg" alt="Tapping Primary School" className="hub-logo" />
        <div className="hub-header-text">
          <span className="hub-school">Tapping Primary School</span>
          <h1>Staffing Hub</h1>
        </div>
      </header>

      <section className="hub-intro">
        <p>
          One place for the school&rsquo;s staffing tools. Modules light up here as
          they are built; staff sign-in arrives with the first live module.
        </p>
      </section>

      <main className="hub-grid">
        {MODULES.map((m) => (
          <ModuleTile key={m.key} module={m} />
        ))}
      </main>

      <footer className="hub-footer">
        <p>
          Built for Tapping Primary School staff. This system holds staff
          timetabling information only &mdash; no student information is stored
          here.
        </p>
      </footer>
    </div>
  )
}
