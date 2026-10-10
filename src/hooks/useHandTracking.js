import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

// Keep WASM files on the same package version as node_modules.
const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

function toSimpleLandmarks(hand) {
  return hand.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
  }))
}

/**
 * Runs MediaPipe Hand Landmarker on a webcam <video> element.
 *
 * @param {React.RefObject<HTMLVideoElement>} videoRef
 * @param {{ enabled?: boolean, onLandmarks?: (landmarks: {x:number,y:number,z:number}[] | null) => void }} options
 */
export default function useHandTracking(videoRef, options = {}) {
  const { enabled = true, onLandmarks } = options

  const [landmarks, setLandmarks] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)

  const landmarkerRef = useRef(null)
  const rafRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const onLandmarksRef = useRef(onLandmarks)

  useEffect(() => {
    onLandmarksRef.current = onLandmarks
  }, [onLandmarks])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    let cancelled = false

    async function createLandmarker(vision, delegate) {
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate,
        },
        runningMode: 'VIDEO',
        numHands: 1,
      })
    }

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)

        let landmarker
        try {
          landmarker = await createLandmarker(vision, 'GPU')
        } catch {
          landmarker = await createLandmarker(vision, 'CPU')
        }

        if (cancelled) {
          landmarker.close()
          return
        }

        landmarkerRef.current = landmarker
        setIsReady(true)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setIsReady(false)
          setError(
            err?.message ||
              'Failed to load the MediaPipe hand tracking model.',
          )
        }
      }
    }

    init()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)

      if (landmarkerRef.current) {
        landmarkerRef.current.close()
        landmarkerRef.current = null
      }
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !isReady) {
      return undefined
    }

    const detectFrame = () => {
      const video = videoRef.current
      const landmarker = landmarkerRef.current

      if (
        video &&
        landmarker &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime

          try {
            const result = landmarker.detectForVideo(video, performance.now())
            const hand = result.landmarks?.[0]
            const nextLandmarks = hand ? toSimpleLandmarks(hand) : null

            setLandmarks(nextLandmarks)
            onLandmarksRef.current?.(nextLandmarks)
          } catch {
            // Skip a bad frame (for example a timestamp glitch) and keep going.
          }
        }
      }

      rafRef.current = requestAnimationFrame(detectFrame)
    }

    rafRef.current = requestAnimationFrame(detectFrame)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, isReady, videoRef])

  return { landmarks, isReady, error }
}
