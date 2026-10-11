import { useCallback, useEffect, useRef, useState } from 'react'
import HandOverlay from './HandOverlay.jsx'
import useHandTracking from '../hooks/useHandTracking.js'
import { RecognitionController } from '../recognition/controller.js'
import { requestModel } from '../recognition/modelClient.js'
import { releaseCamera } from '../recognition/cameraResources.js'
import { SUPPORTED_SIGNS } from '../recognition/config.js'

// Fields the screens display or act on. Results that only differ elsewhere
// (for example raw probabilities) are not forwarded, which keeps React
// updates well below the 30 fps tracking rate.
function displayKey(result) {
  return [result.status, result.letter, result.candidate, result.lockedLetter, result.phase,
    result.challengeId, result.error, Math.round((result.progress ?? 0) * 50)].join('|')
}

/**
 * Webcam + MediaPipe hand tracking and sign recognition.
 *
 * @param {string | undefined} deviceId  Optional camera id for two-player mode
 */
export default function Camera({ deviceId, onStatus, onRecognition, challengeId = null, targetSign = null, recognitionActive = true, allowlist = SUPPORTED_SIGNS.learning, ghost = null, trackingPaused = false }) {
  // A device change gets fresh state and fully tears down the previous session.
  return <CameraSession key={deviceId || 'default'} deviceId={deviceId} onStatus={onStatus} onRecognition={onRecognition} challengeId={challengeId} targetSign={targetSign} recognitionActive={recognitionActive} allowlist={allowlist} ghost={ghost} trackingPaused={trackingPaused} />
}

function CameraSession({ deviceId, onStatus, onRecognition, challengeId, targetSign, recognitionActive, allowlist, ghost, trackingPaused }) {
  const videoRef = useRef(null)
  const drawRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(true)
  const [cameraError, setCameraError] = useState(null)
  const controllerRef = useRef(null)
  const recognitionEnabled = Boolean(onRecognition)
  const recognitionCallback = useRef(onRecognition)
  const challengeRef = useRef(challengeId)
  const activeRef = useRef(recognitionActive)
  const targetRef = useRef(targetSign)
  const [recognitionReady, setRecognitionReady] = useState(false)
  const [recognitionError, setRecognitionError] = useState(null)
  useEffect(() => {
    challengeRef.current = challengeId
    controllerRef.current?.setChallenge(challengeId)
  }, [challengeId])
  useEffect(() => {
    targetRef.current = targetSign
    controllerRef.current?.setTarget(targetSign)
  }, [targetSign])
  useEffect(() => { activeRef.current = recognitionActive }, [recognitionActive])
  useEffect(() => { recognitionCallback.current = onRecognition }, [onRecognition])
  useEffect(() => {
    if (!cameraReady || !recognitionEnabled) return undefined
    let cancelled = false
    let lastKey = null
    let lastSentAt = 0
    const controller = new RecognitionController({ infer: requestModel, allowlist,
      onResult: result => {
        if (result.status === 'error') setRecognitionError(result.error)
        // Unchanged results still go out every 250 ms: lesson feedback waits
        // for a message to hold steady, which needs repeated updates.
        const key = displayKey(result)
        const now = performance.now()
        if (key === lastKey && !result.isNew && now - lastSentAt < 250) return
        lastKey = key
        lastSentAt = now
        recognitionCallback.current?.(result)
      } })
    controller.setChallenge(challengeRef.current)
    controller.setTarget(targetRef.current)
    controllerRef.current = controller
    recognitionCallback.current?.({ status: 'loading', letter: null, progress: 0 })
    let ready = false
    let lastFrame = performance.now()
    controllerRef.current.feed = ({ landmarks, handedness, world }) => {
      lastFrame = performance.now()
      if (ready && activeRef.current) {
        const video = videoRef.current
        const aspectRatio = video?.videoWidth && video?.videoHeight ? video.videoWidth / video.videoHeight : 1
        controller.process(landmarks, lastFrame, { aspectRatio, handedness, world })
      }
    }
    requestModel().then(() => { if (!cancelled) { ready = true; setRecognitionReady(true) } }).catch(error => {
      if (!cancelled) {
        setRecognitionError(error.message)
        recognitionCallback.current?.({ status: 'error', error: error.message, letter: null, progress: 0 })
      }
    })
    const watchdog = setInterval(() => {
      if (ready && activeRef.current && performance.now() - lastFrame > 350) controller.invalidate('tracking-paused', performance.now())
    }, 150)
    return () => { cancelled = true; clearInterval(watchdog); controller.dispose(); controllerRef.current = null }
  }, [cameraReady, recognitionEnabled, allowlist])

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

  const handleFrame = useCallback((frame) => {
    drawRef.current?.(frame.landmarks, frame.handedness)
    controllerRef.current?.feed(frame)
  }, [])

  const { isReady: modelReady, error: modelError } = useHandTracking(videoRef, {
    enabled: cameraReady,
    onFrame: handleFrame,
    paused: trackingPaused,
  })

  const error = cameraError || modelError || recognitionError
  const loading = !error && (cameraLoading || (cameraReady && !modelReady))

  useEffect(() => {
    onStatus?.({ ready: cameraReady && modelReady && (!recognitionEnabled || recognitionReady) && !error, error })
  }, [cameraReady, modelReady, recognitionEnabled, recognitionReady, error, onStatus])

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
        <HandOverlay videoRef={videoRef} drawRef={drawRef} ghost={ghost} />
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

