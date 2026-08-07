import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'

const DOMAIN = 'education.wa.edu.au'

export default function SignInPanel() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setMessage(null)
    const addr = email.trim().toLowerCase()
    if (!addr.endsWith('@' + DOMAIN)) {
      setMessage({ kind: 'error', text: `Accounts use your school email ending @${DOMAIN}.` })
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(addr, password)
        if (error) setMessage({ kind: 'error', text: error.message })
      } else {
        const { data, error } = await signUp(addr, password)
        if (error) {
          setMessage({ kind: 'error', text: error.message })
        } else if (data.session) {
          // Email confirmation disabled: signed in straight away.
        } else {
          setMessage({
            kind: 'ok',
            text: 'Account created. Check your school inbox for the confirmation link, then sign in.',
          })
          setMode('signin')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="signin">
      <h3>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h3>
      <p className="signin-note">
        For Tapping PS staff. Use your <strong>@{DOMAIN}</strong> address.
      </p>
      <form onSubmit={submit}>
        <label>
          School email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`firstname.lastname@${DOMAIN}`}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
        </label>
        {message && <p className={`signin-msg ${message.kind}`}>{message.text}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        className="btn-link"
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setMessage(null)
        }}
      >
        {mode === 'signin' ? 'First time here? Create your account' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
