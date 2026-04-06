// HOST (TV) — creates a room, runs game logic, renders board

const DICE_FACES = ['\u2680','\u2681','\u2682','\u2683','\u2684','\u2685'];

// DOM
const roomCodeEl = document.getElementById('room-code');
const joinUrlEl = document.getElementById('join-url');
const playerListEl = document.getElementById('player-list');
const startBtn = document.getElementById('start-btn');
const winConditionEl = document.getElementById('win-condition');
const winValueEl = document.getElementById('win-value');
const winValueLabel = document.getElementById('win-value-label');
const scoreboard = document.getElementById('scoreboard');
const diceDisplay = document.getElementById('dice-display');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlay-content');
const rulesList = document.getElementById('rules-list');

let engine = null;
let roomCode = null;
let lastEvent = null;

// === INIT: Create room ===
async function init() {
  roomCode = DB.generateCode();

  // Ensure unique
  while (await DB.roomExists(roomCode)) {
    roomCode = DB.generateCode();
  }

  const hostId = 'host_' + Math.random().toString(36).substr(2, 9);
  await DB.createRoom(roomCode, hostId);
  DB.onDisconnectRemove(roomCode);

  roomCodeEl.textContent = roomCode;

  // Generate QR code pointing to player page with room code
  const baseUrl = window.location.href.replace(/\/[^/]*$/, '/');
  const playerUrl = `${baseUrl}player.html?room=${roomCode}`;
  const qr = qrcode(0, 'M');
  qr.addData(playerUrl);
  qr.make();
  document.getElementById('qr-code').innerHTML = qr.createSvgTag(4, 0);

  joinUrlEl.textContent = `Skanna QR-koden eller ange rumskoden manuellt`;

  engine = new GameEngine(roomCode);

  // Listen to room changes
  engine.listen((data) => {
    if (!data) return;
    renderFromState(data);
  });

  // Listen for player actions (dice rolls, shop purchases, sabotage)
  DB.onActions(roomCode, async (actions) => {
    if (!actions || !engine.room || engine.room.state !== 'playing') return;

    for (const [playerId, action] of Object.entries(actions)) {
      if (action.processed) continue;

      if (action.type === 'roll-dice') {
        // Only accept from current turn player
        if (playerId !== engine.room.currentTurn) continue;
        await db.ref(`rooms/${roomCode}/actions/${playerId}/processed`).set(true);

        const result = await engine.rollDice();
        if (result) {
          // Handle tile after animation delay
          setTimeout(() => engine.handleTile(result.tile.type), 1500);
        }
      }

      if (action.type === 'use-sabotage') {
        await db.ref(`rooms/${roomCode}/actions/${playerId}/processed`).set(true);
        await engine.useSabotage(playerId, action.targetId);
      }

      if (action.type === 'buy-item') {
        await db.ref(`rooms/${roomCode}/actions/${playerId}/processed`).set(true);
        await engine.buyItem(playerId, action.itemId, action.extraData);
      }
    }
  });
}

// === RENDER FROM STATE ===
function renderFromState(data) {
  const players = data.players ? Object.entries(data.players).map(([id, p]) => ({ id, ...p })) : [];

  if (data.state === 'lobby') {
    renderPlayerList(players);
    startBtn.disabled = players.length < 1;
  }

  if (data.state === 'playing' || data.state === 'minigame') {
    if (document.getElementById('lobby-screen').classList.contains('active')) {
      switchScreen('game');
    }
    renderScoreboard(players, data.currentTurn);
    renderPieces(players);
  }

  // Handle current event
  if (data.currentEvent && data.currentEvent.timestamp !== lastEvent) {
    lastEvent = data.currentEvent.timestamp;
    handleEvent(data.currentEvent, players);
  }

  // No active event — hide overlay
  if (!data.currentEvent && !overlay.classList.contains('hidden')) {
    overlay.classList.add('hidden');
  }

  // House rules
  if (data.houseRules) {
    const rules = Object.values(data.houseRules);
    rulesList.innerHTML = rules.map(r => `
      <li>${r.text}<div class="rule-author">— ${r.addedBy}</div></li>
    `).join('');
  }
}

