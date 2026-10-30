import { CanvasTexture, SRGBColorSpace } from 'three'

// The printed surfaces of the Soundbox, drawn on canvases at runtime (no image files, no network).

const NAVY = '#002e6e'
const SKY = '#00baf2'

function texture(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [c, ctx]
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** The "paytm" wordmark as type: "pay" in navy, "tm" in sky. */
function wordmark(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number) {
  ctx.font = `800 ${size}px "Geist Variable", system-ui, sans-serif`
  ctx.textBaseline = 'alphabetic'
  const pay = ctx.measureText('pay').width
  const tm = ctx.measureText('tm').width
  const x = cx - (pay + tm) / 2
  ctx.fillStyle = NAVY
  ctx.fillText('pay', x, y)
  ctx.fillStyle = SKY
  ctx.fillText('tm', x + pay, y)
}

/** A QR-looking pattern from a fixed seed. Decorative only: it encodes nothing and can't be scanned to pay. */
function decorativeQr(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const n = 29
  const cell = size / n
  let seed = 20240531
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const finder = (r: number, c: number) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8)
  ctx.fillStyle = '#111827'
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!finder(r, c) && random() > 0.52) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.5, cell + 0.5)
    }
  }
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const fx = x + c * cell
    const fy = y + r * cell
    ctx.fillRect(fx, fy, cell * 7, cell * 7)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(fx + cell, fy + cell, cell * 5, cell * 5)
    ctx.fillStyle = '#111827'
    ctx.fillRect(fx + cell * 2, fy + cell * 2, cell * 3, cell * 3)
  }
}

/** The QR stand: blue frame, white card, wordmark, "Accepted Here", the QR, a UPI footer. */
export function standeeTexture(): CanvasTexture {
  const [c, ctx] = canvas(768, 1024)
  ctx.fillStyle = SKY
  roundRect(ctx, 0, 0, 768, 1024, 40)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 26, 26, 716, 972, 26)
  ctx.fill()

  wordmark(ctx, 384, 168, 120)
  ctx.fillStyle = NAVY
  ctx.font = '600 38px "Geist Variable", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Accepted Here', 384, 226)

  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 154, 270, 460, 460, 18)
  ctx.fill()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 4
  ctx.stroke()
  decorativeQr(ctx, 184, 300, 400)

  ctx.fillStyle = NAVY
  ctx.font = '600 34px "Geist Variable", system-ui, sans-serif'
  ctx.fillText('Scan & pay with any UPI app', 384, 806)
  ctx.fillStyle = '#f1f5f9'
  roundRect(ctx, 214, 850, 340, 84, 42)
  ctx.fill()
  ctx.font = '800 40px "Geist Variable", system-ui, sans-serif'
  ctx.fillStyle = NAVY
  ctx.fillText('UPI', 384, 906)
  return texture(c)
}

/** The black top: a contactless mark and a "Tap card" hint (the display is its own glowing mesh). */
export function panelTexture(): CanvasTexture {
  const [c, ctx] = canvas(1024, 600)
  ctx.clearRect(0, 0, 1024, 600)
  ctx.strokeStyle = 'rgba(255,255,255,0.82)'
  ctx.lineCap = 'round'
  ctx.lineWidth = 12
  const cx = 512
  const cy = 170
  for (let i = 0; i < 4; i++) {
    const r = 26 + i * 26
    ctx.beginPath()
    ctx.arc(cx - 50, cy, r, -Math.PI / 4, Math.PI / 4)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '500 34px "Geist Variable", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Tap card to pay', cx, 300)
  return texture(c)
}

/** Speaker holes on the base's front. */
export function grilleTexture(): CanvasTexture {
  const [c, ctx] = canvas(1024, 200)
  ctx.clearRect(0, 0, 1024, 200)
  ctx.fillStyle = 'rgba(8, 22, 54, 0.55)'
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 44; col++) {
      const x = 70 + col * 20 + (row % 2) * 10
      const y = 40 + row * 30
      ctx.beginPath()
      ctx.arc(x, y, 5.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return texture(c)
}

/** The little display: one line of glowing mono text. */
export function displayTexture(text: string, color: string): CanvasTexture {
  const [c, ctx] = canvas(640, 200)
  ctx.fillStyle = '#05070b'
  ctx.fillRect(0, 0, 640, 200)
  ctx.font = `600 ${text.length > 8 ? 78 : 96}px "Geist Mono Variable", ui-monospace, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = 26
  ctx.fillStyle = color
  ctx.fillText(text, 320, 104)
  return texture(c)
}
