// Game logic — runs on the HOST's browser
// This is the "server" — Firebase just syncs the state

const BOARD = [
  { id: 0,  type: 'green' },  { id: 1,  type: 'green' },
  { id: 2,  type: 'yellow' }, { id: 3,  type: 'green' },
  { id: 4,  type: 'blue' },   { id: 5,  type: 'green' },
  { id: 6,  type: 'green' },  { id: 7,  type: 'yellow' },
  { id: 8,  type: 'green' },  { id: 9,  type: 'green' },
  { id: 10, type: 'blue' },   { id: 11, type: 'green' },
  { id: 12, type: 'yellow' }, { id: 13, type: 'green' },
  { id: 14, type: 'green' },  { id: 15, type: 'blue' },
  { id: 16, type: 'green' },  { id: 17, type: 'green' },
  { id: 18, type: 'yellow' }, { id: 19, type: 'green' },
  { id: 20, type: 'blue' },   { id: 21, type: 'green' },
  { id: 22, type: 'green' },  { id: 23, type: 'yellow' }
];

const PLAYER_COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#fd79a8'];

const SHOP_ITEMS = [
  { id: 'wheelSlice', name: 'Hjulfält', description: 'Lägg till en egen regel på Lyckohjulet', cost: 5, type: 'wheel' },
  { id: 'sabotage', name: 'Sabotage', description: 'Frys en motståndares skärm i 5 sek', cost: 15, type: 'usable' },
  { id: 'shield', name: 'Sköld', description: 'Blockerar nästa negativa händelse', cost: 25, type: 'passive' }
];

const WHEEL_SLICES = [
  { text: '+5 Poäng', effect: { type: 'points', value: 5 } },
  { text: '-3 Poäng', effect: { type: 'points', value: -3 } },
  { text: '+10 Mynt', effect: { type: 'coins', value: 10 } },
  { text: 'Byt plats med slumpmässig spelare', effect: { type: 'swap' } },
  { text: '+2 Poäng', effect: { type: 'points', value: 2 } },
  { text: '-5 Mynt', effect: { type: 'coins', value: -5 } },
  { text: 'Alla får +1 Poäng', effect: { type: 'pointsAll', value: 1 } },
  { text: 'Dubbla dina mynt!', effect: { type: 'doubleCoins' } }
];

// ============ GAME ENGINE (runs on host) ============