// === EVENT HANDLER ===
function handleEvent(event, players) {
  switch (event.type) {
    case 'dice-rolled':
      diceDisplay.classList.remove('hidden');
      diceDisplay.textContent = DICE_FACES[event.roll - 1];
      diceDisplay.style.animation = 'none';
      diceDisplay.offsetHeight;
      diceDisplay.style.animation = 'diceRoll 0.5s ease-out';
      showToast(`${event.playerName} slog ${event.roll}!`);
      if (event.lapped) {
        setTimeout(() => showToast(`${event.playerName} rundade brädet! +5 mynt`, 3000), 1500);
      }
      break;

    case 'turn-changed':
      diceDisplay.classList.add('hidden');
      showToast(`${event.playerName}s tur!`);
      break;

    case 'trivia':
      if (event.phase === 'question') {
        overlay.classList.remove('hidden');
        overlayContent.innerHTML = `
          <p style="color:var(--text-dim);margin-bottom:0.5rem;">${event.category}</p>
          <h2>${event.question}</h2>
          <div class="trivia-options">
            ${event.options.map((opt, i) => `<div class="trivia-option">${opt}</div>`).join('')}
          </div>
          <div class="timer-bar" id="trivia-timer"></div>
          <p style="margin-top:1rem;color:var(--text-dim);">Svara på era telefoner!</p>
        `;
        const timer = document.getElementById('trivia-timer');
        timer.style.width = '100%';
        requestAnimationFrame(() => { timer.style.width = '0%'; timer.style.transitionDuration = '15s'; });
      } else if (event.phase === 'end') {
        overlay.classList.add('hidden');
      }
      break;

    case 'minigame-select':
      overlay.classList.remove('hidden');
      overlayContent.innerHTML = `
        <h2>Minispel!</h2>
        <p style="font-size:1.3rem;margin-bottom:1rem;">${event.chooserName} väljer spel...</p>
        <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
          ${event.games.map(g => `
            <div style="background:var(--bg);border-radius:12px;padding:1.5rem;min-width:150px;text-align:center;">
              <div style="font-size:3rem;">${g.icon}</div>
              <div style="font-weight:700;margin-top:0.5rem;">${g.name}</div>
              <div style="color:var(--text-dim);font-size:0.85rem;">${g.description}</div>
            </div>
          `).join('')}
        </div>
      `;
      break;

    case 'wheel':
      if (event.phase === 'spinning') {
        overlay.classList.remove('hidden');
        overlayContent.innerHTML = `
          <h2>Lyckohjulet!</h2>
          <div class="wheel-container"><canvas id="wheel-canvas" width="350" height="350"></canvas></div>
        `;
        drawWheel(event.slices, event.winningIndex);
      } else if (event.phase === 'result') {
        overlayContent.innerHTML = `<h2>Resultat</h2><p style="font-size:1.5rem;margin:1rem 0;">${event.resultText}</p>`;
        setTimeout(() => overlay.classList.add('hidden'), 2500);
      }
      break;

    case 'blackjack':
      overlay.classList.remove('hidden');
      if (event.phase === 'betting') {
        overlayContent.innerHTML = `
          <h2>&#9824; Blackjack — Runda ${event.round} &#9829;</h2>
          <p style="font-size:1.3rem;">${event.round === 1 ? 'Poäng + mynt att vinna!' : 'Spela om mynt!'}</p>
          <p style="margin-top:1rem;color:var(--text-dim);font-size:1.1rem;">Spelarna satsar mynt på sina telefoner...</p>
          <div class="timer-bar" id="bet-timer"></div>
        `;
        const betTimer = document.getElementById('bet-timer');
        betTimer.style.width = '100%';
        requestAnimationFrame(() => { betTimer.style.width = '0%'; betTimer.style.transitionDuration = '15s'; });

      } else if (event.phase === 'playing') {
        const dealerCards = event.dealerHand.map((c, i) =>
          i === 1 ? '<span class="bj-card hidden-card">?</span>' : `<span class="bj-card">${c.rank}${c.suit}</span>`
        ).join('');
        const totalPot = Object.values(event.playerBets || {}).reduce((s, v) => s + v, 0);
        overlayContent.innerHTML = `
          <h2>&#9824; Blackjack — Runda ${event.round} &#9829;</h2>
          <p style="color:var(--yellow);font-size:1.1rem;">Pott: ${totalPot} mynt</p>
          <div><h3>Dealer</h3><div class="bj-cards">${dealerCards}</div></div>
          <div class="bj-players-grid" style="margin-top:1.5rem;">
            ${players.map(p => {
              const hand = event.playerHands[p.id];
              const status = event.playerStatus[p.id];
              const bet = event.playerBets?.[p.id] || 0;
              const total = hand ? engine.bjHandTotal(hand) : 0;
              return `<div class="bj-player-box" style="border-color:${p.color}">
                <span class="bj-player-name">${p.name}</span>
                <span>Insats: ${bet}</span>
                <span>${hand ? hand.length : 0} kort</span>
                <span class="bj-player-status ${status}">${
                  status === 'bust' ? 'BUST (' + total + ')' : status === 'stand' ? 'STAND' : 'Spelar...'
                }</span>
              </div>`;
            }).join('')}
          </div>
          <p style="margin-top:1rem;color:var(--text-dim);">Spela på era telefoner!</p>
        `;
      } else if (event.phase === 'results') {
        const dc = event.dealerHand.map(c => `<span class="bj-card">${c.rank}${c.suit}</span>`).join('');
        const triggerPlayer = players.find(p => p.id === event.triggerId);
        overlayContent.innerHTML = `
          <h2>&#9824; Blackjack — Runda ${event.round} &#9829;</h2>
          <p style="color:var(--yellow);font-size:1.1rem;">Pott: ${event.totalPot} mynt</p>
          <div><h3>Dealer: ${event.dealerTotal} ${event.dealerBust ? '(BUST!)' : ''}</h3>
          <div class="bj-cards">${dc}</div></div>
          <div class="bj-results">
            ${event.results.map(r => `
              <div class="bj-result-row ${r.won ? 'winner' : r.bust ? 'loser' : ''}">
                <div class="player-dot" style="background:${r.color}"></div>
                <span>${r.name}</span>
                <span class="bj-cards-small">${r.hand.map(c => c.rank+c.suit).join(' ')} (${r.bet} insats)</span>
                <span class="bj-total">${r.total} ${r.bust ? '\uD83D\uDCA5' : r.won ? '\u2713 +' + r.coinGain : ''}</span>
              </div>
            `).join('')}
          </div>
          <p style="margin-top:1rem;color:var(--text-dim);">${triggerPlayer ? triggerPlayer.name + ' bestämmer...' : 'Väntar...'}</p>
        `;
      }
      break;

    case 'sabotage':
      showToast(`${event.fromName} saboterade ${event.targetName}! \uD83D\uDCA3`);
      break;

    case 'shield-used':
      showToast(`${event.playerName}s sköld blockerade effekten!`);
      break;

    case 'game-over':
      overlay.classList.remove('hidden');
      overlayContent.innerHTML = `
        <h2>Spelet är slut!</h2>
        <div class="game-over-winner">
          <div class="winner-crown">\uD83D\uDC51</div>
          <div class="winner-name" style="color:${event.winner.color}">${event.winner.name}</div>
          <div class="winner-points">${event.winner.points || 0} poäng</div>
        </div>
        <div class="rankings">
          ${event.rankings.map((p, i) => `
            <div class="ranking-row">
              <span class="rank">#${i+1}</span>
              <div class="player-dot" style="background:${p.color}"></div>
              <span>${p.name}</span>
              <span class="score-points">\u2605 ${p.points || 0}</span>
              <span class="score-coins">\u2699 ${p.coins || 0}</span>
            </div>
          `).join('')}
        </div>
      `;
      break;
  }
}

