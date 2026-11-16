import { drawFighter, pixelsToLines, SPRITE_H, type Kit, type Pixels, type Pose, type Tint } from './sprite.js'
import { listenToKeys } from './keyboard.js'
import { color, screen, terminalWidth, visibleLength } from './terminal.js'

type Strike = 'punch' | 'kick'
type Move = Strike | 'block'
type Action = 'idle' | Move | 'hurt' | 'stun'
type Phase = 'select' | 'countdown' | 'fight' | 'over'
type Range = [number, number]
type Paint = (text: string) => string

interface Fighter {
  action: Action
  since: number
  hits: number
  resolved: boolean
  stunFor: number
}

type Speed = Record<Strike, { impact: number; end: number }>

interface Difficulty {
  label: string
  cpu: Speed
  parryWindow: number
  guardBase: number
  guardStep: number
  counter: number
  reactPunch: Range
  reactKick: Range
  think: Range
}

type Level = 'normal' | 'hard'

const WIN_HITS = 10

const PLAYER_SPEED: Speed = { punch: { impact: 200, end: 520 }, kick: { impact: 450, end: 760 } }
const DIFFICULTY: Record<Level, Difficulty> = {
  normal: {
    label: 'NORMAL',
    cpu: { punch: { impact: 470, end: 760 }, kick: { impact: 660, end: 960 } },
    parryWindow: 340,
    guardBase: 0.2,
    guardStep: 0.07,
    counter: 0.3,
    reactPunch: [150, 280],
    reactKick: [150, 280],
    think: [800, 1500],
  },
  hard: {
    label: 'HARD',
    cpu: { punch: { impact: 300, end: 560 }, kick: { impact: 440, end: 720 } },
    parryWindow: 170,
    guardBase: 0.5,
    guardStep: 0.15,
    counter: 0.6,
    reactPunch: [60, 150],
    reactKick: [50, 120],
    think: [200, 500],
  },
}
const LEVEL_KEYS: Record<string, Level> = { n: 'normal', h: 'hard' }
const BLOCK_ACTIVE = 600
const BLOCK_END = 800
const HURT_END = 300
const HIT_FLASH = 110
const BLOCK_STUN = 400
const PARRY_STUN = 750
const COUNT_STEP = 700
const FIGHT_BANNER = 600
const FINISH_DELAY = 700
const INNER = 64
const LEFT_X = 6
const RIGHT_X = LEFT_X + 17
const PLAYER_KIT: Kit = { glove: 39, gloveShade: 25, shorts: 33 }
const CPU_KIT: Kit = { glove: 196, gloveShade: 124, shorts: 161 }

const KEYS: Record<string, Move> = { a: 'punch', s: 'block', d: 'kick' }

const rand = (min: number, max: number): number => min + Math.random() * (max - min)
const flash: Paint = (text) => color.bold(color.yellow(text))

