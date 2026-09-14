const socket = io({ transports: ['websocket', 'polling'] });

let room = null;
let myId = null;
let currentGame = null;
let ctx = null;
let drawing = false;
let erase = false;

const $ = s => document.querySelector(s);

const games = {
  doodle: ['DOODLE GUESS', '2–7 PLAYERS'],
  ultimate: ['ULTIMATE TIC-TAC-TOE', '2 PLAYERS'],
  truth: ['TRUTH OR DARE', '2–7 PLAYERS'],
  would: ['WOULD YOU RATHER', '2–7 PLAYERS'],
  emoji: ['EMOJI DECODE', '2–7 PLAYERS'],
  quiz: ['QUICK QUIZ', '2–7 PLAYERS'],
  reaction: ['REACTION RUSH', '2–7 PLAYERS'],
  word: ['WORD CHAIN', '2–7 PLAYERS']
};

function toast(message) {
  const el = $('#toast');
  if (!el) return;

  el.textContent = message;
  el.style.display = 'block';

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 2500);
}

function toggleJoin() {
  $('#join')?.classList.toggle('hidden');
  $('#playerName')?.focus();
}

function createRoom() {
  const name = $('#playerName')?.value.trim() || 'Player';

  if (!socket.connected) {
    toast('Connecting to server... Please wait.');
    return;
  }

  socket.emit('room:create', { name });
}

function joinRoom() {
  const name = $('#playerName')?.value.trim() || 'Player';
  const code = $('#roomInput')?.value.trim().toUpperCase();

  if (!code) {
    toast('Enter the room code first.');
    return;
  }

  socket.emit('room:join', {
    code,
    name
  });
}

function hideAll() {
  $('#room')?.classList.add('hidden');
  $('#play')?.classList.add('hidden');
}

function showRoom() {
  hideAll();

  $('#room')?.classList.remove('hidden');

  setTimeout(() => {
    $('#room')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }, 100);
}

