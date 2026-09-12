const express=require("express"),http=require("http"),{Server}=require("socket.io"),crypto=require("crypto");
const app=express(),server=http.createServer(app),io=new Server(server);
const rooms=new Map(),games=new Map();
app.use(express.static(__dirname));
function code(){return crypto.randomBytes(3).toString("hex").toUpperCase()}
io.on("connection",socket=>{
  socket.on("room:create",({name})=>{let c=code();rooms.set(c,{players:[{id:socket.id,name:name||"Player",avatar:"😎"}],host:socket.id});socket.join(c);socket.room=c;socket.emit("room:state",rooms.get(c))});
  socket.on("room:join",({code:c,name})=>{c=(c||"").toUpperCase();let r=rooms.get(c);if(!r)return socket.emit("room:error","Room not found");if(r.players.length>=7)return socket.emit("room:error","Room is full (max 7)");let avatars=["🦊","🐼","🐸","🐯","🐨","🐰","🐙"];r.players.push({id:socket.id,name:name||"Player",avatar:avatars[r.players.length]});socket.join(c);socket.room=c;io.to(c).emit("room:state",r)});
  socket.on("game:start",({game})=>{if(!socket.room)return;games.set(socket.room,{game});io.to(socket.room).emit("game:started",game)});
  socket.on("draw:stroke",data=>socket.to(socket.room||"").emit("draw:stroke",data));
  socket.on("draw:clear",()=>socket.to(socket.room||"").emit("draw:clear"));
  socket.on("chat",msg=>io.to(socket.room||"").emit("chat",{name:"Player",msg}));
  socket.on("ttt:move",data=>socket.to(socket.room||"").emit("ttt:move",data));
  socket.on("disconnect",()=>{let c=socket.room,r=rooms.get(c);if(!r)return;r.players=r.players.filter(p=>p.id!==socket.id);if(!r.players.length)rooms.delete(c);else io.to(c).emit("room:state",r)});
});
server.listen(process.env.PORT||3000,()=>console.log("PlayRoom running on http://localhost:3000"));