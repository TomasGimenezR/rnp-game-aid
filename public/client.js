const socket = io();
let currentUser = null;
let currentRoom = null;

// DOM Elements
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const successEl = document.getElementById('success');
const loginSection = document.getElementById('loginSection');
const mainContent = document.getElementById('mainContent');
const usernameInput = document.getElementById('usernameInput');
const roomNameInput = document.getElementById('roomNameInput');
const roomsList = document.getElementById('roomsList');
const messageInput = document.getElementById('messageInput');
const messages = document.getElementById('messages');
const currentRoomEl = document.getElementById('currentRoom');
const noRoomEl = document.getElementById('noRoom');
const currentRoomName = document.getElementById('currentRoomName');
const membersList = document.getElementById('membersList');

// Socket event listeners
socket.on('connect', () => {
  updateStatus('Connected', true);
});

socket.on('disconnect', () => {
  updateStatus('Disconnected', false);
  currentUser = null;
  loginSection.style.display = 'block';
  mainContent.classList.remove('active');
});

socket.on('login_success', (data) => {
  currentUser = data;
  loginSection.style.display = 'none';
  mainContent.classList.add('active');
  showSuccess(`Welcome, ${data.username}!`);
  getRooms();
  usernameInput.value = '';
});

socket.on('login_error', (error) => {
  showError(error);
});

socket.on('room_created', (data) => {
  currentRoom = { roomId: data.roomId, name: data.roomName, members: data.members };
  showSuccess(`Room "${data.roomName}" created!`);
  updateChatUI();
  getRooms();
});

socket.on('room_joined', (data) => {
  currentRoom = { roomId: data.roomId, name: data.roomName, members: data.members };
  showSuccess(`Joined room "${data.roomName}"`);
  updateChatUI();
  messages.innerHTML = '';
});

socket.on('room_members_updated', (data) => {
  if (currentRoom && currentRoom.roomId === data.roomId) {
    currentRoom.members = data.members;
    membersList.innerHTML = data.members.join(', ');
  }
});

socket.on('rooms_list', (roomsList_data) => {
  displayRooms(roomsList_data);
});

socket.on('room_list_updated', (roomsList_data) => {
  displayRooms(roomsList_data);
});

socket.on('new_message', (data) => {
  if (currentRoom) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    const time = new Date(data.timestamp).toLocaleTimeString();
    messageEl.innerHTML = `
      <div class="message-heroname">${data.heroName}</div>
      <div class="message-text">${escapeHtml(data.message)}</div>
      <div class="message-time">${time}</div>
    `;
    messages.appendChild(messageEl);
    messages.scrollTop = messages.scrollHeight;
  }
});

socket.on('action_roll_result', (data) => {
  const { text, heroName } = data;
  const messageEl = document.createElement('div');
  messageEl.className = 'message action-roll-result';
  messageEl.innerHTML = `
    <div class="message-heroname">${heroName}</div>
    <div class="message-text"><strong>Action Roll Results:</strong> ${text}</div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;
});

socket.on('error', (error) => {
  showError(error);
});

// Functions
function login() {
  const username = usernameInput.value.trim();
  if (!username) {
    showError('Please enter a username');
    return;
  }
  socket.emit('login', username);
}

function createRoom() {
  if (!currentUser) {
    showError('Please login first');
    return;
  }
  const roomName = roomNameInput.value.trim();
  if (!roomName) {
    showError('Please enter a room name');
    return;
  }
  socket.emit('create_room', { roomName });
  roomNameInput.value = '';
}

function joinRoom(roomId) {
  if (!currentUser) {
    showError('Please login first');
    return;
  }
  let heroName = prompt("Enter your hero's name:");
  if (!heroName || heroName == "") {
    showError('Hero name cannot be empty');
    return;
  }
  let heroArchetypeId = prompt("Enter your hero's archetype ID (number):");
  if (!heroArchetypeId || isNaN(heroArchetypeId)) {
    showError('Hero archetype ID must be a number');
    return;
  }
  let heroPathId = prompt("Enter your hero's path ID (number):");
  if (!heroPathId || isNaN(heroPathId)) {
    showError('Hero path ID must be a number');
    return;
  }
  data = { roomId, heroName: heroName.trim(), heroArchetypeId: parseInt(heroArchetypeId), heroPathId: parseInt(heroPathId) };
  socket.emit('join_room', data );
}

function leaveRoom() {
  if (!currentRoom) return;
  socket.emit('leave_room');
  currentRoom = null;
  updateChatUI();
  getRooms();
}

function sendMessage() {
  if (!currentRoom) {
    showError('Not in a room');
    return;
  }
  const message = messageInput.value.trim();
  if (!message) return;
  socket.emit('send_message', message);
  messageInput.value = '';
}

function getRooms() {
  socket.emit('get_rooms');
}

function displayRooms(roomsList_data) {
  if (roomsList_data.length === 0) {
    roomsList.innerHTML = '<p style="color: #999; text-align: center;">No rooms available</p>';
    return;
  }

  roomsList.innerHTML = roomsList_data.map(room => `
    <div class="room-item">
      <div class="room-item-header">
        <div class="room-item-name">${escapeHtml(room.name)}</div>
      </div>
      <div class="room-item-info">EM: ${escapeHtml(room.creator)}</div>
      <div class="room-item-members">All players: ${room.memberCount} - ${room.members.join(', ')}</div>
      <button class="room-item-button" onclick="joinRoom('${room.roomId}')">Join as Player</button>
    </div>
  `).join('');
}

function updateChatUI() {
  if (currentRoom) {
    currentRoomName.textContent = currentRoom.name;
    membersList.innerHTML = currentRoom.members.join(', ');
    currentRoomEl.style.display = 'block';
    noRoomEl.style.display = 'none';
  } else {
    currentRoomEl.style.display = 'none';
    noRoomEl.style.display = 'block';
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

forcedRoll = () => {
  socket.emit('forced_roll');
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

roomNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') createRoom();
});

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
