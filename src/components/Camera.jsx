import { useCallback, useEffect, useRef, useState } from 'react'
import HandOverlay from './HandOverlay.jsx'
import useHandTracking from '../hooks/useHandTracking.js'

/**
 * Webcam + MediaPipe hand tracking.
 *
 * @param {string | undefined} deviceId  Optional camera id for two-player mode
 * @param {(landmarks: {x:number,y:number,z:number}[] | null) => void} onLandmarks
 */
export default function Camera({ deviceId, onLandmarks }) {
  const videoRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(true)
  const [cameraError, setCameraError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let stream

    setCameraReady(false)
    setCameraLoading(true)
    setCameraError(null)

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('This browser does not support webcam access.')
        setCameraLoading(false)
        return
      }

      const videoConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }

      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId }
      } else {
        videoConstraints.facingMode = 'user'
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        video.srcObject = stream
        await video.play()

        if (!cancelled) {
          setCameraReady(true)
          setCameraLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          const denied = err?.name === 'NotAllowedError'
          setCameraError(
            denied
              ? 'Camera permission was denied. Please allow webcam access and refresh.'
              : err?.message || 'Could not start the webcam.',
          )
          setCameraLoading(false)
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      const video = videoRef.current
      if (video) {
        video.srcObject = null
      }
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [deviceId])

  const handleLandmarks = useCallback(
    (nextLandmarks) => {
      onLandmarks?.(nextLandmarks)
    },
    [onLandmarks],
  )

  const {
    landmarks,
    isReady: modelReady,
    error: modelError,
  } = useHandTracking(videoRef, {
    enabled: cameraReady,
    onLandmarks: handleLandmarks,
  })

  const error = cameraError || modelError
  const loading = !error && (cameraLoading || (cameraReady && !modelReady))

  let statusMessage = ''
  if (cameraLoading) {
    statusMessage = 'Starting camera…'
  } else if (cameraReady && !modelReady && !error) {
    statusMessage = 'Loading hand tracking model…'
  }

  return (
    <div className="sd-camera">
      <style>{cameraStyles}</style>
      <div className="sd-camera__frame">
        <video
          ref={videoRef}
          className="sd-camera__video"
          playsInline
          muted
          autoPlay
        />
        <HandOverlay videoRef={videoRef} landmarks={landmarks} />

        {loading && (
          <div className="sd-camera__status" role="status">
            {statusMessage}
          </div>
        )}

        {error && (
          <div className="sd-camera__status sd-camera__status--error" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

const cameraStyles = `
  .sd-camera {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
  }

  .sd-camera__frame {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-radius: 16px;
    background: #111318;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  }

  .sd-camera__video,
  .sd-hand-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    transform: scaleX(-1);
  }

  .sd-camera__video {
    background: #111318;
  }

  .sd-hand-overlay {
    pointer-events: none;
  }

  .sd-camera__status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    text-align: center;
    color: #f8fafc;
    background: rgba(17, 19, 24, 0.72);
    font-size: 1rem;
  }

  .sd-camera__status--error {
    color: #fecaca;
  }
`
