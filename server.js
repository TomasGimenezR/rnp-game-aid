import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Hero, GameRoom } from './gameLogic.js';

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
const users = new Map(); // userId -> { username, socketId, activeGameRoomId }
const gameRoomsList = new Map(); // gameId -> { name, creator, members: Set, gameState: 'Combat'|'Downtime' }

function getOccupantsPayload(gameRoom) {
  const emSocket = io.sockets.sockets.get(gameRoom.em.socketId);
  const em = emSocket ? { username: gameRoom.em.username } : null;
  const heroes = gameRoom.heroes.map(u => ({
    name: u.hero?.name,
    username: u.username,
    roundCoin: !!u.hero?.roundCoin
  }));
  return { em, heroes };
}

function broadcastOccupants(gameRoomId) {
  const gameRoom = gameRoomsList.get(gameRoomId);
  if (!gameRoom) return;
  io.to(gameRoomId).emit('gameRoom:occupants', getOccupantsPayload(gameRoom));
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🌐 User connected: ${socket.id}`);

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

    users.set(socket.id, { username, socketId: socket.id, activeGameRoomId: null });
    socket.emit('login_success', { userId: socket.id, username });
    console.log(`✅ User logged in: ${username}`);
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

    const gameRoomId = `gameRoom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const gameRoom = new GameRoom(gameRoomId, gameName, user);

    gameRoomsList.set(gameRoomId, gameRoom);
    user.activeGameRoomId = gameRoomId;

    socket.join(gameRoomId);
    socket.emit('create:gameRoom', { gameRoomId, gameRoomName: gameRoom.name, members: [user.username], emOnline: true });
    const gameRoomsInfo = Array.from(gameRoomsList.values()).map(gameRoom => ({
      gameRoomId: gameRoom.gameRoomId,
      name: gameRoom.name,
      em: gameRoom.em,
      playerCount: gameRoom.heroes.length,
      players: gameRoom.heroes.map(heroUser => heroUser.username)
    }));
    io.emit('gameRoom_list_updated', gameRoomsInfo);

    console.log(`🏠 Game Room created: ${gameName} (${gameRoomId}) by ${user.username}`);
  });

  // Join gameRoom event
  socket.on('join:gameRoom', (data) => {
    const { gameRoomId, heroName, heroArchetypeId, heroPathId } = data;
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', 'Not logged in');
      return;
    }

    const gameRoom = gameRoomsList.get(gameRoomId);
    if (!gameRoom) {
      socket.emit('error', 'Game not found');
      return;
    }

    // Leave previous gameRoom if in one
    if (user.activeGameRoomId) {
        socket.leave(user.activeGameRoomId);
        const prevGameRoom = gameRoomsList.get(user.activeGameRoomId);
        if (prevGameRoom) {
            const index = prevGameRoom.heroes.indexOf(socket.id);
            if (index > -1) { // only splice array when item is found
              prevGameRoom.heroes.splice(index, 1);
            }              
            if (prevGameRoom.heroes.length === 0) {
                gameRoomsList.delete(user.activeGameRoomId);
            }
        }
    }

        // Create Hero
    const hero = new Hero({ name: heroName, archetypeId: heroArchetypeId, heroPathId: heroPathId });
    user.hero = hero; // Store hero object in user data for later use
    socket.hero = hero; // Store hero object for later use

    // Join new gameRoom
    user.activeGameRoomId = gameRoomId;
    gameRoom.heroes.push(user);
    socket.join(gameRoomId);

    // Auto-join EM to gameRoom if online
    let emOnline = false;
    const emSocket = io.sockets.sockets.get(gameRoom.em.socketId);
    if (emSocket) emOnline = true;
    if (emOnline && gameRoom.heroes.length == 1) { 
      emSocket.join(gameRoomId);
      io.to(gameRoomId).emit('player_joined',{ gameRoomId });
    }

    const players = gameRoom.heroes.map(heroUser => heroUser.username);
    socket.emit('join:gameRoom', { gameRoom, hero, players, emOnline });
    io.to(gameRoomId).emit('update:gameRoom', { gameRoomId, members: players, emOnline });
    broadcastOccupants(gameRoomId);

    console.log(`💠 ${user.username} joined gameRoom: ${gameRoom.name}`);
  });

  // Get gameRoomsList
  socket.on('get:gameRooms', () => {
    const gameRoomsInfo = Array.from(gameRoomsList.values()).map(gameRoom => ({
      gameRoomId: gameRoom.gameRoomId,
      name: gameRoom.name,
      em: gameRoom.em,
      playerCount: gameRoom.heroes.length,
      players: gameRoom.heroes.map(heroUser => heroUser.username)
    }));
    socket.emit('list:gameRooms', gameRoomsInfo);
  });

  socket.on('action_roll', () => {
    const user = users.get(socket.id);
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    const hero = socket.hero;
    let rollResults;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a gameRoom');
      return;
    }
    if (!hero) {
        socket.emit('error', 'EMs don\'t make action rolls!');
        return;
    }

    if (gameRoom.gameState === 'Combat'){
      rollResults = hero.actionRoll();
      if ((rollResults.skulls + gameRoom.dread) > 12)
        gameRoom.dread = 12; // Cap at 12 Dread
      else
        gameRoom.dread += rollResults.skulls; // Add Dread to gameRoom based on skulls rolled

      // When every hero has flipped their round token, the round ends: reset all tokens and grant +1 Hope each
      const roundComplete = gameRoom.heroes.length > 0 && gameRoom.heroes.every(u => u.hero && u.hero.roundCoin);
      if (roundComplete) {
        gameRoom.heroes.forEach(u => {
          u.hero.roundCoin = false;
          u.hero.hope += 1;
          io.to(u.socketId).emit('show:hope', { hero: u.hero });
        });
        gameRoom.dread += gameRoom.heroes.length; // Add Dread to gameRoom based on number of heroes
        if (gameRoom.dread > 12)
          gameRoom.dread = 12;
        io.to(user.activeGameRoomId).emit('round_complete', { gameRoomId: user.activeGameRoomId });
      }
    } else {
      rollResults = gameRoom.actionRoll(); // Add Momentum and Drama to gameRoom during Downtime
    }
    const text = ` ${rollResults.heroDiceResults.join(' ')} ${rollResults.redDiceResults.join(' ')} ${rollResults.blackDiceResults.join(' ')}</br>Suns: ${rollResults.suns}</br>Skulls: ${rollResults.skulls}`;
    io.to(user.activeGameRoomId).emit('action_roll_result', { text, hero, madeAnEscape: rollResults.madeAnEscape, room: gameRoom });
    io.to(socket.id).emit('show:hope', { hero }); // Update Hope just for player rolling
    broadcastOccupants(user.activeGameRoomId);
  });

  socket.on('forced_roll', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    let rollResults;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a gameRoom');
      return;
    }
    if (!hero) {
        socket.emit('error', 'EMs don\'t make forced rolls!');
        return;
    }

    if (gameRoom && gameRoom.gameState === 'Combat')
      rollResults = hero.forcedRoll();
    else
      rollResults = gameRoom.forcedRoll();
    const text = ` ${rollResults.heroDiceResults.join(' ')} ${rollResults.redDiceResults.join(' ')} ${rollResults.blackDiceResults.join(' ')}
        </br><em>Suns:</em> ${rollResults.suns}
        </br><em>Skulls:</em> ${rollResults.skulls}
        </br> <strong><label style="color: ${rollResults.success ? 'green;">SUCCESS' : 'red;">FAILURE'}</label></strong>`;
    io.to(user.activeGameRoomId).emit('action_roll_result', { text, hero, room: gameRoom });
  });

  socket.on('replace:red', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    let dicePool;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a gameRoom');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    if (!gameRoom && gameRoom.gameState === 'Combat') {
      dicePool = hero.replaceForRedDie();
    } else {
      dicePool = gameRoom.replaceForRedDie();
    }
    io.to(user.activeGameRoomId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

  socket.on('add:red', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    let dicePool;

    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a gameRoom');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    if (!gameRoom && gameRoom.gameState === 'Combat') {
      dicePool = hero.addRedDie();
    } else {
      dicePool = gameRoom.addRedDie();
    }
    io.to(user.activeGameRoomId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

  socket.on('subtract:red', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    let dicePool;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    if (!gameRoom && gameRoom.gameState === 'Combat') {
      dicePool = hero.subtractRedDie();
    } else {
      dicePool = gameRoom.subtractRedDie();
    }
    io.to(user.activeGameRoomId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

  socket.on('replace:black', () => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    let dicePool;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who replace dice, not the EM!');
        return;
    }

    if (!gameRoom && gameRoom.gameState === 'Combat') {
      dicePool = hero.replaceForBlackDie();
    } else {
      dicePool = gameRoom.replaceForBlackDie();
    }
    io.to(user.activeGameRoomId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
  });

    socket.on('add:black', () => {
      const user = users.get(socket.id);
      const hero = socket.hero;
      const gameRoom = gameRoomsList.get(user.activeGameRoomId);
      let dicePool;
      if (!user || !user.activeGameRoomId) {
        socket.emit('error', 'Not in a Game Room');
        return;
      }
      if (!hero) {
          socket.emit('error', 'It is the players who replace dice, not the EM!');
          return;
      }

      if (!gameRoom && gameRoom.gameState === 'Combat') {
        dicePool = hero.addBlackDie();
      } else {
        dicePool = gameRoom.addBlackDie();
      }
      io.to(user.activeGameRoomId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
    });

    socket.on('subtract:black', () => {
      const user = users.get(socket.id);
      const hero = socket.hero;
      const gameRoom = gameRoomsList.get(user.activeGameRoomId);
      let dicePool;
      if (!user || !user.activeGameRoomId) {
        socket.emit('error', 'Not in a Game Room');
        return;
      }
      if (!hero) {
          socket.emit('error', 'It is the players who replace dice, not the EM!');
          return;
      }

      if (!gameRoom && gameRoom.gameState === 'Combat') {
        dicePool = hero.subtractBlackDie();
      } else {
        dicePool = gameRoom.subtractBlackDie();
      }
      io.to(user.activeGameRoomId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
    });

    socket.on('set:dice', (dicePool) => {
        const user = users.get(socket.id);
        const hero = socket.hero;
        const gameRoom = gameRoomsList.get(user.activeGameRoomId);

        if (!user || !user.activeGameRoomId) {
            socket.emit('error', 'Not in a Game Room');
            return;
        }
        if (!hero) {
            socket.emit('error', 'It is the players who set their dice pools, not the EM!');
            return;
        }

        if (!gameRoom && gameRoom.gameState === 'Combat') {
            hero.setDicePool(dicePool);
        } else {
            gameRoom.setDicePool(dicePool);
        }
        io.to(user.activeGameRoomId).emit('dice_pool_updated', { heroName: hero.name, dicePool });
        io.to(socket.id).emit('show:hope', { hero });
    });

    socket.on('reset_dice_pool', () => {
        const user = users.get(socket.id);
        const hero = socket.hero;
        const gameRoom = gameRoomsList.get(user.activeGameRoomId);
        let dicePool;
        if (!gameRoom || !user || !user.activeGameRoomId) {
        socket.emit('error', 'Not in a Game Room');
        return;
        }
        if (!hero) {
            socket.emit('error', 'EMs don\'t make forced rolls!');
            return;
        }

        if (gameRoom.gameState === 'Combat')
          dicePool = hero.setDicePool({ hero: 2, red: 0, black: 0 });
        else
          dicePool = gameRoom.setDicePool({ hero: 2, red: 0, black: 0 });
        io.to(user.activeGameRoomId).emit('dice_pool_reset', { heroName: hero.name });
    });

  socket.on('set:hope', (hope) => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
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
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
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
    io.to(socket.id).emit('update:currencies', { hero });
  });

  socket.on('alter:dread', (dreadChange) => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    let buzz = false;
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }
    if (hero) {
        socket.emit('error', 'It is the EM who alters Dread, not the Players!');
        return;
    }

    if (dreadChange < 0) {
      buzz = true;
      if (gameRoom.dread < Math.abs(dreadChange)) {
        socket.emit('error', 'Not enough Dread to alter');
        return;
      }
    }

    gameRoom.alterDread(dreadChange);
    io.to(user.activeGameRoomId).emit('update:currencies', { hero, dread: gameRoom.dread, buzz });
  });

  socket.on('set:momentum', (momentum) => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who set Momentum, not the EM!');
        return;
    }

    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    if (momentum === "+1")
      gameRoom.momentum = (gameRoom.momentum || 0) + 1;
    else {
      momentum = parseInt(momentum);
      if (isNaN(momentum) || momentum < 0) {
        socket.emit('error', 'Invalid Momentum value');
        return;
      }
      gameRoom.momentum = momentum;
    }
    io.to(user.activeGameRoomId).emit('update:drama_currencies', { momentum: gameRoom.momentum });
  });

  socket.on('spend:momentum', (momentumSpent) => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }
    if (!hero) {
        socket.emit('error', 'It is the players who spend Momentum, not the EM!');
        return;
    }

    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    if ((gameRoom.momentum || 0) < momentumSpent) {
      socket.emit('error', 'Not enough Momentum to spend');
      return;
    }

    gameRoom.momentum = (gameRoom.momentum || 0) - momentumSpent;
    io.to(user.activeGameRoomId).emit('update:drama_currencies', { momentum: gameRoom.momentum });
  });

  socket.on('alter:drama', (dramaChange) => {
    const user = users.get(socket.id);
    const hero = socket.hero;
    let buzz = false;
    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }
    if (hero) {
        socket.emit('error', 'It is the EM who alters Drama, not the Players!');
        return;
    }

    if (dramaChange < 0) {
      buzz = true;
      if ((gameRoom.drama || 0) < Math.abs(dramaChange)) {
        socket.emit('error', 'Not enough Drama to alter');
        return;
      }
    }

    gameRoom.drama = (gameRoom.drama || 0) + dramaChange;
    io.to(user.activeGameRoomId).emit('update:drama_currencies', { drama: gameRoom.drama, buzz });
  });

  // Send message to gameRoom
  socket.on('send_message', (message) => {
    const user = users.get(socket.id);
    const heroName = user?.username || socket.hero?.name || 'Unknown Hero';
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }

    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    if (!gameRoom) {
      socket.emit('error', 'Game Room not found');
      return;
    }

    io.to(user.activeGameRoomId).emit('new_message', {
      username: user.username,
      heroName,
      message,
      timestamp: new Date()
    });
  });

  // Leave gameRoom
  socket.on('leave_room', () => {
    const user = users.get(socket.id);
    if (!user || !user.activeGameRoomId) return;
    let emOnline = true;

    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    if (!gameRoom) {
      socket.emit('error', 'Game Room not found');
      return;
    }
    
    if (gameRoom.em.socketId === socket.id) 
      emOnline = false;

    const index = gameRoom.heroes.indexOf(socket.id);
    if (index > -1) { // only splice array when item is found
      gameRoom.heroes.splice(index, 1);
    }

    const heroesRemaining = Array.from(gameRoom.heroes).map(memberId => users.get(memberId)?.username);
    io.to(user.activeGameRoomId).emit('gameRoom_members_updated', { gameRoomId: user.activeGameRoomId, members: heroesRemaining });
    broadcastOccupants(user.activeGameRoomId);

    if (gameRoom.heroes.size === 0) {
      gameRoomsList.delete(user.activeGameRoomId);
      socket.leave(user.activeGameRoomId);
      user.activeGameRoomId = null;
    }
    
  });

  socket.on('gameRoom:gameState:toggle', () => {
    const user = users.get(socket.id);
    if (!user || !user.activeGameRoomId) {
      socket.emit('error', 'Not in a Game Room');
      return;
    }

    const gameRoom = gameRoomsList.get(user.activeGameRoomId);
    if (!gameRoom) {
      socket.emit('error', 'Game Room not found');
      return;
    }

    // Reset Combat Dice Pools when leaving Combat
    if (gameRoom.gameState === 'Combat') {
      gameRoom.heroes.forEach(heroUser => {        
        heroUser.hero.setDicePool({ hero: 2, red: 0, black: 0 }); // TODO: Not working
      });
    }

    gameRoom.gameState = gameRoom.gameState === 'Combat' ? 'Downtime' : 'Combat';
    io.to(user.activeGameRoomId).emit('gameRoom:gameState:toggle', { gameState: gameRoom.gameState });
  });

  // Disconnect event
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      if (user.activeGameRoomId) {
        const gameRoom = gameRoomsList.get(user.activeGameRoomId);
        if (gameRoom) {
          if (gameRoom.em.socketId === socket.id) 
            gameRoomsList.delete(user.activeGameRoomId);
          else {
            const index = gameRoom.heroes.indexOf(socket.id);
            if (index > -1) { // only splice array when item is found
              gameRoom.heroes.splice(index, 1);
            }              
          }
          const memberNames = Array.from(gameRoom.heroes).map(memberId => users.get(memberId)?.username);
          io.to(user.activeGameRoomId).emit('gameRoom_members_updated', { gameRoomId: user.activeGameRoomId, members: memberNames });
          broadcastOccupants(user.activeGameRoomId);

          if (gameRoom.heroes.size === 0) {
            gameRoomsList.delete(user.activeGameRoomId);
          }
        }
      }
      console.log(`📤 User disconnected: ${user.username}`);
      users.delete(socket.id);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
