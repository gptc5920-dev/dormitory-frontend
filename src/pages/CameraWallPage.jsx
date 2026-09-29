import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, MonitorPlay, Play, RefreshCw, Settings2, Video, Wifi } from "lucide-react";
import { Link } from "react-router-dom";
import { api, apiList, rows } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";

const CAMERA_BINDINGS_KEY = "dormitory_camera_device_bindings";

function readCameraBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(CAMERA_BINDINGS_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function sourceStatus(source, deviceId, streaming) {
  if (!source.is_enabled) return "Disabled";
  if (streaming) return "Live";
  if (source.source_type === "webcam" && deviceId) return "Ready";
  if (source.source_type === "webcam") return "Setup needed";
  if (source.source_type === "ip_camera") return source.has_stream_url ? "Ready" : "Setup needed";
  return "Recorded source";
}

function CameraWallTile({ source, deviceId, registerController }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const sessionRef = useRef(0);
  const [streaming, setStreaming] = useState(false);
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const isBrowserCamera = source.source_type === "webcam";
  const isIpCamera = source.source_type === "ip_camera";
  const canStream = source.is_enabled && ((isBrowserCamera && Boolean(deviceId)) || (isIpCamera && source.has_stream_url));

  const stopStream = useCallback(() => {
    activeRef.current = false;
    startingRef.current = false;
    sessionRef.current += 1;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setImage("");
    setStreaming(false);
  }, []);

  const startStream = useCallback(async () => {
    if (activeRef.current || startingRef.current || !canStream) return;
    setError("");
    activeRef.current = true;
    startingRef.current = true;
    const session = sessionRef.current;
    if (isIpCamera) {
      async function refresh() {
        try {
          const data = await api(`/camera-sources/${source.id}/snapshot/`, { method: "POST", body: JSON.stringify({ detect: false, preview_width: 640 }) });
          if (session !== sessionRef.current) return;
          setImage(data.image);
          setStreaming(true);
          timerRef.current = setTimeout(refresh, 3000);
        } catch (err) {
          if (session !== sessionRef.current) return;
          stopStream();
          setError(`Camera connection failed: ${err.message}`);
        } finally {
          if (session === sessionRef.current) startingRef.current = false;
        }
      }
      await refresh();
      return;
    }
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support camera capture.");
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 20 },
        },
        audio: false,
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is not available.");
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (session !== sessionRef.current) return;
      setStreaming(true);
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      if (session !== sessionRef.current) return;
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      activeRef.current = false;
      setError(`Camera access failed: ${err.message}`);
    } finally {
      if (session === sessionRef.current) startingRef.current = false;
    }
  }, [canStream, deviceId, isIpCamera, source.id, stopStream]);

  useEffect(() => {
    registerController(source.id, { startStream, stopStream });
    return () => {
      registerController(source.id, null);
      stopStream();
    };
  }, [registerController, source.id, startStream, stopStream]);

  const status = sourceStatus(source, deviceId, streaming);
  const statusClass = streaming || canStream ? "verified" : "reviewed";

  return <article className="camera-wall-tile">
    <header className="camera-wall-tile-heading">
      <div><h2>{source.name}</h2><span>{source.location}{source.room_number ? ` - Room ${source.room_number}` : ""}</span></div>
      <span className={`status ${statusClass}`}>{status}</span>
    </header>
    <div className="camera-wall-frame">
      {isBrowserCamera && <video ref={videoRef} playsInline muted className={streaming ? "" : "hidden"} />}
      {isIpCamera && streaming && <img src={image} alt={`${source.name} live preview`} />}
      {!streaming && <div className="camera-wall-placeholder">
        {isIpCamera ? <Wifi size={31} /> : <Camera size={31} />}
        <strong>{source.is_enabled ? status : "Source disabled"}</strong>
        <span>{isIpCamera ? source.has_stream_url ? "Select Start to open this IP camera." : "Add an RTSP URL in Monitoring setup." : isBrowserCamera ? deviceId ? "Select Start to open this camera." : "Assign a browser camera in Monitoring setup." : "This source is available for recorded footage processing."}</span>
      </div>}
      {streaming && <span className="camera-wall-live"><i />Live</span>}
    </div>
    <footer className="camera-wall-tile-footer">
      <span>{source.source_type.replaceAll("_", " ")}</span>
      {canStream && !streaming && <button className="button small primary" type="button" onClick={startStream}><Play size={15} />Start</button>}
      {streaming && <button className="button small subtle" type="button" onClick={stopStream}><CircleStop size={15} />Stop</button>}
    </footer>
    {error && <p className="camera-wall-error">{error}</p>}
  </article>;
}

export default function CameraWallPage() {
  const controllersRef = useRef(new Map());
  const [sources, setSources] = useState([]);
  const [bindings, setBindings] = useState(readCameraBindings);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadSources = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await apiList("/camera-sources/?page_size=200");
      setSources(rows(data));
      setBindings(readCameraBindings());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controllers = controllersRef.current;
    loadSources();
    return () => {
      controllers.forEach((controller) => controller.stopStream());
      controllers.clear();
    };
  }, [loadSources]);

  const registerController = useCallback((sourceId, controller) => {
    if (controller) controllersRef.current.set(sourceId, controller);
    else controllersRef.current.delete(sourceId);
  }, []);

  const readySources = sources.filter((source) => source.is_enabled && (source.source_type === "webcam" ? bindings[source.id] : source.source_type === "ip_camera" && source.has_stream_url));
  const enabledSourceCount = sources.filter((source) => source.is_enabled).length;

  async function startAllStreams() {
    if (!readySources.length) {
      setError("No configured camera streams are available. Set up cameras in Monitoring first.");
      return;
    }
    setError("");
    await Promise.all(readySources.map((source) => controllersRef.current.get(source.id)?.startStream()));
  }

  function stopAllStreams() {
    controllersRef.current.forEach((controller) => controller.stopStream());
  }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Live security overview</p><h1>Camera Wall</h1></div><Link className="button subtle" to="/monitoring"><Settings2 size={17} />Manage cameras</Link></header>
    <ErrorMessage message={error} />
    {loading ? <Loading label="Loading camera sources" /> : <>
      <section className="camera-wall-toolbar panel">
        <div><p className="eyebrow">All camera sources</p><h2>{enabledSourceCount} enabled source{enabledSourceCount === 1 ? "" : "s"}</h2><span>Watch browser and IP camera feeds together. Each stream runs independently.</span></div>
        <div className="camera-wall-actions"><button className="button primary" type="button" onClick={startAllStreams}><MonitorPlay size={17} />Start all</button><button className="button subtle" type="button" onClick={stopAllStreams}><CircleStop size={17} />Stop all</button><button className="icon-button" type="button" title="Refresh sources" onClick={() => loadSources(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} size={18} /></button></div>
      </section>
      {sources.length ? <section className="camera-wall-grid">{sources.map((source) => <CameraWallTile key={source.id} source={source} deviceId={bindings[source.id] || ""} registerController={registerController} />)}</section> : <Empty title="No camera sources" detail="Add a browser camera or IP camera source from Monitoring to build the wall." />}
      <section className="camera-wall-note"><Video size={18} /><span>Configure cameras and run detection in Monitoring. IP previews refresh every three seconds.</span></section>
    </>}
  </div>;
}
