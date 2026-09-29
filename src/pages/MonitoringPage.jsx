import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Camera, CircleStop, MonitorPlay, Play, Plus, ScanLine, Settings2, Trash2, Upload, Video, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api, apiList, rows } from "../api";
import { ErrorMessage, Loading, SuccessMessage } from "../components/Feedback";
import NetworkCameraStream from "../components/NetworkCameraStream";
import Modal from "../components/Modal";
import { createUnknownFaceTracker, resetUnknownFaceTracker, trackUnknownFaces } from "../unknownFaceAlerts";

const CAMERA_BINDINGS_KEY = "dormitory_camera_device_bindings";

function readCameraBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(CAMERA_BINDINGS_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function emptyCameraForm(source, deviceId = "") {
  return {
    id: source?.id || null,
    name: source?.name || "",
    location: source?.location || "",
    room: source?.room ? String(source.room) : "",
    source_type: source?.source_type || "webcam",
    stream_url: "",
    has_stream_url: source?.has_stream_url || false,
    deviceId,
  };
}

function CameraStream({ source, deviceId, onConfigure, registerController, onUnknownFace, onActivity }) {
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const startingRef = useRef(false);
  const timerRef = useRef(null);
  const busyRef = useRef(false);
  const cameraSessionRef = useRef(0);
  const unknownFaceRef = useRef(createUnknownFaceTracker());
  const [cameraOn, setCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [focusLabel, setFocusLabel] = useState("");
  const [videoViewport, setVideoViewport] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    startingRef.current = false;
    cameraSessionRef.current += 1;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    busyRef.current = false;
    setCameraOn(false);
    setScanning(false);
    setAnalyzing(false);
    setFocusLabel("");
    setVideoViewport(null);
    resetUnknownFaceTracker(unknownFaceRef.current);
  }, []);

  const updateVideoViewport = useCallback(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video?.videoWidth || !video?.videoHeight) return;
    const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    setVideoViewport({
      left: (stage.clientWidth - width) / 2,
      top: (stage.clientHeight - height) / 2,
      width,
      height,
    });
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current || startingRef.current) return;
    if (!deviceId) {
      setError("Select a browser camera for this source before starting it.");
      return;
    }

    setError("");
    setResult(null);
    startingRef.current = true;
    const session = cameraSessionRef.current;
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support camera capture.");
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 20, max: 24 },
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      let capabilities = {};
      try {
        if (track && "contentHint" in track) track.contentHint = "detail";
        capabilities = track?.getCapabilities?.() || {};
      } catch {
        capabilities = {};
      }
      let nextFocusLabel = "Camera-managed focus";
      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
          nextFocusLabel = "Continuous autofocus";
        } catch {
          nextFocusLabel = "Camera-managed focus";
        }
      }
      if (session !== cameraSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is not available.");
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (session !== cameraSessionRef.current) return;
      setFocusLabel(nextFocusLabel);
      setCameraOn(true);
      requestAnimationFrame(updateVideoViewport);
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      if (session !== cameraSessionRef.current) return;
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setFocusLabel("");
      setError(`Camera access failed: ${err.message}`);
    } finally {
      if (session === cameraSessionRef.current) startingRef.current = false;
    }
  }, [deviceId, updateVideoViewport]);

  const captureFrame = useCallback(async () => {
    if (busyRef.current || !videoRef.current?.videoWidth) return;
    busyRef.current = true;
    const session = cameraSessionRef.current;
    setAnalyzing(true);
    try {
      const canvas = canvasRef.current;
      const scale = Math.min(1, 960 / videoRef.current.videoWidth);
      canvas.width = Math.max(1, Math.round(videoRef.current.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(videoRef.current.videoHeight * scale));
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
      if (session !== cameraSessionRef.current) return;
      if (!blob) throw new Error("The browser could not capture a camera frame.");
      const body = new FormData();
      body.append("frame", blob, `${source.name.toLowerCase().replaceAll(" ", "-") || "camera"}-frame.jpg`);
      body.append("source", String(source.id));
      const nextResult = await api("/monitoring/detect-frame/", { method: "POST", body });
      if (session === cameraSessionRef.current && streamRef.current) {
        setResult(nextResult);
        if (nextResult.incidents_created?.length) onActivity({ source, incidents: nextResult.incidents_created });
        if (!nextResult.face_recognition_error) {
          const count = trackUnknownFaces(unknownFaceRef.current, nextResult.faces);
          if (count) onUnknownFace({ source, count });
        }
      }
    } catch (err) {
      if (session === cameraSessionRef.current) setError(err.message);
    } finally {
      if (session === cameraSessionRef.current) {
        busyRef.current = false;
        setAnalyzing(false);
      }
    }
  }, [source, onUnknownFace, onActivity]);

  const toggleScanning = useCallback(() => {
    if (scanning) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      resetUnknownFaceTracker(unknownFaceRef.current);
      setScanning(false);
      return;
    }
    captureFrame();
    timerRef.current = setInterval(captureFrame, 3000);
    setScanning(true);
  }, [captureFrame, scanning]);

  useEffect(() => {
    registerController(source.id, { startCamera, stopCamera });
    return () => {
      registerController(source.id, null);
      stopCamera();
    };
  }, [registerController, source.id, startCamera, stopCamera]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !cameraOn) return undefined;
    if (typeof ResizeObserver === "undefined") {
      updateVideoViewport();
      return undefined;
    }
    const observer = new ResizeObserver(updateVideoViewport);
    observer.observe(stage);
    updateVideoViewport();
    return () => observer.disconnect();
  }, [cameraOn, updateVideoViewport]);

  const sourceWidth = result?.frame?.width || videoRef.current?.videoWidth || 1;
  const sourceHeight = result?.frame?.height || videoRef.current?.videoHeight || 1;

  return <article className="camera-stream-card">
    <header className="camera-stream-heading">
      <div><h2>{source.name}</h2><span>{source.location}{source.room_number ? ` · Room ${source.room_number}` : ""}</span></div>
      <div className="camera-card-actions">
        <span className={`status ${cameraOn ? "verified" : "reviewed"}`}>{cameraOn ? "Live" : deviceId ? "Ready" : "Setup needed"}</span>
        <button className="icon-button" type="button" title={`Configure ${source.name}`} onClick={() => onConfigure(source)}><Settings2 size={17} /></button>
      </div>
    </header>
    <div ref={stageRef} className={`camera-stage ${scanning ? "is-scanning" : ""}`}>
      <video ref={videoRef} playsInline muted className={cameraOn ? "" : "hidden"} onLoadedMetadata={updateVideoViewport} />
      {!cameraOn && <div className="camera-placeholder"><Camera size={38} /><strong>{deviceId ? "Camera is ready to start" : "Choose a browser camera"}</strong><span>{deviceId ? "Start this stream or use Start all streams." : "Use Configure to associate a connected camera."}</span></div>}
      {scanning && <span className="live-indicator"><i />{analyzing ? "Analyzing frame" : "Detection active · every 3 seconds"}</span>}
      {cameraOn && result?.detections?.length > 0 && <span className="detect-count">{result.detections.length} detected</span>}
      {cameraOn && videoViewport && result?.detections?.map((item, index) => {
        const [x1, y1, x2, y2] = item.box;
        const style = {
          left: videoViewport.left + (x1 / sourceWidth) * videoViewport.width,
          top: videoViewport.top + (y1 / sourceHeight) * videoViewport.height,
          width: ((x2 - x1) / sourceWidth) * videoViewport.width,
          height: ((y2 - y1) / sourceHeight) * videoViewport.height,
        };
        return <div className={`detection-box ${item.incident_type}`} style={style} key={`${item.incident_type}-${index}`}><span>{item.label} · {Math.round(item.confidence * 100)}%</span></div>;
      })}
      {cameraOn && videoViewport && result?.faces?.map((face, index) => {
        const [x1, y1, x2, y2] = face.box;
        const style = {
          left: videoViewport.left + (x1 / sourceWidth) * videoViewport.width,
          top: videoViewport.top + (y1 / sourceHeight) * videoViewport.height,
          width: ((x2 - x1) / sourceWidth) * videoViewport.width,
          height: ((y2 - y1) / sourceHeight) * videoViewport.height,
        };
        return <div className={`detection-box ${face.status === "possible_match" ? "face-match" : "face-unknown"}`} style={style} key={`face-${index}`}><span>{face.tenant_name ? `Possible match: ${face.tenant_name}` : "Unknown face"}</span></div>;
      })}
      {cameraOn && <div className="camera-readout"><span>{videoRef.current?.videoWidth || "—"} × {videoRef.current?.videoHeight || "—"}</span><span>{focusLabel}</span></div>}
      <canvas ref={canvasRef} hidden />
    </div>
    <div className="camera-stream-controls">
      {!cameraOn ? <button className="button primary" type="button" disabled={!deviceId} onClick={startCamera}><Play size={17} />Start stream</button> : <>
        <button className={`button ${scanning ? "danger-button" : "success-button"}`} type="button" onClick={toggleScanning}>{scanning ? <CircleStop size={17} /> : <ScanLine size={17} />}{scanning ? "Stop detection" : "Start detection"}</button>
        <button className="button subtle" type="button" onClick={stopCamera}><CircleStop size={17} />Stop stream</button>
      </>}
    </div>
    {error && <p className="camera-error">{error}</p>}
    <div className="camera-result"><strong>Latest scan</strong>{!result ? <span className="muted">No frame analyzed yet.</span> : <><span>{result.detections.length ? result.detections.map((item) => item.label).join(", ") : "No target cues detected"}</span>{result.faces?.length > 0 && <small>Faces: {result.faces.map((face) => face.tenant_name ? `Possible match: ${face.tenant_name}` : "Unknown").join(", ")}. Confirm any match before acting.</small>}{result.face_recognition_error && <small>Face matching unavailable: {result.face_recognition_error}</small>}<small>{result.incidents_created.length} new incident(s) created.</small></>}</div>
  </article>;
}

