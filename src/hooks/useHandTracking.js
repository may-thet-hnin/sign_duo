import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

// Keep WASM files on the same package version as node_modules.
const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

// The WASM runtime loads once. Landmarkers are pooled: each camera needs its
// own instance (VIDEO mode tracks across frames), but lesson steps that mount
// a new camera reuse an idle one instead of rebuilding it.
let visionPromise = null
const idleLandmarkers = []
const MAX_IDLE = 2

async function acquireLandmarker() {
  const pooled = idleLandmarkers.pop()
  if (pooled) return pooled
  visionPromise ??= FilesetResolver.forVisionTasks(WASM_URL).catch((error) => {
    visionPromise = null
    throw error
  })
  const vision = await visionPromise
  const create = (delegate) => HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
  })
  try {
    return await create('GPU')
  } catch {
    return create('CPU')
  }
}

function releaseLandmarker(landmarker) {
  if (idleLandmarkers.length < MAX_IDLE) idleLandmarkers.push(landmarker)
  else landmarker.close()
}

function toFrame(result) {
  const hand = result.landmarks?.[0]
  if (!hand) return { landmarks: null, handedness: null, world: null }
  const handedness = (result.handedness ?? result.handednesses)?.[0]?.[0]?.categoryName ?? null
  const world = result.worldLandmarks?.[0]?.map(({ x, y, z }) => ({ x, y, z })) ?? null
  return { landmarks: hand.map(({ x, y, z }) => ({ x, y, z })), handedness, world }
}

/**
 * Runs MediaPipe Hand Landmarker on a webcam <video> element, once per new
 * video frame. Results go to `onFrame` without React state, so a 30 fps
 * tracking loop does not re-render the component tree.
 *
 * @param {React.RefObject<HTMLVideoElement>} videoRef
 * @param {{ enabled?: boolean, onFrame?: (frame: { landmarks: {x:number,y:number,z:number}[] | null, handedness: 'Left' | 'Right' | null, world: {x:number,y:number,z:number}[] | null }) => void }} options
 */
export default function useHandTracking(videoRef, options = {}) {
  // `paused` skips detection (each call blocks the main thread for tens of ms)
  // while keeping the loop and landmarker ready, e.g. during a success animation.
  const { enabled = true, onFrame, paused = false } = options
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)

  const landmarkerRef = useRef(null)
  const onFrameRef = useRef(onFrame)

  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    let cancelled = false
    let raf = 0
    let lastVideoTime = -1

    const detectFrame = () => {
      const video = videoRef.current
      const landmarker = landmarkerRef.current

      if (
        video &&
        landmarker &&
        !pausedRef.current &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime
        try {
          onFrameRef.current?.(toFrame(landmarker.detectForVideo(video, performance.now())))
        } catch {
          // Skip a bad frame (for example a timestamp glitch) and keep going.
        }
      }

      raf = requestAnimationFrame(detectFrame)
    }

    acquireLandmarker().then((landmarker) => {
      if (cancelled) {
        releaseLandmarker(landmarker)
        return
      }
      landmarkerRef.current = landmarker
      setIsReady(true)
      setError(null)
      raf = requestAnimationFrame(detectFrame)
    }).catch((err) => {
      if (!cancelled) {
        setIsReady(false)
        setError(err?.message || 'Failed to load the MediaPipe hand tracking model.')
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (landmarkerRef.current) {
        releaseLandmarker(landmarkerRef.current)
        landmarkerRef.current = null
      }
      setIsReady(false)
    }
  }, [enabled, videoRef])

  return { isReady, error }
}
