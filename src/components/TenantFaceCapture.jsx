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

export default function TenantFaceCapture({ file, existingImage, hasExistingPhoto, check, onChange, onRemove }) {
  const videoRef = useRef(null);
  const uploadRef = useRef(null);
  const streamRef = useRef(null);
  const cameraSessionRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
      try {
        const photo = await cameraPhoto(videoRef.current);
        if (!isCurrent()) return;
        if (photo) {
          const body = new FormData();
          body.append("photo", photo);
          const result = await api("/tenants/check-face/", { method: "POST", body });
          if (!isCurrent()) return;
          if (result?.face_detected) {
            onChangeRef.current(photo);
            stopCamera();
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
      }
      if (isCurrent()) timer = setTimeout(detectFace, 1500);
    }
    detectFace();
    return () => { active = false; clearTimeout(timer); };
  }, [cameraOpen, stopCamera]);

  async function startCamera() {
    setError("");
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
    const photo = await cameraPhoto(videoRef.current);
    if (session !== cameraSessionRef.current) return;
    if (!photo) { setError("Unable to capture a photo. Try again."); return; }
    onChange(photo);
    stopCamera();
  }

  const image = preview || existingImage;
  return <div className="tenant-face-field span-2">
    <strong>Face photo</strong>
    <p className="muted">Add one clear, front-facing photo. Camera matches are suggestions for staff review.</p>
    <div className="tenant-face-content">
      <div className="tenant-face-preview">{image ? <img src={image} alt="Tenant enrollment face" /> : <span>{hasExistingPhoto ? "Photo enrolled" : "No photo yet"}</span>}</div>
      <div className="tenant-face-actions">
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) { stopCamera(); onChange(selected); setError(""); } event.target.value = ""; }} />
        <button type="button" className="button subtle" onClick={() => uploadRef.current?.click()}><ImagePlus size={16} />Upload photo</button>
        {!cameraOpen ? <button type="button" className="button subtle" onClick={startCamera}><Camera size={16} />Use camera</button> : <>
          <button type="button" className="button primary" onClick={capture}><Camera size={16} />Capture photo</button>
          <button type="button" className="button subtle" onClick={stopCamera}><CircleStop size={16} />Stop camera</button>
        </>}
        {(file || hasExistingPhoto) && <button type="button" className="button subtle" onClick={() => { stopCamera(); onRemove(); setError(""); }}><Trash2 size={16} />Remove photo</button>}
      </div>
    </div>
    <video ref={videoRef} className={`tenant-face-camera ${cameraOpen ? "" : "hidden"}`} playsInline muted />
    {cameraOpen && <p role="status" className="muted">Looking for one clear face. Hold still; a photo will be captured automatically. You can also select Capture photo.</p>}
    {file && check?.message && <p role={check.status === "error" ? "alert" : "status"} className={check.status === "error" ? "camera-error" : "muted"}>{check.message}</p>}
    {error && <p role="alert" className="camera-error">{error}</p>}
  </div>;
}
