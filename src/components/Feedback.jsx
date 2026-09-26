import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

export function ErrorMessage({ message }) {
  return message ? <div className="feedback error" role="alert"><AlertCircle size={17} />{message}</div> : null;
}

export function SuccessMessage({ message }) {
  return message ? <div className="feedback success" role="status"><CheckCircle2 size={17} />{message}</div> : null;
}

export function Loading({ label = "Loading" }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={20} />{label}</div>;
}

export function Empty({ title, detail }) {
  return <div className="empty"><strong>{title}</strong>{detail && <span>{detail}</span>}</div>;
}