class GameEngine {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.room = null;
    this.actionListenerActive = false;
  }

  // Start listening to room state
  listen(onUpdate) {
    DB.onRoomChange(this.roomCode, (data) => {
      this.room = data;
      if (onUpdate) onUpdate(data);
    });
  }

  getPlayersArray() {
    if (!this.room || !this.room.players) return [];
    return Object.entries(this.room.players).map(([id, p]) => ({ id, ...p }));
  }

  getCurrentPlayer() {
    const players = this.getPlayersArray();
    if (players.length === 0) return null;
    const turnId = this.room.currentTurn;
    return players.find(p => p.id === turnId) || players[0];
  }

  // Start the game
  async startGame(winCondition, winValue) {
    const players = this.getPlayersArray();
    if (players.length === 0) return;

    await DB.updateRoom(this.roomCode, {
      state: 'playing',
      currentTurn: players[0].id,
      winCondition: winCondition || 'points',
      winValue: winValue || 30,
      startedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // Roll dice for current player
  async rollDice() {
    const player = this.getCurrentPlayer();
    if (!player) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    const oldPos = player.position || 0;
    const newPos = (oldPos + roll) % BOARD.length;
    const tile = BOARD[newPos];

    // Lap bonus
    let coinBonus = 1; // passive income per turn
    if (newPos < oldPos) coinBonus += 5; // completed a lap

    await DB.updatePlayer(this.roomCode, player.id, {
      position: newPos,
      coins: (player.coins || 0) + coinBonus
    });

    await DB.pushEvent(this.roomCode, {
      type: 'dice-rolled',
      playerId: player.id,
      playerName: player.name,
      roll,
      newPosition: newPos,
      tileType: tile.type,
      lapped: newPos < oldPos
    });

    // Handle tile after animation delay
    return { roll, tile, player };
  }

  // Advance to next player's turn
  async advanceTurn() {
    const players = this.getPlayersArray();
    const currentIdx = players.findIndex(p => p.id === this.room.currentTurn);
    const nextIdx = (currentIdx + 1) % players.length;

    // Check win condition
    if (this.room.winCondition === 'points') {
      const winner = players.find(p => (p.points || 0) >= this.room.winValue);
      if (winner) {
        await this.endGame();
        return;
      }
    }

    await DB.updateRoom(this.roomCode, {
      currentTurn: players[nextIdx].id
    });

    await DB.pushEvent(this.roomCode, {
      type: 'turn-changed',
      playerId: players[nextIdx].id,
      playerName: players[nextIdx].name
    });
  }

  // === TRIVIA ===

  async startTrivia() {
    const q = getRandomQuestion();
    await DB.clearActions(this.roomCode);

    await DB.pushEvent(this.roomCode, {
      type: 'trivia',
      phase: 'question',
      question: q.question,
      options: q.options,
      category: q.category,
      correctAnswer: q.correctAnswer
    });

    // Listen for answers
    this.listenForActions((actions) => {
      this.handleTriviaAnswers(actions, q.correctAnswer);
    });

    // Auto-end after 15 seconds
    this._triviaTimeout = setTimeout(() => {
      this.endTrivia();
    }, 15000);
  }

  async handleTriviaAnswers(actions, correctAnswer) {
    const players = this.getPlayersArray();
    const actionEntries = Object.entries(actions);

    for (const [playerId, action] of actionEntries) {
      if (action.type !== 'trivia-answer' || action.processed) continue;

      const player = players.find(p => p.id === playerId);
      if (!player) continue;

      const isCorrect = action.answer === correctAnswer;

      if (isCorrect) {
        // Check if first correct
        const otherCorrect = actionEntries.some(([id, a]) =>
          id !== playerId && a.type === 'trivia-answer' && a.answer === correctAnswer && a.timestamp < action.timestamp
        );

        if (!otherCorrect) {
          await DB.updatePlayer(this.roomCode, playerId, { points: (player.points || 0) + 3 });
        } else {
          await DB.updatePlayer(this.roomCode, playerId, { coins: (player.coins || 0) + 3 });
        }
      }

      // Mark as processed
      await db.ref(`rooms/${this.roomCode}/actions/${playerId}/processed`).set(true);
    }

    // Check if all answered
    if (actionEntries.length >= players.length) {
      this.endTrivia();
    }
  }

  async endTrivia() {
    if (this._triviaTimeout) clearTimeout(this._triviaTimeout);
    this.stopListeningActions();

    await DB.pushEvent(this.roomCode, { type: 'trivia', phase: 'end' });
    await DB.clearActions(this.roomCode);

    setTimeout(() => this.advanceTurn(), 2000);
  }

  // === WHEEL ===

  async startWheel() {
    const customSlices = this.room.wheelCustomSlices
      ? Object.values(this.room.wheelCustomSlices).map(s => ({
          text: `${s.text} (av ${s.addedBy})`,
          effect: { type: 'custom' }
        }))
      : [];

    const allSlices = [...WHEEL_SLICES, ...customSlices];
    const winningIndex = Math.floor(Math.random() * allSlices.length);

    await DB.pushEvent(this.roomCode, {
      type: 'wheel',
      phase: 'spinning',
      slices: allSlices.map(s => s.text),
      winningIndex
    });

    // Apply effect after spin animation
    setTimeout(async () => {
      const result = allSlices[winningIndex];
      const player = this.getCurrentPlayer();
      await this.applyWheelEffect(player, result.effect);

      await DB.pushEvent(this.roomCode, {
        type: 'wheel',
        phase: 'result',
        resultText: result.text
      });

      setTimeout(() => this.advanceTurn(), 2500);
    }, 4000);
  }

  async applyWheelEffect(player, effect) {
    if (!effect || !player) return;

    // Check shield for negative effects
    if ((effect.type === 'points' && effect.value < 0) || (effect.type === 'coins' && effect.value < 0)) {
      const items = player.items || [];
      const shieldIdx = items.findIndex(i => i.id === 'shield' && !i.usedAt);
      if (shieldIdx !== -1) {
        items[shieldIdx].usedAt = Date.now();
        await DB.updatePlayer(this.roomCode, player.id, { items });
        await DB.pushEvent(this.roomCode, { type: 'shield-used', playerName: player.name });
        return;
      }
    }

    const players = this.getPlayersArray();

    switch (effect.type) {
      case 'points':
        await DB.updatePlayer(this.roomCode, player.id, {
          points: Math.max(0, (player.points || 0) + effect.value)
        });
        break;
      case 'coins':
        await DB.updatePlayer(this.roomCode, player.id, {
          coins: Math.max(0, (player.coins || 0) + effect.value)
        });
        break;
      case 'swap':
        const others = players.filter(p => p.id !== player.id);
        if (others.length > 0) {
          const target = others[Math.floor(Math.random() * others.length)];
          await DB.updatePlayer(this.roomCode, player.id, { position: target.position });
          await DB.updatePlayer(this.roomCode, target.id, { position: player.position });
        }
        break;
      case 'pointsAll':
        for (const p of players) {
          await DB.updatePlayer(this.roomCode, p.id, { points: (p.points || 0) + effect.value });
        }
        break;
      case 'doubleCoins':
        await DB.updatePlayer(this.roomCode, player.id, { coins: (player.coins || 0) * 2 });
        break;
    }
  }

  // === BLACKJACK ===

  async startBlackjack() {
    const players = this.getPlayersArray();
    const deck = this.createDeck();

    const dealerHand = [deck.pop(), deck.pop()];
    const playerHands = {};
    const playerStatus = {};

    for (const p of players) {
      playerHands[p.id] = [deck.pop(), deck.pop()];
      playerStatus[p.id] = 'playing';
    }

    await DB.clearActions(this.roomCode);

    await DB.pushEvent(this.roomCode, {
      type: 'blackjack',
      phase: 'playing',
      deck,
      dealerHand,
      playerHands,
      playerStatus
    });

    this.listenForActions((actions) => {
      this.handleBlackjackActions(actions);
    });
  }

  async handleBlackjackActions(actions) {
    const event = this.room.currentEvent;
    if (!event || event.type !== 'blackjack' || event.phase !== 'playing') return;

    let { deck, dealerHand, playerHands, playerStatus } = event;
    let changed = false;

    for (const [playerId, action] of Object.entries(actions)) {
      if (action.type !== 'bj-action' || action.processed) continue;
      if (playerStatus[playerId] !== 'playing') continue;

      if (action.action === 'hit') {
        playerHands[playerId].push(deck.pop());
        if (this.bjHandTotal(playerHands[playerId]) > 21) {
          playerStatus[playerId] = 'bust';
        }
      } else if (action.action === 'stand') {
        playerStatus[playerId] = 'stand';
      }

      await db.ref(`rooms/${this.roomCode}/actions/${playerId}/processed`).set(true);
      changed = true;
    }

    if (changed) {
      await DB.pushEvent(this.roomCode, {
        type: 'blackjack',
        phase: 'playing',
        deck, dealerHand, playerHands, playerStatus
      });

      // Check if all done
      const allDone = Object.values(playerStatus).every(s => s === 'stand' || s === 'bust');
      if (allDone) {
        await DB.clearActions(this.roomCode);
        this.stopListeningActions();
        await this.resolveBlackjack(deck, dealerHand, playerHands, playerStatus);
      }
    }
  }

  async resolveBlackjack(deck, dealerHand, playerHands, playerStatus) {
    // Dealer draws to 17
    while (this.bjHandTotal(dealerHand) < 17) {
      dealerHand.push(deck.pop());
    }
    const dealerTotal = this.bjHandTotal(dealerHand);
    const dealerBust = dealerTotal > 21;

    const players = this.getPlayersArray();
    const results = [];
    let bestScore = -1;
    let winnerId = null;

    for (const p of players) {
      const total = this.bjHandTotal(playerHands[p.id]);
      const bust = playerStatus[p.id] === 'bust';
      const won = !bust && (dealerBust || total > dealerTotal);

      if (won) {
        await DB.updatePlayer(this.roomCode, p.id, {
          points: (p.points || 0) + 5,
          coins: (p.coins || 0) + 3
        });
      } else if (!bust && total === dealerTotal) {
        await DB.updatePlayer(this.roomCode, p.id, { coins: (p.coins || 0) + 2 });
      }

      if (!bust && total > bestScore) {
        bestScore = total;
        winnerId = p.id;
      }

      results.push({ id: p.id, name: p.name, color: p.color, hand: playerHands[p.id], total, bust, won });
    }

    if (winnerId) {
      const w = players.find(p => p.id === winnerId);
      await DB.updatePlayer(this.roomCode, winnerId, { points: (w.points || 0) + 3 });
    }

    await DB.pushEvent(this.roomCode, {
      type: 'blackjack',
      phase: 'results',
      dealerHand, dealerTotal, dealerBust,
      results
    });

    setTimeout(async () => {
      await DB.clearEvent(this.roomCode);
      this.advanceTurn();
    }, 5000);
  }

  createDeck() {
    const suits = ['♠','♥','♦','♣'];
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const deck = [];
    for (const s of suits) for (const r of ranks) deck.push({ rank: r, suit: s });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  bjCardStr(c) { return `${c.rank}${c.suit}`; }

  bjHandTotal(hand) {
    let total = hand.reduce((s, c) => {
      if (['J','Q','K'].includes(c.rank)) return s + 10;
      if (c.rank === 'A') return s + 11;
      return s + parseInt(c.rank);
    }, 0);
    let aces = hand.filter(c => c.rank === 'A').length;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  // === SABOTAGE ===

  async useSabotage(fromPlayerId, targetPlayerId) {
    const players = this.getPlayersArray();
    const from = players.find(p => p.id === fromPlayerId);
    const target = players.find(p => p.id === targetPlayerId);
    if (!from || !target) return;

    // Remove sabotage from inventory
    const items = from.items || [];
    const idx = items.findIndex(i => i.id === 'sabotage' && !i.usedAt);
    if (idx === -1) return;
    items[idx].usedAt = Date.now();
    await DB.updatePlayer(this.roomCode, fromPlayerId, { items });

    // Check shield
    const targetItems = target.items || [];
    const shieldIdx = targetItems.findIndex(i => i.id === 'shield' && !i.usedAt);
    if (shieldIdx !== -1) {
      targetItems[shieldIdx].usedAt = Date.now();
      await DB.updatePlayer(this.roomCode, targetPlayerId, { items: targetItems });
      await DB.pushEvent(this.roomCode, { type: 'shield-used', playerName: target.name });
      return;
    }

    await DB.pushEvent(this.roomCode, {
      type: 'sabotage',
      targetId: targetPlayerId,
      targetName: target.name,
      fromName: from.name
    });
  }

  // === BUY ITEM ===

  async buyItem(playerId, itemId, extraData) {
    const player = this.getPlayersArray().find(p => p.id === playerId);
    if (!player) return { error: 'Spelare hittades inte' };

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return { error: 'Föremålet finns inte' };
    if ((player.coins || 0) < item.cost) return { error: 'Inte tillräckligt med mynt' };

    const newCoins = player.coins - item.cost;

    if (item.type === 'wheel' && extraData?.text) {
      await DB.addWheelSlice(this.roomCode, { text: extraData.text, addedBy: player.name });
      await DB.updatePlayer(this.roomCode, playerId, { coins: newCoins });
      return { success: true };
    }

    const items = player.items || [];
    items.push({ id: item.id, name: item.name, usedAt: null });
    await DB.updatePlayer(this.roomCode, playerId, { coins: newCoins, items });
    return { success: true };
  }

  // === TILE HANDLER ===

  async handleTile(tileType) {
    switch (tileType) {
      case 'green': await this.startTrivia(); break;
      case 'yellow': await this.startWheel(); break;
      case 'blue': await this.startBlackjack(); break;
      default: await this.advanceTurn();
    }
  }

  // === END GAME ===

  async endGame() {
    const players = this.getPlayersArray().sort((a, b) => (b.points || 0) - (a.points || 0));
    await DB.updateRoom(this.roomCode, { state: 'finished' });
    await DB.pushEvent(this.roomCode, {
      type: 'game-over',
      rankings: players,
      winner: players[0]
    });
  }

  // === ACTION LISTENERS ===

  listenForActions(callback) {
    this.stopListeningActions();
    this.actionListenerActive = true;
    DB.onActions(this.roomCode, (actions) => {
      if (this.actionListenerActive && Object.keys(actions).length > 0) {
        callback(actions);
      }
    });
  }

  stopListeningActions() {
    this.actionListenerActive = false;
    db.ref(`rooms/${this.roomCode}/actions`).off();
  }

  // Timer-based win condition
  startTimer(minutes) {
    this._gameTimer = setTimeout(() => {
      this.endGame();
    }, minutes * 60 * 1000);
  }
}