function goHome() {
  socket.emit('room:leave');

  room = null;
  currentGame = null;

  hideAll();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function renderPlayers() {
  if (!room || !$('#players')) return;

  $('#players').innerHTML = room.players.map(player => `
    <div class="player">
      <span class="av">${player.avatar}</span>
      <b>${escapeHtml(player.name)}</b>
      ${player.id === room.host ? '<small>HOST</small>' : ''}
      <span style="margin-left:auto">
        🏆 ${player.score || 0}
      </span>
    </div>
  `).join('');
}

function startGame(game) {
  if (!room) {
    toast('Create or join a room first ✨');
    return;
  }

  if (myId !== room.host) {
    toast('Only the HOST can start the game.');
    return;
  }

  if (!socket.connected) {
    toast('Connecting to game server...');
    return;
  }

  socket.emit('game:start', { game }, response => {
    if (response && !response.ok) {
      toast(response.message || 'Could not start game.');
    }
  });
}

function copyCode() {
  const code = $('#code')?.textContent?.trim();

  if (!code || code === '------') {
    toast('No room code available.');
    return;
  }

  if (navigator.clipboard) {
    navigator.clipboard.writeText(code)
      .then(() => toast('Room code copied! 🎉'))
      .catch(() => toast('Room code: ' + code));
  } else {
    toast('Room code: ' + code);
  }
}

function addScore(points) {
  socket.emit('score:add', Number(points) || 0);
}


/* =========================
   CONNECTION
========================= */

socket.on('connect', () => {
  myId = socket.id;
  toast('Connected to PlayRoom ⚡');
});

socket.on('connect_error', () => {
  toast('Could not connect to game server. Refresh once.');
});


/* =========================
   ROOM
========================= */

socket.on('room:created', data => {
  if (data?.code) {
    $('#code').textContent = data.code;
    toast('Room created! Share this code 🎉');
  }
});

socket.on('room:state', data => {
  room = data;

  if (data?.code) {
    $('#code').textContent = data.code;
  }

  renderPlayers();
  showRoom();
});

socket.on('room:error', message => {
  toast(message);
});

socket.on('game:error', message => {
  toast(message);
});

socket.on('scores:state', scores => {
  if (!room) return;

  const scoreMap = new Map(
    scores.map(player => [player.id, player.score])
  );

  room.players.forEach(player => {
    if (scoreMap.has(player.id)) {
      player.score = scoreMap.get(player.id);
    }
  });

  renderPlayers();

  const me = scores.find(player => player.id === myId);

  if (me && $('#liveScore')) {
    $('#liveScore').textContent = '🏆 ' + me.score;
  }
});


/* =========================
   GAME START
========================= */

socket.on('game:started', game => {
  const name = typeof game === 'string'
    ? game
    : game?.game;

  if (!games[name]) {
    toast('Game could not be loaded.');
    return;
  }

  renderGame(name);
});

socket.on('game:ended', message => {
  toast(message || 'Game ended');

  currentGame = null;

  setTimeout(() => {
    showRoom();
  }, 500);
});


function renderGame(game) {
  if (!games[game]) {
    toast('Unknown game.');
    return;
  }

  currentGame = game;

  hideAll();

  $('#play')?.classList.remove('hidden');

  if ($('#gameName')) {
    $('#gameName').textContent = games[game][0];
  }

  if ($('#gameMode')) {
    $('#gameMode').textContent = games[game][1];
  }

  if ($('#liveScore')) {
    const me = room?.players.find(p => p.id === myId);

    $('#liveScore').textContent =
      '🏆 ' + (me?.score || 0);
  }

  let html = '';

  if (game === 'doodle') html = doodle();
  if (game === 'ultimate') html = ultimate();
  if (game === 'truth') html = truth();
  if (game === 'would') html = would();
  if (game === 'emoji') html = emoji();
  if (game === 'quiz') html = quiz();
  if (game === 'reaction') html = reaction();
  if (game === 'word') html = word();

  $('#gameArea').innerHTML = html;

  if (game === 'doodle') {
    initDoodle();
  }

  if (game === 'reaction') {
    initReaction();
  }

  if (game === 'would') {
    newWould();
  }
}


/* =========================
   DOODLE GUESS
========================= */

function doodle() {
  return `
    <div class="gameBox">

      <div class="round">
        <span id="dRound">ROUND 1 / 5</span>
        <span class="timer" id="tm">60</span>
        <span id="role">WAITING...</span>
      </div>

      <div class="doodle">

        <div class="canvasBox">

          <canvas
            id="cv"
            width="760"
            height="430">
          </canvas>

          <div class="word" id="wordBox">
            Your word:
            <b id="word">Waiting...</b>
          </div>

        </div>

        <div class="chat">

          <b>💬 LIVE GUESSES</b>

          <div class="chatLog" id="log">
            <div class="chatLine">
              Waiting for the drawer...
            </div>
          </div>

          <div class="chatInput">

            <input
              id="guess"
              placeholder="Guess the word..."
              onkeydown="if(event.key==='Enter') guess()">

            <button onclick="guess()">
              Send
            </button>

          </div>

        </div>

      </div>

      <div class="toolbar">

        <button id="clearBtn" onclick="clearDraw()">
          Clear
        </button>

        <button id="eraserBtn" onclick="eraser()">
          🧽 Eraser
        </button>

        <input
          id="brush"
          type="range"
          min="2"
          max="24"
          value="6">

        <button
          class="neon small"
          onclick="showRoom()">
          END GAME
        </button>

      </div>

    </div>
  `;
}


function initDoodle() {

  drawing = false;
  erase = false;
  ctx = null;

  const canvas = $('#cv');

  if (!canvas) return;

  ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  canvas.onpointerdown = event => {

    if ($('#role')?.dataset.drawer !== 'yes') {
      return;
    }

    drawing = true;

    stroke(event);
  };

  canvas.onpointerup = () => {
    drawing = false;
    ctx?.beginPath();
  };

  canvas.onpointerleave = () => {
    drawing = false;
    ctx?.beginPath();
  };

  canvas.onpointermove = event => {

    if (drawing) {
      stroke(event);
    }

  };
}


function stroke(event) {

  if (!ctx) return;

  const canvas = $('#cv');

  const rect =
    canvas.getBoundingClientRect();

  const x =
    (event.clientX - rect.left) *
    canvas.width /
    rect.width;

  const y =
    (event.clientY - rect.top) *
    canvas.height /
    rect.height;

  const width =
    Number($('#brush')?.value || 6);

  const color =
    erase ? 'white' : '#111';

  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;

  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y);

  socket.emit('draw:stroke', {
    x,
    y,
    w: width,
    color
  });
}


