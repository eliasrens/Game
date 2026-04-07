// PLAYER (Mobile) — joins room, sends actions, renders controller

let roomCode = null;
let myId = null;
let myName = '';
let lastEvent = null;
let rolledForTurn = null; // tracks which currentTurn we already rolled for
let currentTurnId = null;

// DOM
const joinForm = document.getElementById('join-form');
const roomInput = document.getElementById('room-input');
const nameInput = document.getElementById('name-input');
const joinError = document.getElementById('join-error');
const playerNameDisplay = document.getElementById('player-name-display');
const turnText = document.getElementById('turn-text');
const diceBtn = document.getElementById('dice-btn');
const myPointsEl = document.getElementById('my-points');
const myCoinsEl = document.getElementById('my-coins');
const triviaArea = document.getElementById('trivia-area');
const triviaQuestion = document.getElementById('trivia-question');
const triviaButtons = document.getElementById('trivia-buttons');
const triviaFeedback = document.getElementById('trivia-feedback');
const bjArea = document.getElementById('bj-area');
const shopItemsEl = document.getElementById('shop-items');
const inventoryEl = document.getElementById('inventory');
const ruleForm = document.getElementById('rule-form');
const ruleInput = document.getElementById('rule-input');
const rulesDisplay = document.getElementById('rules-display');

// Auto-uppercase room code
roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.toUpperCase(); });

// Auto-fill room code from URL parameter (e.g. ?room=ABCD)
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
  roomInput.value = urlRoom.toUpperCase();
  nameInput.focus();
}

// === JOIN ===
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  if (!code || !name) return;

  // Check room exists
  const exists = await DB.roomExists(code);
  if (!exists) {
    joinError.textContent = 'Rummet finns inte';
    joinError.classList.remove('hidden');
    return;
  }

  const room = await DB.getRoom(code);

  // Check if this is a reconnect (same name exists in room)
  let reconnecting = false;
  let existingId = null;
  if (room.players) {
    for (const [id, p] of Object.entries(room.players)) {
      if (p.name === name) {
        reconnecting = true;
        existingId = id;
        break;
      }
    }
  }

  if (!reconnecting) {
    // New player — only allowed in lobby
    if (room.state !== 'lobby') {
      joinError.textContent = 'Spelet har redan startat';
      joinError.classList.remove('hidden');
      return;
    }

    const count = await DB.getPlayerCount(code);
    if (count >= 8) {
      joinError.textContent = 'Rummet är fullt (max 8)';
      joinError.classList.remove('hidden');
      return;
    }
  }

  roomCode = code;
  myName = name;

  if (reconnecting) {
    // Rejoin as existing player
    myId = existingId;
    await DB.updatePlayer(code, myId, { connected: true });
    DB.onPlayerDisconnect(code, myId);
    playerNameDisplay.textContent = name;
    // Go straight to game if already playing
    if (room.state === 'playing' || room.state === 'minigame') {
      switchScreen('game');
      loadShop();
    } else {
      switchScreen('waiting');
    }
  } else {
    // Brand new player
    myId = 'player_' + Math.random().toString(36).substr(2, 9);
    const count = await DB.getPlayerCount(code);
    const color = PLAYER_COLORS[count];
    await DB.joinRoom(code, myId, name, color);
    DB.onPlayerDisconnect(code, myId);
    playerNameDisplay.textContent = name;
    switchScreen('waiting');
  }

  // Listen to room state
  DB.onRoomChange(code, (data) => {
    if (!data) {
      switchScreen('disconnected');
      return;
    }
    handleRoomUpdate(data);
  });
});