export default function MonitoringPage() {
  const controllersRef = useRef(new Map());
  const alertIdRef = useRef(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [cameraAlerts, setCameraAlerts] = useState([]);
  const [desktopPermission, setDesktopPermission] = useState(() => window.Notification?.permission || "unsupported");
  const [status, setStatus] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [sources, setSources] = useState([]);
  const [bindings, setBindings] = useState(readCameraBindings);
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const [devices, setDevices] = useState([]);
  const [discoveringDevices, setDiscoveringDevices] = useState(false);
  const [cameraForm, setCameraForm] = useState(() => emptyCameraForm());
  const [savingCamera, setSavingCamera] = useState(false);
  const [upload, setUpload] = useState({ file: null, room: "", source_name: "Uploaded corridor video" });
  const [job, setJob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pushCameraAlert = useCallback(({ title, detail, tag, incidentId }) => {
    setCameraAlerts((current) => [{ id: ++alertIdRef.current, title, detail, incidentId }, ...current].slice(0, 5));
    if (window.Notification?.permission === "granted") {
      try { new window.Notification(title, { body: detail, tag }); } catch { /* In-app alert remains available. */ }
    }
  }, []);

  const notifyUnknownFace = useCallback(({ source, count }) => {
    pushCameraAlert({
      title: "Unrecognized face detected",
      detail: `${count} face${count === 1 ? "" : "s"} could not be matched at ${source.name}${source.location ? ` (${source.location})` : ""}. Review the camera before acting.`,
      tag: `unknown-face-${source.id}`,
    });
  }, [pushCameraAlert]);

  const notifyActivity = useCallback(({ source, incidents }) => {
    const labels = [...new Set(incidents.map((incident) => incident.incident_type?.replaceAll("_", " ") || "activity"))];
    pushCameraAlert({
      title: "Camera activity needs review",
      detail: `${incidents.length} new incident${incidents.length === 1 ? "" : "s"} at ${source.name}${source.location ? ` (${source.location})` : ""}: ${labels.join(", ")}.`,
      tag: `camera-activity-${source.id}-${incidents[0].id}`,
      incidentId: incidents[0].id,
    });
  }, [pushCameraAlert]);

  async function enableDesktopAlerts() {
    try {
      const permission = await window.Notification.requestPermission();
      setDesktopPermission(permission);
      if (permission === "denied") setError("Browser notifications are blocked. Camera alerts will still appear here.");
    } catch (err) { setError(`Unable to enable browser notifications: ${err.message}`); }
  }

  const loadData = useCallback(async () => {
    const [model, roomData, sourceData] = await Promise.all([
      api("/monitoring/status/"), apiList("/rooms/?active=true&page_size=200"), apiList("/camera-sources/?page_size=200"),
    ]);
    setStatus(model);
    setRooms(rows(roomData));
    setSources(rows(sourceData));
  }, []);

  const loadAvailableDevices = useCallback(async (requestPermission = false) => {
    setDiscoveringDevices(true);
    setError("");
    let temporaryStream;
    try {
      if (!window.isSecureContext) throw new Error("Open this page using HTTPS or localhost to enable camera access.");
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error("This browser cannot list connected cameras.");
      if (requestPermission) temporaryStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const found = await navigator.mediaDevices.enumerateDevices();
      const cameras = found.filter((device) => device.kind === "videoinput" && device.deviceId).map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
      setDevices(cameras);
      if (requestPermission) {
        if (!cameras.length) throw new Error("No cameras found. Connect a webcam, then try Discover cameras again.");
        setCameraForm((current) => ({
          ...current,
          deviceId: cameras.filter((camera) => !Object.entries(bindingsRef.current).some(([sourceId, boundDevice]) => Number(sourceId) !== current.id && boundDevice === camera.deviceId)).find((camera) => camera.deviceId === current.deviceId)?.deviceId
            || cameras.find((camera) => !Object.entries(bindingsRef.current).some(([sourceId, boundDevice]) => Number(sourceId) !== current.id && boundDevice === camera.deviceId))?.deviceId || "",
        }));
      }
    } catch (err) {
      const messages = {
        NotAllowedError: "Camera permission was denied. Allow camera access in your browser's site settings, then try Discover cameras again.",
        NotFoundError: "No cameras found. Connect a built-in or USB webcam, then try Discover cameras again.",
        NotReadableError: "The camera is busy or unavailable. Close other apps using it, then try again.",
      };
      setError(messages[err.name] || `Camera discovery failed: ${err.message}`);
    } finally {
      temporaryStream?.getTracks().forEach((track) => track.stop());
      setDiscoveringDevices(false);
    }
  }, []);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    const refresh = () => loadAvailableDevices();
    mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, [loadAvailableDevices]);

  useEffect(() => {
    const controllers = controllersRef.current;
    loadData().catch((err) => setError(err.message));
    loadAvailableDevices();
    return () => {
      controllers.forEach((controller) => controller.stopCamera());
      controllers.clear();
    };
  }, [loadAvailableDevices, loadData]);

  const saveBinding = useCallback((sourceId, deviceId) => {
    setBindings((current) => {
      const next = { ...current };
      if (deviceId) next[sourceId] = deviceId;
      else delete next[sourceId];
      localStorage.setItem(CAMERA_BINDINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const registerController = useCallback((sourceId, controller) => {
    if (controller) controllersRef.current.set(sourceId, controller);
    else controllersRef.current.delete(sourceId);
  }, []);

  function configureCamera(source) {
    setError("");
    setSuccess("");
    const available = devices.filter((device) => !Object.entries(bindings).some(([sourceId, boundDevice]) => Number(sourceId) !== source?.id && boundDevice === device.deviceId));
    const savedDevice = source ? bindings[source.id] : "";
    setCameraForm(emptyCameraForm(source, available.find((device) => device.deviceId === savedDevice)?.deviceId || available[0]?.deviceId || ""));
    setSetupOpen(true);
  }

  function closeSetup() {
    if (savingCamera) return;
    setSetupOpen(false);
    setCameraForm(emptyCameraForm());
    setError("");
  }

  async function saveCamera(event) {
    event.preventDefault();
    if (savingCamera) return;
    setError("");
    setSuccess("");
    if (cameraForm.source_type === "webcam" && !devices.some((device) => device.deviceId === cameraForm.deviceId)) {
      setError("Discover cameras and choose a connected browser camera before saving this source.");
      return;
    }
    if (cameraForm.source_type === "webcam" && Object.entries(bindings).some(([sourceId, deviceId]) => Number(sourceId) !== cameraForm.id && deviceId === cameraForm.deviceId)) {
      setError("This browser camera is already assigned to another source. Choose a different camera.");
      return;
    }
    setSavingCamera(true);
    const payload = {
      name: cameraForm.name,
      source_type: cameraForm.source_type,
      location: cameraForm.location,
      room: cameraForm.room || null,
      is_enabled: true,
    };
    if (cameraForm.source_type === "ip_camera" && cameraForm.stream_url.trim()) payload.stream_url = cameraForm.stream_url.trim();
    try {
      const saved = await api(cameraForm.id ? `/camera-sources/${cameraForm.id}/` : "/camera-sources/", {
        method: cameraForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setSources((current) => cameraForm.id ? current.map((source) => source.id === saved.id ? saved : source) : [...current, saved].sort((first, second) => first.name.localeCompare(second.name)));
      saveBinding(saved.id, cameraForm.source_type === "webcam" ? cameraForm.deviceId : "");
      setCameraForm(emptyCameraForm());
      setSetupOpen(false);
      setSuccess(`${saved.name} is configured. Use Start stream to check the connection.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCamera(false);
    }
  }

  async function removeCamera(source) {
    if (savingCamera) return;
    if (!source || !window.confirm(`Remove ${source.name}? Existing incidents will keep their source name.`)) return;
    setError("");
    setSavingCamera(true);
    try {
      controllersRef.current.get(source.id)?.stopCamera();
      await api(`/camera-sources/${source.id}/`, { method: "DELETE" });
      setSources((current) => current.filter((item) => item.id !== source.id));
      saveBinding(source.id, "");
      if (cameraForm.id === source.id) setCameraForm(emptyCameraForm());
      setSetupOpen(false);
      setSuccess(`${source.name} was removed.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCamera(false);
    }
  }

  async function startAllStreams() {
    const configuredSources = browserSources.filter((source) => source.source_type === "ip_camera" ? source.has_stream_url : bindings[source.id]);
    if (!configuredSources.length) {
      setError("Configure at least one camera before starting streams.");
      return;
    }
    setError("");
    await Promise.all(configuredSources.map((source) => controllersRef.current.get(source.id)?.startCamera()));
  }

  function stopAllStreams() {
    controllersRef.current.forEach((controller) => controller.stopCamera());
  }

  async function processUpload(event) {
    event.preventDefault();
    setError("");
    setJob(null);
    setProcessing(true);
    const body = new FormData();
    body.append("video", upload.file);
    body.append("source_name", upload.source_name);
    if (upload.room) body.append("room", upload.room);
    try {
      setJob(await api("/video-jobs/", { method: "POST", body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  const browserSources = sources.filter((source) => ["webcam", "ip_camera"].includes(source.source_type) && source.is_enabled);
  const configuredCount = browserSources.filter((source) => source.source_type === "ip_camera" ? source.has_stream_url : bindings[source.id]).length;
  const assignableDevices = devices.filter((device) => !Object.entries(bindings).some(([sourceId, boundDevice]) => Number(sourceId) !== cameraForm.id && boundDevice === device.deviceId));

  return <div className="page">
    <div className="camera-notifications" aria-label="Camera notifications">
      {cameraAlerts.map((alert) => <div key={alert.id} className="camera-notification" role="alert">
        <BellRing size={19} aria-hidden="true" /><div><strong>{alert.title}</strong><p>{alert.detail}</p>{alert.incidentId && <Link to={`/incidents?incident=${alert.incidentId}`}>Review incident</Link>}</div>
        <button className="icon-button" type="button" aria-label={alert.incidentId ? "Dismiss camera activity notification" : "Dismiss unrecognized face notification"} onClick={() => setCameraAlerts((current) => current.filter((item) => item.id !== alert.id))}><X size={17} /></button>
      </div>)}
    </div>
    <header className="page-header"><div><p className="eyebrow">Camera operations</p><h1>Monitoring</h1></div><span className={`status ${status?.weights_available ? "verified" : "reviewed"}`}>{status?.weights_available ? "YOLO Nano ready" : "Fallback mode"}</span></header>
    <ErrorMessage message={setupOpen ? "" : error} />
    <SuccessMessage message={success} />
    {!status ? <Loading label="Checking detector" /> : <>
      <section className="model-banner"><ScanLine size={21} /><div><strong>{status.mode}</strong><span>{status.notice}</span></div></section>
      <section className="camera-toolbar panel">
        <div><p className="eyebrow">Live cameras</p><h2>{configuredCount} of {browserSources.length} source{browserSources.length === 1 ? "" : "s"} configured</h2><span>Each source can stream and run detection independently.</span></div>
        <div className="camera-toolbar-actions"><button className="button primary" type="button" onClick={() => configureCamera()}><Plus size={17} />Set up camera</button><button className="button subtle" type="button" disabled={!configuredCount} onClick={startAllStreams}><MonitorPlay size={17} />Start all streams</button><button className="button subtle" type="button" onClick={stopAllStreams}><CircleStop size={17} />Stop all</button>{desktopPermission === "default" && <button className="button subtle" type="button" onClick={enableDesktopAlerts}><BellRing size={17} />Enable desktop alerts</button>}{desktopPermission === "granted" && <span className="status verified">Desktop alerts on</span>}</div>
      </section>
      <section className="camera-stream-grid">
        {browserSources.map((source) => source.source_type === "ip_camera" ? <NetworkCameraStream key={source.id} source={source} onConfigure={configureCamera} registerController={registerController} onUnknownFace={notifyUnknownFace} onActivity={notifyActivity} /> : <CameraStream key={source.id} source={source} deviceId={bindings[source.id] || ""} onConfigure={configureCamera} registerController={registerController} onUnknownFace={notifyUnknownFace} onActivity={notifyActivity} />)}
        {!browserSources.length && <div className="empty camera-empty"><Camera size={25} /><strong>No cameras are configured</strong><span>Choose Set up camera to add a camera source.</span></div>}
      </section>
      {setupOpen && <Modal title={cameraForm.id ? "Configure camera" : "Set up camera"} onClose={closeSetup} wide>
        <p className="muted">For Wi-Fi CCTV, connect the camera to Wi-Fi using its manufacturer app, enable RTSP, and enter its stream URL. The server must be on the same network or have a route to the camera. For a webcam, click Discover cameras and allow access, then enter its name and location. After saving, use Start stream to view the camera.</p>
        {cameraForm.source_type === "webcam" && <button className="button subtle" type="button" disabled={discoveringDevices || savingCamera} onClick={() => loadAvailableDevices(true)}><Video size={17} />{discoveringDevices ? "Checking cameras..." : "Discover cameras"}</button>}
        <ErrorMessage message={error} />
        <form className="form-grid camera-setup-modal-form" onSubmit={saveCamera}>
          <label>Camera type<select value={cameraForm.source_type} onChange={(event) => setCameraForm({ ...cameraForm, source_type: event.target.value })}><option value="webcam">Browser webcam</option><option value="ip_camera">Wi-Fi / IP CCTV (RTSP)</option></select></label>
          <label>Camera name<input value={cameraForm.name} onChange={(event) => setCameraForm({ ...cameraForm, name: event.target.value })} placeholder="East wing entrance" maxLength={120} required /></label>
          <label>Location<input value={cameraForm.location} onChange={(event) => setCameraForm({ ...cameraForm, location: event.target.value })} placeholder="East wing, ground floor" maxLength={160} required /></label>
          <label>Associate room<select value={cameraForm.room} onChange={(event) => setCameraForm({ ...cameraForm, room: event.target.value })}><option value="">Common area / no room</option>{rooms.map((room) => <option key={room.id} value={room.id}>Room {room.number}</option>)}</select></label>
          {cameraForm.source_type === "webcam" ? <label>Connected browser camera<select value={cameraForm.deviceId} onChange={(event) => setCameraForm({ ...cameraForm, deviceId: event.target.value })} required><option value="">Select a connected camera</option>{assignableDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select><small>{devices.length > 0 && assignableDevices.length === 0 ? "All discovered cameras are assigned. Connect another camera or edit an existing source." : "Each browser camera can be assigned to one stream."}</small></label> : <label>RTSP stream URL<input type="password" autoComplete="new-password" value={cameraForm.stream_url} onChange={(event) => setCameraForm({ ...cameraForm, stream_url: event.target.value })} placeholder="rtsp://user:password@192.168.1.100:554/stream" maxLength={500} required={!cameraForm.has_stream_url} /><small>{cameraForm.has_stream_url ? "Leave blank to keep the saved URL. " : ""}Use the stream path supplied by your camera manufacturer. Credentials are never returned by the API.</small></label>}
          <div className="form-actions span-2"><button className="button subtle" type="button" disabled={savingCamera} onClick={closeSetup}>Cancel</button>{cameraForm.id && <button className="button danger-button" type="button" disabled={savingCamera} onClick={() => removeCamera(sources.find((source) => source.id === cameraForm.id))}><Trash2 size={17} />Remove</button>}<button className="button primary" disabled={savingCamera || discoveringDevices}>{savingCamera ? "Saving..." : <>{cameraForm.id ? <Settings2 size={17} /> : <Plus size={17} />}{cameraForm.id ? "Save changes" : "Add camera"}</>}</button></div>
        </form>
      </Modal>}
      <section className="upload-band">
        <div><p className="eyebrow">Recorded footage</p><h2>Analyze uploaded video</h2></div>
        <form className="upload-form" onSubmit={processUpload}>
          <label>Video file<input type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/*" onChange={(event) => setUpload({ ...upload, file: event.target.files[0] || null })} required /></label>
          <label>Source label<input value={upload.source_name} onChange={(event) => setUpload({ ...upload, source_name: event.target.value })} required /></label>
          <label>Room<select value={upload.room} onChange={(event) => setUpload({ ...upload, room: event.target.value })}><option value="">Common area / no room</option>{rooms.map((room) => <option key={room.id} value={room.id}>Room {room.number}</option>)}</select></label>
          <button className="button primary" disabled={processing}>{processing ? "Processing..." : <><Upload size={17} />Analyze video</>}</button>
        </form>
        {job && <SuccessMessage message={`${job.status === "completed" ? "Analysis complete" : job.status}: ${job.frames_processed} sampled frames, ${job.incidents_created} incidents created.`} />}
      </section>
    </>}
  </div>;
}
