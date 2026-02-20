import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Hero } from './gameLogic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Store connected users and rooms
const users = new Map(); // userId -> { username, socketId, room }
const rooms = new Map(); // roomId -> { name, creator, members: Set }

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Login event
  socket.on('login', (username) => {
    if (!username || username.trim() === '') {
      socket.emit('login_error', 'Username cannot be empty');
      return;
    }

    // Check if username already exists
    const existingUser = Array.from(users.values()).find(u => u.username === username);
    if (existingUser) {
      socket.emit('login_error', 'Username already taken');
      return;
    }

    users.set(socket.id, { username, socketId: socket.id, room: null });
    socket.emit('login_success', { userId: socket.id, username });
    console.log(`User logged in: ${username}`);
  });

  // Create room event
  socket.on('create_room', (roomData) => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', 'Not logged in');
      return;
    }

    const { roomName } = roomData;
    if (!roomName || roomName.trim() === '') {
      socket.emit('error', 'Room name cannot be empty');
      return;
    }

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const room = {
      roomId,
      name: roomName,
      creator: user.username,
      members: new Set([socket.id]),
      createdAt: new Date()
    };

    rooms.set(roomId, room);
    user.room = roomId;

    socket.join(roomId);
    socket.emit('room_created', { roomId, roomName, members: [user.username] });
    io.emit('room_list_updated', Array.from(rooms.values()).map(r => ({
      roomId: r.roomId,
      name: r.name,
      creator: r.creator,
      memberCount: r.members.size,
      members: Array.from(r.members).map(memberId => users.get(memberId)?.username)
    })));

    console.log(`Room created: ${roomName} (${roomId}) by ${user.username}`);
  });

  // Join room event
  socket.on('join_room', (data) => {
    const { roomId, heroName, heroArchetypeId, heroPathId } = data;
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', 'Not logged in');
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    // Leave previous room if in one
    if (user.room) {
        socket.leave(user.room);
        const prevRoom = rooms.get(user.room);
        if (prevRoom) {
            prevRoom.members.delete(socket.id);
            if (prevRoom.members.size === 0) {
                rooms.delete(user.room);
            }
        }
    }
    
    // Join new room
    user.room = roomId;
    room.members.add(socket.id);
    socket.join(roomId);
    
    // Create Hero
    const hero = new Hero({ name: heroName, archetypeId: heroArchetypeId, heroPathId: heroPathId });
    socket.hero = hero; // Store hero object for later use
    
    const memberNames = Array.from(room.members).map(memberId => users.get(memberId)?.username);
    socket.emit('room_joined', { roomId, roomName: room.name, hero, members: memberNames });
    io.to(roomId).emit('room_members_updated', { roomId, members: memberNames });

    console.log(`${user.username} joined room: ${room.name}`);
  });

  // Get rooms list
  socket.on('get_rooms', () => {
    const roomsList = Array.from(rooms.values()).map(room => ({
      roomId: room.roomId,
      name: room.name,
      creator: room.creator,
      memberCount: room.members.size,
      members: Array.from(room.members).map(memberId => users.get(memberId)?.username)
    }));
    socket.emit('rooms_list', roomsList);
  });

  socket.on('action_roll', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.room) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'EMs don\'t make action rolls!');
        return;
    }

    const rollResults = hero.actionRoll();
    const text = ` ${rollResults.heroDiceResults.join(' ')} ${rollResults.redDiceResults.join(' ')} ${rollResults.blackDiceResults.join(' ')}</br>Suns: ${rollResults.suns}</br>Skulls: ${rollResults.skulls}`;
    io.to(user.room).emit('action_roll_result', { text, heroName: hero.name });
  });

  socket.on('forced_roll', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.room) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'EMs don\'t make forced rolls!');
        return;
    }

    const rollResults = hero.forcedRoll();
    const text = ` ${rollResults.heroDiceResults.join(' ')} ${rollResults.redDiceResults.join(' ')} ${rollResults.blackDiceResults.join(' ')}
        </br><em>Suns:</em> ${rollResults.suns}
        </br><em>Skulls:</em> ${rollResults.skulls}
        </br> <strong><label style="color: ${rollResults.success ? 'green;">SUCCESS' : 'red;">FAILURE'}</label></strong>`;
    io.to(user.room).emit('action_roll_result', { text, heroName: hero.name });
  });

    socket.on('reset_dice_pool', () => {
        const user = users.get(socket.id);
        const hero = socket.hero;
        if (!user || !user.room) {
        socket.emit('error', 'Not in a room');
        return;
        }
        if (!hero) {
            socket.emit('error', 'EMs don\'t make forced rolls!');
            return;
        }
        hero.resetDicePool();
        socket.emit('dice_pool_reset', { heroName: hero.name });
    });

  // Send message to room
  socket.on('send_message', (message) => {
    const user = users.get(socket.id);
    const heroName = user?.username || socket.hero?.name || 'Unknown Hero';
    if (!user || !user.room) {
      socket.emit('error', 'Not in a room');
      return;
    }

    const room = rooms.get(user.room);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    io.to(user.room).emit('new_message', {
      username: user.username,
      heroName,
      message,
      timestamp: new Date()
    });
  });

  // Leave room
  socket.on('leave_room', () => {
    const user = users.get(socket.id);
    if (!user || !user.room) return;

    const room = rooms.get(user.room);
    if (room) {
      room.members.delete(socket.id);
      const memberNames = Array.from(room.members).map(memberId => users.get(memberId)?.username);
      io.to(user.room).emit('room_members_updated', { roomId: user.room, members: memberNames });

      if (room.members.size === 0) {
        rooms.delete(user.room);
      }
    }

    socket.leave(user.room);
    user.room = null;
  });

  // Disconnect event
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      if (user.room) {
        const room = rooms.get(user.room);
        if (room) {
          room.members.delete(socket.id);
          const memberNames = Array.from(room.members).map(memberId => users.get(memberId)?.username);
          io.to(user.room).emit('room_members_updated', { roomId: user.room, members: memberNames });

          if (room.members.size === 0) {
            rooms.delete(user.room);
          }
        }
      }
      console.log(`User disconnected: ${user.username}`);
      users.delete(socket.id);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
