import { useCallback, useEffect, useRef, useState } from 'react'
import HandOverlay from './HandOverlay.jsx'
import useHandTracking from '../hooks/useHandTracking.js'
import { RecognitionController } from '../recognition/controller.js'
import { requestModel } from '../recognition/modelClient.js'
import { releaseCamera } from '../recognition/cameraResources.js'

/**
 * Webcam + MediaPipe hand tracking.
 *
 * @param {string | undefined} deviceId  Optional camera id for two-player mode
 * @param {(landmarks: {x:number,y:number,z:number}[] | null) => void} onLandmarks
 */
export default function Camera({ deviceId, onLandmarks, onStatus, onRecognition }) {
  // A device change gets fresh state and fully tears down the previous session.
  return <CameraSession key={deviceId || 'default'} deviceId={deviceId} onLandmarks={onLandmarks} onStatus={onStatus} onRecognition={onRecognition} />
}

function CameraSession({ deviceId, onLandmarks, onStatus, onRecognition }) {
  const videoRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(true)
  const [cameraError, setCameraError] = useState(null)
  const controllerRef = useRef(null)
  const recognitionEnabled = Boolean(onRecognition)
  const recognitionCallback = useRef(onRecognition)
  useEffect(() => { recognitionCallback.current = onRecognition }, [onRecognition])
  useEffect(() => {
    if (!cameraReady || !recognitionEnabled) return undefined
    let cancelled = false
    const controller = new RecognitionController({ infer: requestModel,
      onResult: result => recognitionCallback.current?.(result) })
    controllerRef.current = controller
    recognitionCallback.current?.({ status: 'loading', letter: null, progress: 0 })
    let ready = false
    let lastFrame = performance.now()
    controllerRef.current.feed = points => {
      lastFrame = performance.now()
      if (ready) controller.process(points, lastFrame)
    }
    requestModel().then(() => { if (!cancelled) ready = true }).catch(error => {
      if (!cancelled) recognitionCallback.current?.({ status: 'error', error: error.message, letter: null, progress: 0 })
    })
    const watchdog = setInterval(() => {
      if (ready && performance.now() - lastFrame > 350) controller.invalidate('tracking-paused', performance.now())
    }, 150)
    return () => { cancelled = true; clearInterval(watchdog); controller.dispose(); controllerRef.current = null }
  }, [cameraReady, recognitionEnabled])

  useEffect(() => {
    let cancelled = false
    let stream
    const video = videoRef.current

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
        stream?.getTracks().forEach((track) => track.stop())
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

    // Async startup also allows StrictMode cleanup before requesting a stream.
    Promise.resolve().then(() => { if (!cancelled) startCamera() })

    return () => {
      cancelled = true
      releaseCamera(video, stream)
    }
  }, [deviceId])

  const handleLandmarks = useCallback(
    (nextLandmarks) => {
      onLandmarks?.(nextLandmarks)
      controllerRef.current?.feed(nextLandmarks)
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

  useEffect(() => {
    onStatus?.({ ready: cameraReady && modelReady && !error, error })
  }, [cameraReady, modelReady, error, onStatus])

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