function clearDraw() {

  if ($('#role')?.dataset.drawer !== 'yes') {
    return;
  }

  if (ctx) {

    ctx.clearRect(
      0,
      0,
      $('#cv').width,
      $('#cv').height
    );

    ctx.fillStyle = 'white';

    ctx.fillRect(
      0,
      0,
      $('#cv').width,
      $('#cv').height
    );

    ctx.beginPath();
  }

  socket.emit('draw:clear');
}


function eraser() {

  if ($('#role')?.dataset.drawer !== 'yes') {
    return;
  }

  erase = !erase;

  toast(
    erase
      ? 'Eraser ON 🧽'
      : 'Pen ON ✏️'
  );
}


function guess() {

  const input = $('#guess');

  if (!input) return;

  const value = input.value.trim();

  if (!value) return;

  socket.emit('doodle:guess', {
    guess: value
  });

  input.value = '';
}


socket.on('doodle:state', data => {

  if (currentGame !== 'doodle') return;

  $('#dRound').textContent =
    `ROUND ${data.round} / ${data.totalRounds}`;

  $('#tm').textContent =
    data.timeLeft;

  const role = $('#role');

  role.dataset.drawer =
    data.drawerId === myId
      ? 'yes'
      : 'no';

  role.textContent =
    data.drawerId === myId
      ? '✏️ YOU ARE DRAWING'
      : `🎯 ${escapeHtml(data.drawerName)} IS DRAWING`;

  $('#word').textContent =
    data.word || 'Guess it!';

  $('#guess').disabled =
    data.drawerId === myId;

  $('#clearBtn').disabled =
    data.drawerId !== myId;

  $('#eraserBtn').disabled =
    data.drawerId !== myId;

  $('#brush').disabled =
    data.drawerId !== myId;

  if (data.drawerId === myId) {
    toast('Your turn to draw! ✏️');
  }
});


socket.on('doodle:tick', time => {

  if ($('#tm')) {
    $('#tm').textContent = time;
  }

});


socket.on('doodle:guess', data => {

  const log = $('#log');

  if (!log) return;

  log.innerHTML += `
    <div class="chatLine">
      ${escapeHtml(data.name)}:
      ${escapeHtml(data.guess)}
    </div>
  `;

  log.scrollTop = log.scrollHeight;
});


socket.on('doodle:correct', data => {

  const log = $('#log');

  if (log) {

    log.innerHTML += `
      <div class="chatLine">
        🎉 <b>
          ${escapeHtml(data.name)}
          got it!
          Word: ${escapeHtml(data.word)}
        </b>
      </div>
    `;

  }

  toast(`${data.name} guessed it! +100`);
});


socket.on('doodle:message', message => {

  const log = $('#log');

  if (log) {

    log.innerHTML += `
      <div class="chatLine">
        ${escapeHtml(message)}
      </div>
    `;

  }

});


socket.on('doodle:finished', () => {

  toast('Doodle finished! 🎉');

  setTimeout(() => {
    showRoom();
  }, 800);

});


