(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });
const shell = document.getElementById("game-shell");

const distanceEl = document.getElementById("distance");
const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");
const bestEl = document.getElementById("best");
const bestGameoverEl = document.getElementById("best-gameover");
const finalDistanceEl = document.getElementById("final-distance");
const finalScoreEl = document.getElementById("final-score");
const gameoverReason = document.getElementById("gameover-reason");
const startBtn = document.getElementById("start");
const restartBtn = document.getElementById("restart");
const overlay = document.getElementById("overlay");
const pauseOverlay = document.getElementById("pause-overlay");
const gameoverOverlay = document.getElementById("gameover-overlay");

let W = 960, H = 640, dpr = 1;
let state = "menu";
let last = 0;
let time = 0;
let best = Number(localStorage.getItem("snowbound-best") || 0);

const keys = { left:false, right:false, up:false, down:false };
const world = {
  y: 0,
  speed: 0,
  targetSpeed: 0,
  distance: 0,
  score: 0,
  seed: Math.random() * 100000,
  chunks: [],
  objects: [],
  particles: [],
  nextObjectY: 0,
  nextChunkY: 0,
  monster: null
};

const player = {
  x: 0, y: 0, vx: 0,
  angle: 0,
  z: 0, vz: 0,
  jumping: false,
  crash: 0,
  invuln: 0,
  trick: 0,
  trickTimer: 0
};

