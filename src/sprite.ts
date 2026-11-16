import { useColor } from './terminal.js'

export type Pose = 'idle' | 'punch' | 'chamber' | 'kick' | 'block' | 'hurt' | 'down' | 'win'
export type Tint = 'normal' | 'flash' | 'hit'
export type Pixels = (number | null)[][]

type P = [number, number]

interface Skeleton {
  head: P
  neck: P
  hip: P
  frontArm: [P, P]
  backArm: [P, P]
  frontLeg: [P, P]
  backLeg: [P, P]
}

export interface Kit {
  glove: number
  gloveShade: number
  shorts: number
}

export const SPRITE_W = 34
export const SPRITE_H = 36

const SKIN = 180
const SKIN_SHADE = 137
const SKIN_HIT = 231
const SKIN_HIT_SHADE = 224
const HAIR = 52
const EYE = 234
const OUTLINE = 233
const SHOE = 255
const TRIM = 205
const GLOW = 226

const SKELETONS: Record<Pose, Skeleton> = {
  idle: {
    head: [15, 5],
    neck: [13, 11],
    hip: [12, 21],
    frontArm: [[18, 15], [21, 10]],
    backArm: [[11, 16], [17, 11]],
    frontLeg: [[17, 27], [20, 33]],
    backLeg: [[9, 28], [6, 33]],
  },
  punch: {
    head: [17, 6],
    neck: [15, 11],
    hip: [12, 21],
    frontArm: [[22, 11], [30, 10]],
    backArm: [[12, 16], [17, 12]],
    frontLeg: [[18, 27], [22, 33]],
    backLeg: [[8, 28], [4, 33]],
  },
  chamber: {
    head: [14, 5],
    neck: [13, 11],
    hip: [12, 21],
    frontArm: [[18, 15], [20, 10]],
    backArm: [[10, 16], [16, 10]],
    frontLeg: [[19, 19], [17, 27]],
    backLeg: [[12, 28], [11, 33]],
  },
  kick: {
    head: [11, 6],
    neck: [11, 12],
    hip: [13, 21],
    frontArm: [[15, 15], [17, 10]],
    backArm: [[8, 16], [13, 10]],
    frontLeg: [[21, 19], [30, 18]],
    backLeg: [[12, 28], [10, 33]],
  },
  block: {
    head: [14, 7],
    neck: [13, 12],
    hip: [12, 22],
    frontArm: [[18, 17], [19, 7]],
    backArm: [[16, 18], [17, 9]],
    frontLeg: [[17, 28], [20, 33]],
    backLeg: [[9, 28], [6, 33]],
  },
  hurt: {
    head: [9, 7],
    neck: [10, 12],
    hip: [12, 21],
    frontArm: [[15, 14], [17, 18]],
    backArm: [[6, 13], [4, 8]],
    frontLeg: [[16, 27], [19, 33]],
    backLeg: [[9, 28], [6, 33]],
  },
  down: {
    head: [4, 30],
    neck: [9, 31],
    hip: [19, 32],
    frontArm: [[12, 28], [15, 29]],
    backArm: [[6, 27], [3, 25]],
    frontLeg: [[25, 30], [31, 32]],
    backLeg: [[24, 33], [30, 34]],
  },
  win: {
    head: [13, 6],
    neck: [13, 12],
    hip: [13, 22],
    frontArm: [[18, 9], [19, 3]],
    backArm: [[8, 9], [7, 3]],
    frontLeg: [[16, 28], [18, 33]],
    backLeg: [[10, 28], [8, 33]],
  },
}

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function capsule(buf: Pixels, a: P, b: P, r1: number, r2: number, c: number): void {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const r = Math.max(r1, r2)
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r))
  const x1 = Math.min(SPRITE_W - 1, Math.ceil(Math.max(a[0], b[0]) + r))
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r))
  const y1 = Math.min(SPRITE_H - 1, Math.ceil(Math.max(a[1], b[1]) + r))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2))
      const px = a[0] + dx * t - x
      const py = a[1] + dy * t - y
      if (px * px + py * py <= (r1 + (r2 - r1) * t) ** 2) buf[y][x] = c
    }
  }
}

const disc = (buf: Pixels, p: P, r: number, c: number) => capsule(buf, p, p, r, r, c)

