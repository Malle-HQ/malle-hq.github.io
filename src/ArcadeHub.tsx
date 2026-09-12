import { useState } from 'react'
import bierbert from '../Bierbert/Bierbert_standard.png'
import './ArcadeHub.css'
import './ArcadeRules.css'

export default function ArcadeHub({ onBack, onPixelGame, onSnake }: { onBack: () => void; onPixelGame: () => void; onSnake: () => void }) {
  const [rules, setRules] = useState<'columns' | 'snake' | null>(null)
  const openGame = (game: 'columns' | 'snake') => { const launch = game === 'columns' ? onPixelGame : onSnake; if (localStorage.getItem(`malle-hq-rules-${game}-v1`)) launch(); else setRules(game) }
  const acceptRules = () => { if (!rules) return; localStorage.setItem(`malle-hq-rules-${rules}-v1`, 'gesehen'); const launch = rules === 'columns' ? onPixelGame : onSnake; setRules(null); launch() }
  return <main className="arcade-hub">
    <header><button onClick={onBack}>← Zurück zum HQ</button><span>🕹️ Bierberts Arcade-Ecke</span></header>
    <section className="arcade-intro"><span>🎮</span><p>Bierbert präsentiert</p><h1>Arcade-Ecke</h1><strong>Hier wird nicht gezockt. Hier wird eskaliert.</strong></section>
    <section className="arcade-games">
      <button className="arcade-game arcade-columns" onClick={() => openGame('columns')}><span className="arcade-game-icon">🍺</span><small>Reaktion & Säulentechnik</small><h2>Bierberts Säulen-Sause</h2><p>Baue deinen Pixel-Mittäter und fange alles, was in die Säule gehört.</p><b>Fang den Pegel →</b></button>
      <button className="arcade-game arcade-snake" onClick={() => openGame('snake')}><span className="arcade-game-icon">🍹</span><small>Der Klassiker mit Pegel</small><h2>Cocktail-Kobra</h2><p>Friss Cocktails, werde länger – und versuche trotz steigender Promille geradeaus zu steuern.</p><b>Schlängern →</b></button>
    </section>
    <div className="rules-reopen-row"><button onClick={() => setRules('columns')}>📖 Regeln: Säulen-Sause</button><button onClick={() => setRules('snake')}>📖 Regeln: Cocktail-Kobra</button></div>
    <p className="arcade-warning">Bierbert übernimmt keine Haftung für verknotete Finger. 🐍</p>
    {rules && <div className="arcade-rules-backdrop"><section className="arcade-rules"><button className="rules-close" onClick={() => setRules(null)}>×</button><img src={bierbert} alt="Bierbert erklärt die Spielregeln" /><p>Bierbert erklärt</p><h2>{rules === 'columns' ? 'So füllst du die Säule!' : 'So schlängerst du mit Pegel!'}</h2>{rules === 'columns' ? <ul><li>Ziehe deine Figur mit dem Finger nach links und rechts.</li><li>Fange Bier, Cocktails, Wein und Kurze – das gibt Punkte.</li><li>Wasser, Saft und Milch zählen als Fehlgriff.</li><li>Nach drei Fehlgriffen ist Schluss. Die Bombe beendet sofort alles!</li></ul> : <ul><li>Steuere per Wischen, Pfeiltasten oder den Bildschirmknöpfen.</li><li>Jeder Cocktail macht die Schlange länger und bringt einen Punkt.</li><li>Mit steigendem Pegel reagiert die Steuerung verzögert oder absichtlich falsch.</li><li>Wand oder eigener Schlangenkörper bedeuten Feierabend!</li></ul>}<button className="rules-ok" onClick={acceptRules}>Alles klar, Bierbert! →</button></section></div>}
  </main>
}
