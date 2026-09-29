import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CircleStop, Play, ScanLine, Settings2, Wifi } from "lucide-react";
import { createUnknownFaceTracker, resetUnknownFaceTracker, trackUnknownFaces } from "../unknownFaceAlerts";

export default function NetworkCameraStream({ source, onConfigure, registerController, onUnknownFace, onActivity }) {
  const session = useRef(0);
  const timer = useRef(null);
  const active = useRef(false);
  const detect = useRef(false);
  const unknownFaceRef = useRef(createUnknownFaceTracker());
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
    resetUnknownFaceTracker(unknownFaceRef.current);
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
          method: "POST", body: JSON.stringify({ detect: analyzing, preview_width: analyzing ? 1280 : 960 }),
        });
        if (current !== session.current) return;
        setImage(data.image);
        setState("Live");
        if (analyzing) {
          setResult(data);
          if (data.incidents_created?.length) onActivity({ source, incidents: data.incidents_created });
          if (!data.face_recognition_error) {
            const count = trackUnknownFaces(unknownFaceRef.current, data.faces);
            if (count) onUnknownFace({ source, count });
          }
        }
        timer.current = setTimeout(refresh, 3000);
      } catch (err) {
        if (current !== session.current) return;
        stopCamera();
        setError(err.message);
      }
    }
    await refresh();
  }, [source, stopCamera, onUnknownFace, onActivity]);

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
        <button className="button primary" disabled={state !== "Live"} onClick={() => { detect.current = !detect.current; if (!detect.current) resetUnknownFaceTracker(unknownFaceRef.current); setScanning(detect.current); }}>{scanning ? <CircleStop size={17} aria-hidden="true" /> : <ScanLine size={17} aria-hidden="true" />}{scanning ? "Stop detection" : "Start detection"}</button>
      </>}
    </div>
    <p className="muted">Preview refreshes 3 seconds after each frame arrives.</p>
    {error && <p className="camera-error">{error}</p>}
    <div className="camera-result"><strong>Latest scan</strong><span>{result ? result.detections.map(item => item.label).join(", ") || "No target cues detected" : "No frame analyzed yet."}</span>{result?.faces?.length > 0 && <small>Faces: {result.faces.map((face) => face.tenant_name ? `Possible match: ${face.tenant_name}` : "Unknown").join(", ")}. Confirm any match before acting.</small>}{result?.face_recognition_error && <small>Face matching unavailable: {result.face_recognition_error}</small>}{result && <small>{result.incidents_created.length} new incident(s) created.</small>}</div>
  </article>;
}
