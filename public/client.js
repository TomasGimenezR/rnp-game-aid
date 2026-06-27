const socket = io();
let currentUser = null;
let currentGameRoom = null;
let pendingGameRoomJoin = null;
let currentGameMode = 'Downtime';

// DOM Elements
const loginPage = document.getElementById('loginPage');
const gameRoomsPage = document.getElementById('gameRoomsPage');
const gameRoomPage = document.getElementById('gameRoomPage');
const gameRoomContainer = document.querySelector('.gameRoom-container');
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
const dreadTracker = document.getElementById('dreadTracker');
const momentumTracker = document.getElementById('momentumTracker');
const dramaTracker = document.getElementById('dramaTracker');
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
  // Ensure the creator has a complete currentGameRoom object (defaults match server GameRoom initial state)
  currentGameRoom = {
    gameRoomId: data.gameRoomId,
    name: data.gameRoomName,
    members: data.members || [],
    emOnline: data.emOnline,
    gameState: 'Downtime',
    momentum: 0,
    drama: 0,
    dread: 0
  };
  showSuccess(`Game Room "${data.gameRoomName}" created!`);
  closeCreateGameRoomModal();
  getGameRooms();
});

socket.on('join:gameRoom', (data) => {
  const { gameRoom, hero, players, emOnline } = data;
  // save the current game room locally so display updates can reference it
  currentGameRoom = gameRoom;
  hopeTracker.textContent = hero.hope;
  momentumTracker.textContent = gameRoom.momentum || 0;
  dramaTracker.textContent = gameRoom.drama || 0;
  showSuccess(`Joined gameRoom "${gameRoom.name}"`);
  closeHeroNameModal();
  showPage('gameRoomPage');
  messages.innerHTML = '';
  updateGameRoomHeader();
  updateGameModeInDisplay(currentGameRoom.gameState);
  // updateGameModeInDisplay(gameRoom.gameState);
});

socket.on('player_joined', (data) => {
  if (currentGameRoom && currentGameRoom.gameRoomId === data.gameRoomId) {
    showPage('gameRoomPage');
    messages.innerHTML = '';
    updateGameRoomHeader();
    updateGameModeInDisplay(currentGameRoom.gameState);
  }
})

