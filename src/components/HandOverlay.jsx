import { useEffect, useRef } from 'react'
import { HandLandmarker } from '@mediapipe/tasks-vision'
import { ghostShape, placeGhost } from '../utils/ghostHands.js'

const CONNECTIONS = HandLandmarker.HAND_CONNECTIONS

// Translucent target handshape, drawn under the tracked hand.
function drawGhost(ctx, sign, landmarks, handedness, width, height) {
  const points = placeGhost(ghostShape(sign, performance.now()), landmarks, handedness, width, height)
  if (!points) return
  const line = Math.max(4, Math.round(width / 150))
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([line * 1.6, line * 1.2])
  ctx.lineWidth = line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  for (const { start, end } of CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(points[start][0], points[start][1])
    ctx.lineTo(points[end][0], points[end][1])
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  for (const i of [4, 8, 12, 16, 20]) {
    ctx.beginPath()
    ctx.arc(points[i][0], points[i][1], line * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawHand(ctx, landmarks, width, height, ghost = null, handedness = null) {
  ctx.clearRect(0, 0, width, height)
  if (ghost) drawGhost(ctx, ghost, landmarks, handedness, width, height)
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
 * Canvas overlay that draws 21 hand landmarks and their connections, and
 * optionally a ghost of the `ghost` sign's handshape as a guide.
 * It is mirrored the same way as the webcam video so points stay aligned.
 * Drawing is imperative: the parent calls `drawRef.current(landmarks)` from the
 * tracking loop, so each video frame does not need a React render.
 */
export default function HandOverlay({ videoRef, drawRef, ghost = null }) {
  const canvasRef = useRef(null)
  const ghostRef = useRef(ghost)
  useEffect(() => { ghostRef.current = ghost }, [ghost])

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
    drawRef.current = (landmarks, handedness) => {
      if (ctx) drawHand(ctx, landmarks, canvas.width, canvas.height, ghostRef.current, handedness)
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
