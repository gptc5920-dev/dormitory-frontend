import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, ImagePlus, Trash2 } from "lucide-react";
import { api } from "../api";

async function cameraPhoto(video) {
  if (!video?.videoWidth || !video?.videoHeight) return null;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1280 / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return blob ? new File([blob], "tenant-face.jpg", { type: "image/jpeg" }) : null;
}

function FacePhoto({ photo, index, disabled, onRemove }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!photo.file) return undefined;
    const url = URL.createObjectURL(photo.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.file]);
  return <div className="tenant-face-sample">
    <div className="tenant-face-preview"><img src={photo.image || preview || undefined} alt={index === 0 ? "Occupant enrollment face" : `Occupant enrollment face ${index + 1}`} /></div>
    <span className="muted">Photo {index + 1}{!photo.file ? " · Saved" : ""}</span>
    {photo.message && <p role={photo.status === "error" ? "alert" : "status"} className={photo.status === "error" ? "camera-error" : "muted"}>{photo.message}</p>}
    <button type="button" className="button subtle small" disabled={disabled} aria-label={index === 0 ? "Remove photo" : `Remove photo ${index + 1}`} onClick={() => onRemove(photo.key)}><Trash2 size={14} />Remove</button>
  </div>;
}

export default function TenantFaceCapture({ photos, disabled, onChange, onRemove }) {
  const videoRef = useRef(null);
  const uploadRef = useRef(null);
  const streamRef = useRef(null);
  const cameraSessionRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const captureBusyRef = useRef(null);
  const automaticDoneRef = useRef(false);
  const canCaptureRef = useRef(false);
  canCaptureRef.current = !disabled && photos.length < 10;
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoCaptured, setAutoCaptured] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    cameraSessionRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopCamera = useCallback(() => {
    cameraSessionRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let active = true;
    let timer;
    const session = cameraSessionRef.current;
    const isCurrent = () => active && session === cameraSessionRef.current;
    async function detectFace() {
      if (!isCurrent() || !canCaptureRef.current || automaticDoneRef.current) return;
      if (captureBusyRef.current === session) { timer = setTimeout(detectFace, 1500); return; }
      captureBusyRef.current = session;
      setCapturing(true);
      try {
        const photo = await cameraPhoto(videoRef.current);
        if (!isCurrent()) return;
        if (photo) {
          const body = new FormData();
          body.append("photo", photo);
          const result = await api("/tenants/check-face/", { method: "POST", body });
          if (!isCurrent()) return;
          if (result?.face_detected) {
            if (canCaptureRef.current && !automaticDoneRef.current) onChangeRef.current([photo]);
            automaticDoneRef.current = true;
            setAutoCaptured(true);
            return;
          }
        }
      } catch (err) {
        if (!isCurrent()) return;
        // A frame without exactly one face is expected while positioning.
        if (err.status !== 400) {
          setError(`Automatic face detection failed: ${err.message}`);
          stopCamera();
          return;
        }
      } finally {
        if (captureBusyRef.current === session) captureBusyRef.current = null;
        if (isCurrent()) setCapturing(false);
      }
      if (isCurrent()) timer = setTimeout(detectFace, 1500);
    }
    detectFace();
    return () => { active = false; clearTimeout(timer); };
  }, [cameraOpen, stopCamera]);

  async function startCamera() {
    setError("");
    setAutoCaptured(false);
    automaticDoneRef.current = false;
    setCapturing(false);
    const session = ++cameraSessionRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture requires HTTPS and a supported browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      if (session !== cameraSessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (session !== cameraSessionRef.current) return;
      setCameraOpen(true);
    } catch (err) {
      if (session !== cameraSessionRef.current) return;
      stopCamera();
      setError(`Camera access failed: ${err.message}`);
    }
  }

  async function capture() {
    const session = cameraSessionRef.current;
    if (captureBusyRef.current === session || !canCaptureRef.current) return;
    captureBusyRef.current = session;
    setCapturing(true);
    try {
      const photo = await cameraPhoto(videoRef.current);
      if (session !== cameraSessionRef.current) return;
      if (!photo) { setError("Unable to capture a photo. Try again."); return; }
      if (canCaptureRef.current) onChangeRef.current([photo]);
      automaticDoneRef.current = true;
      setAutoCaptured(true);
      setError("");
    } catch (err) { setError(`Unable to capture a photo: ${err.message}`); }
    finally {
      if (captureBusyRef.current === session) captureBusyRef.current = null;
      if (session === cameraSessionRef.current) setCapturing(false);
    }
  }

  return <div className="tenant-face-field span-2">
    <strong>Face photos · {photos.length}/10</strong>
    <p className="muted">Add 3–5 clear photos of the same person: front, slight left, slight right, and at the camera’s usual distance. Keep one visible face in every photo. Up to 10 photos, 8 MB each.</p>
    <p className="muted">More angles can help matching, but a distant or blurry face may still be unrecognizable. Camera matches are suggestions for staff review.</p>
    <div className="tenant-face-gallery">
      {photos.length ? photos.map((photo, index) => <FacePhoto key={photo.key} photo={photo} index={index} disabled={disabled} onRemove={onRemove} />) : <span className="muted">{disabled ? "Loading face photos..." : "No photos yet"}</span>}
    </div>
    <div className="tenant-face-content">
      <div className="tenant-face-actions">
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || photos.length >= 10} hidden onChange={(event) => { const selected = Array.from(event.target.files || []); if (selected.length) { stopCamera(); onChange(selected); setError(""); } event.target.value = ""; }} />
        <button type="button" className="button subtle" disabled={disabled || photos.length >= 10} onClick={() => uploadRef.current?.click()}><ImagePlus size={16} />Upload photos</button>
        {!cameraOpen ? <button type="button" className="button subtle" disabled={disabled || photos.length >= 10} onClick={startCamera}><Camera size={16} />Use camera</button> : <>
          <button type="button" className="button primary" disabled={disabled || capturing || photos.length >= 10} onClick={capture}><Camera size={16} />Capture photo</button>
          <button type="button" className="button subtle" onClick={stopCamera}><CircleStop size={16} />Stop camera</button>
        </>}
      </div>
    </div>
    <video ref={videoRef} className={`tenant-face-camera ${cameraOpen ? "" : "hidden"}`} playsInline muted />
    {cameraOpen && <p role="status" className="muted">{autoCaptured ? "First photo captured. Turn slightly left or right, then select Capture photo for each new angle. Select Save when finished." : "Looking for one clear face. Hold still; the first photo will be captured automatically. You can also select Capture photo."}</p>}
    {error && <p role="alert" className="camera-error">{error}</p>}
  </div>;
}
