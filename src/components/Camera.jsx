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
      <div className="sd-camera__frame">
        <video
          ref={videoRef}
          className="sd-camera__video"
          playsInline
          muted
          autoPlay
        />
        <HandOverlay videoRef={videoRef} landmarks={landmarks} />
        {cameraReady && modelReady && !error && <span className="sd-camera__live">Tracking</span>}

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

