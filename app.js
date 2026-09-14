const socket=io({transports:['websocket','polling']});

let room=null;
let myId=null;
let currentGame=null;
let ctx=null;
let drawing=false;
let erase=false;

let truthState=null;
let wouldState=null;
let reactionState=null;
let bikeState=null;
let fightState=null;

const $=s=>document.querySelector(s);

const games={
  doodle:['DOODLE GUESS','2–7 PLAYERS'],
  ultimate:['ULTIMATE TIC-TAC-TOE','2 PLAYERS'],
  truth:['TRUTH OR DARE','2–7 PLAYERS'],
  would:['WOULD YOU RATHER','2–7 PLAYERS'],
  emoji:['EMOJI DECODE','2–7 PLAYERS'],
  quiz:['QUICK QUIZ','2–7 PLAYERS'],
  reaction:['REACTION RUSH','2–7 PLAYERS'],
  word:['WORD CHAIN','2–7 PLAYERS'],
  bike:['BIKE RACING','2–7 PLAYERS'],
  fight:['NEON FIGHT','2 PLAYERS']
};

function esc(v){
  return String(v).replace(/[&<>'"]/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  }[c]));
}

function toast(t){
  const e=$('#toast');
  if(!e)return;

  e.textContent=t;
  e.style.display='block';

  clearTimeout(window.tt);

  window.tt=setTimeout(
    ()=>e.style.display='none',
    2200
  );
}

function toggleJoin(){
  $('#join')?.classList.toggle('hidden');
  $('#playerName')?.focus();
}

function createRoom(){

  socket.emit(
    'room:create',
    {
      name:
        $('#playerName')?.value.trim()||
        'Player'
    }
  );

}

function joinRoom(){

  const code=
    $('#roomInput')?.value.trim();

  if(!code){
    return toast(
      'Enter the room code first.'
    );
  }

  socket.emit(
    'room:join',
    {
      code,
      name:
        $('#playerName')?.value.trim()||
        'Player'
    }
  );

}

function hideAll(){

  $('#room')?.classList.add('hidden');
  $('#play')?.classList.add('hidden');

}

function showRoom(){

  currentGame=null;

  hideAll();

  $('#room')?.classList.remove('hidden');

  setTimeout(()=>{
    $('#room')?.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });
  },80);

}

function renderPlayers(){

  if(!room||!$('#players'))return;

  $('#players').innerHTML=
    room.players.map(p=>`

      <div class="player">

        <span class="av">
          ${p.avatar}
        </span>

        <b>
          ${esc(p.name)}
        </b>

        ${
          p.id===room.host
          ?' <small>HOST</small>'
          :''
        }

        <span style="margin-left:auto">
          🏆 ${p.score||0}
        </span>

      </div>

    `).join('');

}

function startGame(g){

  if(!room){
    return toast(
      'Create or join a room first ✨'
    );
  }

  socket.emit(
    'game:start',
    {game:g},
    a=>{
      if(a&&!a.ok){
        toast(a.message);
      }
    }
  );

}

function copyCode(){

  const c=
    $('#code')?.textContent||'';

  navigator.clipboard
    ?.writeText(c)
    .then(
      ()=>toast('Room code copied!')
    )
    .catch(
      ()=>toast('Room code: '+c)
    );

}

function goHome(){

  socket.emit('room:leave');

  room=null;
  currentGame=null;

  hideAll();

  window.scrollTo({
    top:0,
    behavior:'smooth'
  });

}

function addScore(n){
  socket.emit('score:add',n);
}


/* =================================
   PARTY CHAT
================================= */

function partyChat(){

  return `

    <div class="partyChat">

      <b>💬 PARTY CHAT</b>

      <div
        id="partyLog"
        class="chatLog">
      </div>

      <div class="chatInput">

        <input
          id="partyInput"
          placeholder="Type a message…"
          onkeydown="
            if(event.key==='Enter')
            sendPartyChat()
          "
        >

        <button
          onclick="sendPartyChat()">
          SEND
        </button>

      </div>

    </div>

  `;

}

function sendPartyChat(){

  const input=$('#partyInput');

  const message=
    input?.value.trim();

  if(!message)return;

  socket.emit(
    'party:chat',
    message.slice(0,160)
  );

  input.value='';

}

