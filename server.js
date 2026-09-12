const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: false } });
const rooms = new Map();

app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'PlayRoom' }));

const WORDS = ['CAT','DOG','PIZZA','GUITAR','ELEPHANT','ROCKET','CAKE','SUNGLASSES','BICYCLE','TIGER','ICE CREAM','CASTLE','SUN','TREE','HOUSE','FLOWER'];
const cleanName = (v) => String(v || 'Player').trim().slice(0, 18) || 'Player';
const makeCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
function newCode() { let c; do c = makeCode(); while (rooms.has(c)); return c; }
function getRoom(socket) { return socket.room ? rooms.get(socket.room) : null; }
function publicRoom(code, room) {
  return { code, host: room.host, players: room.players.map(p => ({ id:p.id, name:p.name, avatar:p.avatar, score:p.score })), game: room.game ? room.game.name : null };
}
function broadcastRoom(code) { const r = rooms.get(code); if (r) io.to(code).emit('room:state', publicRoom(code, r)); }
function broadcastScores(code) {
  const r = rooms.get(code); if (!r) return;
  io.to(code).emit('scores:state', r.players.map(p => ({ id:p.id, name:p.name, score:p.score })));
}
function stopDoodle(room) { if (room.doodleTimer) clearInterval(room.doodleTimer); room.doodleTimer = null; }
function startDoodleRound(code) {
  const room = rooms.get(code); if (!room || room.game?.name !== 'doodle') return;
  stopDoodle(room);
  const players = room.players;
  if (players.length < 2) return;
  const d = room.game.doodle;
  if (d.round > d.totalRounds) {
    io.to(code).emit('doodle:finished');
    return;
  }
  d.drawerIndex = (d.round - 1) % players.length;
  d.drawerId = players[d.drawerIndex].id;
  d.word = WORDS[Math.floor(Math.random() * WORDS.length)];
  d.timeLeft = 60;
  io.to(code).emit('draw:clear');
  players.forEach(p => io.to(p.id).emit('doodle:state', {
    round:d.round, totalRounds:d.totalRounds, drawerId:d.drawerId,
    drawerName:players[d.drawerIndex].name, timeLeft:60,
    word:p.id === d.drawerId ? d.word : null
  }));
  room.doodleTimer = setInterval(() => {
    const r = rooms.get(code); if (!r || r.game?.name !== 'doodle') return stopDoodle(r);
    d.timeLeft--;
    io.to(code).emit('doodle:tick', d.timeLeft);
    if (d.timeLeft <= 0) {
      stopDoodle(r);
      io.to(code).emit('doodle:message', `⏰ Time's up! The word was ${d.word}.`);
      d.round++;
      setTimeout(() => startDoodleRound(code), 1200);
    }
  }, 1000);
}
function endGame(code) {
  const room = rooms.get(code); if (!room) return;
  stopDoodle(room); room.game = null; broadcastRoom(code);
}
function checkWin(board) {
  const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) if (board[a] && board[a]===board[b] && board[b]===board[c]) return board[a];
  return board.every(Boolean) ? 'DRAW' : null;
}

