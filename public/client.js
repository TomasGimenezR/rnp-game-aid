const socket = io();
let currentUser = null;
let currentGameRoom = null;
let pendingGameRoomJoin = null;
let currentGameMode = 'combat';

// DOM Elements
const loginPage = document.getElementById('loginPage');
const gameRoomsPage = document.getElementById('gameRoomsPage');
const gameRoomPage = document.getElementById('gameRoomPage');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const successEl = document.getElementById('success');
const usernameInput = document.getElementById('usernameInput');
const gameRoomNameInput = document.getElementById('gameRoomNameInput');
const heroNameInput = document.getElementById('heroNameInput');
const gameRoomsList = document.getElementById('gameRoomsList');
const messageInput = document.getElementById('messageInput');
const messages = document.getElementById('messages');
const hopeTracker = document.getElementById('hopeTracker');
const currentGameRoomName = document.getElementById('currentGameRoomName');

// Socket event listeners
socket.on('connect', () => {
  updateStatus('Connected', true);
});

socket.on('disconnect', () => {
  updateStatus('Disconnected', false);
  currentUser = null;
  currentGameRoom = null;
  showPage('loginPage');
});

socket.on('login_success', (data) => {
  currentUser = data;
  showSuccess(`Welcome, ${data.username}!`);
  getGameRooms();
  showPage('gameRoomsPage');
  usernameInput.value = '';
});

socket.on('login_error', (error) => {
  showError(error);
});

socket.on('create:gameRoom', (data) => {
  currentGameRoom = { gameRoomId: data.gameRoomId, name: data.gameRoomName, members: data.members, emOnline: data.emOnline };
  showSuccess(`Game Room "${data.gameRoomName}" created!`);
  closeCreateGameRoomModal();
  getGameRooms();
});

socket.on('join:gameRoom', (data) => {
  currentGameRoom = { gameRoomId: data.gameRoomId, name: data.gameRoomName, members: data.members, emOnline: data.emOnline };
  hopeTracker.textContent = data.hero.hope;
  showSuccess(`Joined gameRoom "${data.gameRoomName}"`);
  closeHeroNameModal();
  showPage('gameRoomPage');
  messages.innerHTML = '';
  updateGameRoomHeader();
});

socket.on('player_joined', (data) => {
  if (currentGameRoom && currentGameRoom.gameRoomId === data.gameRoomId) {
    showPage('gameRoomPage');
    messages.innerHTML = '';
    updateGameRoomHeader();
  }
})

socket.on('gameRoom_members_updated', (data) => {
  if (currentGameRoom && currentGameRoom.gameRoomId === data.gameRoomId) {
    currentGameRoom.members = data.members;
    currentGameRoom.emOnline = data.emOnline;
    updateGameRoomHeader();
  }
});

socket.on('list:gameRooms', (gameRoomsList_data) => {
  displayGameRooms(gameRoomsList_data);
});

socket.on('gameRoom_list_updated', (gameRoomsList_data) => {
  displayGameRooms(gameRoomsList_data);
});

socket.on('new_message', (data) => {
  if (currentGameRoom) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    const time = new Date(data.timestamp).toLocaleTimeString();
    messageEl.innerHTML = `
      <div class="message-heroname">${escapeHtml(data.username)}</div>
      <div class="message-text">${escapeHtml(data.message)}</div>
      <div class="message-time">${time}</div>
    `;
    messages.appendChild(messageEl);
    messages.scrollTop = messages.scrollHeight;
  }
});

