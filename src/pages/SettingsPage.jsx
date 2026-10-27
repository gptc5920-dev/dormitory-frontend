import { useEffect, useState } from "react";
import { BellRing, LockKeyhole, Save, UserRound } from "lucide-react";
import { api } from "../api";
import { ErrorMessage, Loading, SuccessMessage } from "../components/Feedback";
import ResetButton from "../components/ResetButton";
import { useAuth } from "../context/AuthContext";
import "./settings.css";

const blankPasswords = { current_password: "", new_password: "", confirm_password: "" };
const permissionLabels = {
  granted: "Allowed in this browser",
  default: "Browser permission needed",
  denied: "Blocked in this browser",
  unsupported: "Unavailable in this browser",
};

function SettingsSection({ id, title, description, icon: Icon, children }) {
  return <section className="panel settings-section" aria-labelledby={id}>
    <div className="panel-heading"><div className="settings-heading"><span className="settings-icon"><Icon size={20} /></span><div><h2 id={id}>{title}</h2><p>{description}</p></div></div></div>
    <div className="settings-body">{children}</div>
  </section>;
}

export default function SettingsPage() {
  const { updateUser, updateAccount, changePassword } = useAuth();
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState({ first_name: "", last_name: "", email: "" });
  const [desktopAlerts, setDesktopAlerts] = useState(true);
  const [permission, setPermission] = useState(() => window.Notification?.permission || "unsupported");
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [passwords, setPasswords] = useState(blankPasswords);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState({});
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api("/auth/me/", { signal: controller.signal }).then((data) => {
      if (!active) return;
      setAccount(data);
      setProfile({ first_name: data.first_name, last_name: data.last_name, email: data.email });
      setDesktopAlerts(data.desktop_alerts);
      updateUser(data);
    }).catch((err) => { if (active) setLoadError(err.message); });
    return () => { active = false; controller.abort(); };
  }, [retry, updateUser]);

  useEffect(() => {
    const refresh = () => setPermission(window.Notification?.permission || "unsupported");
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  function clearFeedback(section) {
    setFeedback((current) => ({ ...current, [section]: {} }));
  }

  async function saveAccount(event, section, changes) {
    event.preventDefault();
    if (busy) return;
    setBusy(section);
    clearFeedback(section);
    try {
      const saved = await updateAccount(changes);
      setAccount(saved);
      if (section === "profile") setProfile({ first_name: saved.first_name, last_name: saved.last_name, email: saved.email });
      if (section === "notifications") setDesktopAlerts(saved.desktop_alerts);
      setFeedback((current) => ({ ...current, [section]: { success: section === "profile" ? "Profile saved." : "Notification preference saved." } }));
    } catch (err) {
      setFeedback((current) => ({ ...current, [section]: { error: err.message } }));
    } finally { setBusy(""); }
  }

  async function requestPermission() {
    setRequestingPermission(true);
    clearFeedback("notifications");
    try {
      setPermission(await window.Notification.requestPermission());
    } catch (err) {
      setFeedback((current) => ({ ...current, notifications: { error: `Unable to request browser permission: ${err.message}` } }));
    } finally { setRequestingPermission(false); }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (busy) return;
    clearFeedback("security");
    if (passwords.new_password !== passwords.confirm_password) {
      setFeedback((current) => ({ ...current, security: { error: "The new passwords do not match." } }));
      return;
    }
    setBusy("security");
    try {
      await changePassword(passwords);
    } catch (err) {
      setFeedback((current) => ({ ...current, security: { error: err.message } }));
    } finally { setBusy(""); }
  }

  const profileChanged = account && ["first_name", "last_name", "email"].some((key) => profile[key] !== account[key]);
  return <div className="page settings-page">
    <header className="page-header"><div><p className="eyebrow">Your workspace</p><h1>Settings</h1><p className="page-description">Manage your profile, notifications, and account security.</p></div></header>
    {loadError ? <><ErrorMessage message={loadError} /><button className="button subtle" onClick={() => { setLoadError(""); setRetry((value) => value + 1); }}>Try again</button></> : !account ? <Loading label="Loading settings" /> : <div className="settings-grid">
      <aside className="panel settings-account" aria-label="Signed-in account">
        <span className="settings-avatar">{(account.first_name || account.username)[0].toUpperCase()}</span>
        <strong>{[account.first_name, account.last_name].filter(Boolean).join(" ") || account.username}</strong>
        <span className="muted">@{account.username}</span>
        <span className="status verified">{account.role === "admin" ? "Administrator" : "Manager"}</span>
        <p>Settings apply to your signed-in account.</p>
      </aside>
      <div className="settings-sections">
        <SettingsSection id="profile-settings" title="Profile" description="Keep your contact details up to date." icon={UserRound}>
          <form onSubmit={(event) => saveAccount(event, "profile", profile)}>
            <fieldset disabled={!!busy} className="settings-fields form-grid">
              <label>First name<input autoComplete="given-name" maxLength={150} value={profile.first_name} onChange={(e) => { setProfile({ ...profile, first_name: e.target.value }); clearFeedback("profile"); }} /></label>
              <label>Last name<input autoComplete="family-name" maxLength={150} value={profile.last_name} onChange={(e) => { setProfile({ ...profile, last_name: e.target.value }); clearFeedback("profile"); }} /></label>
              <label className="span-2">Email address<input type="email" autoComplete="email" maxLength={254} value={profile.email} onChange={(e) => { setProfile({ ...profile, email: e.target.value }); clearFeedback("profile"); }} /></label>
              <div className="span-2"><ErrorMessage message={feedback.profile?.error} /><SuccessMessage message={feedback.profile?.success} /></div>
              <div className="form-actions span-2"><ResetButton disabled={!profileChanged || !!busy} onClick={() => { setProfile({ first_name: account.first_name, last_name: account.last_name, email: account.email }); clearFeedback("profile"); }} /><button className="button primary" disabled={!profileChanged || !!busy}><Save size={16} />{busy === "profile" ? "Saving..." : "Save profile"}</button></div>
            </fieldset>
          </form>
        </SettingsSection>
        <SettingsSection id="notification-settings" title="Notifications" description="Choose whether camera alerts appear on your desktop." icon={BellRing}>
          <form onSubmit={(event) => saveAccount(event, "notifications", { desktop_alerts: desktopAlerts })}>
            <fieldset disabled={!!busy} className="settings-fields form-stack">
              <label className="settings-toggle"><input type="checkbox" checked={desktopAlerts} onChange={(e) => { setDesktopAlerts(e.target.checked); clearFeedback("notifications"); }} /><span>Desktop camera alerts<small>Send desktop notifications for new camera activity and possible unauthorized people.</small></span></label>
              <div className="settings-permission"><span>{permissionLabels[permission]}</span>{permission === "default" && <button type="button" className="button subtle small" disabled={requestingPermission} onClick={requestPermission}>{requestingPermission ? "Requesting..." : "Allow browser notifications"}</button>}</div>
              {permission === "denied" && <p className="settings-help">Allow notifications in your browser's site settings to receive desktop alerts.</p>}
              {permission === "unsupported" && <p className="settings-help">This browser cannot send desktop notifications. Try a supported browser over HTTPS or localhost.</p>}
              <p className="settings-help">Desktop alerts need browser permission and an open monitoring page with detection running. Alerts always remain available in the notification bell.</p>
              <ErrorMessage message={feedback.notifications?.error} /><SuccessMessage message={feedback.notifications?.success} />
              <div className="form-actions"><ResetButton disabled={desktopAlerts === account.desktop_alerts || !!busy} onClick={() => { setDesktopAlerts(account.desktop_alerts); clearFeedback("notifications"); }} /><button className="button primary" disabled={desktopAlerts === account.desktop_alerts || !!busy}><Save size={16} />{busy === "notifications" ? "Saving..." : "Save notifications"}</button></div>
            </fieldset>
          </form>
        </SettingsSection>
        <SettingsSection id="security-settings" title="Security" description="Update the password you use to sign in." icon={LockKeyhole}>
          <form onSubmit={savePassword}>
            <fieldset disabled={!!busy} className="settings-fields form-grid">
              <input className="sr-only" aria-label="Account username" autoComplete="username" value={account.username} readOnly tabIndex={-1} />
              <label className="span-2">Current password<input type="password" autoComplete="current-password" maxLength={128} required value={passwords.current_password} onChange={(e) => { setPasswords({ ...passwords, current_password: e.target.value }); clearFeedback("security"); }} /></label>
              <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={passwords.new_password} onChange={(e) => { setPasswords({ ...passwords, new_password: e.target.value }); clearFeedback("security"); }} /></label>
              <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={passwords.confirm_password} onChange={(e) => { setPasswords({ ...passwords, confirm_password: e.target.value }); clearFeedback("security"); }} /></label>
              <p className="settings-help span-2">Use at least 8 characters. Avoid common passwords, numbers only, and personal details. Changing your password signs you out on all devices.</p>
              <div className="span-2"><ErrorMessage message={feedback.security?.error} /></div>
              <div className="form-actions span-2"><ResetButton disabled={!!busy} onClick={() => { setPasswords(blankPasswords); clearFeedback("security"); }} /><button className="button primary" disabled={!!busy}>{busy === "security" ? "Updating..." : "Change password"}</button></div>
            </fieldset>
          </form>
        </SettingsSection>
      </div>
    </div>}
  </div>;
}