function leg(buf: Pixels, hip: P, [knee, foot]: [P, P], skin: number, shorts: number): void {
  capsule(buf, hip, knee, 2.4, 2, skin)
  capsule(buf, knee, foot, 2, 1.6, skin)
  capsule(buf, hip, lerp(hip, knee, 0.4), 2.7, 2.5, shorts)
  capsule(buf, [foot[0] - 1, foot[1] + 0.5], [foot[0] + 2.5, foot[1] + 0.5], 1.3, 1.3, SHOE)
}

function arm(buf: Pixels, neck: P, [elbow, fist]: [P, P], skin: number): void {
  capsule(buf, neck, elbow, 1.8, 1.6, skin)
  capsule(buf, elbow, fist, 1.6, 1.5, skin)
}

function head(buf: Pixels, [hx, hy]: P, skin: number): void {
  for (let y = Math.floor(hy - 4); y <= hy + 4; y++) {
    for (let x = Math.floor(hx - 4); x <= hx + 4; x++) {
      if (y < 0 || y >= SPRITE_H || x < 0 || x >= SPRITE_W) continue
      if ((x - hx) ** 2 + (y - hy) ** 2 > 3.7 ** 2) continue
      buf[y][x] = y < hy - 1 ? HAIR : skin
    }
  }
  const ex = Math.round(hx + 2)
  const ey = Math.round(hy)
  if (ey >= 0 && ey < SPRITE_H && ex < SPRITE_W) buf[ey][ex] = EYE
}

function ring(buf: Pixels, c: number): void {
  const marks: P[] = []
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      if (buf[y][x] !== null) continue
      const near = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].some(([dx, dy]) => buf[y + dy]?.[x + dx] != null)
      if (near) marks.push([x, y])
    }
  }
  for (const [x, y] of marks) buf[y][x] = c
}

export function drawFighter(target: Pixels, ox: number, pose: Pose, mirrored: boolean, kit: Kit, tint: Tint): void {
  const sk = SKELETONS[pose]
  const buf: Pixels = Array.from({ length: SPRITE_H }, () => Array<number | null>(SPRITE_W).fill(null))
  const skin = tint === 'hit' ? SKIN_HIT : SKIN
  const shade = tint === 'hit' ? SKIN_HIT_SHADE : SKIN_SHADE

  leg(buf, sk.hip, sk.backLeg, shade, kit.shorts)
  arm(buf, sk.neck, sk.backArm, shade)
  capsule(buf, sk.neck, sk.hip, 3.6, 3, skin)
  disc(buf, sk.hip, 3.3, kit.shorts)
  capsule(buf, [sk.hip[0] - 3, sk.hip[1] - 3], [sk.hip[0] + 3, sk.hip[1] - 3], 0.7, 0.7, TRIM)
  disc(buf, sk.backArm[1], 2.4, kit.gloveShade)
  head(buf, sk.head, skin)
  leg(buf, sk.hip, sk.frontLeg, skin, kit.shorts)
  arm(buf, sk.neck, sk.frontArm, skin)
  disc(buf, sk.frontArm[1], 2.6, kit.glove)

  ring(buf, OUTLINE)
  if (tint === 'flash') ring(buf, GLOW)

  const width = target[0]?.length ?? 0
  for (let y = 0; y < SPRITE_H && y < target.length; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const c = buf[y][x]
      if (c === null) continue
      const tx = ox + (mirrored ? SPRITE_W - 1 - x : x)
      if (tx >= 0 && tx < width) target[y][tx] = c
    }
  }
}

export function pixelsToLines(pixels: Pixels): string[] {
  const lines: string[] = []
  for (let y = 0; y < pixels.length; y += 2) {
    let line = ''
    let state = ''
    const set = (code: string) => {
      if (!useColor || code === state) return
      line += `\x1b[${code}m`
      state = code
    }
    for (let x = 0; x < pixels[y].length; x++) {
      const top = pixels[y][x]
      const bottom = pixels[y + 1]?.[x] ?? null
      if (top === null && bottom === null) {
        set('0')
        line += ' '
      } else if (top !== null && bottom !== null) {
        set(`38;5;${top};48;5;${bottom}`)
        line += '▀'
      } else if (top !== null) {
        set(`0;38;5;${top}`)
        line += '▀'
      } else {
        set(`0;38;5;${bottom}`)
        line += '▄'
      }
    }
    if (useColor) line += '\x1b[0m'
    lines.push(line)
  }
  return lines
}
