const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: false
  }
});

const rooms = new Map();


/* =========================
   BASIC SETUP
========================= */

app.use(express.static(__dirname));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'PlayRoom'
  });
});


const WORDS = [
  'CAT',
  'DOG',
  'PIZZA',
  'GUITAR',
  'ELEPHANT',
  'ROCKET',
  'CAKE',
  'SUNGLASSES',
  'BICYCLE',
  'TIGER',
  'ICE CREAM',
  'CASTLE',
  'SUN',
  'TREE',
  'HOUSE',
  'FLOWER'
];


function cleanName(value) {

  return String(value || 'Player')
    .trim()
    .slice(0, 18) || 'Player';

}


function makeCode() {

  return crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase();

}


function newCode() {

  let code;

  do {
    code = makeCode();
  } while (rooms.has(code));

  return code;

}


function getRoom(socket) {

  if (!socket.room) {
    return null;
  }

  return rooms.get(socket.room) || null;

}


function publicRoom(code, room) {

  return {
    code,
    host: room.host,

    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      score: player.score
    })),

    game: room.game
      ? room.game.name
      : null
  };

}


function broadcastRoom(code) {

  const room = rooms.get(code);

  if (!room) return;

  io.to(code).emit(
    'room:state',
    publicRoom(code, room)
  );

}


function broadcastScores(code) {

  const room = rooms.get(code);

  if (!room) return;

  io.to(code).emit(
    'scores:state',
    room.players.map(player => ({
      id: player.id,
      name: player.name,
      score: player.score
    }))
  );

}


/* =========================
   DOODLE
========================= */

function stopDoodle(room) {

  if (room?.doodleTimer) {
    clearInterval(room.doodleTimer);
  }

  if (room) {
    room.doodleTimer = null;
  }

}


function startDoodleRound(code) {

  const room = rooms.get(code);

  if (!room || room.game?.name !== 'doodle') {
    return;
  }

  stopDoodle(room);

  if (room.players.length < 2) {
    return;
  }

  const doodle = room.game.doodle;

  if (doodle.round > doodle.totalRounds) {

    io.to(code).emit(
      'doodle:finished'
    );

    room.game = null;

    broadcastRoom(code);

    return;
  }


  /* Rotate drawer every round.
     With 2 players:
     Round 1 → Player 1
     Round 2 → Player 2
     Round 3 → Player 1
  */

  doodle.drawerIndex =
    (doodle.round - 1) %
    room.players.length;

  doodle.drawerId =
    room.players[doodle.drawerIndex].id;

  doodle.word =
    WORDS[
      Math.floor(
        Math.random() * WORDS.length
      )
    ];

  doodle.timeLeft = 60;


  io.to(code).emit('draw:clear');


  room.players.forEach(player => {

    io.to(player.id).emit(
      'doodle:state',
      {
        round: doodle.round,
        totalRounds: doodle.totalRounds,

        drawerId: doodle.drawerId,

        drawerName:
          room.players[doodle.drawerIndex].name,

        timeLeft: 60,

        word:
          player.id === doodle.drawerId
            ? doodle.word
            : null
      }
    );

  });


  room.doodleTimer =
    setInterval(() => {

      const currentRoom =
        rooms.get(code);

      if (
        !currentRoom ||
        currentRoom.game?.name !== 'doodle'
      ) {

        if (currentRoom) {
          stopDoodle(currentRoom);
        }

        return;
      }


      doodle.timeLeft--;

      io.to(code).emit(
        'doodle:tick',
        doodle.timeLeft
      );


      if (doodle.timeLeft <= 0) {

        stopDoodle(currentRoom);

        io.to(code).emit(
          'doodle:message',
          `⏰ Time's up! The word was ${doodle.word}.`
        );

        doodle.round++;

        setTimeout(() => {
          startDoodleRound(code);
        }, 1200);

      }

    }, 1000);

}


/* =========================
   TIC TAC TOE
========================= */

function checkWin(board) {

  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],

    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],

    [0, 4, 8],
    [2, 4, 6]
  ];


  for (const [a, b, c] of lines) {

    if (
      board[a] &&
      board[a] === board[b] &&
      board[b] === board[c]
    ) {

      return board[a];

    }

  }


  if (board.every(Boolean)) {
    return 'DRAW';
  }

  return null;

}


function emitTTT(code) {

  const room = rooms.get(code);

  if (!room?.game?.ttt) {
    return;
  }

  const ttt =
    room.game.ttt;

  io.to(code).emit(
    'ttt:state',
    {
      board: ttt.board,
      turn: ttt.turn,
      winner: ttt.winner,
      players: ttt.players
    }
  );

}


/* =========================
   SOCKET CONNECTION
========================= */

