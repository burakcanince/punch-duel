const isTTY = Boolean(process.stdout.isTTY)
const forceColor = process.env.FORCE_COLOR
export const useColor = forceColor !== undefined ? forceColor !== '0' : isTTY && !('NO_COLOR' in process.env)

const style =
  (open: string, close: string) =>
  (text: string | number): string =>
    useColor ? `\x1b[${open}m${text}\x1b[${close}m` : String(text)

export const color = {
  bold: style('1', '22'),
  red: style('91', '39'),
  cyan: style('96', '39'),
  gray: style('90', '39'),
  yellow: style('93', '39'),
  orange: style('38;5;208', '39'),
  badge: style('48;5;208;97;1', '49;39;22'),
}

export const screen = {
  enter(): void {
    if (isTTY) process.stdout.write('\x1b[?1049h\x1b[?25l')
  },
  leave(): void {
    if (isTTY) process.stdout.write('\x1b[?25h\x1b[?1049l')
  },
  draw(lines: string[]): void {
    if (isTTY) process.stdout.write('\x1b[H' + lines.map((line) => line + '\x1b[K').join('\n') + '\x1b[J')
  },
}

export const terminalWidth = (): number => Math.max(40, Math.min(process.stdout.columns || 80, 200))

export const visibleLength = (text: string): number => text.replace(/\x1b\[[0-9;]*m/g, '').length
