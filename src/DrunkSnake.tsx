import { useCallback, useEffect, useRef, useState } from 'react'
import './DrunkSnake.css'

type Point = { x: number; y: number }
type Direction = 'up' | 'down' | 'left' | 'right'
const GRID = 20
const cocktails = ['🍹', '🍸', '🍷', '🥂']
const vectors: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const opposites: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const clockwise: Record<Direction, Direction> = { up: 'right', right: 'down', down: 'left', left: 'up' }

export default function DrunkSnake({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), timerRef = useRef<number>(0), tickRef = useRef<() => void>(() => undefined), snakeRef = useRef<Point[]>([]), directionRef = useRef<Direction>('right'), foodRef = useRef<Point>({ x: 15, y: 10 }), scoreRef = useRef(0), runningRef = useRef(false), touchRef = useRef<Point | null>(null)
  const [running, setRunning] = useState(false), [finished, setFinished] = useState(false), [score, setScore] = useState(0), [best, setBest] = useState(() => Number(localStorage.getItem('malle-hq-snake-best') || 0)), [effect, setEffect] = useState('Noch nüchtern – verdächtig!')

  const draw = useCallback(() => {
    const context = canvasRef.current?.getContext('2d'); if (!context) return
    context.fillStyle = '#16122c'; context.fillRect(0, 0, 400, 400)
    context.strokeStyle = 'rgba(255,255,255,.035)'; context.lineWidth = 1
    for (let n = 0; n <= GRID; n += 1) { context.beginPath(); context.moveTo(n * 20, 0); context.lineTo(n * 20, 400); context.stroke(); context.beginPath(); context.moveTo(0, n * 20); context.lineTo(400, n * 20); context.stroke() }
    snakeRef.current.forEach((part, index) => { context.fillStyle = index === 0 ? '#ffc93c' : `hsl(${168 + index * 5} 70% ${48 + index % 3 * 5}%)`; context.beginPath(); context.roundRect(part.x * 20 + 2, part.y * 20 + 2, 16, 16, 5); context.fill(); if (index === 0) { context.fillStyle = '#172b3d'; context.fillRect(part.x * 20 + 6, part.y * 20 + 6, 3, 3); context.fillRect(part.x * 20 + 12, part.y * 20 + 6, 3, 3) } })
    context.font = '20px serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(cocktails[scoreRef.current % cocktails.length], foodRef.current.x * 20 + 10, foodRef.current.y * 20 + 10)
  }, [])

  const placeFood = () => { let next: Point; do next = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }; while (snakeRef.current.some(part => part.x === next.x && part.y === next.y)); foodRef.current = next }
  const stop = useCallback(() => { runningRef.current = false; window.clearTimeout(timerRef.current); setRunning(false); setFinished(true); const nextBest = Math.max(best, scoreRef.current); setBest(nextBest); localStorage.setItem('malle-hq-snake-best', String(nextBest)) }, [best])
  const tick = useCallback(() => {
    if (!runningRef.current) return
    const snake = snakeRef.current, vector = vectors[directionRef.current], head = { x: snake[0].x + vector.x, y: snake[0].y + vector.y }
    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID || snake.some(part => part.x === head.x && part.y === head.y)) { stop(); return }
    snake.unshift(head)
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) { scoreRef.current += 1; setScore(scoreRef.current); placeFood() } else snake.pop()
    draw(); timerRef.current = window.setTimeout(() => tickRef.current(), Math.max(72, 150 - scoreRef.current * 3))
  }, [draw, stop])
  useEffect(() => { tickRef.current = tick }, [tick])
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const steer = useCallback((wanted: Direction) => {
    if (!runningRef.current || opposites[directionRef.current] === wanted) return
    const level = scoreRef.current, random = Math.random(); let actual = wanted
    if (level >= 10 && random < .28) actual = opposites[wanted]
    else if (level >= 6 && random < .34) actual = clockwise[wanted]
    else if (level >= 3 && random < .22) { setEffect('Bierbert verarbeitet die Eingabe noch …'); window.setTimeout(() => { if (runningRef.current && opposites[directionRef.current] !== wanted) directionRef.current = wanted }, 240); return }
    if (opposites[directionRef.current] !== actual) directionRef.current = actual
    setEffect(level < 3 ? 'Noch nüchtern – verdächtig!' : level < 6 ? 'Leicht verzögerte Reaktion' : level < 10 ? 'Links? Rechts? Wird überbewertet.' : 'Volltrunken: Steuerung ohne Gewähr!')
  }, [])
  useEffect(() => { const key = (event: KeyboardEvent) => { const map: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }; if (map[event.key]) { event.preventDefault(); steer(map[event.key]) } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [steer])
  const start = () => { window.clearTimeout(timerRef.current); snakeRef.current = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }]; directionRef.current = 'right'; scoreRef.current = 0; setScore(0); setFinished(false); setEffect('Noch nüchtern – verdächtig!'); placeFood(); runningRef.current = true; setRunning(true); draw(); timerRef.current = window.setTimeout(tick, 350) }
  const pegel = Math.min(100, score * 8)

  return <main className="snake-page"><button className="game-hq-back" onClick={onBack}>← Zurück zum HQ</button><section className="snake-shell"><div className="snake-title"><span>🍹🐍</span><div><p>Cocktail-Snake mit Kontrollverlust</p><h1>Cocktail-Kobra</h1></div></div><div className="snake-stats"><strong>{score} Cocktails</strong><span>Rekord: {best}</span></div><div className="pegel"><span style={{ width: `${pegel}%` }} /><b>Pegel {pegel}%</b></div><p className="snake-effect">🥴 {effect}</p><div className="snake-board" onTouchStart={event => { const touch = event.touches[0]; touchRef.current = { x: touch.clientX, y: touch.clientY } }} onTouchEnd={event => { const startPoint = touchRef.current, touch = event.changedTouches[0]; if (!startPoint) return; const dx = touch.clientX - startPoint.x, dy = touch.clientY - startPoint.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')) }}><canvas ref={canvasRef} width="400" height="400" />{!running && <div className="snake-overlay"><span>{finished ? '🥴' : '🐍'}</span><strong>{finished ? `${score} Cocktails – Feierabend!` : 'Bereit zum Schlängeln?'}</strong><p>Je mehr Cocktails, desto betrunkener wird die Steuerung.</p><button onClick={start}>{finished ? 'Nochmal eskalieren' : 'Spiel starten'}</button></div>}</div><div className="snake-controls"><button onClick={() => steer('up')}>▲</button><button onClick={() => steer('left')}>◀</button><button onClick={() => steer('down')}>▼</button><button onClick={() => steer('right')}>▶</button></div><small className="snake-help">Wischen, Pfeiltasten oder die Knöpfe benutzen.</small></section></main>
}