// === LOBBY ===
function renderPlayerList(players) {
  playerListEl.innerHTML = players.map(p => `
    <div class="player-card">
      <div class="player-dot" style="background:${p.color}"></div>
      ${p.name}
    </div>
  `).join('');
}

winConditionEl.addEventListener('change', () => {
  if (winConditionEl.value === 'timer') {
    winValueLabel.textContent = 'Minuter:';
    winValueEl.value = 15; winValueEl.min = 5; winValueEl.max = 60; winValueEl.step = 5;
  } else {
    winValueLabel.textContent = 'Poängmål:';
    winValueEl.value = 30; winValueEl.min = 10; winValueEl.max = 200; winValueEl.step = 5;
  }
});

startBtn.addEventListener('click', async () => {
  const wc = winConditionEl.value;
  const wv = parseInt(winValueEl.value);
  await engine.startGame(wc, wv);
  if (wc === 'timer') engine.startTimer(wv);
});

// === RENDER ===
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`${name}-screen`).classList.add('active');
}

function renderScoreboard(players, currentTurn) {
  scoreboard.innerHTML = players.map(p => `
    <div class="score-card ${p.id === currentTurn ? 'active-turn' : ''}">
      <div class="player-dot" style="background:${p.color}"></div>
      <span>${p.name}</span>
      <span class="score-points">\u2605 ${p.points || 0}</span>
      <span class="score-coins">\u2699 ${p.coins || 0}</span>
    </div>
  `).join('');
}

