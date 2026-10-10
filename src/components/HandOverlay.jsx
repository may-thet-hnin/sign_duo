import { useEffect, useRef } from 'react'
import { HandLandmarker } from '@mediapipe/tasks-vision'

const CONNECTIONS = HandLandmarker.HAND_CONNECTIONS

function drawHand(ctx, landmarks, width, height) {
  ctx.clearRect(0, 0, width, height)
  if (!landmarks || landmarks.length === 0) {
    return
  }

  ctx.lineWidth = Math.max(2, width / 320)
  ctx.strokeStyle = '#22d3ee'
  ctx.fillStyle = '#f472b6'

  for (const connection of CONNECTIONS) {
    const start = landmarks[connection.start]
    const end = landmarks[connection.end]
    if (!start || !end) {
      continue
    }

    ctx.beginPath()
    ctx.moveTo(start.x * width, start.y * height)
    ctx.lineTo(end.x * width, end.y * height)
    ctx.stroke()
  }

  const radius = Math.max(3, width / 180)
  for (const point of landmarks) {
    ctx.beginPath()
    ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Canvas overlay that draws 21 hand landmarks and their connections.
 * It is mirrored the same way as the webcam video so points stay aligned.
 */
export default function HandOverlay({ videoRef, landmarks }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      return undefined
    }

    const syncSize = () => {
      const nextWidth = video.videoWidth || video.clientWidth
      const nextHeight = video.videoHeight || video.clientHeight
      if (nextWidth && nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
    }

    syncSize()
    video.addEventListener('loadedmetadata', syncSize)
    window.addEventListener('resize', syncSize)

    return () => {
      video.removeEventListener('loadedmetadata', syncSize)
      window.removeEventListener('resize', syncSize)
    }
  }, [videoRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    drawHand(ctx, landmarks, canvas.width, canvas.height)
  }, [landmarks])

  return (
    <canvas
      ref={canvasRef}
      className="sd-hand-overlay"
      aria-hidden="true"
    />
  )
}