// === ROOM STATE LISTENER ===
function handleRoomUpdate(data) {
  // Game started?
  if (data.state === 'playing' || data.state === 'minigame') {
    if (!document.getElementById('game-screen').classList.contains('active')) {
      switchScreen('game');
      loadShop();
    }

    // Update my stats
    const me = data.players?.[myId];
    if (me) {
      myPointsEl.textContent = `\u2733 ${me.points || 0}`;
      myCoinsEl.textContent = `\u2699 ${me.coins || 0}`;
    }

    // Update turn — reset rolledForTurn when turn changes
    if (data.currentTurn !== currentTurnId) {
      rolledForTurn = null;
    }
    currentTurnId = data.currentTurn;
    const isMyTurn = data.currentTurn === myId;
    const alreadyRolled = rolledForTurn === data.currentTurn;
    const canRoll = isMyTurn && !alreadyRolled;

    diceBtn.disabled = !canRoll;

    if (canRoll) {
      turnText.textContent = 'Din tur! Slå tärningen!';
      turnText.style.color = 'var(--accent)';
      if (navigator.vibrate) navigator.vibrate(200);
    } else if (isMyTurn) {
      turnText.textContent = 'Din tur — vänta...';
      turnText.style.color = 'var(--accent)';
    } else {
      const currentPlayer = data.players?.[data.currentTurn];
      turnText.textContent = currentPlayer ? `${currentPlayer.name}s tur...` : 'Väntar...';
      turnText.style.color = 'var(--text-dim)';
    }
  }

  // Handle events
  if (data.currentEvent && data.currentEvent.timestamp !== lastEvent) {
    lastEvent = data.currentEvent.timestamp;
    handleEvent(data.currentEvent, data);
  }

  // No active event — reset UI
  if (!data.currentEvent) {
    bjArea.classList.add('hidden');
    bjArea.dataset.showingResults = '';
    triviaArea.classList.add('hidden');
    diceBtn.classList.remove('hidden');
  }

  // House rules
  if (data.houseRules) {
    const rules = Object.values(data.houseRules);
    rulesDisplay.innerHTML = rules.map(r =>
      `<p>${r.text} <span class="rule-author">— ${r.addedBy}</span></p>`
    ).join('');
  }
}