socket.on('draw:stroke', data => {

  if (!ctx) return;

  ctx.lineWidth = data.w;
  ctx.lineCap = 'round';
  ctx.strokeStyle = data.color;

  ctx.lineTo(data.x, data.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(data.x, data.y);

});


socket.on('draw:clear', () => {

  if (!ctx) return;

  ctx.fillStyle = 'white';

  ctx.fillRect(
    0,
    0,
    $('#cv').width,
    $('#cv').height
  );

  ctx.beginPath();

});


/* =========================
   TIC TAC TOE
========================= */

function ultimate() {

  return `
    <div class="gameBox">

      <div class="round">
        <span>ULTIMATE TIC-TAC-TOE</span>
        <span id="ut">X'S TURN</span>
      </div>

      <div
        class="ttt"
        id="ttt">
      </div>

      <div style="text-align:center">

        <p id="tttInfo">
          Waiting for game...
        </p>

        <button
          class="ghost"
          onclick="resetTTT()">
          RESET BOARD
        </button>

      </div>

    </div>
  `;
}


function move(index) {

  socket.emit('ttt:move', {
    index
  });

}


function resetTTT() {

  socket.emit('ttt:reset');

}


socket.on('ttt:state', state => {

  if (currentGame !== 'ultimate') return;

  paintTTT(state);

  if (state.winner) {

    toast(
      state.winner === 'DRAW'
        ? 'Draw! 🤝'
        : `${state.winner} wins! 🏆`
    );

  }

});


function paintTTT(state) {

  const board = $('#ttt');

  if (!board) return;

  board.innerHTML =
    state.board.map((value, index) => `
      <button
        onclick="move(${index})"
        ${value || state.winner ? 'disabled' : ''}>
        ${value}
      </button>
    `).join('');

  const playerIndex =
    state.players?.indexOf(myId);

  const symbol =
    playerIndex === 0
      ? 'X'
      : playerIndex === 1
        ? 'O'
        : '-';

  if ($('#ut')) {

    $('#ut').textContent =
      state.winner
        ? (
          state.winner === 'DRAW'
            ? 'DRAW GAME'
            : `${state.winner} WINS!`
        )
        : (
          state.turn === symbol
            ? `YOUR TURN (${symbol})`
            : `${state.turn}'S TURN`
        );
  }

  if ($('#tttInfo')) {

    $('#tttInfo').textContent =
      symbol === '-'
        ? 'You are a spectator.'
        : `You are ${symbol}. ${
            state.turn === symbol
              ? 'Your turn!'
              : 'Wait for the other player.'
          }`;
  }

}


/* =========================
   TRUTH OR DARE
========================= */

const truths = [
  ['TRUTH', 'What is your most useless talent?'],
  ['DARE', 'Do your best celebrity impression for 20 seconds.'],
  ['TRUTH', 'What is the funniest thing you have done to impress someone?'],
  ['DARE', 'Talk like a robot until your next turn.'],
  ['TRUTH', 'Who would survive longest in a zombie apocalypse?'],
  ['DARE', 'Make your weirdest face for 10 seconds.']
];

function truth() {

  return `
    <div class="fun">

      <div class="emoji">🎭</div>

      <div class="eyebrow" id="ttype">
        TRUTH
      </div>

      <h3 id="tp">
        Click below to reveal your challenge.
      </h3>

      <button
        class="neon"
        onclick="newTruth()">
        NEW CARD
      </button>

    </div>
  `;
}


function newTruth() {

  const card =
    truths[Math.floor(Math.random() * truths.length)];

  $('#ttype').textContent = card[0];
  $('#tp').textContent = card[1];

}


/* =========================
   WOULD YOU RATHER
========================= */

const wouldCards = [
  ['Have unlimited money', 'Have unlimited free time'],
  ['Fly', 'Be invisible'],
  ['Live without music', 'Live without movies'],
  ['Always be early', 'Always be late']
];

function would() {

  return `
    <div class="fun">

      <div class="emoji">🤔</div>

      <h3>WOULD YOU RATHER?</h3>

      <div class="choices">

        <button
          id="w1"
          onclick="vote(1)">
          Option A
        </button>

        <button
          id="w2"
          onclick="vote(2)">
          Option B
        </button>

      </div>

      <button
        class="neon"
        onclick="newWould()">
        NEW QUESTION
      </button>

    </div>
  `;
}


function newWould() {

  const card =
    wouldCards[
      Math.floor(Math.random() * wouldCards.length)
    ];

  if ($('#w1')) $('#w1').textContent = card[0];
  if ($('#w2')) $('#w2').textContent = card[1];

}


function vote(option) {

  toast(
    option === 1
      ? 'You chose A 👍'
      : 'You chose B 👍'
  );

  addScore(10);

}


/* =========================
   EMOJI
========================= */

const emojiCards = [
  ['🐱👑', 'CAT KING'],
  ['🍕❤️', 'LOVE PIZZA'],
  ['🚀🌙', 'MOON ROCKET'],
  ['☀️🏖️', 'SUNNY BEACH']
];

function emoji() {

  const card =
    emojiCards[
      Math.floor(Math.random() * emojiCards.length)
    ];

  return `
    <div class="fun">

      <div class="emoji">
        ${card[0]}
      </div>

      <h3>
        Guess the phrase!
      </h3>

      <input
        class="answer"
        id="ei"
        placeholder="Your answer">

      <button
        class="neon"
        onclick="checkE('${card[1]}')">
        CHECK
      </button>

      <p id="er"></p>

    </div>
  `;
}


function checkE(answer) {

  const input =
    $('#ei')?.value.trim().toUpperCase();

  if (!input) return;

  if (input === answer) {

    $('#er').textContent =
      '🎉 Correct! +50';

    addScore(50);

  } else {

    $('#er').textContent =
      '❌ Try again!';

  }

}


/* =========================
   QUIZ
========================= */

const quizCards = [
  ['What is 5 + 7?', '12'],
  ['Which planet is known as the Red Planet?', 'MARS'],
  ['How many days are in a week?', '7'],
  ['What is the capital of France?', 'PARIS']
];

function quiz() {

  const card =
    quizCards[
      Math.floor(Math.random() * quizCards.length)
    ];

  return `
    <div class="fun">

      <div class="emoji">🧠</div>

      <h3>
        ${card[0]}
      </h3>

      <input
        class="answer"
        id="qi"
        placeholder="Your answer">

      <button
        class="neon"
        onclick="qa('${card[1]}')">
        ANSWER
      </button>

      <p id="qr"></p>

    </div>
  `;
}


function qa(answer) {

  const input =
    $('#qi')?.value.trim().toUpperCase();

  if (!input) return;

  if (input === answer.toUpperCase()) {

    $('#qr').textContent =
      '🎉 Correct! +50';

    addScore(50);

  } else {

    $('#qr').textContent =
      '❌ Wrong answer!';

  }

}


/* =========================
   REACTION RUSH
========================= */

function reaction() {

  return `
    <div class="fun">

      <div class="emoji">⚡</div>

      <h3>
        REACTION RUSH
      </h3>

      <div
        class="reaction"
        id="reaction">
        WAIT...
      </div>

      <p>
        Wait for CLICK! then click as fast as possible.
      </p>

    </div>
  `;
}


function initReaction() {

  const reactionBox =
    $('#reaction');

  if (!reactionBox) return;

  reactionBox.textContent = 'WAIT...';

  const delay =
    1000 + Math.random() * 3000;

  setTimeout(() => {

    if (!$('#reaction')) return;

    reactionBox.className =
      'reaction go';

    reactionBox.textContent =
      'CLICK!';

    reactionBox.dataset.start =
      performance.now();

  }, delay);

  reactionBox.onclick = () => {

    if (!reactionBox.dataset.start) {

      toast('Too early! 😅');

      return;

    }

    const time =
      performance.now() -
      Number(reactionBox.dataset.start);

    toast(
      Math.round(time) +
      ' ms! ⚡'
    );

    addScore(
      Math.max(
        10,
        300 - Math.round(time / 5)
      )
    );

    reactionBox.dataset.start = '';

    initReaction();

  };

}


/* =========================
   WORD CHAIN
========================= */

function word() {

  return `
    <div class="fun">

      <div class="emoji">🔤</div>

      <h3>
        Word Chain
      </h3>

      <p>
        Type a word beginning with the last letter.
      </p>

      <div
        class="answer"
        id="chain">
        START
      </div>

      <input
        class="answer"
        id="wi"
        placeholder="Your word">

      <button
        class="neon"
        onclick="chain()">
        SEND WORD
      </button>

      <p id="wr"></p>

    </div>
  `;
}


function chain() {

  const input = $('#wi');

  if (!input) return;

  const value =
    input.value.trim();

  if (!value) return;

  const last =
    $('#chain')
      .textContent
      .trim()
      .slice(-1)
      .toLowerCase();

  if (
    value[0].toLowerCase() !== last
  ) {

    $('#wr').textContent =
      '❌ Start with ' +
      last.toUpperCase();

  } else {

    $('#chain').textContent =
      value.toUpperCase();

    $('#wr').textContent =
      '🔥 Chain continues!';

    addScore(25);

  }

  input.value = '';

}


/* =========================
   INLINE BUTTON SUPPORT
========================= */

Object.assign(window, {
  createRoom,
  joinRoom,
  toggleJoin,
  startGame,
  showRoom,
  goHome,
  copyCode,
  guess,
  clearDraw,
  eraser,
  move,
  resetTTT,
  newTruth,
  newWould,
  vote,
  checkE,
  qa,
  chain,
  renderGame
});