io.on('connection', socket => {
  socket.on('room:create', ({ name }) => {
    if (socket.room) socket.leave(socket.room);
    const code = newCode();
    const room = { host:socket.id, players:[{id:socket.id,name:cleanName(name),avatar:'😎',score:0}], game:null, doodleTimer:null };
    rooms.set(code, room); socket.room = code; socket.join(code);
    socket.emit('room:created', { code });
    broadcastRoom(code); broadcastScores(code);
  });

  socket.on('room:join', ({ code, name }) => {
    const c = String(code || '').trim().toUpperCase();
    const room = rooms.get(c);
    if (!room) return socket.emit('room:error', 'Room not found. Check the code.');
    if (room.players.length >= 7) return socket.emit('room:error', 'Room is full (maximum 7 players).');
    if (room.game) return socket.emit('room:error', 'A game is already running. Ask the host to return to the room.');
    const avatars=['🦊','🐼','🐸','🐯','🐨','🐰','🐙'];
    room.players.push({id:socket.id,name:cleanName(name),avatar:avatars[(room.players.length-1)%avatars.length],score:0});
    socket.room=c; socket.join(c); broadcastRoom(c); broadcastScores(c);
  });

  socket.on('room:leave', () => leaveRoom(socket));

  socket.on('game:start', ({ game }) => {
    const code=socket.room, room=getRoom(socket); if (!room) return socket.emit('room:error','Create or join a room first.');
    if (socket.id !== room.host) return socket.emit('room:error','Only the host can start a game.');
    if (game === 'ultimate' && room.players.length !== 2) return socket.emit('room:error','Ultimate Tic-Tac-Toe needs exactly 2 players.');
    if (game === 'doodle' && room.players.length < 2) return socket.emit('room:error','Doodle Guess needs at least 2 players.');
    stopDoodle(room);
    room.game = { name:game };
    if (game === 'doodle') {
      room.game.doodle={round:1,totalRounds:5,drawerIndex:0,drawerId:null,word:null,timeLeft:60};
      io.to(code).emit('game:started','doodle');
      startDoodleRound(code);
    } else if (game === 'ultimate') {
      room.game.ttt={board:Array(9).fill(''),turn:'X',players:[room.players[0].id,room.players[1].id],winner:null};
      io.to(code).emit('game:started','ultimate');
      emitTTT(code);
    } else {
      io.to(code).emit('game:started', game);
    }
    broadcastRoom(code);
  });

  socket.on('draw:stroke', data => {
    const room=getRoom(socket); if (!room?.game?.doodle) return;
    if (room.game.doodle.drawerId !== socket.id) return;
    socket.to(socket.room).emit('draw:stroke', data);
  });
  socket.on('draw:clear', () => {
    const room=getRoom(socket); if (!room?.game?.doodle || room.game.doodle.drawerId !== socket.id) return;
    io.to(socket.room).emit('draw:clear');
  });

  socket.on('doodle:guess', ({ guess }) => {
    const code=socket.room, room=getRoom(socket); if (!room?.game?.doodle) return;
    const d=room.game.doodle; if (socket.id === d.drawerId) return;
    const text=String(guess||'').trim(); if (!text) return;
    const player=room.players.find(p=>p.id===socket.id); if (!player) return;
    if (text.toUpperCase() === d.word.toUpperCase()) {
      player.score += 100;
      const drawer=room.players.find(p=>p.id===d.drawerId); if (drawer) drawer.score += 50;
      io.to(code).emit('doodle:correct', { name:player.name, word:d.word });
      broadcastScores(code);
      stopDoodle(room); d.round++;
      setTimeout(() => startDoodleRound(code), 1200);
    } else {
      io.to(code).emit('doodle:guess', { name:player.name, guess:text.slice(0,40) });
    }
  });

  socket.on('ttt:move', ({ index }) => {
    const code=socket.room, room=getRoom(socket), t=room?.game?.ttt; if (!t || t.winner) return;
    const symbol=t.players[0]===socket.id?'X':t.players[1]===socket.id?'O':null;
    if (!symbol || symbol!==t.turn || !Number.isInteger(index) || index<0 || index>8 || t.board[index]) return;
    t.board[index]=symbol; t.winner=checkWin(t.board); if (!t.winner) t.turn=symbol==='X'?'O':'X';
    if (t.winner && t.winner!=='DRAW') { const p=room.players.find(x=>x.id===socket.id); if(p)p.score+=250; broadcastScores(code); }
    emitTTT(code);
  });
  socket.on('ttt:reset', () => {
    const room=getRoom(socket); if (!room?.game?.ttt || socket.id!==room.host) return;
    room.game.ttt.board=Array(9).fill(''); room.game.ttt.turn='X'; room.game.ttt.winner=null; emitTTT(socket.room);
  });

  socket.on('score:add', n => {
    const room=getRoom(socket); const p=room?.players.find(x=>x.id===socket.id); const points=Math.max(0,Math.min(500,Number(n)||0));
    if(p && points){p.score+=points;broadcastScores(socket.room);broadcastRoom(socket.room);}
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

function emitTTT(code) {
  const room=rooms.get(code); if(!room?.game?.ttt)return;
  const t=room.game.ttt;
  io.to(code).emit('ttt:state',{board:t.board,turn:t.turn,winner:t.winner,players:t.players});
}
function leaveRoom(socket) {
  const code=socket.room, room=rooms.get(code); if(!room)return;
  stopDoodle(room);
  room.players=room.players.filter(p=>p.id!==socket.id);
  if (!room.players.length) { rooms.delete(code); return; }
  if (room.host===socket.id) room.host=room.players[0].id;
  socket.leave(code); socket.room=null;
  if(room.game) { room.game=null; io.to(code).emit('game:ended','A player left. Back to lobby.'); }
  broadcastRoom(code); broadcastScores(code);
}

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`PlayRoom running on port ${PORT}`));