// === EVENT HANDLER ===
function handleEvent(event, roomData) {
  switch (event.type) {
    case 'trivia':
      if (event.phase === 'question') {
        triviaArea.classList.remove('hidden');
        diceBtn.classList.add('hidden');
        triviaQuestion.textContent = event.question;
        triviaFeedback.textContent = '';
        triviaButtons.innerHTML = event.options.map((opt, i) =>
          `<button class="trivia-btn" data-index="${i}">${opt}</button>`
        ).join('');
        triviaButtons.querySelectorAll('.trivia-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            triviaButtons.querySelectorAll('.trivia-btn').forEach(b => b.disabled = true);
            btn.classList.add('selected');
            const answer = parseInt(btn.dataset.index);
            await DB.playerAction(roomCode, myId, { type: 'trivia-answer', answer });
            // Show immediate feedback
            if (answer === event.correctAnswer) {
              btn.classList.add('correct');
              triviaFeedback.textContent = 'Rätt!';
              triviaFeedback.style.color = 'var(--green)';
            } else {
              btn.classList.add('wrong');
              triviaFeedback.textContent = 'Fel!';
              triviaFeedback.style.color = 'var(--red)';
            }
          });
        });
      } else if (event.phase === 'end') {
        setTimeout(() => {
          triviaArea.classList.add('hidden');
          diceBtn.classList.remove('hidden');
        }, 1500);
      }
      break;

    case 'category-select':
      diceBtn.classList.add('hidden');
      if (event.chooserId === myId) {
        bjArea.classList.remove('hidden');
        bjArea.innerHTML = `
          <h3>Du varvade! Välj trivia-kategori!</h3>
          <div class="minigame-choices">
            ${event.categories.map(c => `
              <button class="minigame-choice-btn" data-cat="${c.id}">
                <span class="minigame-icon">${c.icon}</span>
                <span class="minigame-name">${c.name}</span>
              </button>
            `).join('')}
          </div>
        `;
        bjArea.querySelectorAll('.minigame-choice-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            bjArea.querySelectorAll('.minigame-choice-btn').forEach(b => b.disabled = true);
            btn.style.borderColor = 'var(--accent)';
            await DB.playerAction(roomCode, myId, { type: 'category-choice', categoryId: btn.dataset.cat });
          });
        });
      } else {
        turnText.textContent = `${event.chooserName} väljer trivia-kategori...`;
      }
      break;

    case 'minigame-select':
      diceBtn.classList.add('hidden');
      if (event.chooserId === myId) {
        // I get to choose!
        bjArea.classList.remove('hidden');
        bjArea.innerHTML = `
          <h3>Välj minispel!</h3>
          <div class="minigame-choices">
            ${event.games.map(g => `
              <button class="minigame-choice-btn" data-game="${g.id}">
                <span class="minigame-icon">${g.icon}</span>
                <span class="minigame-name">${g.name}</span>
                <span class="minigame-desc">${g.description}</span>
              </button>
            `).join('')}
          </div>
        `;
        bjArea.querySelectorAll('.minigame-choice-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            bjArea.querySelectorAll('.minigame-choice-btn').forEach(b => b.disabled = true);
            btn.style.borderColor = 'var(--accent)';
            await DB.playerAction(roomCode, myId, { type: 'minigame-choice', gameId: btn.dataset.game });
          });
        });
      } else {
        turnText.textContent = `${event.chooserName} väljer minispel...`;
      }
      break;

    case 'wheel':
      if (event.phase === 'spinning') {
        turnText.textContent = 'Lyckohjulet snurrar! Titta på TV:n!';
      }
      break;

    case 'blackjack':
      diceBtn.classList.add('hidden');
      bjArea.classList.remove('hidden');

      if (event.phase === 'betting') {
        const me = roomData?.players?.[myId];
        const myCoinsNow = me?.coins || 0;
        const maxBet = Math.min(myCoinsNow, event.maxBet || 20);

        bjArea.innerHTML = `
          <h3>&#9824; Blackjack — Runda ${event.round} &#9829;</h3>
          <p>${event.round === 1 ? 'Poäng + mynt att vinna!' : 'Spela om mynt!'}</p>
          <div class="bj-bet-section">
            <p>Satsa mynt (du har <strong>${myCoinsNow}</strong>):</p>
            <div class="bj-quick-bets">
              <button class="bj-quick-bet" data-bet="0">0</button>
              <button class="bj-quick-bet" data-bet="1">1</button>
              <button class="bj-quick-bet" data-bet="3">3</button>
              <button class="bj-quick-bet" data-bet="5">5</button>
              <button class="bj-quick-bet" data-bet="10">10</button>
              <button class="bj-quick-bet" data-bet="${maxBet}">Allt (${maxBet})</button>
            </div>
          </div>
        `;

        bjArea.querySelectorAll('.bj-quick-bet').forEach(btn => {
          const amount = parseInt(btn.dataset.bet);
          if (amount > maxBet) { btn.disabled = true; btn.style.opacity = '0.4'; }
          btn.addEventListener('click', async () => {
            bjArea.querySelectorAll('.bj-quick-bet').forEach(b => b.disabled = true);
            btn.style.borderColor = 'var(--accent)';
            btn.style.background = 'rgba(52,152,219,0.3)';
            await DB.playerAction(roomCode, myId, { type: 'bj-bet', amount: Math.min(amount, maxBet) });
            bjArea.innerHTML = `
              <h3>&#9824; Blackjack — Runda ${event.round} &#9829;</h3>
              <p>Du satsade <strong>${Math.min(amount, maxBet)}</strong> mynt. Väntar...</p>
            `;
          });
        });

      } else if (event.phase === 'playing') {
        const myHand = event.playerHands?.[myId];
        const myStatus = event.playerStatus?.[myId];
        const myBet = event.playerBets?.[myId] || 0;
        if (!myHand) return;

        const total = bjHandTotal(myHand);

        if (myStatus === 'playing') {
          bjArea.innerHTML = `
            <h3>&#9824; Blackjack — Runda ${event.round} &#9829;</h3>
            <p class="bj-your-bet">Din insats: ${myBet} mynt</p>
            <div class="bj-hand">
              ${myHand.map(c => `<span class="bj-card-mobile">${c.rank}${c.suit}</span>`).join('')}
            </div>
            <div class="bj-total-display">Summa: <strong>${total}</strong></div>
            <div class="bj-actions">
              <button class="btn-hit" id="bj-hit">Kort till</button>
              <button class="btn-stand" id="bj-stand">Stanna</button>
            </div>
          `;
          document.getElementById('bj-hit').addEventListener('click', async () => {
            await DB.playerAction(roomCode, myId, { type: 'bj-action', action: 'hit' });
          });
          document.getElementById('bj-stand').addEventListener('click', async () => {
            await DB.playerAction(roomCode, myId, { type: 'bj-action', action: 'stand' });
          });
        } else {
          bjArea.innerHTML = `
            <h3>&#9824; Blackjack — Runda ${event.round} &#9829;</h3>
            <div class="bj-hand">
              ${myHand.map(c => `<span class="bj-card-mobile">${c.rank}${c.suit}</span>`).join('')}
            </div>
            <div class="bj-total-display">Summa: <strong>${total}</strong></div>
            <p class="bj-wait">${myStatus === 'bust' ? 'BUST!' : 'Du stannade. Väntar...'}</p>
          `;
        }

      } else if (event.phase === 'results') {
        const myResult = event.results?.find(r => r.id === myId);
        const iAmTrigger = event.triggerId === myId;

        let resultHtml = `<h3>&#9824; Resultat — Runda ${event.round} &#9829;</h3>`;

        if (myResult) {
          const outcomeText = myResult.bust ? 'BUST' : myResult.won ? 'VINST!' : myResult.push ? 'Oavgjort' : 'Förlust';
          const gainText = myResult.coinGain > 0 ? ` +${myResult.coinGain} mynt` : '';
          resultHtml += `
            <div class="bj-hand">
              ${myResult.hand.map(c => `<span class="bj-card-mobile">${c.rank}${c.suit}</span>`).join('')}
            </div>
            <div class="bj-total-display">
              Du: ${myResult.total} vs Dealer: ${event.dealerTotal} ${event.dealerBust ? '(BUST)' : ''}
              <br><strong>${outcomeText}</strong>${gainText}
            </div>
          `;
        }

        if (iAmTrigger) {
          resultHtml += `
            <div style="margin-top:1.5rem;">
              <p style="margin-bottom:0.75rem;font-weight:700;font-size:1.1rem;">Spela igen?</p>
              <div class="bj-actions">
                <button class="btn-hit" id="bj-new-round">Ny runda</button>
                <button class="btn-stand" id="bj-end-game">Avsluta</button>
              </div>
            </div>
          `;
        } else {
          resultHtml += `<p class="bj-wait" style="margin-top:1rem;">Väntar på beslut...</p>`;
        }

        bjArea.innerHTML = resultHtml;

        if (iAmTrigger) {
          document.getElementById('bj-new-round').addEventListener('click', async () => {
            bjArea.querySelectorAll('button').forEach(b => b.disabled = true);
            bjArea.dataset.showingResults = '';
            await DB.playerAction(roomCode, myId, { type: 'bj-continue' });
            bjArea.innerHTML = '<h3>Startar ny runda...</h3>';
          });
          document.getElementById('bj-end-game').addEventListener('click', async () => {
            bjArea.querySelectorAll('button').forEach(b => b.disabled = true);
            bjArea.dataset.showingResults = '';
            await DB.playerAction(roomCode, myId, { type: 'bj-end' });
            bjArea.innerHTML = '<h3>Avslutar...</h3>';
          });
        }
      }
      break;

    case 'sabotage':
      if (event.targetId === myId) {
        showFreeze(event.fromName);
      }
      break;

    case 'game-over':
      document.getElementById('tab-play').innerHTML = `
        <div class="game-over-mobile">
          <h2>Spelet är slut!</h2>
          <div class="mobile-winner">
            <span class="crown">\uD83D\uDC51</span>
            <span style="color:${event.winner.color}">${event.winner.name}</span>
            <span>vann med ${event.winner.points || 0} poäng!</span>
          </div>
          <div class="mobile-rankings">
            ${event.rankings.map((p, i) => `
              <div class="mobile-rank-row">
                <span>#${i+1}</span>
                <div class="player-dot" style="background:${p.color}"></div>
                <span>${p.name}</span>
                <span>\u2605 ${p.points || 0}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      break;
  }
}

