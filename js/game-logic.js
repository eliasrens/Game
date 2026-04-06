// Game logic — runs on the HOST's browser
// This is the "server" — Firebase just syncs the state

// Available minigames — add new ones here
const AVAILABLE_MINIGAMES = [
  { id: 'blackjack', name: 'Blackjack', icon: '🃏', description: 'Slå dealern! Närmast 21 vinner.' }
  // Future games:
  // { id: 'higher-lower', name: 'Högre eller Lägre', icon: '📊', description: 'Gissa om nästa tal är högre eller lägre.' },
  // { id: 'reaction', name: 'Reaktionstest', icon: '⚡', description: 'Snabbaste reflexerna vinner!' },
];

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
  { id: 'buyPoints', name: 'Köp 5 Poäng', description: 'Köp 5 poäng direkt', cost: 10, type: 'instant' },
  { id: 'stealPoints', name: 'Ta 5 Poäng', description: 'Ta bort 5 poäng från en valfri spelare', cost: 10, type: 'target' },
  { id: 'changeCategory', name: 'Byt kategori', description: 'Byt trivia-kategori till valfri', cost: 5, type: 'category' },
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
      winValue: winValue || 100,
      activeCategory: 'blandat',
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
    const lapped = newPos < oldPos;
    if (lapped) coinBonus += 5;

    await DB.updatePlayer(this.roomCode, player.id, {
      position: newPos,
      coins: (player.coins || 0) + coinBonus
    });

    // If player lapped, let them choose a trivia category
    if (lapped) {
      this._pendingCategoryChoice = player.id;
    }

    await DB.pushEvent(this.roomCode, {
      type: 'dice-rolled',
      playerId: player.id,
      playerName: player.name,
      roll,
      newPosition: newPos,
      tileType: tile.type,
      lapped
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
    const cat = this.room.activeCategory;
    const q = cat ? getQuestionFromCategory(cat) : getRandomQuestion();
    if (!q) { await this.advanceTurn(); return; }
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

      setTimeout(() => this.advanceTurn(), 6000);
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
    this._bjRound = 1;
    this._bjTriggerId = this.room.currentTurn; // player who landed on the tile
    await this.startBlackjackBetting();
  }

  // Phase 1: Betting
  async startBlackjackBetting() {
    await DB.clearActions(this.roomCode);

    await DB.pushEvent(this.roomCode, {
      type: 'blackjack',
      phase: 'betting',
      round: this._bjRound,
      minBet: 1,
      maxBet: 20
    });

    this.listenForActions((actions) => {
      this.handleBlackjackBets(actions);
    });

    // Auto-start after 15 seconds if not everyone has bet
    this._bjBetTimeout = setTimeout(() => {
      this.startBlackjackRound();
    }, 15000);
  }

  async handleBlackjackBets(actions) {
    const players = this.getPlayersArray();
    const bets = {};
    let betCount = 0;

    for (const [playerId, action] of Object.entries(actions)) {
      if (action.type === 'bj-bet' && !action.processed) {
        bets[playerId] = action.amount || 0;
        betCount++;
      }
    }

    // All players have bet
    if (betCount >= players.length) {
      clearTimeout(this._bjBetTimeout);
      await this.startBlackjackRound(bets);
    }
  }

  // Phase 2: Playing
  async startBlackjackRound(bets) {
    this.stopListeningActions();

    const players = this.getPlayersArray();
    const deck = this.createDeck();
    const dealerHand = [deck.pop(), deck.pop()];
    const playerHands = {};
    const playerStatus = {};

    // Collect bets from actions if not passed
    if (!bets) {
      const room = await DB.getRoom(this.roomCode);
      const actions = room?.actions || {};
      bets = {};
      for (const [playerId, action] of Object.entries(actions)) {
        if (action.type === 'bj-bet') {
          bets[playerId] = action.amount || 0;
        }
      }
    }

    // Deduct bets from players and store
    const playerBets = {};
    for (const p of players) {
      const bet = Math.min(bets[p.id] || 0, p.coins || 0);
      playerBets[p.id] = bet;
      if (bet > 0) {
        await DB.updatePlayer(this.roomCode, p.id, { coins: (p.coins || 0) - bet });
      }
      playerHands[p.id] = [deck.pop(), deck.pop()];
      playerStatus[p.id] = 'playing';
    }

    await DB.clearActions(this.roomCode);

    await DB.pushEvent(this.roomCode, {
      type: 'blackjack',
      phase: 'playing',
      round: this._bjRound,
      deck,
      dealerHand,
      playerHands,
      playerStatus,
      playerBets
    });

    this.listenForActions((actions) => {
      this.handleBlackjackActions(actions);
    });
  }

  async handleBlackjackActions(actions) {
    const event = this.room.currentEvent;
    if (!event || event.type !== 'blackjack' || event.phase !== 'playing') return;

    let { deck, dealerHand, playerHands, playerStatus, playerBets } = event;
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
        round: this._bjRound,
        deck, dealerHand, playerHands, playerStatus, playerBets
      });

      const allDone = Object.values(playerStatus).every(s => s === 'stand' || s === 'bust');
      if (allDone) {
        await DB.clearActions(this.roomCode);
        this.stopListeningActions();
        await this.resolveBlackjack(deck, dealerHand, playerHands, playerStatus, playerBets);
      }
    }
  }

  // Phase 3: Results
  async resolveBlackjack(deck, dealerHand, playerHands, playerStatus, playerBets) {
    while (this.bjHandTotal(dealerHand) < 17) {
      dealerHand.push(deck.pop());
    }
    const dealerTotal = this.bjHandTotal(dealerHand);
    const dealerBust = dealerTotal > 21;

    const players = this.getPlayersArray();
    const results = [];

    for (const p of players) {
      const total = this.bjHandTotal(playerHands[p.id]);
      const bust = playerStatus[p.id] === 'bust';
      const won = !bust && (dealerBust || total > dealerTotal);
      const push = !bust && !dealerBust && total === dealerTotal;
      const bet = playerBets[p.id] || 0;

      let coinGain = 0;
      if (won) {
        // Beat the dealer — get bet back + win same amount (double)
        coinGain = bet * 2;
      } else if (push) {
        // Tie — get bet back
        coinGain = bet;
      }
      // Bust/lose — coins already deducted

      if (coinGain > 0) {
        await DB.updatePlayer(this.roomCode, p.id, {
          coins: (p.coins || 0) + coinGain
        });
      }

      results.push({ id: p.id, name: p.name, color: p.color, hand: playerHands[p.id], total, bust, won, push, bet, coinGain });
    }

    await DB.pushEvent(this.roomCode, {
      type: 'blackjack',
      phase: 'results',
      round: this._bjRound,
      dealerHand, dealerTotal, dealerBust,
      results,
      triggerId: this._bjTriggerId
    });

    // Wait for trigger player to decide: new round or end
    await DB.clearActions(this.roomCode);
    this.listenForActions((actions) => {
      const triggerAction = actions[this._bjTriggerId];
      if (!triggerAction || triggerAction.processed) return;

      if (triggerAction.type === 'bj-continue') {
        db.ref(`rooms/${this.roomCode}/actions/${this._bjTriggerId}/processed`).set(true);
        this.stopListeningActions();
        this._bjRound++;
        this.startBlackjackBetting();
      } else if (triggerAction.type === 'bj-end') {
        db.ref(`rooms/${this.roomCode}/actions/${this._bjTriggerId}/processed`).set(true);
        this.stopListeningActions();
        this.endBlackjack();
      }
    });

    // Auto-end after 15 seconds if trigger player doesn't decide
    this._bjDecideTimeout = setTimeout(() => {
      this.stopListeningActions();
      this.endBlackjack();
    }, 15000);
  }

  async endBlackjack() {
    clearTimeout(this._bjDecideTimeout);
    await DB.clearActions(this.roomCode);
    await DB.clearEvent(this.roomCode);
    this.advanceTurn();
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

    if (item.type === 'instant' && item.id === 'buyPoints') {
      await DB.updatePlayer(this.roomCode, playerId, {
        coins: newCoins,
        points: (player.points || 0) + 5
      });
      return { success: true };
    }

    if (item.type === 'target' && item.id === 'stealPoints') {
      const targetId = extraData?.targetId;
      if (!targetId) return { error: 'Ingen spelare vald' };
      const target = this.getPlayersArray().find(p => p.id === targetId);
      if (!target) return { error: 'Spelaren finns inte' };
      await DB.updatePlayer(this.roomCode, playerId, { coins: newCoins });
      await DB.updatePlayer(this.roomCode, targetId, {
        points: Math.max(0, (target.points || 0) - 5)
      });
      return { success: true };
    }

    if (item.type === 'category' && item.id === 'changeCategory') {
      const categoryId = extraData?.categoryId;
      if (!categoryId) return { error: 'Ingen kategori vald' };
      await DB.updatePlayer(this.roomCode, playerId, { coins: newCoins });
      await DB.updateRoom(this.roomCode, { activeCategory: categoryId });
      return { success: true };
    }

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
    // If player lapped, let them choose category first
    if (this._pendingCategoryChoice) {
      await this.startCategorySelect(this._pendingCategoryChoice);
      this._pendingCategoryChoice = null;
      // After category is chosen, continue with tile
      this._pendingTile = tileType;
      return;
    }

    switch (tileType) {
      case 'green': await this.startTrivia(); break;
      case 'yellow': await this.startWheel(); break;
      case 'blue': await this.startMinigameSelect(); break;
      default: await this.advanceTurn();
    }
  }

  async startCategorySelect(playerId) {
    const player = this.getPlayersArray().find(p => p.id === playerId);
    await DB.clearActions(this.roomCode);

    await DB.pushEvent(this.roomCode, {
      type: 'category-select',
      chooserId: playerId,
      chooserName: player?.name || '?',
      categories: TRIVIA_CATEGORIES
    });

    this.listenForActions((actions) => {
      const choice = actions[playerId];
      if (!choice || choice.type !== 'category-choice' || choice.processed) return;

      db.ref(`rooms/${this.roomCode}/actions/${playerId}/processed`).set(true);
      this.stopListeningActions();
      clearTimeout(this._categoryTimeout);

      DB.updateRoom(this.roomCode, { activeCategory: choice.categoryId }).then(() => {
        const tile = this._pendingTile;
        this._pendingTile = null;
        switch (tile) {
          case 'green': this.startTrivia(); break;
          case 'yellow': this.startWheel(); break;
          case 'blue': this.startMinigameSelect(); break;
          default: this.advanceTurn();
        }
      });
    });

    this._categoryTimeout = setTimeout(() => {
      this.stopListeningActions();
      const tile = this._pendingTile;
      this._pendingTile = null;
      switch (tile) {
        case 'green': this.startTrivia(); break;
        case 'yellow': this.startWheel(); break;
        case 'blue': this.startMinigameSelect(); break;
        default: this.advanceTurn();
      }
    }, 10000);
  }

  // === MINIGAME SELECT ===

  async startMinigameSelect() {
    const chooserId = this.room.currentTurn;
    const chooser = this.getPlayersArray().find(p => p.id === chooserId);
    await DB.clearActions(this.roomCode);

    await DB.pushEvent(this.roomCode, {
      type: 'minigame-select',
      chooserId,
      chooserName: chooser?.name || '?',
      games: AVAILABLE_MINIGAMES
    });

    this.listenForActions((actions) => {
      const choice = actions[chooserId];
      if (!choice || choice.type !== 'minigame-choice' || choice.processed) return;

      db.ref(`rooms/${this.roomCode}/actions/${chooserId}/processed`).set(true);
      this.stopListeningActions();
      clearTimeout(this._selectTimeout);
      this.launchMinigame(choice.gameId);
    });

    // Auto-pick first game after 15 seconds
    this._selectTimeout = setTimeout(() => {
      this.stopListeningActions();
      this.launchMinigame(AVAILABLE_MINIGAMES[0].id);
    }, 15000);
  }

  async launchMinigame(gameId) {
    await DB.clearActions(this.roomCode);
    switch (gameId) {
      case 'blackjack': await this.startBlackjack(); break;
      // Add more minigames here:
      // case 'higher-lower': await this.startHigherLower(); break;
      default: await this.startBlackjack();
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
    this._actionCallback = (snap) => {
      const actions = snap.val() || {};
      if (this.actionListenerActive && Object.keys(actions).length > 0) {
        callback(actions);
      }
    };
    db.ref(`rooms/${this.roomCode}/actions`).on('value', this._actionCallback);
  }

  stopListeningActions() {
    this.actionListenerActive = false;
    if (this._actionCallback) {
      db.ref(`rooms/${this.roomCode}/actions`).off('value', this._actionCallback);
      this._actionCallback = null;
    }
  }

  // Timer-based win condition
  startTimer(minutes) {
    this._gameTimer = setTimeout(() => {
      this.endGame();
    }, minutes * 60 * 1000);
  }
}