function resize() {
  const rect = shell.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = Math.max(320, rect.width);
  H = Math.max(320, rect.height);
  canvas.width = Math.floor(W*dpr);
  canvas.height = Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", resize);
resize();

function hash(n) {
  const x = Math.sin(n * 127.1 + world.seed * 0.013) * 43758.5453;
  return x - Math.floor(x);
}
function rand(min,max) { return min + Math.random()*(max-min); }
function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
function lerp(a,b,t) { return a+(b-a)*t; }

function reset() {
  world.y = 0;
  world.speed = 4.5;
  world.targetSpeed = 5;
  world.distance = 0;
  world.score = 0;
  world.seed = Math.random() * 100000;
  world.chunks.length = 0;
  world.objects.length = 0;
  world.particles.length = 0;
  world.nextObjectY = 500;
  world.nextChunkY = 0;
  world.monster = null;

  player.x = W/2;
  player.y = H*.68;
  player.vx = 0;
  player.angle = 0;
  player.z = 0;
  player.vz = 0;
  player.jumping = false;
  player.crash = 0;
  player.invuln = 0;
  player.trick = 0;
  player.trickTimer = 0;

  generateAhead();
  updateHUD();
}

function generateAhead() {
  const ahead = 2300;
  while (world.nextChunkY < world.y + ahead) {
    const cy = world.nextChunkY;
    world.chunks.push({
      y: cy,
      width: 1,
      ridge: hash(Math.floor(cy/160)+10)
    });
    world.nextChunkY += 160;
  }

  while (world.nextObjectY < world.y + ahead) {
    const y = world.nextObjectY;
    const r = hash(Math.floor(y/130)+91);
    let type;
    if (r < .45) type = "tree";
    else if (r < .62) type = "rock";
    else if (r < .72) type = "mogul";
    else if (r < .82) type = "ramp";
    else if (r < .90) type = "snowman";
    else type = "sign";

    const x = 75 + hash(Math.floor(y/97)+33) * (W-150);
    world.objects.push({type,x,y,hit:false,rot:0,seed:r});
    world.nextObjectY += rand(115, 260);
  }

  // Keep memory bounded.
  world.objects = world.objects.filter(o => o.y > world.y - 500);
  world.chunks = world.chunks.filter(c => c.y > world.y - 500);
}

function screenY(worldY) {
  return player.y + (worldY - world.y);
}
function groundX(x) { return clamp(x, 30, W-30); }

function start() {
  reset();
  state = "playing";
  overlay.classList.remove("visible");
  gameoverOverlay.classList.remove("visible");
  pauseOverlay.classList.remove("visible");
  last = performance.now();
  requestAnimationFrame(loop);
}

function pause() {
  if (state !== "playing") return;
  state = "paused";
  pauseOverlay.classList.add("visible");
}
function resume() {
  if (state !== "paused") return;
  state = "playing";
  pauseOverlay.classList.remove("visible");
  last = performance.now();
  requestAnimationFrame(loop);
}

function end(reason) {
  state = "gameover";
  const dist = Math.floor(world.distance);
  if (dist > best) {
    best = dist;
    localStorage.setItem("snowbound-best", String(best));
  }
  finalDistanceEl.textContent = dist + " m";
  finalScoreEl.textContent = Math.floor(world.score).toLocaleString();
  bestGameoverEl.textContent = best;
  gameoverReason.textContent = reason;
  gameoverOverlay.classList.add("visible");
}

function jump() {
  if (state !== "playing") return;
  if (!player.jumping && player.crash <= 0) {
    player.jumping = true;
    player.vz = 11;
    player.z = 1;
    player.trick = 0;
    player.trickTimer = 0;
    burst(player.x, player.y, 10, 1.2);
  }
}

function crash(reason) {
  if (player.invuln > 0 || player.jumping || player.crash > 0) return;
  player.crash = .95;
  player.invuln = 1.2;
  player.vx *= .2;
  world.speed *= .38;
  burst(player.x, player.y, 22, 2.5);
  setTimeout(() => {
    if (state === "playing") end(reason);
  }, 850);
}

function update(dt) {
  time += dt;
  generateAhead();

  const difficulty = Math.min(world.distance / 5000, 1);
  const base = 4.6 + difficulty*2.3;
  world.targetSpeed = base + (keys.up ? 1.9 : 0) - (keys.down ? 2.0 : 0);
  world.speed = lerp(world.speed, Math.max(1.4, world.targetSpeed), 1-Math.pow(.001,dt));

  if (player.crash > 0) {
    player.crash -= dt;
    player.angle += dt * 8;
  } else {
    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.vx += steer * 0.42 * dt * 60;
    player.vx *= Math.pow(.78, dt*6);
    player.x += player.vx * dt * 60;
    player.x = groundX(player.x);

    const desiredAngle = clamp(player.vx * .075, -.62, .62);
    player.angle = lerp(player.angle, desiredAngle, 1-Math.pow(.001,dt));

    if (player.jumping) {
      player.z += player.vz * dt;
      player.vz -= 27 * dt;
      player.trickTimer += dt;
      if (keys.left) player.trick -= dt * 3.0;
      if (keys.right) player.trick += dt * 3.0;
      if (player.z <= 0) {
        player.z = 0;
        player.jumping = false;
        player.vz = 0;
        const spins = Math.abs(player.trick);
        if (spins > .75) {
          world.score += Math.floor(spins * 500);
          burst(player.x, player.y, 14, 1.5);
        }
      }
    }
  }

  world.y += world.speed * dt * 60;
  world.distance = world.y / 7.5;
  world.score += world.speed * dt * 1.4;

  if (player.invuln > 0) player.invuln -= dt;

  checkObjects();
  updateMonster(dt);
  updateParticles(dt);

  if (world.distance > 2500 && !world.monster) {
    world.monster = {x: W/2, y: H+120, active:true, phase:0};
  }

  updateHUD();
}

function checkObjects() {
  if (player.crash > 0 || player.invuln > 0) return;
  for (const o of world.objects) {
    if (o.hit) continue;
    const sy = screenY(o.y);
    if (sy < -50 || sy > H+50) continue;
    const dx = player.x - o.x;
    const dy = player.y - sy;
    const d = Math.hypot(dx,dy);

    if (o.type === "ramp" && d < 32 && !player.jumping) {
      o.hit = true;
      player.jumping = true;
      player.vz = 12;
      player.z = 1;
      world.score += 150;
      burst(player.x, player.y, 14, 1.8);
      continue;
    }
    const radius = ({tree:27,rock:22,mogul:24,snowman:23,sign:18})[o.type] || 20;
    if (d < radius + 13) {
      o.hit = true;
      if (o.type === "mogul") {
        player.jumping = true;
        player.vz = 8;
        player.z = 1;
        world.score += 75;
        burst(player.x, player.y, 9, 1);
      } else if (o.type === "snowman") {
        world.score += 250;
        burst(player.x, player.y, 25, 2);
        o.hit = true;
      } else {
        crash(o.type === "tree" ? "You met a tree at high speed." :
              o.type === "rock" ? "The rock did not move." : "That sign had the right of way.");
      }
    }
  }
}

function updateMonster(dt) {
  if (!world.monster || !world.monster.active) return;
  const m = world.monster;
  m.phase += dt;
  const targetY = player.y + 90;
  m.y = lerp(m.y, targetY, 1-Math.pow(.001,dt*.8));
  const targetX = player.x + Math.sin(time*2.1)*35;
  m.x = lerp(m.x, targetX, 1-Math.pow(.001,dt*1.3));
  m.y -= dt * 4.5 * 60;
  if (m.y < player.y-10 && Math.abs(m.x-player.x)<48 && player.z < 10) {
    end("The abominable snow monster caught you.");
  }
}

function burst(x,y,count,power) {
  for(let i=0;i<count;i++) {
    const a = Math.random()*Math.PI*2;
    const s = Math.random()*power*3;
    world.particles.push({
      x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
      life:rand(.25,.7), max:.7, size:rand(2,5)
    });
  }
}
function updateParticles(dt) {
  for (const p of world.particles) {
    p.x += p.vx * dt*60;
    p.y += p.vy * dt*60;
    p.vy += .04*dt*60;
    p.life -= dt;
  }
  world.particles = world.particles.filter(p=>p.life>0);
}

function draw() {
  drawSnow();
  drawObjects();
  drawMonster();
  drawPlayer();
  drawParticles();
}

function drawSnow() {
  ctx.fillStyle = "#d9e9f0";
  ctx.fillRect(0,0,W,H);

  // Broad blue-white snow bands create the old-school scrolling texture.
  for(let i=0;i<16;i++) {
    const y = ((i*73 + world.y*0.55) % (H+73))-73;
    ctx.fillStyle = i%2 ? "rgba(145,183,201,.16)" : "rgba(255,255,255,.22)";
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.bezierCurveTo(W*.25,y-18,W*.7,y+20,W,y-4);
    ctx.lineTo(W,y+20);
    ctx.bezierCurveTo(W*.7,y+38,W*.25,y,W,y+20);
    ctx.lineTo(0,y+20);
    ctx.fill();
  }

  // Distant edge shadows.
  ctx.fillStyle = "rgba(71,106,124,.12)";
  ctx.fillRect(0,0,32,H);
  ctx.fillRect(W-32,0,32,H);

  // Tiny snow texture.
  for(let i=0;i<90;i++) {
    const x = hash(i+1000)*W;
    const y = (hash(i+2000)*H + world.y*1.8) % H;
    ctx.fillStyle = "rgba(80,120,140,.13)";
    ctx.fillRect(x,y,1,1);
  }
}

function drawObjects() {
  const visible = world.objects
    .filter(o => { const y=screenY(o.y); return y>-80 && y<H+80; })
    .sort((a,b)=>a.y-b.y);

  for (const o of visible) {
    const sy = screenY(o.y);
    const scale = .75 + clamp((sy/H),0,1)*.25;
    if (o.hit && o.type !== "ramp") continue;
    ctx.save();
    ctx.translate(o.x, sy);
    ctx.scale(scale,scale);
    if(o.type==="tree") drawTree();
    else if(o.type==="rock") drawRock();
    else if(o.type==="mogul") drawMogul();
    else if(o.type==="ramp") drawRamp();
    else if(o.type==="snowman") drawSnowman();
    else drawSign();
    ctx.restore();
  }
}
function shadow(rx,ry=5) {
  ctx.fillStyle="rgba(30,55,65,.18)";
  ctx.beginPath(); ctx.ellipse(0,5,rx,ry,0,0,Math.PI*2); ctx.fill();
}
function drawTree() {
  shadow(17,5);
  ctx.fillStyle="#6b4a34"; ctx.fillRect(-4,-9,8,22);
  ctx.fillStyle="#315c52";
  ctx.beginPath(); ctx.moveTo(0,-48);ctx.lineTo(-21,-12);ctx.lineTo(21,-12);ctx.closePath();ctx.fill();
  ctx.beginPath(); ctx.moveTo(0,-32);ctx.lineTo(-27,1);ctx.lineTo(27,1);ctx.closePath();ctx.fill();
  ctx.fillStyle="#eef7f8";
  ctx.beginPath();ctx.moveTo(-13,-31);ctx.lineTo(0,-48);ctx.lineTo(9,-32);ctx.closePath();ctx.fill();
}
function drawRock() {
  shadow(17,5);
  ctx.fillStyle="#778994";
  ctx.beginPath();ctx.moveTo(-21,7);ctx.lineTo(-15,-12);ctx.lineTo(-4,-20);ctx.lineTo(15,-12);ctx.lineTo(21,7);ctx.closePath();ctx.fill();
  ctx.fillStyle="#a9bbc4";
  ctx.beginPath();ctx.moveTo(-15,-12);ctx.lineTo(-4,-20);ctx.lineTo(4,-12);ctx.lineTo(-11,-7);ctx.closePath();ctx.fill();
}
function drawMogul() {
  shadow(17,4);
  ctx.fillStyle="#9ebbc8";
  ctx.beginPath();ctx.ellipse(0,0,23,11,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#f8fcfd";
  ctx.beginPath();ctx.ellipse(-7,-5,11,6,0,0,Math.PI*2);ctx.fill();
}
function drawRamp() {
  shadow(24,5);
  ctx.fillStyle="#8eaeba";
  ctx.beginPath();ctx.moveTo(-27,8);ctx.lineTo(20,8);ctx.lineTo(27,-14);ctx.lineTo(4,-14);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-19,3);ctx.lineTo(18,3);ctx.stroke();
}
function drawSnowman() {
  shadow(16,4);
  ctx.fillStyle="#fff";
  ctx.beginPath();ctx.arc(0,2,14,0,Math.PI*2);ctx.arc(0,-16,10,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#202f38";ctx.fillRect(-5,-19,3,3);ctx.fillRect(3,-19,3,3);
  ctx.fillStyle="#e48b38";ctx.beginPath();ctx.moveTo(3,-15);ctx.lineTo(16,-12);ctx.lineTo(3,-9);ctx.closePath();ctx.fill();
}
function drawSign() {
  shadow(12,4);
  ctx.fillStyle="#77543a";ctx.fillRect(-2,-28,4,30);
  ctx.fillStyle="#f6f1d4";ctx.strokeStyle="#475866";ctx.lineWidth=2;
  ctx.fillRect(-17,-30,34,18);ctx.strokeRect(-17,-30,34,18);
  ctx.fillStyle="#43545e";ctx.font="bold 8px Arial";ctx.textAlign="center";ctx.fillText("SLOW",0,-19);
}

function drawMonster() {
  const m=world.monster;
  if(!m) return;
  if(m.y < -100 || m.y > H+160) return;
  ctx.save();
  ctx.translate(m.x,m.y);
  const bob=Math.sin(m.phase*8)*3;
  ctx.translate(0,bob);
  shadow(28,7);
  ctx.fillStyle="#334e5c";
  ctx.beginPath();ctx.ellipse(0,-12,25,38,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#e8f4f6";
  ctx.beginPath();ctx.ellipse(0,-28,17,18,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#dbecef";
  ctx.beginPath();ctx.moveTo(-18,-17);ctx.lineTo(-34,-33);ctx.lineTo(-24,-5);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(18,-17);ctx.lineTo(34,-33);ctx.lineTo(24,-5);ctx.closePath();ctx.fill();
  ctx.fillStyle="#1b2830";
  ctx.beginPath();ctx.arc(-7,-31,3,0,Math.PI*2);ctx.arc(7,-31,3,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#9d3d45";
  ctx.beginPath();ctx.ellipse(0,-19,10,5,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x,player.y-player.z);
  if(player.invuln>0 && Math.floor(time*15)%2===0) ctx.globalAlpha=.55;
  if(player.crash>0) ctx.rotate(player.angle);
  else ctx.rotate(player.angle);

  // shadow moves away while airborne
  ctx.save();
  ctx.globalAlpha=.22;
  ctx.fillStyle="#243c48";
  ctx.beginPath();ctx.ellipse(0,player.z+6,15,4,0,0,Math.PI*2);ctx.fill();
  ctx.restore();

  // skis
  ctx.strokeStyle="#283d48";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-17,12);ctx.lineTo(18,12);ctx.moveTo(-15,17);ctx.lineTo(20,17);ctx.stroke();

  // body
  ctx.fillStyle="#b24c45";
  ctx.beginPath();ctx.ellipse(0,0,8,18,0,0,Math.PI*2);ctx.fill();

  // arms
  ctx.strokeStyle="#a84a42";ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(-5,-5);ctx.lineTo(-17,7);ctx.moveTo(5,-5);ctx.lineTo(17,7);ctx.stroke();

  // head
  ctx.fillStyle="#f1c8a6";
  ctx.beginPath();ctx.arc(0,-20,7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#344d5b";
  ctx.beginPath();ctx.arc(0,-23,8,Math.PI,Math.PI*2);ctx.fill();

  if(player.jumping && Math.abs(player.trick)>.1) {
    ctx.fillStyle="rgba(255,255,255,.75)";
    ctx.font="bold 10px Arial";
    ctx.textAlign="center";
    ctx.fillText(Math.abs(player.trick)>1.2?"SPIN!":"TRICK!",0,-42);
  }
  ctx.restore();
}

function drawParticles() {
  for(const p of world.particles){
    ctx.globalAlpha=clamp(p.life/p.max,0,1);
    ctx.fillStyle="#fff";
    ctx.fillRect(p.x,p.y,p.size,p.size);
  }
  ctx.globalAlpha=1;
}

function updateHUD() {
  distanceEl.textContent = Math.floor(world.distance) + " m";
  scoreEl.textContent = Math.floor(world.score).toLocaleString();
  speedEl.textContent = Math.floor(world.speed*10) + " km/h";
  bestEl.textContent = best;
}

function loop(now) {
  if(state!=="playing") return;
  const dt=Math.min(.033,(now-last)/1000);
  last=now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function setKey(key,value){ keys[key]=value; }

window.addEventListener("keydown", e => {
  if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code)) e.preventDefault();
  if(e.code==="ArrowLeft" || e.code==="KeyA") setKey("left",true);
  if(e.code==="ArrowRight" || e.code==="KeyD") setKey("right",true);
  if(e.code==="ArrowUp" || e.code==="KeyW") setKey("up",true);
  if(e.code==="ArrowDown" || e.code==="KeyS") setKey("down",true);
  if(e.code==="Space") {
  if(!e.repeat) {
    if(state === "gameover") {
      start();
    } else {
      jump();
    }
  }
}
  if(e.code==="KeyP" || e.code==="Escape") {
    if(state==="playing") pause();
    else if(state==="paused") resume();
  }
});
window.addEventListener("keyup", e => {
  if(e.code==="ArrowLeft" || e.code==="KeyA") setKey("left",false);
  if(e.code==="ArrowRight" || e.code==="KeyD") setKey("right",false);
  if(e.code==="ArrowUp" || e.code==="KeyW") setKey("up",false);
  if(e.code==="ArrowDown" || e.code==="KeyS") setKey("down",false);
});

for(const btn of document.querySelectorAll("#touch-controls button")){
  const k=btn.dataset.key;
  const on=e=>{e.preventDefault(); if(k==="jump") jump(); else setKey(k,true);};
  const off=e=>{e.preventDefault(); if(k!=="jump") setKey(k,false);};
  btn.addEventListener("pointerdown",on);
  btn.addEventListener("pointerup",off);
  btn.addEventListener("pointercancel",off);
  btn.addEventListener("pointerleave",off);
}

startBtn.addEventListener("click",start);
restartBtn.addEventListener("click",start);

bestEl.textContent=best;
bestGameoverEl.textContent=best;
draw();

})();