export function createGame(start: number) {
  let phase: Phase = 'select'
  let levelKey: Level = 'normal'
  let level: Difficulty = DIFFICULTY.normal
  let phaseStart = start
  let player = fighter()
  let cpu = fighter()
  let winner: Fighter | null = null
  let cpuNextThink = 0
  let cpuReaction: { at: number; to: Move | 'counter' | 'parry' } | null = null
  let punchStreak = 0
  let pressure = 0

  function fighter(): Fighter {
    return { action: 'idle', since: 0, hits: 0, resolved: true, stunFor: 0 }
  }

  const speed = (f: Fighter, move: Strike) => (f === player ? PLAYER_SPEED : level.cpu)[move]
  const jabInTime = () => level.reactKick[1] + level.cpu.punch.impact < PLAYER_SPEED.kick.impact
  const striking = (f: Fighter): f is Fighter & { action: Strike } => f.action === 'punch' || f.action === 'kick'

  function reset(now: number, next: Level): void {
    levelKey = next
    level = DIFFICULTY[next]
    phase = 'countdown'
    phaseStart = now
    player = fighter()
    cpu = fighter()
    winner = null
    cpuReaction = null
    punchStreak = 0
    pressure = 0
  }

  function canAct(f: Fighter, move: Move): boolean {
    if (f.action === 'idle') return true
    return move === 'block' && striking(f) && f.resolved
  }

  function begin(f: Fighter, move: Move, now: number): void {
    if (phase !== 'fight' || !canAct(f, move)) return
    f.action = move
    f.since = now
    f.resolved = move === 'block'
    if (f !== player) return
    punchStreak = move === 'block' ? 0 : punchStreak + 1
    if (move !== 'kick') cpuReaction = { at: now + rand(...level.reactPunch), to: move }
    else if (jabInTime() && Math.random() < 0.5) cpuReaction = { at: now + rand(...level.reactKick), to: 'kick' }
    else cpuReaction = { at: now + speed(player, 'kick').impact - rand(40, level.parryWindow - 30), to: 'parry' }
  }

  function stun(f: Fighter, now: number, ms: number): void {
    f.action = 'stun'
    f.since = now
    f.stunFor = ms
    f.resolved = true
  }

  function press(key: string, now: number): 'quit' | void {
    if (key === 'q' || key === 'escape') return 'quit'
    const picked = LEVEL_KEYS[key]
    if (phase === 'select' && picked) return reset(now, picked)
    if (phase === 'over' && now - phaseStart > FINISH_DELAY) {
      if (picked) return reset(now, picked)
      if (key === 'r' || key === 'space' || key === 'return') return reset(now, levelKey)
      return
    }
    const move = KEYS[key]
    if (move) begin(player, move, now)
  }

  function cpuThink(now: number): void {
    if (phase !== 'fight' || cpu.action !== 'idle') return
    if (cpuReaction && now >= cpuReaction.at) {
      const { to } = cpuReaction
      cpuReaction = null
      const roll = Math.random()
      if (to === 'counter') return begin(cpu, 'punch', now)
      const guardChance = Math.min(0.95, level.guardBase + punchStreak * level.guardStep + pressure * 0.2)
      if (to === 'punch' && roll < guardChance) return begin(cpu, 'block', now)
      if (to === 'kick' && roll < guardChance) return begin(cpu, 'punch', now)
      if (to === 'parry' && roll < guardChance) return begin(cpu, 'block', now)
      if (to === 'block' && roll < 0.6) return begin(cpu, 'kick', now)
    }
    if (cpuReaction || now < cpuNextThink) return
    cpuNextThink = now + rand(...level.think)
    const roll = Math.random()
    if (roll < 0.5) begin(cpu, 'punch', now)
    else if (roll < 0.75) begin(cpu, 'kick', now)
    else if (roll < 0.85) begin(cpu, 'block', now)
  }

  function expire(f: Fighter, now: number): void {
    let end = Infinity
    if (striking(f)) end = speed(f, f.action).end
    else if (f.action === 'block') end = BLOCK_END
    else if (f.action === 'hurt') end = HURT_END
    else if (f.action === 'stun') end = f.stunFor
    if (now - f.since >= end) f.action = 'idle'
  }

  const impactDue = (f: Fighter, now: number): boolean =>
    striking(f) && !f.resolved && now - f.since >= speed(f, f.action).impact

  const flashing = (f: Fighter, now: number): boolean =>
    f === cpu && striking(f) && !f.resolved && now >= f.since + speed(f, f.action).impact - level.parryWindow

  function tick(now: number): void {
    if (phase === 'countdown') {
      if (now - phaseStart >= COUNT_STEP * 3) {
        phase = 'fight'
        phaseStart = now
        cpuNextThink = now + rand(500, 1000)
      }
      return
    }
    if (phase !== 'fight') return

    expire(player, now)
    expire(cpu, now)

    const pairs: [Fighter, Fighter][] = [
      [player, cpu],
      [cpu, player],
    ]
    const strikes = pairs
      .filter(([attacker]) => impactDue(attacker, now))
      .map(([attacker, target]) => {
        const guard = target.action === 'block' && now - target.since < BLOCK_ACTIVE
        return { attacker, target, move: attacker.action as Strike, guard, parry: guard && now - target.since <= level.parryWindow }
      })

    for (const { attacker, target, move, guard, parry } of strikes) {
      attacker.resolved = true
      const mine = attacker === player
      if (parry || (guard && move === 'punch')) {
        stun(attacker, now, parry ? PARRY_STUN : BLOCK_STUN)
        target.action = 'idle'
        if (target === cpu) {
          pressure = 0
          if (parry || Math.random() < level.counter) cpuReaction = { at: now + rand(60, 160), to: 'counter' }
        }
        continue
      }
      attacker.hits += 1
      target.action = 'hurt'
      target.since = now
      target.resolved = true
      pressure = mine ? pressure + 1 : 0
      if (mine) cpuNextThink = Math.min(cpuNextThink, now + HURT_END + rand(40, 200))
      else cpuNextThink = now + rand(600, 900)
    }

    if (player.hits >= WIN_HITS || cpu.hits >= WIN_HITS) {
      winner = player.hits >= cpu.hits ? player : cpu
      phase = 'over'
      phaseStart = now
      return
    }

    cpuThink(now)
  }

  function poseOf(f: Fighter, now: number): Pose {
    if (phase === 'over' && now - phaseStart >= FINISH_DELAY) return f === winner ? 'win' : 'down'
    const elapsed = now - f.since
    switch (f.action) {
      case 'punch':
        return elapsed >= speed(f, 'punch').impact - 60 ? 'punch' : 'idle'
      case 'kick':
        return elapsed >= speed(f, 'kick').impact ? 'kick' : 'chamber'
      case 'block':
        return elapsed < BLOCK_ACTIVE ? 'block' : 'idle'
      case 'hurt':
      case 'stun':
        return 'hurt'
      default:
        return 'idle'
    }
  }

  function stage(now: number): string[] {
    const pixels: Pixels = Array.from({ length: SPRITE_H }, () => Array<number | null>(INNER).fill(null))
    const tintOf = (f: Fighter): Tint => {
      if (flashing(f, now)) return 'flash'
      if (f.action === 'hurt' && now - f.since < HIT_FLASH) return 'hit'
      return 'normal'
    }
    const layers: [Fighter, number, boolean, Kit][] = [
      [player, LEFT_X, false, PLAYER_KIT],
      [cpu, RIGHT_X, true, CPU_KIT],
    ]
    if (striking(player) && !striking(cpu)) layers.reverse()
    for (const [f, x, mirrored, kit] of layers) drawFighter(pixels, x, poseOf(f, now), mirrored, kit, tintOf(f))

    return pixelsToLines(pixels)
  }

  function frame(now: number): string[] {
    const width = terminalWidth()
    const center = (text: string) => ' '.repeat(Math.max(0, Math.floor((width - visibleLength(text)) / 2))) + text
    const left = ' '.repeat(Math.max(0, Math.floor((width - INNER) / 2)))
    const bar = (hits: number, paint: Paint, reverse: boolean) => {
      const filled = paint('■'.repeat(hits))
      const empty = color.gray('□'.repeat(WIN_HITS - hits))
      return reverse ? empty + filled : filled + empty
    }
    const finished = phase === 'over' && now - phaseStart >= FINISH_DELAY

    let status = ''
    if (phase === 'select') status = flash('Choose difficulty')
    else if (phase === 'countdown') status = flash(String(3 - Math.floor((now - phaseStart) / COUNT_STEP)))
    else if (phase === 'fight' && now - phaseStart < FIGHT_BANNER) status = color.bold(color.orange('FIGHT!'))
    else if (finished) status = winner === player ? color.bold(color.cyan('YOU WIN!')) : color.bold(color.red('CPU WINS'))

    const score =
      `${color.cyan('YOU')} ${bar(player.hits, color.cyan, false)}  ` +
      color.bold(`${String(player.hits).padStart(2)} : ${String(cpu.hits).padEnd(2)}`) +
      `  ${bar(cpu.hits, color.red, true)} ${color.red('CPU')}`
    const controls =
      phase === 'select'
        ? `${color.bold('[N]')} Normal   ${color.bold('[H]')} Hard   ${color.bold('[Q]')} Quit`
        : finished
          ? `${color.bold('[R]')} Rematch   ${color.bold('[N]')} Normal   ${color.bold('[H]')} Hard   ${color.bold('[Q]')} Quit`
          : `${color.bold('[A]')} Punch   ${color.bold('[S]')} Block   ${color.bold('[D]')} Kick   ${color.bold('[Q]')} Quit`

    return [
      '',
      center(color.badge(' PUNCH DUEL ')),
      center(phase === 'select' ? '' : color.gray(level.label)),
      center(score),
      '',
      ...stage(now).map((line) => left + line),
      left + color.gray('─'.repeat(INNER)),
      '',
      center(status),
      '',
      center(controls),
      center(color.gray(`First to ${WIN_HITS} hits wins. Press S while the CPU glows yellow to parry.`)),
    ]
  }

  return { press, tick, frame }
}

export function startGame(): Promise<void> {
  return new Promise((resolve) => {
    const game = createGame(Date.now())
    screen.enter()

    const loop = setInterval(() => {
      const now = Date.now()
      game.tick(now)
      screen.draw(game.frame(now))
    }, 33)

    const stopKeys = listenToKeys((key) => {
      if ((key.ctrl && key.name === 'c') || game.press(key.name, Date.now()) === 'quit') finish()
    })

    function finish(): void {
      clearInterval(loop)
      stopKeys()
      screen.leave()
      resolve()
    }
  })
}
