import { useEffect, useRef, useState } from 'react'
import './PixelGame.css'

export type GameLook = { hat: string; top: string; bottoms: string; shoes: string; hair: string }
export type GameScore = { profileId: string; name: string; avatarUrl?: string | null; score: number; look: GameLook }
type Falling = { x: number; y: number; speed: number; icon: string; kind: 'good' | 'bad' | 'bomb' }

const choices = {
  hat: [['none', 'Keine'], ['sunglasses', 'Sonnenbrille'], ['sombrero', 'Mexico-Hut'], ['cap', 'Cap'], ['beerhelmet', 'Bierhelm'], ['goggles', 'Taucherbrille']],
  top: [['shirt', 'T-Shirt'], ['floral', 'Malle-Hemd']],
  bottoms: [['shorts', 'Shorts'], ['trunks', 'Badehose']],
  shoes: [['sandals', 'Sandalen'], ['barefoot', 'Barfuß']],
  hair: [['brown', 'Braun'], ['black', 'Schwarz'], ['blond', 'Blond'], ['red', 'Rot']],
} as const
const drops = [
  { icon: '🍺', kind: 'good' as const }, { icon: '🍹', kind: 'good' as const }, { icon: '🥃', kind: 'good' as const }, { icon: '🍷', kind: 'good' as const },
  { icon: '💧', kind: 'bad' as const }, { icon: '🧃', kind: 'bad' as const }, { icon: '🥛', kind: 'bad' as const }, { icon: '💣', kind: 'bomb' as const },
]

function drawPixelPerson(context: CanvasRenderingContext2D, x: number, y: number, look: GameLook) {
  const hair = { brown: '#654126', black: '#202834', blond: '#e7bd45', red: '#b9512d' }[look.hair] || '#654126'
  context.save(); context.translate(Math.round(x), Math.round(y)); context.imageSmoothingEnabled = false
  if (look.hat === 'sombrero') { context.fillStyle = '#f0b936'; context.fillRect(-27, -49, 54, 7); context.fillStyle = '#d98224'; context.fillRect(-17, -57, 34, 9); context.fillRect(-10, -64, 20, 8) }
  if (look.hat === 'cap') { context.fillStyle = '#d9578e'; context.fillRect(-14, -54, 27, 12); context.fillRect(-19, -43, 38, 6); context.fillStyle = '#fff'; context.fillRect(-5, -51, 9, 5) }
  if (look.hat === 'beerhelmet') { context.fillStyle = '#ff6b35'; context.fillRect(-16, -56, 32, 15); context.fillStyle = '#ffc93c'; context.fillRect(-25, -58, 9, 22); context.fillRect(17, -58, 9, 22); context.fillStyle = '#fff'; context.fillRect(-23, -54, 5, 8); context.fillRect(19, -54, 5, 8); context.strokeStyle = '#168aad'; context.lineWidth = 3; context.beginPath(); context.moveTo(-20, -37); context.lineTo(-8, -22); context.moveTo(21, -37); context.lineTo(8, -22); context.stroke() }
  context.fillStyle = hair; context.fillRect(-14, -45, 28, 8); context.fillRect(-18, -39, 7, 15)
  context.fillStyle = '#efb38d'; context.fillRect(-13, -37, 26, 25)
  if (look.hat === 'goggles') { context.fillStyle = '#168aad'; context.fillRect(-16, -34, 32, 13); context.fillStyle = '#bdefff'; context.fillRect(-12, -31, 10, 7); context.fillRect(3, -31, 10, 7); context.fillStyle = '#ff6b35'; context.fillRect(14, -29, 5, 31); context.fillRect(18, -29, 8, 5) }
  else if (look.hat === 'sunglasses') { context.fillStyle = '#172b3d'; context.fillRect(-12, -32, 10, 7); context.fillRect(3, -32, 10, 7); context.fillRect(-2, -30, 5, 2) }
  context.fillStyle = look.top === 'floral' ? '#ff6b35' : '#168aad'; context.fillRect(-18, -12, 36, 32)
  if (look.top === 'floral') { context.fillStyle = '#ffe36e'; context.fillRect(-12, -5, 5, 5); context.fillRect(7, 7, 5, 5) }
  context.fillStyle = look.bottoms === 'trunks' ? '#8f5bd7' : '#17324d'; context.fillRect(-17, 20, 34, 17); context.fillStyle = '#efb38d'; context.fillRect(-15, 37, 11, 19); context.fillRect(4, 37, 11, 19)
  if (look.shoes === 'sandals') { context.fillStyle = '#66402b'; context.fillRect(-18, 54, 14, 5); context.fillRect(4, 54, 14, 5) }
  context.fillStyle = '#efb38d'; context.fillRect(18, -7, 9, 35); context.fillStyle = '#dfbb72'; context.fillRect(24, -2, 10, 42); context.fillStyle = '#f0d59a'; context.fillRect(27, 4, 22, 27); context.strokeStyle = '#a87931'; context.lineWidth = 2; context.strokeRect(27, 4, 22, 27)
  context.restore()
}