function appendChat(name,msg){

  const log=$('#partyLog');

  if(!log)return;

  log.innerHTML+=`

    <div class="chatLine">

      <b>${esc(name)}:</b>
      ${esc(msg)}

    </div>

  `;

  log.scrollTop=
    log.scrollHeight;

}


/* =================================
   CONNECTION
================================= */

socket.on(
  'connect',
  ()=>{
    myId=socket.id;
    toast('Connected ⚡');
  }
);

socket.on(
  'connect_error',
  ()=>{
    toast(
      'Server connection failed. Refresh once.'
    );
  }
);


/* =================================
   ROOM
================================= */

socket.on(
  'room:created',
  d=>{

    $('#code').textContent=
      d.code;

    toast(
      'Room created! Share this code 🎉'
    );

  }
);


/*
 IMPORTANT:
 The lobby must NOT appear while
 a game is running.
*/

socket.on(
  'room:state',
  r=>{

    room=r;

    $('#code').textContent=
      r.code;

    renderPlayers();

    if(!currentGame){
      showRoom();
    }

  }
);

socket.on(
  'room:error',
  toast
);

socket.on(
  'game:error',
  toast
);

socket.on(
  'scores:state',
  scores=>{

    if(!room)return;

    const map=
      new Map(
        scores.map(
          x=>[x.id,x.score]
        )
      );

    room.players.forEach(
      p=>{
        if(map.has(p.id)){
          p.score=
            map.get(p.id);
        }
      }
    );

    renderPlayers();

    const me=
      scores.find(
        x=>x.id===myId
      );

    if(
      me&&
      $('#liveScore')
    ){

      $('#liveScore').textContent=
        '🏆 '+me.score;

    }

  }
);


/* =================================
   GAME START
================================= */

socket.on(
  'game:started',
  g=>{

    const game=
      typeof g==='string'
      ?g
      :g?.game;

    if(!games[game]){

      return toast(
        'Game could not be loaded.'
      );

    }

    renderGame(game);

  }
);

socket.on(
  'game:ended',
  msg=>{

    toast(
      msg||
      'Game ended'
    );

    currentGame=null;

    showRoom();

  }
);


function renderGame(g){

  currentGame=g;

  hideAll();

  $('#play').classList.remove(
    'hidden'
  );

  $('#gameName').textContent=
    games[g][0];

  $('#gameMode').textContent=
    games[g][1];

  let html='';

  if(g==='doodle')
    html=doodle();

  else if(g==='ultimate')
    html=ultimate();

  else if(g==='truth')
    html=truth();

  else if(g==='would')
    html=would();

  else if(g==='emoji')
    html=emoji();

  else if(g==='quiz')
    html=quiz();

  else if(g==='reaction')
    html=reaction();

  else if(g==='word')
    html=word();

  else if(g==='bike')
    html=bike();

  else if(g==='fight')
    html=fight();

  $('#gameArea').innerHTML=
    html;

  if(g==='doodle')
    initDoodle();

  if(g==='truth')
    renderTruthState();

  if(g==='would')
    renderWouldState();

  if(g==='reaction')
    renderReactionState();

  if(g==='bike')
    renderBike();

  if(g==='fight')
    renderFight();

}


/* =================================
   DOODLE
================================= */

function doodle(){

  return `

    <div class="gameBox">

      <div class="round">

        <span id="dRound">
          ROUND 1 / 5
        </span>

        <span
          class="timer"
          id="tm">
          60
        </span>

        <span id="role">
          WAITING…
        </span>

      </div>

      <div class="doodle">

        <div class="canvasBox">

          <canvas
            id="cv"
            width="760"
            height="430">
          </canvas>

          <div
            class="word"
            id="wordBox">

            Your word:
            <b id="word">
              Waiting…
            </b>

          </div>

        </div>

        <div class="chat">

          <b>
            💬 LIVE GUESSES
          </b>

          <div
            class="chatLog"
            id="log">
            Waiting for the drawer…
          </div>

          <div class="chatInput">

            <input
              id="guess"
              placeholder="Guess the word…"
              onkeydown="
                if(event.key==='Enter')
                guess()
              "
            >

            <button
              onclick="guess()">
              SEND
            </button>

          </div>

        </div>

      </div>

      <div class="toolbar">

        <button
          onclick="clearDraw()">
          CLEAR
        </button>

        <button
          onclick="eraser()">
          🧽 ERASER
        </button>

        <input
          id="brush"
          type="range"
          min="2"
          max="24"
          value="6"
        >

        <button
          class="ghost"
          onclick="endGame()">
          END GAME
        </button>

      </div>

    </div>

  `;

}

