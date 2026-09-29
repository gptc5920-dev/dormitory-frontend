import { useEffect, useRef, useState } from "react";
import { Camera, CircleStop, ImagePlus, Trash2 } from "lucide-react";

export default function TenantFaceCapture({ file, existingImage, hasExistingPhoto, check, onChange, onRemove }) {
  const videoRef = useRef(null);
  const uploadRef = useRef(null);
  const streamRef = useRef(null);
  const cameraSessionRef = useRef(0);
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

  function stopCamera() {
    cameraSessionRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

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
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) { setError("Unable to capture a photo. Try again."); return; }
    onChange(new File([blob], "tenant-face.jpg", { type: "image/jpeg" }));
    stopCamera();
  }

  const image = preview || existingImage;
  return <div className="tenant-face-field span-2">
    <strong>Face photo</strong>
    <p className="muted">Add one clear, front-facing photo. Camera matches are suggestions for staff review.</p>
    <div className="tenant-face-content">
      <div className="tenant-face-preview">{image ? <img src={image} alt="Tenant enrollment face" /> : <span>{hasExistingPhoto ? "Photo enrolled" : "No photo yet"}</span>}</div>
      <div className="tenant-face-actions">
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) { onChange(selected); setError(""); } event.target.value = ""; }} />
        <button type="button" className="button subtle" onClick={() => uploadRef.current?.click()}><ImagePlus size={16} />Upload photo</button>
        {!cameraOpen ? <button type="button" className="button subtle" onClick={startCamera}><Camera size={16} />Use camera</button> : <>
          <button type="button" className="button primary" onClick={capture}><Camera size={16} />Capture photo</button>
          <button type="button" className="button subtle" onClick={stopCamera}><CircleStop size={16} />Stop camera</button>
        </>}
        {(file || hasExistingPhoto) && <button type="button" className="button subtle" onClick={() => { onRemove(); setError(""); }}><Trash2 size={16} />Remove photo</button>}
      </div>
    </div>
    <video ref={videoRef} className={`tenant-face-camera ${cameraOpen ? "" : "hidden"}`} playsInline muted />
    {file && check?.message && <p role={check.status === "error" ? "alert" : "status"} className={check.status === "error" ? "camera-error" : "muted"}>{check.message}</p>}
    {error && <p role="alert" className="camera-error">{error}</p>}
  </div>;
}