// === DICE ===
diceBtn.addEventListener('click', async () => {
  if (diceBtn.disabled) return;
  rolledForTurn = currentTurnId;
  diceBtn.disabled = true;
  await DB.playerAction(roomCode, myId, { type: 'roll-dice' });
});

// Host needs to listen for roll-dice actions — add to host.js flow
// For now, the host's GameEngine polls actions. Let's hook it up properly.

// === SHOP ===
function loadShop() {
  shopItemsEl.innerHTML = SHOP_ITEMS.map(item => `
    <div class="shop-card">
      <div class="shop-info">
        <h4>${item.name}</h4>
        <p>${item.description}</p>
      </div>
      <button class="shop-buy" data-id="${item.id}" data-cost="${item.cost}">
        &#9881; ${item.cost}
      </button>
    </div>
  `).join('');

  shopItemsEl.querySelectorAll('.shop-buy').forEach(btn => {
    btn.addEventListener('click', () => buyItem(btn.dataset.id));
  });
}

async function buyItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return;

  const room = await DB.getRoom(roomCode);
  const me = room?.players?.[myId];
  if (!me || (me.coins || 0) < item.cost) {
    alert('Inte tillräckligt med mynt!');
    return;
  }

  if (item.type === 'instant') {
    // Buy points — handled by host via action
    await DB.playerAction(roomCode, myId, { type: 'buy-item', itemId });
    return;
  }

  if (item.type === 'target') {
    // Need to pick a target player
    const players = room.players ? Object.entries(room.players).filter(([id]) => id !== myId) : [];
    if (players.length === 0) { alert('Inga andra spelare!'); return; }

    const names = players.map(([, p], i) => `${i + 1}. ${p.name}`).join('\n');
    const choice = prompt(`Välj spelare:\n${names}`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= players.length) { alert('Ogiltigt val!'); return; }

    const targetId = players[idx][0];
    await DB.playerAction(roomCode, myId, { type: 'buy-item', itemId, extraData: { targetId } });
    return;
  }

  if (item.type === 'category') {
    const cats = TRIVIA_CATEGORIES.map((c, i) => `${i + 1}. ${c.icon} ${c.name}`).join('\n');
    const choice = prompt(`Välj kategori:\n${cats}`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= TRIVIA_CATEGORIES.length) { alert('Ogiltigt val!'); return; }
    await DB.playerAction(roomCode, myId, { type: 'buy-item', itemId, extraData: { categoryId: TRIVIA_CATEGORIES[idx].id } });
    return;
  }

  if (item.type === 'wheel') {
    const text = prompt('Skriv din regel för lyckohjulet:');
    if (!text) return;
    await DB.addWheelSlice(roomCode, { text, addedBy: myName });
    await DB.updatePlayer(roomCode, myId, { coins: me.coins - item.cost });
    return;
  }

  const items = me.items || [];
  items.push({ id: item.id, name: item.name, usedAt: null });
  await DB.updatePlayer(roomCode, myId, { coins: me.coins - item.cost, items });
}

