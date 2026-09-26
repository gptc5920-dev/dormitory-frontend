import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ErrorMessage } from "../components/Feedback";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: "manager", password: "Manager123!" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form.username, form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand"><span className="brand-mark"><ShieldCheck size={23} /></span>Smart Dormitory</div>
        <div>
          <p className="eyebrow">Staff access</p>
          <h1>Manager sign in</h1>
          <p className="muted">Review residence activity, records, and monitoring alerts.</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>Username<input autoFocus value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></label>
          <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
          <ErrorMessage message={error} />
          <button className="button primary full" disabled={busy}>{busy ? "Signing in..." : "Sign in"}<ArrowRight size={18} /></button>
        </form>
        <p className="login-note">Demo credentials are prefilled for local development.</p>
      </section>
      <aside className="login-context" aria-hidden="true">
        <div className="context-grid">
          <span>ROOM 101</span><span>ACTIVE</span><span>02 / 04</span>
          <span>LOBBY</span><span>MONITORING</span><span>ONLINE</span>
          <span>INCIDENTS</span><span>REVIEW</span><span>03</span>
        </div>
      </aside>
    </main>
  );
}
