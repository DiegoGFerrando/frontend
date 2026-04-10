import { useRef, useState, useCallback, useEffect } from 'react';
import './App.css';


const API_URL = import.meta.env.VITE_API_URL || '';
const isDev = import.meta.env.MODE === 'development' || import.meta.env.NODE_ENV === 'development';

type Stage = 'camera' | 'preview' | 'loading' | 'ready' | 'result' | 'error';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>('camera');
  const [photo, setPhoto] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultImagePath, setResultImagePath] = useState<string | null>(null);
  const [resultIsVideo, setResultIsVideo] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1024 }, height: { ideal: 1024 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStage('camera');
    } catch {
      setError('No se pudo acceder a la cámara. Por favor, permití el acceso.');
    }
  }, []);

  // Auto-start camera on mount + attach stream when video element mounts
  useEffect(() => {
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    if (stage === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [stage]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Crop to 1:1 aspect ratio (matching the viewport)
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPhoto(dataUrl);
    stopCamera();
    setStage('preview');
  }, [stopCamera]);

  const retake = useCallback(() => {
    setPhoto(null);
    setResultImage(null);
    setResultImagePath(null);
    setResultIsVideo(false);
    setResultText(null);
    setEmail('');
    setError(null);
    startCamera();
  }, [startCamera]);


  const sendPhoto = useCallback(async () => {
    if (!photo) return;
    setStage('loading');
    setError(null);

    if (isDev) {
      // Mock: show the original photo, no API call
      setTimeout(() => {
        setResultImagePath(null);
        setResultImage(photo);
        setResultIsVideo(false);
        setResultText('');
        setStage('ready');
      }, 1000);
      return;
    }

    try {
      const blob = await (await fetch(photo)).blob();
      const formData = new FormData();
      formData.append('image', blob, 'photo.jpg');

      const res = await fetch(`${API_URL}/api/advice`, { method: 'POST', body: formData });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      setResultImagePath(data.imageUrl || null);
      setResultImage(data.imageUrl ? `${API_URL}${data.imageUrl}` : null);
      setResultIsVideo(typeof data.contentType === 'string' && data.contentType.startsWith('video/'));
      setResultText(data.text || null);
      setStage('ready');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Algo salió mal');
      setStage('error');
    }
  }, [photo]);

  const revealResult = useCallback(async () => {
    if (!email.trim()) {
      setError('Por favor, ingresá tu email antes de continuar.');
      return;
    }
    setError(null);
    setStage('result');

    if (isDev) {
      // Mock: skip email sending
      return;
    }

    if (email.trim() && resultImagePath) {
      try {
        await fetch(`${API_URL}/api/advice/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            imageUrl: resultImagePath,
            contentType: resultIsVideo ? 'video/mp4' : 'image/jpeg',
          }),
        });
      } catch {
        // Email send failure is non-blocking
      }
    }
  }, [email, resultImagePath, resultIsVideo]);

  const reset = useCallback(() => {
    setPhoto(null);
    setResultImage(null);
    setResultImagePath(null);
    setResultIsVideo(false);
    setResultText(null);
    setEmail('');
    setError(null);
    startCamera();
  }, [startCamera]);

  return (
    <div className="app">
      <div className="header">
        <img src="/logo.png" alt="Advice EdTech" className="logo" />
        <h1>Advice EdTech</h1>
      </div>

      {/* Viewport */}
      {(stage === 'loading' || stage === 'ready') ? (
        <div className="split-layout">
          <div className="split-left">
            <div className="camera-container">
              <video
                src="/video.mp4"
                autoPlay
                playsInline
              />
            </div>
          </div>
          <div className="split-right">
            <div className="email-input-row">
              <input
                type="email"
                className="email-input"
                placeholder="Ingresá tu email para recibir el resultado"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
              />
              {stage === 'ready' && error && (
                <p style={{ color: '#ff5252', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>{error}</p>
              )}
            </div>

            {stage === 'loading' && (
              <p style={{ color: 'var(--text-muted)' }}>La IA está transformando tu foto...</p>
            )}

            {stage === 'ready' && (
              <button className="btn btn-primary" onClick={revealResult}>
                Ver la imagen
              </button>
            )}

            <div className="progress-bar-container">
              <div className={`progress-bar-fill ${stage === 'ready' ? 'complete' : ''}`} />
            </div>

            <div className="loading-spinner-container">
              {stage === 'ready' ? (
                <div className="spinner-done">✓</div>
              ) : (
                <div className="spinner" />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="camera-container">
          {stage === 'camera' && (
            <>
              <video ref={videoRef} autoPlay playsInline muted />
              <canvas ref={canvasRef} />
            </>
          )}

          {stage === 'preview' && photo && (
            <img src={photo} alt="Captured" />
          )}

          {stage === 'result' && resultImage && (
            resultIsVideo ? (
              <video src={resultImage} autoPlay loop playsInline controls />
            ) : (
              <img src={resultImage} alt="Transformed" />
            )
          )}
        </div>
      )}

      {/* Error */}
      {stage === 'error' && error && (
        <>
          <div className="result-card">
            <p>{error}</p>
            {/* <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Please try again.</p> */}
          </div>
          <button className="btn btn-primary" onClick={reset}>
            Intentar de nuevo
          </button>
        </>
      )}

      {/* Controls */}
      {stage === 'camera' && (
        <button className="btn btn-primary" onClick={takePhoto}>
          📷 Tomar foto
        </button>
      )}

      {stage === 'preview' && (
        <>
          <div className="button-row">
            <button className="btn btn-secondary" onClick={retake}>Repetir</button>
            <button className="btn btn-primary" onClick={sendPhoto}>Transformar ✨</button>
          </div>
        </>
      )}

      {stage === 'result' && (
        <>
          {resultText && (
            <div className="result-card">
              <p>{resultText}</p>
            </div>
          )}
          <div className="button-row">
            <button className="btn btn-secondary" onClick={reset}>Intentar de nuevo</button>
          </div>
        </>
      )}
    </div>
  );
}
