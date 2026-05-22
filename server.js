import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Hero, Game } from './gameLogic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 1200000, // 20 minutes
});

const PORT = 3000;

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Store connected users and games
const users = new Map(); // userId -> { username, socketId, activeGameId }
const gameList = new Map(); // gameId -> { name, creator, members: Set, gameMode: 'combat'|'downtime' }

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

    users.set(socket.id, { username, socketId: socket.id, activeGameId: null });
    socket.emit('login_success', { userId: socket.id, username });
    console.log(`User logged in: ${username}`);
  });

  // Create gameRoom event
  socket.on('create:gameRoom', (gameData) => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', 'Not logged in');
      return;
    }

    const { gameName } = gameData;
    if (!gameName || gameName.trim() === '') {
      socket.emit('error', 'Game Room name cannot be empty');
      return;
    }

    const gameRoomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const gameRoom = new Game(gameRoomId, gameName, user);

    gameList.set(gameRoomId, gameRoom);
    user.activeGameId = gameRoomId;

    socket.join(gameRoomId);
    socket.emit('room_created', { roomId: gameRoomId, gameName, members: [user.username], emOnline: true });
    const roomListData = Array.from(gameList.values()).map(game => ({
      gameId: game.gameId,
      name: game.name,
      em: game.em,
      playerCount: game.heroes.length,
      players: game.heroes.map(heroUser => heroUser.username)
    }));
    io.emit('room_list_updated', roomListData);

    console.log(`🏠 Room created: ${gameName} (${gameRoomId}) by ${user.username}`);
  });

  // Join room event
  socket.on('room:join', (data) => {
    const { roomId, heroName, heroArchetypeId, heroPathId } = data;
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', 'Not logged in');
      return;
    }

    const game = gameList.get(roomId);
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }

    // Leave previous room if in one
    if (user.activeGameId) {
        socket.leave(user.activeGameId);
        const prevRoom = gameList.get(user.activeGameId);
        if (prevRoom) {
            prevRoom.members.delete(socket.id);
            if (prevRoom.members.size === 0) {
                gameList.delete(user.activeGameId);
            }
        }
    }

    // Join new room
    user.activeGameId = roomId;
    game.heroes.push(user);
    socket.join(roomId);

    // Create Hero
    const hero = new Hero({ name: heroName, archetypeId: heroArchetypeId, heroPathId: heroPathId });
    socket.hero = hero; // Store hero object for later use

    // Auto-join EM to room if online
    let emOnline = false;
    const emSocket = io.sockets.sockets.get(game.em.socketId);
    if (emSocket) emOnline = true;
    if (emOnline &&game.heroes.length == 1) { 
      emSocket.join(roomId);
      io.to(roomId).emit('player_joined',{ roomId });
    }

    const players = game.heroes.map(heroUser => heroUser.username).filter(Boolean);
    socket.emit('room_joined', { roomId, gameName: game.name, hero, members: players, emOnline });
    io.to(roomId).emit('room_members_updated', { roomId, members: players, emOnline });

    console.log(`${user.username} joined room: ${game.name}`);
  });

  // Get gameList
  socket.on('get_games', () => {
    const roomsList = Array.from(gameList.values()).map(game => ({
      gameId: game.gameId,
      name: game.name,
      em: game.em,
      playerCount: game.heroes.length,
      players: game.heroes.map(heroUser => heroUser.username).filter(Boolean)
    }));
    socket.emit('rooms_list', roomsList);
  });

  socket.on('action_roll', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'EMs don\'t make action rolls!');
        return;
    }

    const rollResults = hero.actionRoll();
    const text = ` ${rollResults.heroDiceResults.join(' ')} ${rollResults.redDiceResults.join(' ')} ${rollResults.blackDiceResults.join(' ')}</br>Suns: ${rollResults.suns}</br>Skulls: ${rollResults.skulls}`;
    io.to(user.activeGameId).emit('action_roll_result', { text, hero });
    io.to(socket.id).emit('show:hope', { hero }); // Update Hope just for player rolling
  });

  socket.on('forced_roll', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
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
    io.to(user.activeGameId).emit('action_roll_result', { text, hero });
  });

  socket.on('replace:red', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    const dicePool = hero.replaceForRedDie();
    io.to(user.activeGameId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

  socket.on('add:red', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    const dicePool = hero.addRedDie();
    io.to(user.activeGameId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

  socket.on('subtract:red', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    const dicePool = hero.subtractRedDie();
    io.to(user.activeGameId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

  socket.on('replace:black', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    const dicePool = hero.replaceForBlackDie();
    io.to(user.activeGameId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

    socket.on('add:black', () => {
      const user = users.get(socket.id);
      const hero = socket.hero;
      if (!user || !user.activeGameId) {
        socket.emit('error', 'Not in a room');
        return;
      }
      if (!hero) {
          socket.emit('error', 'It is the players who replace dice, not the EM!');
          return;
      }

      const dicePool = hero.addBlackDie();
      io.to(user.activeGameId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
    });

    socket.on('subtract:black', () => {
      const user = users.get(socket.id);
      const hero = socket.hero;
      if (!user || !user.activeGameId) {
        socket.emit('error', 'Not in a room');
        return;
      }
      if (!hero) {
          socket.emit('error', 'It is the players who replace dice, not the EM!');
          return;
      }

      const dicePool = hero.subtractBlackDie();
      io.to(user.activeGameId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
    });

    socket.on('set:dice', (dicePool) => {
        const user = users.get(socket.id);
        const hero = socket.hero;
        if (!user || !user.activeGameId) {
            socket.emit('error', 'Not in a room');
            return;
        }
        if (!hero) {
            socket.emit('error', 'It is the players who set their dice pools, not the EM!');
            return;
        }
        hero.setDicePool(dicePool);
        io.to(user.activeGameId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
        io.to(socket.id).emit('show:hope', { hero });
    });

    socket.on('reset_dice_pool', () => {
        const user = users.get(socket.id);
        const hero = socket.hero;
        if (!user || !user.activeGameId) {
        socket.emit('error', 'Not in a room');
        return;
        }
        if (!hero) {
            socket.emit('error', 'EMs don\'t make forced rolls!');
            return;
        }
        const dicePool = hero.setDicePool({ hero: 2, red: 0, black: 0 });
        io.to(user.activeGameId).emit('dice_pool_reset', { heroName: hero.name, dicePool });
    });

  socket.on('set:hope', (hope) => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who set their Hope, not the EM!');
        return;
    }
    if (hope === "+1")
      hero.setHope(hero.hope + 1);
    else {
      hope = parseInt(hope);
      if (isNaN(hope) || hope < 0) {
        socket.emit('error', 'Invalid Hope value');
        return;
      }
      hero.setHope(hope);
    }
    io.to(socket.id).emit('update:hero', { hero });
  });

  socket.on('spend:hope', (hopeSpent) => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who spend Hope, not the EM!');
        return;
    }

    if (hero.hope < hopeSpent) {
      socket.emit('error', 'Not enough Hope to spend');
      return;
    }

    hero.spendHope(hopeSpent);
    io.to(socket.id).emit('spend:hope', { hero });
  });

  // socket.on('spend:dread', (dreadSpent) => {
  //   const user = users.get(socket.id);
  //   const hero = socket.hero;
  //   if (!user || !user.activeGameId) {
  //     socket.emit('error', 'Not in a room');
  //     return;
  //   }
  //   if (!hero) {
  //       socket.emit('error', 'It is the players who spend Dread, not the EM!');
  //       return;
  //   }

  //   if (hero.dread < dreadSpent) {
  //     socket.emit('error', 'Not enough Dread to spend');
  //     return;
  //   }

  //   hero.spendDread(dreadSpent);
  // });

  // Send message to room
  socket.on('send_message', (message) => {
    const user = users.get(socket.id);
    const heroName = user?.username || socket.hero?.name || 'Unknown Hero';
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }

    const room = gameList.get(user.activeGameId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    io.to(user.activeGameId).emit('new_message', {
      username: user.username,
      heroName,
      message,
      timestamp: new Date()
    });
  });

  // Leave room
  socket.on('leave_room', () => {
    const user = users.get(socket.id);
    if (!user || !user.activeGameId) return;
    const roomId = user.activeGameId;
    let emOnline = true;

    const room = gameList.get(user.activeGameId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.em.socketId === socket.id) 
      emOnline = false;

    const index = room.heroes.indexOf(socket.id);
    if (index > -1) { // only splice array when item is found
      room.heroes.splice(index, 1);
    }

    const heroesRemaining = Array.from(room.heroes).map(memberId => users.get(memberId)?.username);
    io.to(user.activeGameId).emit('room_members_updated', { roomId: user.activeGameId, members: heroesRemaining });

    if (room.heroes.size === 0) {
      gameList.delete(user.activeGameId);
      socket.leave(user.activeGameId);
      user.activeGameId = null;
    }
    
  });

  socket.on('change_game_mode', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.activeGameId) {
      socket.emit('error', 'Not in a room');
      return;
    }

    const room = gameList.get(user.activeGameId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    room.gameMode = data.mode;
    io.to(user.activeGameId).emit('game_mode_changed', { mode: data.mode });
  });

  // Disconnect event
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      if (user.activeGameId) {
        const room = gameList.get(user.activeGameId);
        if (room) {
          if (room.em.socketId === socket.id) 
            gameList.delete(user.activeGameId);
          else
            room.heroes.delete(socket.id);
          const memberNames = Array.from(room.heroes).map(memberId => users.get(memberId)?.username);
          io.to(user.activeGameId).emit('room_members_updated', { roomId: user.activeGameId, members: memberNames });

          if (room.heroes.size === 0) {
            gameList.delete(user.activeGameId);
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
