// Database helper — thin wrapper around Firebase Realtime Database
// All game state lives under /rooms/{roomCode}

const DB = {
  // Generate a 4-letter room code
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  },

  // Room reference
  roomRef(code) {
    return db.ref(`rooms/${code}`);
  },

  // Create a new room
  async createRoom(code, hostId) {
    await db.ref(`rooms/${code}`).set({
      hostId,
      state: 'lobby',
      players: {},
      currentTurn: '',
      houseRules: [],
      wheelCustomSlices: [],
      winCondition: 'points',
      winValue: 30,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
  },

  // Add a player to a room
  async joinRoom(code, playerId, name, color) {
    await db.ref(`rooms/${code}/players/${playerId}`).set({
      name,
      color,
      position: 0,
      points: 0,
      coins: 0,
      items: [],
      connected: true
    });
  },

  // Update a specific field in the room
  async updateRoom(code, updates) {
    await db.ref(`rooms/${code}`).update(updates);
  },

  // Update a specific player
  async updatePlayer(code, playerId, updates) {
    await db.ref(`rooms/${code}/players/${playerId}`).update(updates);
  },

  // Listen to the full room state
  onRoomChange(code, callback) {
    db.ref(`rooms/${code}`).on('value', (snap) => {
      callback(snap.val());
    });
  },

  // Listen to a specific child
  onChildChange(code, path, callback) {
    db.ref(`rooms/${code}/${path}`).on('value', (snap) => {
      callback(snap.val());
    });
  },

  // Write an event (trivia, wheel, minigame, etc.)
  async pushEvent(code, event) {
    await db.ref(`rooms/${code}/currentEvent`).set({
      ...event,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  },

  // Clear current event
  async clearEvent(code) {
    await db.ref(`rooms/${code}/currentEvent`).remove();
  },

  // Player submits an action (answer, hit/stand, etc.)
  async playerAction(code, playerId, action) {
    await db.ref(`rooms/${code}/actions/${playerId}`).set({
      ...action,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  },

  // Clear all actions
  async clearActions(code) {
    await db.ref(`rooms/${code}/actions`).remove();
  },

  // Listen to player actions
  onActions(code, callback) {
    db.ref(`rooms/${code}/actions`).on('value', (snap) => {
      callback(snap.val() || {});
    });
  },

  // Add house rule
  async addHouseRule(code, rule) {
    await db.ref(`rooms/${code}/houseRules`).push(rule);
  },

  // Add custom wheel slice
  async addWheelSlice(code, slice) {
    await db.ref(`rooms/${code}/wheelCustomSlices`).push(slice);
  },

  // Delete room on disconnect (cleanup)
  onDisconnectRemove(code) {
    db.ref(`rooms/${code}`).onDisconnect().remove();
  },

  // Player disconnect flag
  onPlayerDisconnect(code, playerId) {
    db.ref(`rooms/${code}/players/${playerId}/connected`).onDisconnect().set(false);
  },

  // Check if room exists
  async roomExists(code) {
    const snap = await db.ref(`rooms/${code}`).once('value');
    return snap.exists();
  },

  // Get room once
  async getRoom(code) {
    const snap = await db.ref(`rooms/${code}`).once('value');
    return snap.val();
  },

  // Get player count
  async getPlayerCount(code) {
    const snap = await db.ref(`rooms/${code}/players`).once('value');
    const players = snap.val();
    return players ? Object.keys(players).length : 0;
  }
};
