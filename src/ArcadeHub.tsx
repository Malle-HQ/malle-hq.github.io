import './ArcadeHub.css'

export default function ArcadeHub({ onBack, onPixelGame, onSnake }: { onBack: () => void; onPixelGame: () => void; onSnake: () => void }) {
  return <main className="arcade-hub">
    <header><button onClick={onBack}>← Zurück zum HQ</button><span>🕹️ Bierberts Arcade-Ecke</span></header>
    <section className="arcade-intro"><span>🎮</span><p>Bierbert präsentiert</p><h1>Arcade-Ecke</h1><strong>Hier wird nicht gezockt. Hier wird eskaliert.</strong></section>
    <section className="arcade-games">
      <button className="arcade-game arcade-columns" onClick={onPixelGame}><span className="arcade-game-icon">🍺</span><small>Reaktion & Säulentechnik</small><h2>Bierberts Säulen-Sause</h2><p>Baue deinen Pixel-Mittäter und fange alles, was in die Säule gehört.</p><b>Fang den Pegel →</b></button>
      <button className="arcade-game arcade-snake" onClick={onSnake}><span className="arcade-game-icon">🍹</span><small>Der Klassiker mit Pegel</small><h2>Cocktail-Kobra</h2><p>Friss Cocktails, werde länger – und versuche trotz steigender Promille geradeaus zu steuern.</p><b>Schlängern →</b></button>
    </section>
    <p className="arcade-warning">Bierbert übernimmt keine Haftung für verknotete Finger. 🐍</p>
  </main>
}