function renderPieces(players) {
  document.querySelectorAll('.piece-container').forEach(el => el.remove());
  const posMap = {};
  players.forEach(p => {
    const pos = p.position || 0;
    if (!posMap[pos]) posMap[pos] = [];
    posMap[pos].push(p);
  });
  for (const [pos, pls] of Object.entries(posMap)) {
    const tile = document.querySelector(`[data-tile="${pos}"]`);
    if (!tile) continue;
    const container = document.createElement('div');
    container.className = 'piece-container';
    pls.forEach(p => {
      const piece = document.createElement('div');
      piece.className = 'piece';
      piece.style.background = p.color;
      piece.title = p.name;
      container.appendChild(piece);
    });
    tile.appendChild(container);
  }
}

function showToast(msg, duration = 2500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// === WHEEL ===
function drawWheel(slices, winningIndex) {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 175, cy = 175, r = 160;
  const sliceAngle = (2 * Math.PI) / slices.length;
  const colors = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#fd79a8'];
  const targetAngle = -(winningIndex * sliceAngle + sliceAngle / 2) + Math.PI / 2;
  const totalRotation = targetAngle + Math.PI * 8;
  let startTime = null;
  const duration = 3500;

  function animate(time) {
    if (!startTime) startTime = time;
    const progress = Math.min((time - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const rot = totalRotation * eased;
    ctx.clearRect(0, 0, 350, 350);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    for (let i = 0; i < slices.length; i++) {
      const s = i * sliceAngle;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, s, s + sliceAngle);
      ctx.fillStyle = colors[i % colors.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.rotate(s + sliceAngle / 2);
      ctx.textAlign = 'right'; ctx.fillStyle = 'white'; ctx.font = 'bold 11px sans-serif';
      const txt = slices[i].length > 18 ? slices[i].substring(0, 16) + '\u2026' : slices[i];
      ctx.fillText(txt, r - 10, 4); ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(cx+r+10, cy); ctx.lineTo(cx+r+25, cy-10); ctx.lineTo(cx+r+25, cy+10);
    ctx.fillStyle = 'white'; ctx.fill();
    if (progress < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

// GO
init();