socket.on('gameRoom_members_updated', (data) => {
  if (currentGameRoom && currentGameRoom.gameRoomId === data.gameRoomId) {
    currentGameRoom.members = data.members;
    currentGameRoom.emOnline = data.emOnline;
    updateGameRoomHeader();
    updateGameModeInDisplay(currentGameRoom.gameState);
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
  const { text, madeAnEscape, room } = data;
  let { hero } = data;
  if (hero == null)
    hero = { name: 'Unknown Hero' };
  if (room) {
    if (room.gameState === 'Combat')
      dreadTracker.textContent = room.dread;
    else if (room.gameState === 'Downtime') {
      momentumTracker.textContent = room.momentum;
      dramaTracker.textContent = room.drama;
    }
  }
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-heroname">${escapeHtml(hero.name)} ${room.gameState === 'Combat' ? 'Combat' : 'Downtime'} Roll!</div>
    <div class="message-text"><strong>Results:</strong> ${text}</div>
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

socket.on('update:currencies', (data) => {
  const { hero, dread, buzz } = data;
  if (hero)
    hopeTracker.textContent = hero.hope;
  if (dread)
    dreadTracker.textContent = dread;
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-heroname">${escapeHtml(hero? hero.name: "EM")}</div>
    <div class="message-text"><strong>${hero ? 'Spent Hope!' : 'Altered Dread!'}</strong></div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;

  // Buzz screens
  if (buzz) {
    gameRoomContainer.classList.add('buzz');
    setTimeout(() => {
      gameRoomContainer.classList.remove('buzz');
    }, 500);
  }
});

socket.on('update:drama_currencies', (data) => {
  const { momentum, drama, buzz } = data;
  if (momentum !== undefined)
    momentumTracker.textContent = momentum;
  if (drama !== undefined)
    dramaTracker.textContent = drama;

  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-heroname">EM</div>
    <div class="message-text"><strong>${momentum !== undefined ? 'Altered Momentum!' : 'Altered Drama!'}</strong></div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;

  if (buzz) {
    gameRoomContainer.classList.add('buzz');
    setTimeout(() => {
      gameRoomContainer.classList.remove('buzz');
    }, 500);
  }
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

socket.on('gameRoom:gameState:toggle', (data) => {
  const { gameState } = data;
  updateGameModeInDisplay(gameState);
  
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.innerHTML = `
    <div class="message-text"><strong>GAME MODE CHANGED: ${gameState}</strong></div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;
});

// socket.on('update:currencies', (data) => {
//   if (data.dread != null) {
//     gameRoomContainer.classList.add('buzz');
//     setTimeout(() => {
//       gameRoomContainer.classList.remove('buzz');
//     }, 500);
//   }
// });

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
  socket.emit('gameRoom:gameState:toggle', { });
}

function updateGameModeInDisplay(mode) {
  // default to Downtime if no mode provided
  const modeStr = String(mode || 'Downtime');
  currentGameMode = modeStr;
  const modeDisplay = document.getElementById('gameModeDisplay');
  modeDisplay.textContent = modeStr.charAt(0).toUpperCase() + modeStr.slice(1);

  // normalize casing for comparisons
  const modeLower = modeStr.toLowerCase();
  if (modeLower === 'combat')
    modeDisplay.classList.remove('downtime');
  else
    modeDisplay.classList.add('downtime');

  const isDowntime = modeLower === 'downtime';

  document.getElementById('leftTrackerCombat').style.display = isDowntime ? 'none' : 'flex';
  document.getElementById('leftTrackerDowntime').style.display = isDowntime ? 'flex' : 'none';
  document.getElementById('rightTrackerCombat').style.display = isDowntime ? 'none' : 'flex';
  document.getElementById('rightTrackerDowntime').style.display = isDowntime ? 'flex' : 'none';

  document.getElementById('combatActionGroup').style.display = isDowntime ? 'none' : 'block';
  document.getElementById('downtimeActionGroup').style.display = isDowntime ? 'block' : 'none';
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
    if (currentGameRoomName)
      currentGameRoomName.textContent = currentGameRoom.name;
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

function spendDread() {
  const dreadSpent = prompt("How much Dread are you spending? (Enter a number)");
  if (!dreadSpent || isNaN(dreadSpent) || parseInt(dreadSpent) < 0) {
    showError('Please enter a valid number for Dread');
    return;
  }
  socket.emit('spend:dread', parseInt(dreadSpent));
}

alterDread = () => {
  const dreadChange = prompt("Alter Dread by how much? (Enter a number, use negative to reduce)");
  if (!dreadChange || isNaN(dreadChange)) {
    showError('Please enter a valid number for Dread alteration');
    return;
  }
  socket.emit('alter:dread', parseInt(dreadChange));
}

function addOneMomentum() {
  socket.emit('set:momentum', "+1");
}

function setMomentum() {
  const momentumValue = prompt("Set Momentum to what value? (Enter a number)");
  if (!momentumValue || isNaN(momentumValue) || parseInt(momentumValue) < 0) {
    showError('Please enter a valid number for Momentum');
    return;
  }
  socket.emit('set:momentum', parseInt(momentumValue));
}

function spendMomentum() {
  const momentumSpent = prompt("How much Momentum are you spending? (Enter a number)");
  if (!momentumSpent || isNaN(momentumSpent) || parseInt(momentumSpent) < 0) {
    showError('Please enter a valid number for Momentum');
    return;
  }
  socket.emit('spend:momentum', parseInt(momentumSpent));
}

function alterDrama() {
  const dramaChange = prompt("Alter Drama by how much? (Enter a number, use negative to reduce)");
  if (!dramaChange || isNaN(dramaChange)) {
    showError('Please enter a valid number for Drama alteration');
    return;
  }
  socket.emit('alter:drama', parseInt(dramaChange));
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