socket.on('action_roll_result', (data) => {
  const { text, madeAnEscape } = data;
  let { hero } = data;
  console.log('Made an Escape:', madeAnEscape);
  if (hero == null)
    hero = { name: 'Unknown Hero' };
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-heroname">${escapeHtml(hero.name)}</div>
    <div class="message-text"><strong>Action Roll Results:</strong> ${text}</div>
    ${madeAnEscape ? '<div class="message-escape"><em> Made an Escape! </em></div>' : ''}
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('show:hope', (data) => {
  const { hero } = data;
  hopeTracker.textContent = hero.hope;
});

socket.on('update:hero', (data) => {
  const { hero } = data;
  hopeTracker.textContent = hero.hope;
});

socket.on('spend:hope', (data) => {
  const { hero } = data;
  hopeTracker.textContent = hero.hope;
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-heroname">${escapeHtml(hero.name)}</div>
    <div class="message-text"><strong>Spent Hope!</strong></div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('dice_pool_updated', (data) => {
  const { heroName, dicePool } = data;
  const dicePoolText = "🟨 ".repeat(dicePool.hero) + "🟥 ".repeat(dicePool.red) + "⬛ ".repeat(dicePool.black);
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-heroname">${escapeHtml(heroName)}</div>
    <div class="message-text"><strong>Dice Pool Updated:</strong> ${dicePoolText || '(empty)'}</div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('dice_pool_reset', (data) => {
  const { heroName } = data;
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-heroname">${escapeHtml(heroName)}</div>
    <div class="message-text"><strong>Dice Pool Reset!</strong></div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('error', (error) => {
  showError(error);
});

socket.on('game_mode_changed', (data) => {
  const { mode } = data;
  updateGameMode(mode);
});

// Functions
function showPage(pageName) {
  loginPage.style.display = pageName === 'loginPage' ? 'flex' : 'none';
  gameRoomsPage.style.display = pageName === 'gameRoomsPage' ? 'flex' : 'none';
  gameRoomPage.style.display = pageName === 'gameRoomPage' ? 'flex' : 'none';
}

function login() {
  const username = usernameInput.value.trim();
  if (!username) {
    showError('Please enter a username');
    return;
  }
  socket.emit('login', username);
}

function openCreateGameRoomModal() {
  document.getElementById('createRoomModal').classList.add('show');
  document.getElementById('gameRoomNameInput').focus();
}

function closeCreateGameRoomModal() {
  document.getElementById('createRoomModal').classList.remove('show');
  document.getElementById('gameRoomNameInput').value = '';
}

function createGameRoom() {
  if (!currentUser) {
    showError('An error occurred. Please refresh the page and login again.');
    return;
  }
  const gameRoomName = gameRoomNameInput.value.trim();
  if (!gameRoomName) {
    showError('Please enter a game room name');
    return;
  }
  socket.emit('create:gameRoom', { gameName: gameRoomName });
  gameRoomNameInput.value = '';
}

function joinGameRoom(gameRoomId) {
  if (!currentUser) {
    showError('An error occurred. Please refresh the page and login again.');
    return;
  }
  pendingGameRoomJoin = gameRoomId;
  document.getElementById('heroNameModal').classList.add('show');
  heroNameInput.focus();
}

function confirmHeroName() {
  const heroName = heroNameInput.value.trim();
  if (!heroName) {
    showError('Hero name cannot be empty');
    return;
  }
  if (!pendingGameRoomJoin) {
    showError('Error: No game room selected');
    return;
  }

  const data = {
    gameRoomId: pendingGameRoomJoin,
    heroName: heroName,
    heroArchetypeId: 1,
    heroPathId: 1
  };
  socket.emit('join:gameRoom', data);
  heroNameInput.value = '';
}

function cancelJoinRoom() {
  closeHeroNameModal();
  pendingGameRoomJoin = null;
}

function closeHeroNameModal() {
  document.getElementById('heroNameModal').classList.remove('show');
  heroNameInput.value = '';
}

function confirmLeaveGameRoom() {
  document.getElementById('leaveConfirmModal').classList.add('show');
}

function closeLeaveConfirmModal() {
  document.getElementById('leaveConfirmModal').classList.remove('show');
}

function leaveGameRoom() {
  if (!currentGameRoom) return;
  closeLeaveConfirmModal();
  socket.emit('leave:gameRoom');
  currentGameRoom = null;
  getGameRooms();
  showPage('gameRoomsPage');
}

function toggleGameMode() {
  const newMode = currentGameMode === 'combat' ? 'downtime' : 'combat';
  socket.emit('change_game_mode', { mode: newMode });
}

function updateGameMode(mode) {
  currentGameMode = mode;
  const modeDisplay = document.getElementById('gameModeDisplay');
  modeDisplay.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  modeDisplay.classList.remove('downtime');
  if (mode === 'downtime') {
    modeDisplay.classList.add('downtime');
  }
}

function sendMessage() {
  if (!currentGameRoom) {
    showError('Not in a game room');
    return;
  }
  const message = messageInput.value.trim();
  if (!message) return;
  socket.emit('send_message', message);
  messageInput.value = '';
}

function getGameRooms() {
  socket.emit('get:gameRooms');
}

function displayGameRooms(gameRoomsList_data) {
  if (gameRoomsList_data.length === 0) {
    gameRoomsList.innerHTML = '<p style="color: #999; text-align: center; grid-column: 1/-1;">No game rooms available</p>';
    return;
  }

  gameRoomsList.innerHTML = gameRoomsList_data.map(gameRoom => `
    <div class="gameRoom-item">
      <div class="gameRoom-item-name">${escapeHtml(gameRoom.name)}</div>
      <div class="gameRoom-item-info">EM: ${escapeHtml(gameRoom.em.username)}</div>
      <div class="gameRoom-item-members">Players (${gameRoom.playerCount}): ${gameRoom.players ? gameRoom.players.join(', ') : '-'}</div>
      <button class="gameRoom-item-button" onclick="joinGameRoom('${gameRoom.gameRoomId}')">Join as Player</button>
    </div>
  `).join('');
}

function updateGameRoomHeader() {
  if (currentGameRoom) {
    currentRoomName.textContent = currentGameRoom.name;
    const emStatusEl = document.getElementById('emStatus');
    if (emStatusEl) {
      emStatusEl.textContent = currentGameRoom.emOnline ? '' : 'EM offline';
      emStatusEl.style.display = currentGameRoom.emOnline ? 'none' : 'block';
    }
  }
}

function updateStatus(text, connected) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (connected ? ' connected' : '');
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.add('show');
  setTimeout(() => {
    errorEl.classList.remove('show');
  }, 4000);
}

function showSuccess(message) {
  successEl.textContent = message;
  successEl.classList.add('show');
  setTimeout(() => {
    successEl.classList.remove('show');
  }, 3000);
}

function actionRoll() {
  socket.emit('action_roll');
}

function forcedRoll() {
  socket.emit('forced_roll');
}

function resetDicePool() {
  socket.emit('reset_dice_pool');
}

function replaceForRedDie() {
  socket.emit('replace:red');
}

function addRedDie() {
  socket.emit('add:red');
}

function subtractRedDie() {
  socket.emit('subtract:red');
}

function replaceForBlackDie() {
  socket.emit('replace:black');
}

function addBlackDie() {
  socket.emit('add:black');
}

function subtractBlackDie() {
  socket.emit('subtract:black');
}

function addOneHope() {
  socket.emit('set:hope', "+1");
}

function setHope() {
  const hopeValue = prompt("Set Hope to what value? (Enter a number)");
  if (!hopeValue || isNaN(hopeValue) || parseInt(hopeValue) < 0) {
    showError('Please enter a valid number for Hope');
    return;
  }
  socket.emit('set:hope', parseInt(hopeValue));
}

function spendHope() {
  const hopeSpent = prompt("How much Hope are you spending? (Enter a number)");
  if (!hopeSpent || isNaN(hopeSpent) || parseInt(hopeSpent) < 0) {
    showError('Please enter a valid number for Hope');
    return;
  }
  socket.emit('spend:hope', parseInt(hopeSpent));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Allow Enter key to submit
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') login();
});

gameRoomNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') createGameRoom();
});

heroNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') confirmHeroName();
});

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function setDice() {
  const modal = document.getElementById('diceModal');
  modal.classList.add('show');
  document.getElementById('heroInput').focus();
}

function closeDiceModal() {
  const modal = document.getElementById('diceModal');
  modal.classList.remove('show');
}

function submitDicePool() {
  const hero = parseInt(document.getElementById('heroInput').value) || 0;
  const red = parseInt(document.getElementById('redInput').value) || 0;
  const black = parseInt(document.getElementById('blackInput').value) || 0;

  if (hero < 0 || red < 0 || black < 0) {
    showError('Dice counts cannot be negative');
    return;
  }

  socket.emit('set:dice', { hero, red, black });
  closeDiceModal();
  document.getElementById('heroInput').value = '0';
  document.getElementById('redInput').value = '0';
  document.getElementById('blackInput').value = '0';
}

// Close modals when pressing Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDiceModal();
    closeCreateGameRoomModal();
    closeHeroNameModal();
  }
});

// Initialize
showPage('loginPage');
