import readline from 'node:readline'

export interface Key {
  name: string
  ctrl: boolean
}

export function listenToKeys(onKey: (key: Key) => void): () => void {
  const stdin = process.stdin
  readline.emitKeypressEvents(stdin)
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()

  const onKeypress = (text: string | undefined, key: readline.Key | undefined) => {
    onKey({ name: (key?.name ?? text ?? '').toLowerCase(), ctrl: Boolean(key?.ctrl) })
  }
  stdin.on('keypress', onKeypress)

  return () => {
    stdin.off('keypress', onKeypress)
    if (stdin.isTTY) stdin.setRawMode(false)
    stdin.pause()
  }
}
