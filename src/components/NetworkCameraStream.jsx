import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CircleStop, Play, ScanLine, Settings2, Wifi } from "lucide-react";

export default function NetworkCameraStream({ source, onConfigure, registerController }) {
  const session = useRef(0);
  const timer = useRef(null);
  const active = useRef(false);
  const detect = useRef(false);
  const [state, setState] = useState("Ready");
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);

  const stopCamera = useCallback(() => {
    active.current = false;
    session.current += 1;
    clearTimeout(timer.current);
    detect.current = false;
    setScanning(false);
    setState("Ready");
    setImage("");
    setResult(null);
  }, []);

  const startCamera = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    const current = ++session.current;
    setState("Connecting");
    setError("");
    async function refresh() {
      try {
        const analyzing = detect.current;
        const data = await api(`/camera-sources/${source.id}/snapshot/`, {
          method: "POST", body: JSON.stringify({ detect: analyzing }),
        });
        if (current !== session.current) return;
        setImage(data.image);
        setState("Live");
        if (analyzing) setResult(data);
        timer.current = setTimeout(refresh, 3000);
      } catch (err) {
        if (current !== session.current) return;
        stopCamera();
        setError(err.message);
      }
    }
    await refresh();
  }, [source.id, stopCamera]);

  useEffect(() => {
    registerController(source.id, { startCamera, stopCamera });
    return () => { registerController(source.id, null); stopCamera(); };
  }, [source, registerController, startCamera, stopCamera]);

  return <article className="camera-stream-card">
    <header className="camera-stream-heading">
      <div><h2>{source.name}</h2><span>{source.location} · Wi-Fi / IP CCTV</span></div>
      <div className="camera-card-actions"><span className="status">{state}</span><button className="button subtle" onClick={() => onConfigure(source)} aria-label={`Configure ${source.name}`}><Settings2 size={17} aria-hidden="true" />Configure</button></div>
    </header>
    <div className="camera-stage">
      {image ? <img src={image} alt={`${source.name} CCTV preview`} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <div className="camera-placeholder"><Wifi size={38} aria-hidden="true" /><strong>{state === "Connecting" ? "Connecting to CCTV…" : "Wi-Fi CCTV ready"}</strong><span>Server must be able to reach the camera.</span></div>}
    </div>
    <div className="camera-stream-controls">
      {state === "Ready" ? <button className="button primary" disabled={!source.has_stream_url} onClick={startCamera}><Play size={17} aria-hidden="true" />Start stream</button> : <>
        <button className="button subtle" onClick={stopCamera}><CircleStop size={17} aria-hidden="true" />Stop stream</button>
        <button className="button primary" disabled={state !== "Live"} onClick={() => { detect.current = !detect.current; setScanning(detect.current); }}>{scanning ? <CircleStop size={17} aria-hidden="true" /> : <ScanLine size={17} aria-hidden="true" />}{scanning ? "Stop detection" : "Start detection"}</button>
      </>}
    </div>
    <p className="muted">Preview refreshes 3 seconds after each frame arrives.</p>
    {error && <p className="camera-error">{error}</p>}
    <div className="camera-result"><strong>Latest scan</strong><span>{result ? result.detections.map(item => item.label).join(", ") || "No target cues detected" : "No frame analyzed yet."}</span>{result && <small>{result.incidents_created.length} new incident(s) created.</small>}</div>
  </article>;
}