function initDoodle(){

  const c=$('#cv');

  if(!c)return;

  ctx=
    c.getContext('2d');

  ctx.fillStyle='white';

  ctx.fillRect(
    0,
    0,
    c.width,
    c.height
  );

  c.onpointerdown=e=>{

    if(
      $('#role').dataset.drawer!=='yes'
    ){
      return;
    }

    drawing=true;

    stroke(e);

  };

  c.onpointerup=()=>{
    drawing=false;
    ctx.beginPath();
  };

  c.onpointerleave=()=>{
    drawing=false;
    ctx.beginPath();
  };

  c.onpointermove=e=>{
    if(drawing)stroke(e);
  };

}

function stroke(e){

  if(!ctx)return;

  const c=$('#cv');

  const r=
    c.getBoundingClientRect();

  const x=
    (e.clientX-r.left)*
    c.width/r.width;

  const y=
    (e.clientY-r.top)*
    c.height/r.height;

  ctx.lineWidth=
    +$('#brush').value;

  ctx.lineCap='round';

  ctx.strokeStyle=
    erase
    ?'white'
    :'#111';

  ctx.lineTo(x,y);

  ctx.stroke();

  ctx.beginPath();

  ctx.moveTo(x,y);

  socket.emit(
    'draw:stroke',
    {
      x,
      y,
      w:ctx.lineWidth,
      color:ctx.strokeStyle
    }
  );

}

function clearDraw(){

  if(
    $('#role')?.dataset.drawer!=='yes'
  )return;

  ctx?.clearRect(
    0,
    0,
    $('#cv').width,
    $('#cv').height
  );

  if(ctx){

    ctx.fillStyle='white';

    ctx.fillRect(
      0,
      0,
      $('#cv').width,
      $('#cv').height
    );

    ctx.beginPath();

  }

  socket.emit(
    'draw:clear'
  );

}

function eraser(){

  if(
    $('#role')?.dataset.drawer!=='yes'
  )return;

  erase=!erase;

  toast(
    erase
    ?'ERASER ON 🧽'
    :'PEN ON ✏️'
  );

}

function guess(){

  const i=$('#guess');

  const v=
    i?.value.trim();

  if(!v)return;

  socket.emit(
    'doodle:guess',
    {guess:v}
  );

  i.value='';

}

socket.on(
  'doodle:state',
  d=>{

    if(currentGame!=='doodle')
      return;

    $('#dRound').textContent=
      `ROUND ${d.round} / ${d.totalRounds}`;

    $('#tm').textContent=
      d.timeLeft;

    const r=$('#role');

    r.dataset.drawer=
      d.drawerId===myId
      ?'yes'
      :'no';

    r.textContent=
      d.drawerId===myId
      ?'✏️ YOU ARE DRAWING'
      :`🎯 ${esc(d.drawerName)} IS DRAWING`;

    $('#word').textContent=
      d.word||'Guess it!';

    $('#guess').disabled=
      d.drawerId===myId;

    $('#brush').disabled=
      d.drawerId!==myId;

    if(
      d.drawerId===myId
    ){
      toast(
        'Your turn to draw! ✏️'
      );
    }

  }
);

socket.on(
  'doodle:tick',
  n=>{
    if($('#tm'))
      $('#tm').textContent=n;
  }
);

socket.on(
  'doodle:guess',
  d=>{

    if($('#log')){

      $('#log').innerHTML+=`

        <div class="chatLine">

          <b>${esc(d.name)}:</b>
          ${esc(d.guess)}

        </div>

      `;

    }

  }
);

socket.on(
  'doodle:correct',
  d=>{
    toast(
      `${d.name} guessed ${d.word}! 🎉`
    );
  }
);

socket.on(
  'doodle:message',
  m=>{

    if($('#log')){

      $('#log').innerHTML+=`

        <div class="chatLine">
          ${esc(m)}
        </div>

      `;

    }

  }
);

socket.on(
  'doodle:finished',
  ()=>{
    currentGame=null;
    showRoom();
  }
);

socket.on(
  'draw:stroke',
  d=>{

    if(!ctx)return;

    ctx.lineWidth=d.w;
    ctx.lineCap='round';
    ctx.strokeStyle=d.color;

    ctx.lineTo(
      d.x,
      d.y
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
      d.x,
      d.y
    );

  }
);

