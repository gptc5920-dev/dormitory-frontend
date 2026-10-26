import { useState } from "react";
import { BellRing, ShieldAlert, X } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate } from "../api";
import { useCameraAlerts } from "../context/CameraAlertsContext";
import Modal from "./Modal";

function AlertContent({ alert, onReview }) {
  const incidentId = Number(alert.incidentId);
  return <div><strong>{alert.title}</strong><p>{alert.detail}</p>
    {Number.isSafeInteger(incidentId) && incidentId > 0
      ? <Link to={`/incidents?incident=${incidentId}`} onClick={onReview}>Review incident</Link>
      : <Link to="/monitoring" onClick={onReview}>Review camera</Link>}
  </div>;
}

export function CameraAlertToasts() {
  const { alerts, markRead } = useCameraAlerts();
  return <div className="camera-notifications" aria-label="Camera warnings">
    {alerts.filter((alert) => !alert.read).slice(0, 5).map((alert) => <div key={alert.id} className={`camera-notification ${alert.kind === "unauthorized" ? "unauthorized-warning" : ""}`} role="alert">
      {alert.kind === "unauthorized" ? <ShieldAlert size={19} aria-hidden="true" /> : <BellRing size={19} aria-hidden="true" />}
      <AlertContent alert={alert} onReview={() => markRead(alert.id)} />
      <button className="icon-button" type="button" aria-label={alert.kind === "unauthorized" ? "Dismiss unauthorized person warning" : "Dismiss camera activity notification"} onClick={() => markRead(alert.id)}><X size={17} /></button>
    </div>)}
  </div>;
}

export default function CameraNotifications() {
  const { alerts, markRead, markAllRead } = useCameraAlerts();
  const [open, setOpen] = useState(false);
  const unread = alerts.filter((alert) => !alert.read).length;
  return <>
    <button type="button" className="icon-button notifications-trigger" aria-label={`Camera notifications, ${unread} unread`} onClick={() => setOpen(true)}>
      <BellRing size={20} />{unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <Modal title="Camera notifications" onClose={() => setOpen(false)} wide>
      <p className="muted">Recent camera warnings saved for your account in this browser. Unmatched faces require staff review.</p>
      {unread > 0 && <button type="button" className="button subtle small" onClick={markAllRead}>Mark all read</button>}
      {alerts.length ? <div className="notification-history">{alerts.map((alert) => <article key={alert.id} className={alert.read ? "" : "unread"}>
        <div className="notification-history-meta"><time dateTime={alert.createdAt}>{formatDate(alert.createdAt)}</time>{!alert.read && <span className="status reviewed">Unread</span>}</div>
        <AlertContent alert={alert} onReview={() => { markRead(alert.id); setOpen(false); }} />
      </article>)}</div> : <p>No camera notifications yet.</p>}
    </Modal>}
  </>;
}
