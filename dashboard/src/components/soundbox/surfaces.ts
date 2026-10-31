import { CanvasTexture, SRGBColorSpace } from 'three'

// The printed surfaces of the Soundbox, drawn on canvases at runtime (no image files, no network).

const NAVY = '#002e6e'
const SKY = '#00baf2'
const INK = '#1b1b1f'

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

/** "Paytm" as type: "Pay" in navy, "tm" in sky, heavy and slightly slanted like the mark. */
function wordmark(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number) {
  ctx.save()
  ctx.font = `900 ${size}px "Roboto Variable", system-ui, sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const pay = ctx.measureText('Pay').width
  const tm = ctx.measureText('tm').width
  ctx.translate(cx - (pay + tm) / 2, y)
  ctx.transform(1, 0, -0.12, 1, 0, 0) // a light italic slant
  ctx.fillStyle = NAVY
  ctx.fillText('Pay', 0, 0)
  ctx.fillStyle = SKY
  ctx.fillText('tm', pay - size * 0.02, 0)
  ctx.restore()
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
  ctx.fillStyle = INK
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!finder(r, c) && random() > 0.5) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.6, cell + 0.6)
    }
  }
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const fx = x + c * cell
    const fy = y + r * cell
    ctx.fillStyle = INK
    ctx.fillRect(fx, fy, cell * 7, cell * 7)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(fx + cell, fy + cell, cell * 5, cell * 5)
    ctx.fillStyle = INK
    ctx.fillRect(fx + cell * 2, fy + cell * 2, cell * 3, cell * 3)
  }
}

/** Speaker holes: columns of dots that get longer toward the middle, like a pair of brackets. */
function grille(ctx: CanvasRenderingContext2D, x0: number, mirror: boolean) {
  const lengths = [11, 14, 16, 17] // outer column → inner column
  const gap = 30
  ctx.fillStyle = INK
  lengths.forEach((rows, i) => {
    const x = mirror ? x0 - i * gap : x0 + i * gap
    for (let r = 0; r < rows; r++) {
      const y = 560 - ((rows - 1) * gap) / 2 + r * gap
      ctx.beginPath()
      ctx.arc(x, y, 8.5, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

/** The BHIM | UPI footer: grey italic type with the little tricolour chevrons. */
function upiFooter(ctx: CanvasRenderingContext2D, cy: number) {
  const chevron = (x: number, y: number) => {
    ctx.fillStyle = '#f47b20'
    ctx.beginPath()
    ctx.moveTo(x, y - 22)
    ctx.lineTo(x + 18, y)
    ctx.lineTo(x + 6, y)
    ctx.lineTo(x - 12, y - 22)
    ctx.fill()
    ctx.fillStyle = '#1e9b4b'
    ctx.beginPath()
    ctx.moveTo(x + 12, y - 22)
    ctx.lineTo(x + 30, y)
    ctx.lineTo(x + 18, y)
    ctx.lineTo(x, y - 22)
    ctx.fill()
  }
  ctx.save()
  ctx.font = 'italic 900 60px "Roboto Variable", system-ui, sans-serif'
  ctx.fillStyle = '#6d6e71'
  ctx.textAlign = 'left'
  ctx.fillText('BHIM', 300, cy)
  chevron(468, cy - 8)
  ctx.fillRect(522, cy - 52, 4, 62)
  ctx.fillText('UPI', 548, cy)
  chevron(660, cy - 8)
  ctx.font = '500 13px "Roboto Variable", system-ui, sans-serif'
  ctx.fillText('BHARAT INTERFACE FOR MONEY', 300, cy + 26)
  ctx.fillText('UNIFIED PAYMENTS INTERFACE', 548, cy + 26)
  ctx.restore()
}

/** The white front plate, as printed on the real device. `upiId` is a demo ID, never a real one. */
export function faceplateTexture(upiId: string): CanvasTexture {
  const [c, ctx] = canvas(1024, 1024)
  ctx.clearRect(0, 0, 1024, 1024)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, 1024, 1024, 236)
  ctx.clip()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1024, 1024)

  wordmark(ctx, 512, 205, 116)
  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.font = '600 50px "Roboto Variable", system-ui, sans-serif'
  ctx.fillText('Accepted Here', 512, 268)
  ctx.font = '600 36px "Roboto Variable", system-ui, sans-serif'
  ctx.fillText('Scan & Pay using any UPI App', 512, 350)

  decorativeQr(ctx, 332, 382, 360)
  grille(ctx, 120, false)
  grille(ctx, 904, true)

  ctx.font = '600 32px "Roboto Variable", system-ui, sans-serif'
  ctx.fillStyle = INK
  ctx.fillText(`UPI ID: ${upiId}`, 512, 800)
  upiFooter(ctx, 902)
  ctx.restore()
  return texture(c)
}

export type ButtonIcon = 'minus' | 'plus' | 'power' | 'replay'

/** A glyph pressed into a top button. */
export function buttonTexture(icon: ButtonIcon): CanvasTexture {
  const [c, ctx] = canvas(128, 128)
  ctx.clearRect(0, 0, 128, 128)
  ctx.strokeStyle = 'rgba(14, 78, 140, 0.75)'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (icon === 'minus' || icon === 'plus') {
    ctx.moveTo(40, 64)
    ctx.lineTo(88, 64)
    if (icon === 'plus') {
      ctx.moveTo(64, 40)
      ctx.lineTo(64, 88)
    }
  } else if (icon === 'power') {
    ctx.arc(64, 68, 24, -Math.PI * 0.3, Math.PI * 1.3)
    ctx.moveTo(64, 34)
    ctx.lineTo(64, 64)
  } else {
    ctx.arc(64, 64, 22, 0, Math.PI * 2)
  }
  ctx.stroke()
  return texture(c)
}