export default function PixelGame({ leaderboard, loggedIn, onBack, onScore }: { leaderboard: GameScore[]; loggedIn: boolean; onBack: () => void; onScore: (score: number, look: GameLook) => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), previewRef = useRef<HTMLCanvasElement>(null), frameRef = useRef(0), runningRef = useRef(false), playerX = useRef(180), dropsRef = useRef<Falling[]>([]), lastSpawn = useRef(0), scoreRef = useRef(0), missesRef = useRef(0), seedRef = useRef(73421)
  const [look, setLook] = useState<GameLook>({ hat: 'sunglasses', top: 'floral', bottoms: 'trunks', shoes: 'sandals', hair: 'brown' })
  const lookRef = useRef(look), [running, setRunning] = useState(false), [score, setScore] = useState(0), [misses, setMisses] = useState(0), [finished, setFinished] = useState(false)
  useEffect(() => { lookRef.current = look }, [look])
  useEffect(() => { const context = previewRef.current?.getContext('2d'); if (!context) return; context.imageSmoothingEnabled = false; context.fillStyle = '#bcecff'; context.fillRect(0, 0, 150, 160); context.fillStyle = '#f4d08a'; context.fillRect(0, 132, 150, 28); drawPixelPerson(context, 68, 94, look) }, [look, finished])
  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  const render = (time: number) => {
    const canvas = canvasRef.current, context = canvas?.getContext('2d'); if (!canvas || !context || !runningRef.current) return
    const gradient = context.createLinearGradient(0, 0, 0, 520); gradient.addColorStop(0, '#83d7f4'); gradient.addColorStop(.72, '#fff0b8'); gradient.addColorStop(.73, '#e7c584'); gradient.addColorStop(1, '#d7984f'); context.fillStyle = gradient; context.fillRect(0, 0, 360, 520)
    context.fillStyle = 'rgba(255,255,255,.75)'; context.fillRect(28, 58, 70, 10); context.fillRect(245, 92, 85, 9)
    const random = () => { seedRef.current = seedRef.current * 16807 % 2147483647; return (seedRef.current - 1) / 2147483646 }
    if (time - lastSpawn.current > Math.max(360, 850 - scoreRef.current * 4)) { const item = drops[Math.floor(random() * drops.length)]; dropsRef.current.push({ ...item, x: 25 + random() * 310, y: -30, speed: 2.2 + random() * 1.6 + scoreRef.current / 180 }); lastSpawn.current = time }
    const catcherLeft = playerX.current + 24, catcherRight = playerX.current + 74
    dropsRef.current = dropsRef.current.filter(item => { item.y += item.speed; context.font = '28px serif'; context.textAlign = 'center'; context.fillText(item.icon, item.x, item.y); if (item.y > 430 && item.y < 468 && item.x >= catcherLeft && item.x <= catcherRight) { if (item.kind === 'good') { scoreRef.current += 10; setScore(scoreRef.current) } else { missesRef.current = item.kind === 'bomb' ? 3 : missesRef.current + 1; setMisses(missesRef.current) } return false } return item.y < 545 })
    drawPixelPerson(context, playerX.current, 448, lookRef.current)
    context.fillStyle = '#17324d'; context.font = 'bold 16px sans-serif'; context.textAlign = 'left'; context.fillText(`${scoreRef.current} Punkte`, 14, 27); context.textAlign = 'right'; context.fillText(`${'❌'.repeat(missesRef.current)}${'🤍'.repeat(Math.max(0, 3 - missesRef.current))}`, 346, 27)
    if (missesRef.current >= 3) { runningRef.current = false; setRunning(false); setFinished(true); void onScore(scoreRef.current, lookRef.current); return }
    frameRef.current = requestAnimationFrame(render)
  }
  const start = () => { if (!loggedIn) return; scoreRef.current = 0; missesRef.current = 0; dropsRef.current = []; lastSpawn.current = 0; playerX.current = 145; setScore(0); setMisses(0); setFinished(false); setRunning(true); runningRef.current = true; cancelAnimationFrame(frameRef.current); frameRef.current = requestAnimationFrame(render) }
  const move = (clientX: number) => { const box = canvasRef.current?.getBoundingClientRect(); if (!box) return; playerX.current = Math.max(18, Math.min(280, (clientX - box.left) / box.width * 360 - 40)) }
  const update = (key: keyof GameLook, value: string) => setLook(current => ({ ...current, [key]: value }))

  return <main className="game-page"><button className="game-hq-back" onClick={onBack}>← Zurück zum HQ</button><section className="game-hero"><span>🕹️</span><div><p className="eyebrow">Bierberts Säulen-Sause</p><h1>Fang den Pegel!</h1><p>Alkohol in die Säule. Wasser, Saft und Bomben lieber nicht.</p></div></section><section className="game-content"><div className="game-stage"><canvas ref={canvasRef} width="360" height="520" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); move(event.clientX) }} onPointerMove={event => event.currentTarget.hasPointerCapture(event.pointerId) && move(event.clientX)} /><div className="game-status"><strong>{score} Punkte</strong><span>{misses}/3 Fehlgriffe</span></div>{!running && <div className={`game-overlay ${finished ? '' : 'game-setup'}`}>{finished ? <><span className="finish-icon">🥴</span><strong>Ausgesäult! {score} Punkte</strong><p>Die Säule möchte sofort eine Revanche.</p><button onClick={start}>Nochmal spielen</button><button className="change-look" onClick={() => setFinished(false)}>Figur ändern</button></> : <><div className="setup-heading"><div><p className="eyebrow">Dein Pixel-Mittäter</p><strong>Figur zusammenbauen</strong></div><div className="pixel-preview"><canvas ref={previewRef} width="150" height="160" /><span>Live-Vorschau</span></div></div><div className="setup-fields">{Object.entries(choices).map(([key, values]) => <label key={key}><span>{{ hat: 'Kopfbedeckung', top: 'Oberteil', bottoms: 'Hose', shoes: 'Füße', hair: 'Haare' }[key]}</span><select value={String(look[key as keyof GameLook])} onChange={event => update(key as keyof GameLook, event.target.value)}>{values.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div><p>{loggedIn ? 'Danach ziehst du deine Figur mit dem Finger nach links und rechts.' : 'Bitte zuerst anmelden, damit dein Highscore zählt.'}</p><button disabled={!loggedIn} onClick={start}>Figur übernehmen & starten</button></>}</div>}</div><section className="game-leaderboard"><p className="eyebrow">Ewige Bestenliste</p><h2>Die Säulen-Elite</h2>{leaderboard.length ? leaderboard.map((entry, index) => <article key={entry.profileId} className={index === 0 ? 'champion' : ''}><b>{index === 0 ? '🏆' : `${index + 1}.`}</b><span><strong>{entry.name}</strong><small>{index === 0 ? 'Bierberts amtierender Säulen-Champion' : 'Pegel-Athlet'}</small></span><em>{entry.score}</em></article>) : <p className="empty-state">Noch kein Highscore. Die Säule gehört dir!</p>}</section></section></main>
}
