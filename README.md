# Socket Room App

A simple real-time chat application built with Node.js, Express, and Socket.io that allows users to log in, create rooms, and join existing rooms to chat with others.

## Features

- **User Authentication**: Simple username-based login system
- **Room Management**: Create and join chat rooms
- **Real-time Messaging**: Send and receive messages instantly
- **Member Tracking**: See who's in each room
- **Live Updates**: Automatic synchronization across all connected clients

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## How to Use

### 1. **Login**
- Enter any username in the login form
- Click "Login" to proceed
- Usernames must be unique

### 2. **Create a Room**
- Enter a room name in the "Create New Room" field
- Click "Create"
- You'll be automatically joined to the new room

### 3. **Join a Room**
- Browse the "Available Rooms" list
- Click "Join Room" on any room to join it
- You'll be switched to the new room

### 4. **Chat**
- Once in a room, use the chat area to send messages
- All room members will see your messages in real-time
- See who else is in the room in the "Members" list

### 5. **Leave a Room**
- Click the "Leave" button to exit the current room
- You can then join or create a different room

## Project Structure

```
.
├── server.js          # Main server file with Socket.io logic
├── package.json       # Project dependencies
└── public/
    ├── index.html     # Client HTML UI
    └── client.js      # Client-side Socket.io logic
```

## Technology Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, JavaScript (vanilla)
- **Communication**: WebSockets

## Server Events

### Client → Server
- `login`: Authenticate user with username
- `create_room`: Create a new chat room
- `join_room`: Join an existing room
- `leave_room`: Leave current room
- `send_message`: Send a message to room
- `get_rooms`: Request list of all available rooms

### Server → Client
- `login_success`: Login successful
- `login_error`: Login failed
- `room_created`: Room creation confirmed
- `room_joined`: Joined room successfully
- `room_members_updated`: Member list changed
- `rooms_list`: List of available rooms
- `room_list_updated`: Room list changed
- `new_message`: New message received
- `error`: General error message

## Notes

- The application stores everything in memory; data is lost on server restart
- This is a demonstration app - for production, add proper authentication and database storage
- Currently supports multiple concurrent connections on a single server
# rnp-game-aid