socket.on(
  'draw:clear',
  ()=>{

    if(ctx){

      ctx.fillStyle='white';

      ctx.fillRect(
        0,
        0,
        $('#cv').width,
        $('#cv').height
      );

      ctx.beginPath();

    }

  }
);


/* =================================
   TIC TAC TOE
================================= */

function ultimate(){

  return `

    <div class="gameBox">

      <div class="round">

        <span>
          ULTIMATE TIC-TAC-TOE
        </span>

        <span id="ut">
          X'S TURN
        </span>

      </div>

      <div
        class="ttt"
        id="ttt">
      </div>

      <p id="tttInfo">
        Waiting…
      </p>

      <button
        class="ghost"
        onclick="resetTTT()">
        RESET BOARD
      </button>

    </div>

  `;

}

function move(i){
  socket.emit(
    'ttt:move',
    {index:i}
  );
}

function resetTTT(){
  socket.emit('ttt:reset');
}

socket.on(
  'ttt:state',
  t=>{
    if(currentGame==='ultimate')
      paintTTT(t);
  }
);

function paintTTT(t){

  const e=$('#ttt');

  if(!e)return;

  e.innerHTML=
    t.board.map(
      (x,i)=>
        `<button
          onclick="move(${i})"
          ${x||t.winner?'disabled':''}>
          ${x}
        </button>`
    ).join('');

  const n=
    t.players.indexOf(myId);

  const s=
    n===0?'X':
    n===1?'O':'-';

  $('#ut').textContent=
    t.winner
    ?(
      t.winner==='DRAW'
      ?'DRAW GAME'
      :t.winner+' WINS!'
    )
    :(
      t.turn===s
      ?'YOUR TURN ('+s+')'
      :t.turn+"'S TURN"
    );

  $('#tttInfo').textContent=
    'You are '+s+'. '+
    (
      t.turn===s
      ?'Your turn!'
      :'Wait for the other player.'
    );

}


/* =================================
   TRUTH OR DARE
================================= */

function truth(){

  return `

    <div class="fun">

      <div class="emoji">
        🎭
      </div>

      <div
        id="truthTurn"
        class="eyebrow">
      </div>

      <h3 id="truthPrompt">
      </h3>

      <div id="truthActions">
      </div>

      ${partyChat()}

    </div>

  `;

}

function renderTruthState(){

  if(!truthState)return;

  $('#truthTurn').textContent=
    truthState.turnName+
    "'S TURN • "+
    truthState.type;

  $('#truthPrompt').textContent=
    truthState.prompt;

  $('#truthActions').innerHTML=
    truthState.turnId===myId

    ?

    `<button
      class="neon"
      onclick="truthDone()">
      DONE / NEXT PLAYER
    </button>`

    :

    `<p>
      Watch ${esc(truthState.turnName)}
      and chat with the party 💬
    </p>`;

}

function truthDone(){
  socket.emit('truth:done');
}

socket.on(
  'truth:state',
  d=>{
    truthState=d;

    if(currentGame==='truth')
      renderTruthState();
  }
);


/* =================================
   WOULD YOU RATHER
================================= */

function would(){

  return `

    <div class="fun">

      <div class="emoji">
        🤔
      </div>

      <h3>
        WOULD YOU RATHER?
      </h3>

      <p id="wouldQ">
      </p>

      <div class="choices">

        <button
          id="wa"
          onclick="wouldVote('A')">
        </button>

        <button
          id="wb"
          onclick="wouldVote('B')">
        </button>

      </div>

      <p id="wouldResult">
      </p>

      <button
        class="ghost"
        onclick="wouldNext()">
        NEXT QUESTION
      </button>

      ${partyChat()}

    </div>

  `;

}

function renderWouldState(){

  if(!wouldState)return;

  $('#wouldQ').textContent=
    wouldState.question;

  $('#wa').textContent=
    'A • '+wouldState.a;

  $('#wb').textContent=
    'B • '+wouldState.b;

  $('#wouldResult').textContent=
    `A: ${wouldState.votes.A} votes • `+
    `B: ${wouldState.votes.B} votes`;

}

function wouldVote(x){
  socket.emit(
    'would:vote',
    x
  );
}

