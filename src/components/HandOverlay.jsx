import { useEffect, useRef } from 'react'
import { HandLandmarker } from '@mediapipe/tasks-vision'

const CONNECTIONS = HandLandmarker.HAND_CONNECTIONS

function drawHand(ctx, landmarks, width, height) {
  ctx.clearRect(0, 0, width, height)
  if (!landmarks || landmarks.length === 0) {
    return
  }

  // Chunky 8-bit skeleton: dark outline pass, then a bright line on top.
  const line = Math.max(3, Math.round(width / 200))
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  for (const [strokeWidth, color] of [[line + 4, '#130b3a'], [line, '#5ff3ff']]) {
    ctx.lineWidth = strokeWidth
    ctx.strokeStyle = color
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
  }

  // Square joints; fingertips (4, 8, 12, 16, 20) glow gold.
  const size = Math.max(7, Math.round(width / 85))
  const tips = new Set([4, 8, 12, 16, 20])
  landmarks.forEach((point, i) => {
    const x = Math.round(point.x * width - size / 2)
    const y = Math.round(point.y * height - size / 2)
    ctx.fillStyle = '#130b3a'
    ctx.fillRect(x - 2, y - 2, size + 4, size + 4)
    ctx.fillStyle = tips.has(i) ? '#ffd23f' : '#ff6fb5'
    ctx.fillRect(x, y, size, size)
  })
}

/**
 * Canvas overlay that draws 21 hand landmarks and their connections.
 * It is mirrored the same way as the webcam video so points stay aligned.
 * Drawing is imperative: the parent calls `drawRef.current(landmarks)` from the
 * tracking loop, so each video frame does not need a React render.
 */
export default function HandOverlay({ videoRef, drawRef }) {
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
      if (nextWidth && nextHeight && (canvas.width !== nextWidth || canvas.height !== nextHeight)) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
    }

    const ctx = canvas.getContext('2d')
    drawRef.current = (landmarks) => {
      if (ctx) drawHand(ctx, landmarks, canvas.width, canvas.height)
    }

    syncSize()
    video.addEventListener('loadedmetadata', syncSize)
    window.addEventListener('resize', syncSize)

    return () => {
      drawRef.current = null
      video.removeEventListener('loadedmetadata', syncSize)
      window.removeEventListener('resize', syncSize)
    }
  }, [videoRef, drawRef])

  return (
    <canvas
      ref={canvasRef}
      className="sd-hand-overlay"
      aria-hidden="true"
    />
  )
}
