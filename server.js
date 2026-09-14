const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');

const app=express();
const server=http.createServer(app);

const io=new Server(server,{
  cors:{
    origin:true
  }
});

const rooms=new Map();

app.use(express.static(__dirname));

app.get('/health',(_,res)=>{
  res.json({ok:true});
});


/* =================================
   GAME DATA
================================= */

const words=[
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

const truths=[
  ['TRUTH','What is your most useless talent?'],
  ['DARE','Do your best celebrity impression for 20 seconds.'],
  ['TRUTH','What is the funniest thing you have done to impress someone?'],
  ['DARE','Talk like a robot until your next turn.'],
  ['TRUTH','Who would survive longest in a zombie apocalypse?'],
  ['DARE','Make your weirdest face for 10 seconds.']
];

const wouldCards=[
  ['Have unlimited money','Have unlimited free time'],
  ['Fly','Be invisible'],
  ['Never use social media','Never watch movies'],
  ['Always be early','Always be late']
];

const reactionThings=[
  'GUITAR',
  'PIZZA',
  'BIKE',
  'ROCKET',
  'TIGER',
  'CAKE'
];


/* =================================
   HELPERS
================================= */

function cleanName(v){

  return String(v||'Player')
    .trim()
    .slice(0,18)||
    'Player';

}

function newCode(){

  let c;

  do{

    c=
      crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase();

  }while(rooms.has(c));

  return c;

}

function roomOf(socket){

  return socket.room
    ?rooms.get(socket.room)
    :null;

}

function publicRoom(code,room){

  return {

    code,

    host:
      room.host,

    players:
      room.players.map(
        p=>({
          id:p.id,
          name:p.name,
          avatar:p.avatar,
          score:p.score
        })
      ),

    game:
      room.game?.name||
      null

  };

}

function broadcastRoom(code){

  const room=
    rooms.get(code);

  if(room){

    io.to(code).emit(
      'room:state',
      publicRoom(code,room)
    );

  }

}

function broadcastScores(code){

  const room=
    rooms.get(code);

  if(!room)return;

  io.to(code).emit(
    'scores:state',
    room.players.map(
      p=>({
        id:p.id,
        name:p.name,
        score:p.score
      })
    )
  );

}

function stopTimer(room){

  if(
    room?.timer
  ){

    clearInterval(
      room.timer
    );

    room.timer=null;

  }

}


/* =================================
   DOODLE
================================= */

function startDoodle(code){

  const room=
    rooms.get(code);

  if(
    !room||
    room.game?.name!=='doodle'
  ){
    return;
  }

  stopTimer(room);

  const d=
    room.game.doodle;

  if(
    d.round>d.total
  ){

    room.game=null;

    io.to(code).emit(
      'doodle:finished'
    );

    broadcastRoom(code);

    return;

  }

  d.drawerIndex=
    (d.round-1)%
    room.players.length;

  d.drawerId=
    room.players[
      d.drawerIndex
    ].id;

  d.word=
    words[
      Math.floor(
        Math.random()*
        words.length
      )
    ];

  d.time=60;


  io.to(code).emit(
    'draw:clear'
  );


  room.players.forEach(
    p=>{

      io.to(p.id).emit(
        'doodle:state',
        {

          round:
            d.round,

          totalRounds:
            d.total,

          drawerId:
            d.drawerId,

          drawerName:
            room.players[
              d.drawerIndex
            ].name,

          timeLeft:
            60,

          word:
            p.id===d.drawerId
            ?d.word
            :null

        }
      );

    }
  );


  room.timer=
    setInterval(
      ()=>{

        const r=
          rooms.get(code);

        if(
          !r||
          r.game?.name!=='doodle'
        ){

          if(r)
            stopTimer(r);

          return;

        }

        d.time--;

        io.to(code).emit(
          'doodle:tick',
          d.time
        );

        if(
          d.time<=0
        ){

          stopTimer(r);

          io.to(code).emit(
            'doodle:message',
            `⏰ Time's up! The word was ${d.word}.`
          );

          d.round++;

          setTimeout(
            ()=>startDoodle(code),
            1000
          );

        }

      },
      1000
    );

}


/* =================================
   TIC TAC TOE
================================= */

function checkWin(board){

  const lines=[
    [0,1,2],
    [3,4,5],
    [6,7,8],
    [0,3,6],
    [1,4,7],
    [2,5,8],
    [0,4,8],
    [2,4,6]
  ];

  for(
    const [a,b,c]
    of lines
  ){

    if(
      board[a]&&
      board[a]===board[b]&&
      board[b]===board[c]
    ){

      return board[a];

    }

  }

  return board.every(Boolean)
    ?'DRAW'
    :null;

}

function emitTTT(code){

  const t=
    rooms.get(code)
      ?.game
      ?.ttt;

  if(t){

    io.to(code).emit(
      'ttt:state',
      t
    );

  }

}


/* =================================
   TRUTH
================================= */

function startTruth(code){

  const room=
    rooms.get(code);

  if(!room)return;

  const t=
    room.game.truth;

  t.index=
    t.index%
    room.players.length;

  const card=
    truths[
      Math.floor(
        Math.random()*
        truths.length
      )
    ];

  t.turnId=
    room.players[t.index].id;

  t.turnName=
    room.players[t.index].name;

  t.type=
    card[0];

  t.prompt=
    card[1];

  io.to(code).emit(
    'truth:state',
    t
  );

}


/* =================================
   WOULD YOU RATHER
================================= */

function startWould(code){

  const room=
    rooms.get(code);

  if(!room)return;

  const x=
    wouldCards[
      Math.floor(
        Math.random()*
        wouldCards.length
      )
    ];

  room.game.would={

    question:
      'WOULD YOU RATHER?',

    a:x[0],

    b:x[1],

    votes:{
      A:0,
      B:0
    },

    voted:[]

  };

  io.to(code).emit(
    'would:state',
    room.game.would
  );

}


/* =================================
   REACTION
================================= */

function startReaction(code){

  const room=
    rooms.get(code);

  if(!room)return;

  const target=
    reactionThings[
      Math.floor(
        Math.random()*
        reactionThings.length
      )
    ];

  const options=[
    target,
    ...reactionThings
      .filter(x=>x!==target)
      .sort(
        ()=>Math.random()-.5
      )
      .slice(0,3)
  ].sort(
    ()=>Math.random()-.5
  );

  room.game.reaction={

    target,

    options,

    winner:null,

    message:
      'Pick the named thing as fast as you can!'

  };

  io.to(code).emit(
    'reaction:state',
    room.game.reaction
  );

}


/* =================================
   BIKE RACING
================================= */

function startBike(code){

  const room=
    rooms.get(code);

  if(!room)return;

  room.game.bike={

    players:
      room.players.map(
        p=>({
          id:p.id,
          name:p.name,
          progress:0
        })
      ),

    winner:null

  };

  io.to(code).emit(
    'bike:state',
    room.game.bike
  );

}


/* =================================
   NEON FIGHT
================================= */

function startFight(code){

  const room=
    rooms.get(code);

  if(!room)return;

  room.game.fight={

    players:
      room.players
        .slice(0,2)
        .map(
          p=>({
            id:p.id,
            name:p.name,
            hp:100
          })
        ),

    winner:null,

    message:
      '⚡ FIGHT! ⚡'

  };

  io.to(code).emit(
    'fight:state',
    room.game.fight
  );

}


/* =================================
   SOCKET
================================= */

io.on(
  'connection',
  socket=>{


    /* CREATE ROOM */

    socket.on(
      'room:create',
      ({name})=>{

        const code=
          newCode();

        const room={

          host:
            socket.id,

          players:[
            {
              id:
                socket.id,

              name:
                cleanName(name),

              avatar:
                '😎',

              score:
                0
            }
          ],

          game:null,

          timer:null

        };

        rooms.set(
          code,
          room
        );

        socket.room=
          code;

        socket.join(code);

        socket.emit(
          'room:created',
          {code}
        );

        broadcastRoom(code);

        broadcastScores(code);

      }
    );


    /* JOIN ROOM */

    socket.on(
      'room:join',
      ({code,name})=>{

        code=
          String(code||'')
            .trim()
            .toUpperCase();

        const room=
          rooms.get(code);

        if(!room){

          return socket.emit(
            'room:error',
            'Room not found. Check the code.'
          );

        }

        if(
          room.players.length>=7
        ){

          return socket.emit(
            'room:error',
            'Room is full. Maximum 7 players.'
          );

        }

        if(room.game){

          return socket.emit(
            'room:error',
            'A game is already running.'
          );

        }

        const avatars=[
          '🦊',
          '🐼',
          '🐸',
          '🐯',
          '🐨',
          '🐰',
          '🐙'
        ];

        room.players.push({

          id:
            socket.id,

          name:
            cleanName(name),

          avatar:
            avatars[
              room.players.length-1
            ]||'🙂',

          score:
            0

        });

        socket.room=
          code;

        socket.join(code);

        broadcastRoom(code);

        broadcastScores(code);

      }
    );


    /* PARTY CHAT */

    socket.on(
      'party:chat',
      message=>{

        const room=
          roomOf(socket);

        if(!room)return;

        const player=
          room.players.find(
            p=>p.id===socket.id
          );

        io.to(socket.room).emit(
          'party:chat',
          {

            name:
              player?.name||
              'Player',

            msg:
              String(message||'')
                .slice(0,160)

          }
        );

      }
    );


    /* START GAME */

    socket.on(
      'game:start',
      ({game},ack)=>{

        const room=
          roomOf(socket);

        const fail=
          message=>{

            socket.emit(
              'game:error',
              message
            );

            if(ack){

              ack({
                ok:false,
                message
              });

            }

          };


        if(!room)
          return fail(
            'Create or join a room first.'
          );


        if(
          room.host!==socket.id
        )
          return fail(
            'Only the HOST can start a game.'
          );


        if(room.game)
          return fail(
            'A game is already running.'
          );


        const available=[
          'doodle',
          'ultimate',
          'truth',
          'would',
          'emoji',
          'quiz',
          'reaction',
          'word',
          'bike',
          'fight'
        ];


        if(
          !available.includes(game)
        )
          return fail(
            'Game not available.'
          );


        if(
          game==='ultimate'&&
          room.players.length!==2
        )
          return fail(
            'Ultimate Tic-Tac-Toe needs exactly 2 players.'
          );


        if(
          game==='fight'&&
          room.players.length!==2
        )
          return fail(
            'Neon Fight needs exactly 2 players.'
          );


        if(
          game==='doodle'&&
          room.players.length<2
        )
          return fail(
            'Doodle Guess needs at least 2 players.'
          );


        room.game={
          name:game
        };


        if(game==='doodle'){

          room.game.doodle={
            round:1,
            total:5
          };

          io.to(socket.room).emit(
            'game:started',
            'doodle'
          );

          startDoodle(
            socket.room
          );

        }

        else if(
          game==='ultimate'
        ){

          room.game.ttt={

            board:
              Array(9).fill(''),

            turn:'X',

            players:[
              room.players[0].id,
              room.players[1].id
            ],

            winner:null

          };

          io.to(socket.room).emit(
            'game:started',
            'ultimate'
          );

          emitTTT(
            socket.room
          );

        }

        else if(
          game==='truth'
        ){

          room.game.truth={
            index:0
          };

          io.to(socket.room).emit(
            'game:started',
            'truth'
          );

          startTruth(
            socket.room
          );

        }

        else if(
          game==='would'
        ){

          io.to(socket.room).emit(
            'game:started',
            'would'
          );

          startWould(
            socket.room
          );

        }

        else if(
          game==='reaction'
        ){

          io.to(socket.room).emit(
            'game:started',
            'reaction'
          );

          startReaction(
            socket.room
          );

        }

        else if(
          game==='bike'
        ){

          io.to(socket.room).emit(
            'game:started',
            'bike'
          );

          startBike(
            socket.room
          );

        }

        else if(
          game==='fight'
        ){

          io.to(socket.room).emit(
            'game:started',
            'fight'
          );

          startFight(
            socket.room
          );

        }

        else{

          io.to(socket.room).emit(
            'game:started',
            game
          );

        }


        broadcastRoom(
          socket.room
        );


        if(ack){

          ack({
            ok:true
          });

        }

      }
    );


    /* END GAME */

    socket.on(
      'game:end',
      ()=>{

        const room=
          roomOf(socket);

        if(
          !room||
          room.host!==socket.id
        ){
          return;
        }

        stopTimer(room);

        room.game=null;

        io.to(socket.room).emit(
          'game:ended',
          'Game ended. Back to lobby.'
        );

        broadcastRoom(
          socket.room
        );

      }
    );


    /* DRAWING */

    socket.on(
      'draw:stroke',
      data=>{

        const room=
          roomOf(socket);

        if(
          room?.game?.doodle
            ?.drawerId===socket.id
        ){

          socket
            .to(socket.room)
            .emit(
              'draw:stroke',
              data
            );

        }

      }
    );


    socket.on(
      'draw:clear',
      ()=>{

        const room=
          roomOf(socket);

        if(
          room?.game?.doodle
            ?.drawerId===socket.id
        ){

          io.to(socket.room).emit(
            'draw:clear'
          );

        }

      }
    );


    /* DOODLE GUESS */

    socket.on(
      'doodle:guess',
      ({guess})=>{

        const room=
          roomOf(socket);

        const d=
          room?.game?.doodle;

        if(!d)return;

        if(
          d.drawerId===socket.id
        )return;

        const player=
          room.players.find(
            p=>p.id===socket.id
          );

        const text=
          String(guess||'')
            .trim();

        if(
          !player||
          !text
        )return;


        if(
          text.toUpperCase()===
          d.word.toUpperCase()
        ){

          player.score+=100;

          const drawer=
            room.players.find(
              p=>p.id===d.drawerId
            );

          if(drawer)
            drawer.score+=50;

          io.to(socket.room).emit(
            'doodle:correct',
            {
              name:player.name,
              word:d.word
            }
          );

          broadcastScores(
            socket.room
          );

          stopTimer(room);

          d.round++;

          setTimeout(
            ()=>startDoodle(socket.room),
            1000
          );

        }

        else{

          io.to(socket.room).emit(
            'doodle:guess',
            {
              name:player.name,
              guess:text.slice(0,40)
            }
          );

        }

      }
    );


    /* TTT */

    socket.on(
      'ttt:move',
      ({index})=>{

        const room=
          roomOf(socket);

        const t=
          room?.game?.ttt;

        if(
          !t||
          t.winner
        )return;

        const n=
          t.players.indexOf(
            socket.id
          );

        const symbol=
          n===0
          ?'X'
          :n===1
            ?'O'
            :null;

        if(!symbol)return;

        if(
          symbol!==t.turn
        )return;

        if(
          !Number.isInteger(index)||
          index<0||
          index>8||
          t.board[index]
        )return;

        t.board[index]=
          symbol;

        t.winner=
          checkWin(t.board);

        if(!t.winner){

          t.turn=
            symbol==='X'
            ?'O'
            :'X';

        }

        if(
          t.winner&&
          t.winner!=='DRAW'
        ){

          const p=
            room.players.find(
              x=>x.id===socket.id
            );

          if(p)
            p.score+=250;

          broadcastScores(
            socket.room
          );

        }

        emitTTT(
          socket.room
        );

      }
    );


    socket.on(
      'ttt:reset',
      ()=>{

        const room=
          roomOf(socket);

        const t=
          room?.game?.ttt;

        if(
          room&&
          t&&
          room.host===socket.id
        ){

          t.board=
            Array(9).fill('');

          t.turn='X';

          t.winner=null;

          emitTTT(
            socket.room
          );

        }

      }
    );


    /* TRUTH */

    socket.on(
      'truth:done',
      ()=>{

        const room=
          roomOf(socket);

        const t=
          room?.game?.truth;

        if(!t)return;

        if(
          room.players[
            t.index
          ]?.id!==socket.id
        ){
          return;
        }

        t.index=
          (t.index+1)%
          room.players.length;

        startTruth(
          socket.room
        );

      }
    );


    /* WOULD YOU RATHER */

    socket.on(
      'would:vote',
      choice=>{

        const room=
          roomOf(socket);

        const w=
          room?.game?.would;

        if(
          !w||
          !['A','B'].includes(choice)||
          w.voted.includes(socket.id)
        ){
          return;
        }

        w.voted.push(
          socket.id
        );

        w.votes[choice]++;

        io.to(socket.room).emit(
          'would:state',
          w
        );

      }
    );


    socket.on(
      'would:next',
      ()=>{

        const room=
          roomOf(socket);

        if(
          room?.host===socket.id
        ){

          startWould(
            socket.room
          );

        }

      }
    );


    /* REACTION */

    socket.on(
      'reaction:pick',
      choice=>{

        const room=
          roomOf(socket);

        const g=
          room?.game?.reaction;

        if(
          !g||
          g.winner
        )return;

        if(
          choice!==g.target
        ){
          return;
        }

        g.winner=
          socket.id;

        const p=
          room.players.find(
            x=>x.id===socket.id
          );

        if(p)
          p.score+=150;

        g.message=
          `🏆 ${p?.name||'Player'} was fastest!`;

        broadcastScores(
          socket.room
        );

        io.to(socket.room).emit(
          'reaction:state',
          g
        );

        setTimeout(
          ()=>{
            if(
              rooms.get(socket.room)
                ?.game
                ?.name==='reaction'
            ){
              startReaction(
                socket.room
              );
            }
          },
          1200
        );

      }
    );


    /* BIKE BOOST */

    socket.on(
      'bike:boost',
      ()=>{

        const room=
          roomOf(socket);

        const g=
          room?.game?.bike;

        if(
          !g||
          g.winner
        )return;

        const p=
          g.players.find(
            x=>x.id===socket.id
          );

        if(!p)return;

        p.progress=
          Math.min(
            100,
            p.progress+
            8+
            Math.floor(
              Math.random()*8
            )
          );


        if(
          p.progress>=100
        ){

          g.winner=
            socket.id;

          const real=
            room.players.find(
              x=>x.id===socket.id
            );

          if(real)
            real.score+=300;

          broadcastScores(
            socket.room
          );

          io.to(socket.room).emit(
            'bike:state',
            g
          );

          setTimeout(
            ()=>{
              const r=
                rooms.get(socket.room);

              if(
                r?.game?.name==='bike'
              ){

                r.game=null;

                io.to(socket.room).emit(
                  'game:ended',
                  `${real?.name||'Player'} won the race! 🏁`
                );

                broadcastRoom(
                  socket.room
                );

              }

            },
            1200
          );

        }

        else{

          io.to(socket.room).emit(
            'bike:state',
            g
          );

        }

      }
    );


    /* FIGHT */

    socket.on(
      'fight:move',
      move=>{

        const room=
          roomOf(socket);

        const g=
          room?.game?.fight;

        if(
          !g||
          g.winner
        )return;

        const me=
          g.players.find(
            p=>p.id===socket.id
          );

        const enemy=
          g.players.find(
            p=>p.id!==socket.id
          );

        if(
          !me||
          !enemy
        )return;


        let damage=10;

        if(move==='kick')
          damage=15;

        if(move==='special')
          damage=25;


        enemy.hp=
          Math.max(
            0,
            enemy.hp-damage
          );


        g.message=
          `💥 ${me.name} used ${String(move).toUpperCase()}!`;


        if(
          enemy.hp<=0
        ){

          g.winner=
            me.id;

          const real=
            room.players.find(
              p=>p.id===me.id
            );

          if(real)
            real.score+=300;

          g.message=
            `🏆 ${me.name} WINS THE FIGHT! ⚡`;

          broadcastScores(
            socket.room
          );

        }


        io.to(socket.room).emit(
          'fight:state',
          g
        );

      }
    );


    /* SCORE */

    socket.on(
      'score:add',
      points=>{

        const room=
          roomOf(socket);

        const player=
          room?.players.find(
            p=>p.id===socket.id
          );

        const value=
          Math.max(
            0,
            Math.min(
              500,
              Number(points)||0
            )
          );

        if(
          player&&
          value
        ){

          player.score+=value;

          broadcastScores(
            socket.room
          );

          broadcastRoom(
            socket.room
          );

        }

      }
    );


    /* LEAVE */

    socket.on(
      'room:leave',
      ()=>{
        leaveRoom(socket);
      }
    );


    socket.on(
      'disconnect',
      ()=>{
        leaveRoom(socket);
      }
    );

  }
);


/* =================================
   LEAVE ROOM
================================= */

function leaveRoom(socket){

  const code=
    socket.room;

  const room=
    rooms.get(code);

  if(!room)return;

  stopTimer(room);

  room.players=
    room.players.filter(
      p=>p.id!==socket.id
    );


  if(
    !room.players.length
  ){

    rooms.delete(code);

    return;

  }


  if(
    room.host===socket.id
  ){

    room.host=
      room.players[0].id;

  }


  if(room.game){

    room.game=null;

    io.to(code).emit(
      'game:ended',
      'A player left. Back to lobby.'
    );

  }


  socket.leave(code);

  socket.room=null;

  broadcastRoom(code);

  broadcastScores(code);

}


/* =================================
   SERVER
================================= */

const PORT=
  process.env.PORT||3000;

server.listen(
  PORT,
  '0.0.0.0',
  ()=>{
    console.log(
      `PlayRoom running on port ${PORT}`
    );
  }
);
