#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { startGame } from './game.js'

const args = process.argv.slice(2)

if (args.includes('-v') || args.includes('--version')) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  console.log(pkg.version)
  process.exit(0)
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`punch-duel

A boxing duel in your terminal. First to 10 hits wins.

Keys
  N        Normal difficulty
  H        Hard difficulty
  A        Punch
  S        Block
  D        Kick
  R        Rematch
  Q        Quit

Punches are fast but a block stops them.
Kicks are slow but go through a block.
A punch that lands during a kick wind-up cancels the kick.`)
  process.exit(0)
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('punch-duel needs an interactive terminal.')
  process.exit(1)
}

await startGame()