io.on('connection', socket => {


  /* =======================
     CREATE ROOM
  ======================= */

  socket.on(
    'room:create',
    ({ name }) => {

      if (socket.room) {
        socket.leave(socket.room);
      }


      const code =
        newCode();


      const room = {

        host: socket.id,

        players: [
          {
            id: socket.id,
            name: cleanName(name),
            avatar: '😎',
            score: 0
          }
        ],

        game: null,

        doodleTimer: null

      };


      rooms.set(
        code,
        room
      );


      socket.room = code;

      socket.join(code);


      socket.emit(
        'room:created',
        {
          code
        }
      );


      broadcastRoom(code);

      broadcastScores(code);

    }
  );


  /* =======================
     JOIN ROOM
  ======================= */

  socket.on(
    'room:join',
    ({ code, name }) => {

      const cleanCode =
        String(code || '')
          .trim()
          .toUpperCase();


      const room =
        rooms.get(cleanCode);


      if (!room) {

        socket.emit(
          'room:error',
          'Room not found. Check the code.'
        );

        return;
      }


      if (room.players.length >= 7) {

        socket.emit(
          'room:error',
          'Room is full. Maximum 7 players.'
        );

        return;
      }


      if (room.game) {

        socket.emit(
          'room:error',
          'A game is already running.'
        );

        return;
      }


      const avatars = [
        '🦊',
        '🐼',
        '🐸',
        '🐯',
        '🐨',
        '🐰',
        '🐙'
      ];


      room.players.push({

        id: socket.id,

        name: cleanName(name),

        avatar:
          avatars[
            (room.players.length - 1) %
            avatars.length
          ],

        score: 0

      });


      socket.room =
        cleanCode;

      socket.join(cleanCode);


      broadcastRoom(cleanCode);

      broadcastScores(cleanCode);

    }
  );


  /* =======================
     LEAVE ROOM
  ======================= */

  socket.on(
    'room:leave',
    () => {
      leaveRoom(socket);
    }
  );


  /* =======================
     START GAME
  ======================= */

  socket.on(
    'game:start',
    ({ game }, ack) => {

      const room =
        getRoom(socket);


      function fail(message) {

        socket.emit(
          'game:error',
          message
        );

        if (typeof ack === 'function') {

          ack({
            ok: false,
            message
          });

        }

      }


      if (!room) {

        fail(
          'Create or join a room first.'
        );

        return;
      }


      if (socket.id !== room.host) {

        fail(
          'Only the HOST can start a game.'
        );

        return;
      }


      const availableGames = [
        'doodle',
        'ultimate',
        'truth',
        'would',
        'emoji',
        'quiz',
        'reaction',
        'word'
      ];


      if (!availableGames.includes(game)) {

        fail(
          'That game is not available.'
        );

        return;
      }


      if (
        game === 'ultimate' &&
        room.players.length !== 2
      ) {

        fail(
          'Ultimate Tic-Tac-Toe needs exactly 2 players.'
        );

        return;
      }


      if (
        game === 'doodle' &&
        room.players.length < 2
      ) {

        fail(
          'Doodle Guess needs at least 2 players.'
        );

        return;
      }


      stopDoodle(room);


      room.game = {
        name: game
      };


      /* DOODLE */

      if (game === 'doodle') {

        room.game.doodle = {

          round: 1,

          totalRounds: 5,

          drawerIndex: 0,

          drawerId: null,

          word: null,

          timeLeft: 60

        };


        io.to(roomCode(socket)).emit(
          'game:started',
          'doodle'
        );


        startDoodleRound(
          roomCode(socket)
        );

      }


      /* TIC TAC TOE */

      else if (game === 'ultimate') {

        room.game.ttt = {

          board:
            Array(9).fill(''),

          turn: 'X',

          players: [
            room.players[0].id,
            room.players[1].id
          ],

          winner: null

        };


        io.to(roomCode(socket)).emit(
          'game:started',
          'ultimate'
        );


        emitTTT(
          roomCode(socket)
        );

      }


      /* OTHER GAMES */

      else {

        io.to(roomCode(socket)).emit(
          'game:started',
          game
        );

      }


      broadcastRoom(
        roomCode(socket)
      );


      if (typeof ack === 'function') {

        ack({
          ok: true,
          game
        });

      }

    }
  );


  /* =======================
     DRAWING
  ======================= */

  socket.on(
    'draw:stroke',
    data => {

      const room =
        getRoom(socket);


      if (
        !room?.game?.doodle
      ) {
        return;
      }


      if (
        room.game.doodle.drawerId !==
        socket.id
      ) {
        return;
      }


      socket
        .to(socket.room)
        .emit(
          'draw:stroke',
          data
        );

    }
  );


  socket.on(
    'draw:clear',
    () => {

      const room =
        getRoom(socket);


      if (
        !room?.game?.doodle
      ) {
        return;
      }


      if (
        room.game.doodle.drawerId !==
        socket.id
      ) {
        return;
      }


      io.to(socket.room).emit(
        'draw:clear'
      );

    }
  );


  /* =======================
     DOODLE GUESS
  ======================= */

  socket.on(
    'doodle:guess',
    ({ guess }) => {

      const code =
        socket.room;

      const room =
        getRoom(socket);


      if (
        !room?.game?.doodle
      ) {
        return;
      }


      const doodle =
        room.game.doodle;


      if (
        socket.id === doodle.drawerId
      ) {
        return;
      }


      const text =
        String(guess || '')
          .trim();


      if (!text) {
        return;
      }


      const player =
        room.players.find(
          p => p.id === socket.id
        );


      if (!player) {
        return;
      }


      /* CORRECT ANSWER */

      if (
        text.toUpperCase() ===
        doodle.word.toUpperCase()
      ) {

        player.score += 100;


        const drawer =
          room.players.find(
            p => p.id === doodle.drawerId
          );


        if (drawer) {
          drawer.score += 50;
        }


        io.to(code).emit(
          'doodle:correct',
          {
            name: player.name,
            word: doodle.word
          }
        );


        broadcastScores(code);


        stopDoodle(room);


        doodle.round++;


        setTimeout(() => {

          startDoodleRound(code);

        }, 1200);


      }


      /* WRONG GUESS */

      else {

        io.to(code).emit(
          'doodle:guess',
          {
            name: player.name,
            guess: text.slice(0, 40)
          }
        );

      }

    }
  );


  /* =======================
     TIC TAC TOE MOVE
  ======================= */

  socket.on(
    'ttt:move',
    ({ index }) => {

      const code =
        socket.room;

      const room =
        getRoom(socket);

      const ttt =
        room?.game?.ttt;


      if (!ttt) {
        return;
      }


      if (ttt.winner) {
        return;
      }


      const symbol =
        ttt.players[0] === socket.id
          ? 'X'
          : ttt.players[1] === socket.id
            ? 'O'
            : null;


      if (!symbol) {
        return;
      }


      if (symbol !== ttt.turn) {
        return;
      }


      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > 8
      ) {
        return;
      }


      if (ttt.board[index]) {
        return;
      }


      ttt.board[index] =
        symbol;


      ttt.winner =
        checkWin(ttt.board);


      if (!ttt.winner) {

        ttt.turn =
          symbol === 'X'
            ? 'O'
            : 'X';

      }


      if (
        ttt.winner &&
        ttt.winner !== 'DRAW'
      ) {

        const player =
          room.players.find(
            p => p.id === socket.id
          );


        if (player) {
          player.score += 250;
        }


        broadcastScores(code);

      }


      emitTTT(code);

    }
  );


  /* =======================
     RESET TTT
  ======================= */

  socket.on(
    'ttt:reset',
    () => {

      const room =
        getRoom(socket);


      if (
        !room?.game?.ttt
      ) {
        return;
      }


      if (
        socket.id !== room.host
      ) {
        return;
      }


      room.game.ttt.board =
        Array(9).fill('');


      room.game.ttt.turn =
        'X';


      room.game.ttt.winner =
        null;


      emitTTT(
        socket.room
      );

    }
  );


  /* =======================
     SCORE
  ======================= */

  socket.on(
    'score:add',
    points => {

      const room =
        getRoom(socket);


      const player =
        room?.players.find(
          p => p.id === socket.id
        );


      const value =
        Math.max(
          0,
          Math.min(
            500,
            Number(points) || 0
          )
        );


      if (
        player &&
        value
      ) {

        player.score += value;

        broadcastScores(
          socket.room
        );

        broadcastRoom(
          socket.room
        );

      }

    }
  );


  /* =======================
     DISCONNECT
  ======================= */

  socket.on(
    'disconnect',
    () => {

      leaveRoom(socket);

    }
  );

});


/* =========================
   HELPER
========================= */

function roomCode(socket) {

  return socket.room;

}


/* =========================
   LEAVE ROOM
========================= */

function leaveRoom(socket) {

  const code =
    socket.room;

  const room =
    rooms.get(code);


  if (!room) {
    return;
  }


  stopDoodle(room);


  room.players =
    room.players.filter(
      player =>
        player.id !== socket.id
    );


  if (!room.players.length) {

    rooms.delete(code);

    return;

  }


  /* If host leaves,
     next player becomes host */

  if (
    room.host === socket.id
  ) {

    room.host =
      room.players[0].id;

  }


  socket.leave(code);

  socket.room = null;


  if (room.game) {

    room.game = null;


    io.to(code).emit(
      'game:ended',
      'A player left. Back to lobby.'
    );

  }


  broadcastRoom(code);

  broadcastScores(code);

}


/* =========================
   SERVER
========================= */

const PORT =
  process.env.PORT || 3000;


server.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `PlayRoom running on port ${PORT}`
    );

  }
);