function wouldNext(){
  socket.emit(
    'would:next'
  );
}

socket.on(
  'would:state',
  d=>{
    wouldState=d;

    if(currentGame==='would')
      renderWouldState();
  }
);


/* =================================
   EMOJI
================================= */

function emoji(){

  return `

    <div class="fun">

      <div class="emoji">
        🐱👑
      </div>

      <h3>
        What does this mean?
      </h3>

      <input
        class="answer"
        id="ea"
        placeholder="Your answer"
      >

      <button
        class="neon"
        onclick="checkE()">
        CHECK
      </button>

      <p id="er"></p>

    </div>

  `;

}

function checkE(){

  const a=
    $('#ea').value
      .trim()
      .toLowerCase();

  $('#er').textContent=
    a==='cat king'
    ?'🎉 Correct! +100'
    :'❌ Try again!';

  if(a==='cat king')
    addScore(100);

}


/* =================================
   QUIZ
================================= */

const qs=[
  [
    'Which planet is called the Red Planet?',
    ['Mars','Venus','Jupiter','Mercury'],
    0
  ],
  [
    'How many sides does a hexagon have?',
    ['5','6','7','8'],
    1
  ],
  [
    'What do bees make?',
    ['Milk','Honey','Bread','Juice'],
    1
  ],
  [
    'Largest ocean?',
    ['Atlantic','Indian','Pacific','Arctic'],
    2
  ]
];

function quiz(){

  const q=
    qs[
      Math.floor(
        Math.random()*qs.length
      )
    ];

  return `

    <div class="fun">

      <div class="eyebrow">
        BRAIN RUSH
      </div>

      <h3>
        ${q[0]}
      </h3>

      <div class="quizChoices">

        ${
          q[1].map(
            (x,i)=>
              `<button
                onclick="qa(${i},${q[2]})">
                ${x}
              </button>`
          ).join('')
        }

      </div>

      <p id="qr"></p>

      <button
        class="ghost"
        onclick="renderGame('quiz')">
        NEXT QUESTION
      </button>

    </div>

  `;

}

function qa(i,c){

  $('#qr').textContent=
    i===c
    ?'🎉 Correct! +100'
    :'❌ Wrong!';

  if(i===c)
    addScore(100);

}


/* =================================
   REACTION RUSH
================================= */

function reaction(){

  return `

    <div class="fun">

      <div
        class="emoji">
        ⚡
      </div>

      <h3>
        SELECT THE NAMED THING
      </h3>

      <p id="reactionTarget">
        Loading target…
      </p>

      <div
        id="reactionChoices"
        class="choices">
      </div>

      <p id="reactionMsg">
      </p>

    </div>

  `;

}

function renderReactionState(){

  if(!reactionState)return;

  $('#reactionTarget').textContent=
    '🎯 TARGET: '+
    reactionState.target;

  $('#reactionChoices').innerHTML=
    reactionState.options.map(
      x=>
        `<button
          onclick="reactionPick('${x}')">
          ${x}
        </button>`
    ).join('');

  $('#reactionMsg').textContent=
    reactionState.message||'';

}

function reactionPick(x){

  socket.emit(
    'reaction:pick',
    x
  );

}

socket.on(
  'reaction:state',
  d=>{
    reactionState=d;

    if(currentGame==='reaction')
      renderReactionState();
  }
);


/* =================================
   WORD CHAIN
================================= */

function word(){

  return `

    <div class="fun">

      <div class="emoji">
        🔤
      </div>

      <h3>
        WORD CHAIN
      </h3>

      <div
        class="answer"
        id="chain">
        START
      </div>

      <input
        class="answer"
        id="wi"
        placeholder="Your word"
      >

      <button
        class="neon"
        onclick="chain()">
        SEND WORD
      </button>

      <p id="wr"></p>

    </div>

  `;

}

function chain(){

  const i=$('#wi');

  const v=
    i.value.trim();

  if(!v)return;

  const last=
    $('#chain')
      .textContent
      .trim()
      .slice(-1)
      .toLowerCase();

  if(
    v[0].toLowerCase()!==last
  ){

    $('#wr').textContent=
      '❌ Start with '+
      last.toUpperCase();

  }else{

    $('#chain').textContent=
      v.toUpperCase();

    $('#wr').textContent=
      '🔥 Chain continues!';

    addScore(25);

  }

  i.value='';

}


