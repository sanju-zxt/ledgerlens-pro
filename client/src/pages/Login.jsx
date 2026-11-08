import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
}

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const { login, demoLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const nextPath = location.state?.from || "/"

  const enterDemo = async () => {
    setPending(true)
    setError("")
    try { await demoLogin(); navigate(nextPath, { replace: true }) }
    catch (err) { setError(err.message) }
    finally { setPending(false) }
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setPending(true)
    setError("")
    try { await login(email, password); navigate(nextPath, { replace: true }) }
    catch (err) { setError(err.message) }
    finally { setPending(false) }
  }

  return <main className="login-shell">
    <section className="login-story" aria-labelledby="brand-title">
      <div className="login-story-top"><div className="brand-lockup"><BrandMark /><span>LedgerLens <b>Pro</b></span></div><span className="story-pill"><i /> PAYPAL + FINANCIAL AI</span></div>
      <div className="story-copy"><p className="eyebrow light">FINANCIAL CLARITY, AHEAD</p><h1 id="brand-title">Your next 30 days,<br /><em>clearer.</em></h1><p className="story-lede">A cash-flow cockpit for small businesses. See the evidence, understand the risk, and try a decision before it reaches your books.</p>
        <div className="story-features"><div><span className="feature-number">01</span><span><strong>Know your runway</strong><small>Probabilistic cash-flow forecasts</small></span></div><div><span className="feature-number">02</span><span><strong>See what moves it</strong><small>Explainable assumptions and evidence</small></span></div><div><span className="feature-number">03</span><span><strong>Try another path</strong><small>Scenarios you can compare</small></span></div></div>
      </div>
      <div className="story-visual" aria-hidden="true"><div className="visual-grid" /><div className="visual-caption"><span><i /> BALANCE OUTLOOK</span><span>30-DAY MODEL</span></div><svg viewBox="0 0 520 170" role="presentation"><path className="visual-band" d="M0 140 C58 130 84 125 129 116 S197 100 250 94 S345 72 392 79 S457 58 520 50 L520 122 C458 133 431 139 392 126 S296 131 250 136 S172 146 129 148 S54 159 0 164Z" /><path className="visual-line" d="M0 151 C58 144 84 136 129 132 S197 112 250 114 S345 91 392 103 S457 78 520 83" /><circle cx="392" cy="103" r="5" /></svg><div className="visual-legend"><span><i className="legend-line" /> Median path</span><span><i className="legend-band" /> Uncertainty range</span></div></div>
      <footer className="story-footer"><span>TRANSPARENT BY DESIGN</span><span>Historical facts <b>·</b> modeled outcomes</span></footer>
    </section>

    <section className="login-panel" aria-labelledby="welcome-title"><div className="login-panel-inner">
      <div className="mobile-brand"><div className="brand-lockup"><BrandMark /><span>LedgerLens <b>Pro</b></span></div></div>
      <p className="eyebrow">YOUR FINANCIAL WORKSPACE</p><h2 id="welcome-title">Welcome to a clearer view.</h2><p className="login-intro">Step into the interactive merchant demo or sign in to your workspace.</p>
      <button className="demo-entry" type="button" onClick={enterDemo} disabled={pending}><span className="demo-icon" aria-hidden="true">↗</span><span className="demo-copy"><strong>{pending ? "Opening your workspace…" : "Explore the sandbox demo"}</strong><small>One click · sample evidence · no PayPal credentials needed</small></span><span className="demo-arrow" aria-hidden="true">→</span></button>
      <div className="login-divider"><span />OR SIGN IN<span /></div>
      <form onSubmit={handleSubmit} className="login-form">
        <label htmlFor="email">Work email</label><input id="email" autoComplete="username" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" required />
        <div className="password-label"><label htmlFor="password">Password</label><span>Workspace access</span></div><input id="password" autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="sign-in-button" disabled={pending}>{pending ? "Signing in…" : "Sign in securely"}<span aria-hidden="true">→</span></button>
      </form>
      <div className="login-trust"><span className="trust-check">✓</span><p>The demo contains only labeled sandbox evidence. It does not connect to or expose a merchant account.</p></div>
      <p className="login-bottom">Need a PayPal Sandbox connection? Configure server credentials in <code>.env</code> after entering the demo.</p>
    </div></section>
  </main>
}