function renderInventory(items) {
  const active = (items || []).filter(i => !i.usedAt);
  if (active.length === 0) {
    inventoryEl.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Inga föremål ännu</p>';
    return;
  }
  inventoryEl.innerHTML = active.map(i =>
    `<div class="inventory-item">${i.name}</div>`
  ).join('');
}

// === HOUSE RULES ===
const RULE_COST = 3;

ruleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = ruleInput.value.trim();
  if (!text) return;

  const room = await DB.getRoom(roomCode);
  const me = room?.players?.[myId];
  if (!me || (me.coins || 0) < RULE_COST) {
    alert(`Kostar ${RULE_COST} mynt att lägga till en regel!`);
    return;
  }

  await DB.updatePlayer(roomCode, myId, { coins: me.coins - RULE_COST });
  await DB.addHouseRule(roomCode, { text, addedBy: myName });
  ruleInput.value = '';
});

// === TABS ===
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// === FREEZE (sabotage) ===
function showFreeze(byName) {
  const el = document.createElement('div');
  el.className = 'freeze-overlay';
  el.innerHTML = `
    <div class="freeze-content">
      <div class="freeze-icon">\uD83E\uDD76</div>
      <p>Saboterad av ${byName}!</p>
      <p class="freeze-timer">5</p>
    </div>
  `;
  document.body.appendChild(el);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

  let sec = 5;
  const timer = setInterval(() => {
    sec--;
    const t = el.querySelector('.freeze-timer');
    if (t) t.textContent = sec;
    if (sec <= 0) { clearInterval(timer); el.remove(); }
  }, 1000);
}

// === HELPERS ===
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`${name}-screen`).classList.add('active');
}

function bjHandTotal(hand) {
  let total = hand.reduce((s, c) => {
    if (['J','Q','K'].includes(c.rank)) return s + 10;
    if (c.rank === 'A') return s + 11;
    return s + parseInt(c.rank);
  }, 0);
  let aces = hand.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