/* =================================
   BIKE RACING
================================= */

function bike(){

  return `

    <div class="fun">

      <div
        style="
          font-size:70px;
          filter:drop-shadow(0 0 15px #7b4dff);
        ">
        🏍️
      </div>

      <h2>
        BIKE RACING
      </h2>

      <p>
        Tap BOOST repeatedly!
        First to 100% wins 🏁
      </p>

      <div id="raceTrack">
      </div>

      <button
        class="neon"
        onclick="bikeBoost()">
        🚀 BOOST
      </button>

      ${partyChat()}

    </div>

  `;

}

function renderBike(){

  if(!bikeState)return;

  $('#raceTrack').innerHTML=
    bikeState.players.map(
      p=>`

        <div
          style="
            margin:12px 0;
          ">

          <b>
            ${esc(p.name)}
          </b>

          <div
            style="
              height:28px;
              background:#171a2b;
              border-radius:20px;
              overflow:hidden;
              margin-top:5px;
              border:1px solid #34395c;
            ">

            <div
              style="
                width:${p.progress}%;
                height:100%;
                display:flex;
                align-items:center;
                padding-left:5px;
                font-size:21px;
                transition:width .25s;
              ">

              🏍️

            </div>

          </div>

          <small>
            ${p.progress}%
          </small>

        </div>

      `
    ).join('');

}

function bikeBoost(){

  socket.emit(
    'bike:boost'
  );

}

socket.on(
  'bike:state',
  d=>{

    bikeState=d;

    if(currentGame==='bike')
      renderBike();

  }
);


/* =================================
   NEON FIGHT
================================= */

function fight(){

  return `

    <div class="fun">

      <div
        style="
          font-size:65px;
          animation:fightPulse .5s infinite alternate;
        ">
        ⚔️
      </div>

      <h2>
        NEON FIGHT
      </h2>

      <div
        id="fightArena">
      </div>

      <div class="choices">

        <button
          onclick="fightMove('punch')">
          🥊 PUNCH
        </button>

        <button
          onclick="fightMove('kick')">
          🦵 KICK
        </button>

        <button
          onclick="fightMove('special')">
          ⚡ SPECIAL
        </button>

      </div>

      <p id="fightMsg">
      </p>

      ${partyChat()}

      <style>
        @keyframes fightPulse{
          from{transform:scale(1)}
          to{transform:scale(1.12)}
        }

        @keyframes hitFlash{
          0%{transform:scale(1)}
          50%{transform:scale(1.08)}
          100%{transform:scale(1)}
        }
      </style>

    </div>

  `;

}

function renderFight(){

  if(!fightState)return;

  $('#fightArena').innerHTML=
    fightState.players.map(
      p=>`

        <div
          style="
            margin:15px;
            padding:12px;
            border:1px solid #33395d;
            border-radius:15px;
            animation:
              hitFlash .35s ease;
          ">

          <b>
            ${esc(p.name)}
          </b>

          <span>
            ❤️ ${p.hp}
          </span>

          <div
            style="
              height:18px;
              background:#171a2b;
              border-radius:12px;
              overflow:hidden;
              margin-top:7px;
            ">

            <div
              style="
                width:${p.hp}%;
                height:100%;
                background:
                  linear-gradient(
                    90deg,
                    #ff3b6b,
                    #7b4dff
                  );
                transition:width .25s;
              ">
            </div>

          </div>

        </div>

      `
    ).join('');

  $('#fightMsg').textContent=
    fightState.message||'';

}

function fightMove(move){

  socket.emit(
    'fight:move',
    move
  );

}

socket.on(
  'fight:state',
  d=>{

    fightState=d;

    if(currentGame==='fight')
      renderFight();

    if(d.message)
      toast(d.message);

  }
);


/* =================================
   END GAME
================================= */

function endGame(){
  socket.emit('game:end');
}


/* =================================
   GLOBAL BUTTONS
================================= */

Object.assign(
  window,
  {
    createRoom,
    joinRoom,
    toggleJoin,
    startGame,
    showRoom,
    goHome,
    copyCode,
    sendPartyChat,
    guess,
    clearDraw,
    eraser,
    move,
    resetTTT,
    truthDone,
    wouldVote,
    wouldNext,
    reactionPick,
    qa,
    checkE,
    chain,
    bikeBoost,
    fightMove,
    endGame,
    renderGame
  }
);
