// ============================================================
// CBTI — Car Buying Type Indicator (3D · v3)
// Three.js · single-file game · multi-scene · multiple mini-games
// Mobile landscape optimized, joystick, sounds, growth visible.
// ============================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ============================================================
// 0. Audio — procedural WebAudio synth with reverb/delay & polyphonic BGM
// ============================================================
const Audio = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let convolver = null, reverbSend = null, delay = null, delayFb = null, delaySend = null;
  let muted = false;
  let bgmTimer = null;
  let bgmStep = 0;
  let currentScale = 'major';

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.7;
    master.connect(ctx.destination);

    // Compressor on master for warmth
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 3;
    comp.attack.value = 0.005; comp.release.value = 0.18;
    comp.connect(master);

    musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(comp);
    sfxGain   = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(comp);

    // ---- Reverb (impulse from white noise) ----
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(1.8, 2.5);
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0.35;
    convolver.connect(comp);
    reverbSend.connect(convolver);

    // ---- Delay (eighth-note feedback) ----
    delay = ctx.createDelay(1.0); delay.delayTime.value = 0.21;
    delayFb = ctx.createGain(); delayFb.gain.value = 0.32;
    delay.connect(delayFb); delayFb.connect(delay);
    delay.connect(comp);
    delaySend = ctx.createGain(); delaySend.gain.value = 0.18;
    delaySend.connect(delay);
  }

  function makeImpulse(seconds=1.5, decay=2.0) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch=0; ch<2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i=0;i<len;i++) {
        data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay);
      }
    }
    return buf;
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.7;
  }

  // Voice with envelope, optional filter sweep, sends to verb/delay
  function voice(opts) {
    if (!ctx) return;
    const {
      freq, dur=0.2, type='sine', detune=0, gain=0.35,
      attack=0.005, release=null, filter=null, filterTo=null,
      filterQ=1, dest=sfxGain, verb=0.15, dly=0.0, slideTo=null, slideTime=null
    } = opts;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    if (slideTo != null) {
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(0.01, slideTo), ctx.currentTime + (slideTime || dur));
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + dur);
    let last = g;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter; f.frequency.value = filterTo ? filter==='lowpass' ? 4000 : 200 : 1500;
      if (filterTo) {
        f.frequency.setValueAtTime(filter==='lowpass'? 4000: 200, ctx.currentTime);
        f.frequency.exponentialRampToValueAtTime(filterTo, ctx.currentTime + dur);
      }
      f.Q.value = filterQ;
      g.connect(f); last = f;
    }
    o.connect(g);
    last.connect(dest);
    if (verb > 0 && reverbSend) {
      const v = ctx.createGain(); v.gain.value = verb;
      last.connect(v); v.connect(reverbSend);
    }
    if (dly > 0 && delaySend) {
      const d = ctx.createGain(); d.gain.value = dly;
      last.connect(d); d.connect(delaySend);
    }
    o.start(); o.stop(ctx.currentTime + dur + (release || 0.05));
    return { o, g };
  }

  // Multi-voice chord
  function chord(freqs, dur, opts={}) {
    freqs.forEach(f => voice({ ...opts, freq: f, dur }));
  }

  function noise(dur=0.2, gain=0.3, freq=600, q=1.5, dest=sfxGain) {
    if (!ctx) return;
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate*dur)|0, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value = freq; filt.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(filt); filt.connect(g); g.connect(dest);
    if (reverbSend) {
      const v = ctx.createGain(); v.gain.value = .15;
      g.connect(v); v.connect(reverbSend);
    }
    src.start();
  }

  // ---- SFX library ----
  const sfx = {
    click()   { init(); voice({ freq:880, dur:0.08, type:'square', gain:0.2, verb:0.1 }); },
    hover()   { init(); voice({ freq:1480, dur:0.05, type:'sine', gain:0.13 }); },
    select()  {
      init();
      voice({ freq:523, dur:0.1, type:'triangle', gain:0.3, verb:0.25 });
      setTimeout(()=> voice({ freq:784, dur:0.14, type:'triangle', gain:0.3, verb:0.25, dly:0.2 }), 70);
    },
    coin()    {
      init();
      voice({ freq:1318, dur:0.06, type:'square', gain:0.25 });
      setTimeout(()=> voice({ freq:1760, dur:0.10, type:'square', gain:0.28, verb:0.2 }), 50);
    },
    diamond() {
      init();
      [880, 1318, 1760, 2349].forEach((f,i)=>
        setTimeout(()=> voice({ freq:f, dur:0.12, type:'triangle', gain:0.3, verb:0.4, dly:0.3 }), i*40));
    },
    crash()   {
      init();
      noise(0.5, 0.55, 220, 1.2);
      voice({ freq:130, dur:0.4, type:'sawtooth', gain:0.42, slideTo:55, slideTime:0.35, verb:0.4 });
      voice({ freq:200, dur:0.3, type:'square', gain:0.2, slideTo:80, slideTime:0.3 });
    },
    eat()     {
      init();
      // Yum-yum: rising chime
      [392, 523, 698, 880].forEach((f,i)=>
        setTimeout(()=> voice({ freq:f, dur:0.09, type:'sine', gain:0.3, verb:0.25 }), i*45));
    },
    levelUp() {
      init();
      // Major arpeggio + final chord
      const seq = [523, 659, 784, 1046];
      seq.forEach((f,i)=>
        setTimeout(()=> voice({ freq:f, dur:0.16, type:'triangle', gain:0.32, verb:0.35, dly:0.2 }), i*90));
      setTimeout(()=> chord([523, 659, 784, 1046], 0.5, { type:'triangle', gain:0.18, verb:0.5, dly:0.25 }), 380);
    },
    crack()   { init(); noise(0.18, 0.4, 1400, 2); voice({ freq:200, dur:0.1, type:'sawtooth', gain:0.2 }); },
    flash()   { init(); voice({ freq:2200, dur:0.4, type:'sine', gain:0.4, attack:0.001, verb:0.5, dly:0.3 }); },
    fanfare() {
      init();
      // Triumphant brass-like fanfare
      const mel = [523, 659, 784, 659, 784, 1046, 1319, 1568];
      mel.forEach((f,i)=>
        setTimeout(()=> voice({ freq:f, dur:0.2, type:'sawtooth', gain:0.22, filter:'lowpass', filterTo:3000, verb:0.4 }), i*110));
      setTimeout(()=> chord([523, 659, 784, 1046], 1.2, { type:'sawtooth', gain:0.14, filter:'lowpass', filterTo:2000, verb:0.6 }), 900);
    },
    fix()     {
      init();
      // wrench tightening: pitch-rising clicks
      [220, 277, 330, 392, 440].forEach((f,i)=>
        setTimeout(()=> voice({ freq:f, dur:0.06, type:'square', gain:0.25 }), i*40));
    },
    boing()   {
      init();
      voice({ freq:880, dur:0.22, type:'sine', gain:0.35, slideTo:220, slideTime:0.18, verb:0.25 });
    },
    swoosh()  { init(); noise(0.3, 0.32, 1800, 0.8); },
    error()   {
      init();
      voice({ freq:220, dur:0.12, type:'sawtooth', gain:0.3 });
      setTimeout(()=> voice({ freq:175, dur:0.18, type:'sawtooth', gain:0.3 }), 100);
    },
    success() {
      init();
      [659, 830, 988].forEach((f,i)=>
        setTimeout(()=> voice({ freq:f, dur:0.16, type:'triangle', gain:0.3, verb:0.35 }), i*80));
    },
    countdown(){
      init();
      voice({ freq:880, dur:0.1, type:'square', gain:0.3, verb:0.2 });
    },
    go() {
      init();
      voice({ freq:1318, dur:0.25, type:'square', gain:0.4, verb:0.4 });
      voice({ freq:1760, dur:0.3, type:'sawtooth', gain:0.18, verb:0.4, dly:0.25 });
    },
    jump() {
      init();
      voice({ freq:440, dur:0.18, type:'square', gain:0.28, slideTo:880, slideTime:0.16 });
    },
    slide() {
      init();
      noise(0.18, 0.32, 600, 1);
      voice({ freq:300, dur:0.18, type:'sawtooth', gain:0.18, slideTo:120, slideTime:0.18 });
    },
    fuel() {
      init();
      // electric zap-y feed (used when feeding electric food)
      voice({ freq:660, dur:0.06, type:'square', gain:0.25 });
      setTimeout(()=> voice({ freq:990, dur:0.06, type:'square', gain:0.25 }),35);
      setTimeout(()=> voice({ freq:1480,dur:0.08, type:'square', gain:0.3, verb:0.3 }),70);
    }
  };

  // ---- Polyphonic BGM ----
  // Mini sequencer: bass + arpeggio + melody, on bar grid.
  const songBank = {
    major: { // playful kindergarten
      tonic: 261.63, // C4
      bassPattern:    [0, 0, 5, 0, 7, 0, 4, 0],          // semitone offsets
      arpPattern:     [0, 4, 7, 12, 7, 4, 0, 7],         // C major arp
      melodyPattern:  [12, 14, 16, 14, 12, 11, 9, 7, 12, 14, 16, 19, 17, 16, 14, 12],
      bassType: 'sine', arpType: 'triangle', melodyType: 'square', tempo: 130, swing:0.04
    },
    mystic: { // hatching
      tonic: 220, // A3
      bassPattern:    [0, 0, 7, 0, 5, 0, 7, 0],
      arpPattern:     [0, 3, 7, 10, 7, 3, 0, 7],         // A minor 7
      melodyPattern:  [12, 15, 19, 22, 19, 15, 12, 10, 12, 15, 19, 24, 22, 19, 15, 12],
      bassType: 'sine', arpType: 'sine', melodyType: 'triangle', tempo: 90, swing:0
    },
    race: { // driving
      tonic: 196, // G3
      bassPattern:    [0, 0, 0, 5, 7, 7, 0, 5],
      arpPattern:     [0, 3, 5, 7, 10, 7, 5, 3],         // G minor pentatonic feel
      melodyPattern:  [12, 14, 15, 17, 19, 17, 15, 14, 17, 15, 14, 12, 10, 12, 14, 15],
      bassType: 'sawtooth', arpType: 'square', melodyType: 'sawtooth', tempo: 160, swing:0.02
    },
    result: { // victory
      tonic: 261.63,
      bassPattern:    [0, 0, 7, 0, 5, 0, 7, 12],
      arpPattern:     [0, 4, 7, 12, 16, 12, 7, 4],
      melodyPattern:  [12, 16, 19, 24, 19, 16, 12, 16, 19, 16, 12, 16, 19, 24, 19, 16],
      bassType: 'sine', arpType: 'triangle', melodyType: 'square', tempo: 140, swing:0
    }
  };

  function midi(tonic, semis) { return tonic * Math.pow(2, semis/12); }

  function startBGM(scale='major') {
    init();
    stopBGM();
    currentScale = scale;
    const song = songBank[scale] || songBank.major;
    const stepDur = 60/song.tempo/2; // 8th note
    bgmStep = 0;

    bgmTimer = setInterval(() => {
      if (!ctx || muted) return;
      const t = ctx.currentTime + 0.03;
      const swing = (bgmStep % 2 === 1) ? song.swing : 0;
      const tt = t + swing;

      // ---- Bass (every 8th but accent on beats) ----
      const bassNote = song.bassPattern[bgmStep % song.bassPattern.length];
      if (bgmStep % 1 === 0) {
        const fb = midi(song.tonic, bassNote) / 2; // bass octave down
        const ob = ctx.createOscillator(), gb = ctx.createGain();
        ob.type = song.bassType; ob.frequency.value = fb;
        gb.gain.setValueAtTime(0, tt);
        gb.gain.linearRampToValueAtTime(0.22, tt + 0.01);
        gb.gain.exponentialRampToValueAtTime(0.001, tt + stepDur*1.4);
        const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value = 800;
        ob.connect(gb); gb.connect(filt); filt.connect(musicGain);
        ob.start(tt); ob.stop(tt + stepDur*1.5);
      }

      // ---- Arpeggio (every step, lighter) ----
      const arpNote = song.arpPattern[bgmStep % song.arpPattern.length];
      const fa = midi(song.tonic, arpNote);
      const oa = ctx.createOscillator(), ga = ctx.createGain();
      oa.type = song.arpType; oa.frequency.value = fa;
      ga.gain.setValueAtTime(0, tt);
      ga.gain.linearRampToValueAtTime(0.10, tt + 0.005);
      ga.gain.exponentialRampToValueAtTime(0.001, tt + stepDur*0.9);
      oa.connect(ga); ga.connect(musicGain);
      // Send some to delay for sparkle
      const sd = ctx.createGain(); sd.gain.value = 0.16;
      ga.connect(sd); sd.connect(delaySend);
      const sv = ctx.createGain(); sv.gain.value = 0.18;
      ga.connect(sv); sv.connect(reverbSend);
      oa.start(tt); oa.stop(tt + stepDur);

      // ---- Melody (every other step, soaring) ----
      if (bgmStep % 2 === 0) {
        const mi = (bgmStep/2) % song.melodyPattern.length;
        const fm = midi(song.tonic, song.melodyPattern[mi]);
        const om = ctx.createOscillator(), gm = ctx.createGain();
        om.type = song.melodyType; om.frequency.value = fm;
        gm.gain.setValueAtTime(0, tt);
        gm.gain.linearRampToValueAtTime(0.14, tt + 0.02);
        gm.gain.exponentialRampToValueAtTime(0.001, tt + stepDur*1.7);
        const f2 = ctx.createBiquadFilter(); f2.type='lowpass'; f2.frequency.value = 2200;
        om.connect(gm); gm.connect(f2); f2.connect(musicGain);
        const v2 = ctx.createGain(); v2.gain.value = 0.3;
        gm.connect(v2); v2.connect(reverbSend);
        om.start(tt); om.stop(tt + stepDur*1.8);
      }

      bgmStep++;
    }, 1000 * 60/songBank[scale === 'mystic' ? 'mystic' : scale === 'race' ? 'race' : scale === 'result' ? 'result' : 'major'].tempo / 2);
  }
  function stopBGM() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer=null; } }

  return { init, setMuted, sfx, startBGM, stopBGM, isMuted: ()=>muted };
})();

// ============================================================
// 1. Renderer / Scene / Camera
// ============================================================
const app = document.getElementById('app');
const ui = document.getElementById('ui');
const fade = document.getElementById('fade');
const rotateHint = document.getElementById('rotate-hint');

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a26, 0.022);
scene.background = new THREE.Color(0x07061a);

const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 2.4, 8);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', resize);
addEventListener('orientationchange', resize);
function resize() {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  // Show rotate hint on portrait mobile
  const portrait = innerHeight > innerWidth;
  const small = Math.min(innerWidth, innerHeight) < 600;
  if (portrait && small) rotateHint.classList.add('show');
  else rotateHint.classList.remove('show');
}
resize();

// ============================================================
// 2. Global state
// ============================================================
const State = {
  scene: 'banner',
  carType: null,        // 'family' | 'sport' | 'compact'
  babyName: '부릉이',
  level: 1,             // 1..5 visible growth
  food: [],             // multi-feed history
  fuelPref: { ev_slow:0, ev_fast:0, gasoline:0, premium:0 },
  drive: null,
  repair: null,
  upgrade: null,
  finance: null,        // 'lump' | 'install' | 'lease' | 'rent'
  raceScore: 0,
  points: 0,
  hits: 0,
  // Personality scores 0-100
  traits: {
    adventure: 50, // 모험심
    safety: 50,    // 안전
    economy: 50,   // 실속
    activity: 50,  // 활동
    premium: 50,   // 고급
  },
  axes: null,      // computed CBTI 4-axis
  cbti: null,      // computed type
};

// ============================================================
// 3. Helpers — tween, ease, fade, toast
// ============================================================
const easeOutCubic = t => 1 - Math.pow(1-t, 3);
const easeInOutCubic = t => t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const easeOutBack = t => { const c=1.70158, c3=c+1; return 1+c3*Math.pow(t-1,3)+c*Math.pow(t-1,2); };

function tween(obj, key, to, ms=600, ease=easeOutCubic, done) {
  const from = obj[key]; const t0 = performance.now();
  function tick(now) {
    const t = Math.min(1,(now-t0)/ms);
    obj[key] = from + (to - from)*ease(t);
    if (t<1) requestAnimationFrame(tick); else if (done) done();
  }
  requestAnimationFrame(tick);
}
function tweenVec(vec, to, ms=600, ease=easeOutCubic, done) {
  const from = vec.clone(); const t0 = performance.now();
  function tick(now) {
    const t = Math.min(1,(now-t0)/ms);
    vec.lerpVectors(from, to, ease(t));
    if (t<1) requestAnimationFrame(tick); else if (done) done();
  }
  requestAnimationFrame(tick);
}
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function fadeTransition(fn) {
  fade.classList.add('show'); await wait(550); await fn(); fade.classList.remove('show');
}
function flashScreen(color='#fff', ms=600) {
  const f = document.createElement('div');
  Object.assign(f.style, { position:'fixed', inset:'0', background:color, zIndex:'45', pointerEvents:'none', transition:`opacity ${ms}ms ease`, opacity:'1' });
  document.body.appendChild(f);
  requestAnimationFrame(()=> f.style.opacity = '0');
  setTimeout(()=> f.remove(), ms+50);
}
function showToast(text, ms=1500) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=> { t.classList.remove('show'); setTimeout(()=> t.remove(), 400); }, ms);
}

// ============================================================
// 4. Scene group manager
// ============================================================
const sceneGroups = {};
const updaters = new Set();
function setActiveScene(name) {
  for (const k in sceneGroups) sceneGroups[k].visible = (k === name);
  State.scene = name;
}

// Camera tween helper (lookAt target)
let camLook = new THREE.Vector3(0, 0.5, 0);
function moveCam(toPos, toLook, ms=900) {
  const fromPos = camera.position.clone();
  const fromLook = camLook.clone();
  const t0 = performance.now();
  return new Promise(res => {
    function tick(now){
      const t = Math.min(1,(now-t0)/ms);
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(fromPos, toPos, e);
      camLook.lerpVectors(fromLook, toLook, e);
      camera.lookAt(camLook);
      if (t<1) requestAnimationFrame(tick); else res();
    }
    requestAnimationFrame(tick);
  });
}

// ============================================================
// 5. Common assets — starfield, lights, particle bursts
// ============================================================
function makeRadialTex(color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128,128,0, 128,128,128);
  grd.addColorStop(0, `rgba(${color.r*255|0},${color.g*255|0},${color.b*255|0},1)`);
  grd.addColorStop(.4, `rgba(${color.r*255|0},${color.g*255|0},${color.b*255|0},.4)`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0,0,256,256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
const radialWhite = makeRadialTex(new THREE.Color(0xffffff));

function makeStarfield() {
  const g = new THREE.BufferGeometry();
  const N = 1200;
  const pos = new Float32Array(N*3);
  const col = new Float32Array(N*3);
  for (let i=0;i<N;i++) {
    const r = 30 + Math.random()*70;
    const t = Math.random()*Math.PI*2;
    const p = (Math.random()-.5)*Math.PI;
    pos[i*3]   = r*Math.cos(p)*Math.cos(t);
    pos[i*3+1] = r*Math.sin(p);
    pos[i*3+2] = r*Math.cos(p)*Math.sin(t);
    const c = new THREE.Color().setHSL(Math.random(), .5+Math.random()*.4, .6+Math.random()*.3);
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  const m = new THREE.PointsMaterial({ size: .14, vertexColors:true, transparent:true, opacity:.85, sizeAttenuation:true, depthWrite:false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, m);
}
const starfield = makeStarfield();
scene.add(starfield);
updaters.add(t => { starfield.rotation.y = t*0.005; });

// Lighting
const hemi = new THREE.HemisphereLight(0xb6c3ff, 0x331a55, .55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(5,10,7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
scene.add(sun);

// Particle bursts
const bursts = [];
function spawnBurst(position, colorHex, count=80, spread=2.0, life=1.5) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count*3);
  const vel = new Float32Array(count*3);
  for (let i=0;i<count;i++) {
    pos[i*3]=position.x; pos[i*3+1]=position.y; pos[i*3+2]=position.z;
    const a = Math.random()*Math.PI*2;
    const b = Math.acos(2*Math.random()-1);
    const speed = (.3 + Math.random()*.7) * spread;
    vel[i*3]   = Math.sin(b)*Math.cos(a)*speed;
    vel[i*3+1] = Math.cos(b)*speed;
    vel[i*3+2] = Math.sin(b)*Math.sin(a)*speed;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const mat = new THREE.PointsMaterial({ color: colorHex, size:.18, transparent:true, opacity:1, blending: THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  bursts.push({ pts, vel, life, age:0 });
}

// ============================================================
// 6. Car factory — cars grow with level (1-5)
// Type-specific shapes (family/sport/compact)
// ============================================================
const TYPES = {
  family: {
    label: '🚙 패밀리카',
    desc: '넓고 안전 · 가족과 나들이 · 안정',
    color: 0x6ec1ff,    // sky blue
    accent: 0xffffff,
    bias: { adventure:5, safety:18, activity:8, economy:8, premium:5 },
    suggestNames: ['해피', '복덩이', '데이지', '코코', '버디', '뽀로'],
    finalCar: { name:'현대 팰리세이드', meta:'대형 SUV · 7-8인승 · 안전등급 최상' }
  },
  sport: {
    label: '🏎️ 스포츠카',
    desc: '빠르고 화끈 · 모험과 스피드',
    color: 0xff3b5c,    // racing red
    accent: 0xffd86b,
    bias: { adventure:25, safety:-5, activity:18, economy:-5, premium:15 },
    suggestNames: ['플래시', '블레이즈', '터보', '제트', '맥스', '레이서'],
    finalCar: { name:'BMW M4', meta:'스포츠 쿠페 · 고성능 엔진 · 다이나믹' }
  },
  compact: {
    label: '🚗 작은차',
    desc: '경제적 · 도심 · 실속',
    color: 0x70e08b,    // mint
    accent: 0xfffbe5,
    bias: { adventure:-2, safety:10, activity:6, economy:25, premium:-8 },
    suggestNames: ['콩이', '꼬마', '뽀삐', '도토리', '몽이', '뽕뽕'],
    finalCar: { name:'기아 캐스퍼', meta:'경형 SUV · 최고 효율 · 도심 운전' }
  }
};

function buildCar(type, level=1, opts={}) {
  // ---- Chibi car ----
  // Local +Z = forward (front of car)
  const cfg = TYPES[type];
  const colorHex = opts.colorOverride ?? cfg.color;
  const g = new THREE.Group();
  const baseColor = new THREE.Color(colorHex);

  // Size per type. Babies are stubby cubes. Adults stretch.
  const babyness = Math.max(0, (4 - level)) / 3; // 1 at lv1 → 0 at lv4+
  const sizeMap = {
    family:  { L: 1.5 + (1-babyness)*0.4, W: 1.25 + (1-babyness)*0.1, H: 1.15 - (1-babyness)*0.1 },
    sport:   { L: 1.7 + (1-babyness)*0.5, W: 1.2,  H: 1.05 - (1-babyness)*0.3 },
    compact: { L: 1.15 + (1-babyness)*0.15, W: 1.05 + (1-babyness)*0.1, H: 1.05 },
  };
  const s = sizeMap[type];
  const lvScale = 0.7 + (level-1)*0.18; // 0.7..1.42

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: baseColor, roughness:.28, metalness:.25, clearcoat:1, clearcoatRoughness:.08, sheen:.5, sheenColor: baseColor.clone().multiplyScalar(1.2)
  });
  const accentMat = new THREE.MeshPhysicalMaterial({
    color: cfg.accent, roughness:.45, metalness:.2
  });

  // ---- Lower hull ----
  const hull = new THREE.Mesh(new RoundedBoxGeometry(s.L, s.H*0.55, s.W, 6, 0.32), bodyMat);
  hull.position.y = 0.15;
  hull.castShadow = true; hull.receiveShadow = true;
  g.add(hull);

  // ---- Cabin (rounded big bubble for chibi) ----
  let cab;
  if (type === 'family') {
    cab = new THREE.Mesh(new RoundedBoxGeometry(s.L*0.78, s.H*0.65, s.W*0.95, 6, 0.34), bodyMat);
    cab.position.set(-0.02, s.H*0.62, 0);
  } else if (type === 'sport') {
    cab = new THREE.Mesh(new RoundedBoxGeometry(s.L*0.6, s.H*0.55, s.W*0.85, 6, 0.3), bodyMat);
    cab.position.set(-0.05, s.H*0.5, 0);
    // Sport spoiler — chunky cute
    const spo = new THREE.Mesh(new RoundedBoxGeometry(s.W*0.9, 0.12, 0.22, 4, 0.06), accentMat);
    spo.position.set(-s.L*0.45, s.H*0.55, 0);
    g.add(spo);
  } else {
    cab = new THREE.Mesh(new RoundedBoxGeometry(s.L*0.92, s.H*0.7, s.W*0.95, 6, 0.34), bodyMat);
    cab.position.set(0, s.H*0.62, 0);
  }
  cab.castShadow = true;
  g.add(cab);

  // ---- Windshield (front glass), more rounded ----
  const glassMat = new THREE.MeshPhysicalMaterial({
    color:0x88ddff, roughness:.05, metalness:.1, transmission:.8, transparent:true, opacity:.5, clearcoat:1, ior:1.4
  });
  const glass = new THREE.Mesh(new RoundedBoxGeometry(s.L*0.5, s.H*0.45, s.W*0.86, 5, 0.2), glassMat);
  // Tilted toward front
  glass.position.set(type==='sport'? 0.1 : 0.15, type==='family'? s.H*0.62 : type==='sport'? s.H*0.5 : s.H*0.62, 0);
  g.add(glass);
  g.userData.glass = glass;

  // ---- Cute antenna with heart ----
  if (level <= 3) {
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.35, 8),
      new THREE.MeshStandardMaterial({ color:0x222244, roughness:.6 })
    );
    stick.position.set(-s.L*0.2, s.H*0.62 + 0.36, 0);
    g.add(stick);
    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshStandardMaterial({ color:0xff5577, emissive:0xff7eb3, emissiveIntensity:0.7 })
    );
    heart.position.set(-s.L*0.2, s.H*0.62 + 0.55, 0);
    heart.scale.set(1.0, 0.85, 1.0);
    g.add(heart);
    g.userData.heart = heart;
  }

  // ---- Wheels (chunky cute) ----
  const wheelR = type==='sport'? 0.32 : type==='family'? 0.34 : 0.30;
  const wheelW = type==='sport'? 0.18 : 0.16;
  const wheelMat = new THREE.MeshStandardMaterial({ color:0x222233, roughness:.7 });
  const rimMat   = new THREE.MeshStandardMaterial({ color: type==='sport'? 0xffd86b : 0xfafafa, metalness:.85, roughness:.18 });
  const wheelGeo = new THREE.TorusGeometry(wheelR, wheelW, 16, 28);
  const rimGeo   = new THREE.CylinderGeometry(wheelR*0.62, wheelR*0.62, wheelW*1.7, 22);
  const wOff = { x: s.L*0.34, z: s.W*0.5 };
  const wheels = [];
  [[-wOff.x, -s.H*0.18, wOff.z],[wOff.x, -s.H*0.18, wOff.z],[-wOff.x, -s.H*0.18, -wOff.z],[wOff.x, -s.H*0.18, -wOff.z]].forEach(p => {
    const w = new THREE.Group();
    const t = new THREE.Mesh(wheelGeo, wheelMat); t.rotation.y = Math.PI/2;
    const r = new THREE.Mesh(rimGeo, rimMat); r.rotation.z = Math.PI/2;
    w.add(t); w.add(r);
    w.position.set(...p);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  });
  g.userData.wheels = wheels;

  // ---- Big chibi eyes on the windshield ----
  // Local +Z is forward, so eyes face +Z
  const eyeY = (type==='compact'? s.H*0.65 : type==='sport'? s.H*0.5 : s.H*0.62) + 0.02;
  const eyeZ = s.W*0.42;       // pushed toward the front (+Z)
  const eyeGroup = new THREE.Group();
  // Bigger eyes when younger
  const eyeR = (level <= 2) ? 0.22 : (level <= 3 ? 0.18 : 0.0);
  if (eyeR > 0) {
    for (const x of [-s.W*0.22, s.W*0.22]) {
      const eye = new THREE.Group();
      const wEye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 22, 22), new THREE.MeshBasicMaterial({ color:0xffffff }));
      eye.add(wEye);
      const pupilHolder = new THREE.Group();
      const p = new THREE.Mesh(new THREE.SphereGeometry(eyeR*0.6, 16, 16), new THREE.MeshBasicMaterial({ color:0x1a1245 }));
      p.position.z = eyeR*0.55; pupilHolder.add(p);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(eyeR*0.18, 10, 10), new THREE.MeshBasicMaterial({ color:0xffffff }));
      shine.position.set(eyeR*0.18, eyeR*0.22, eyeR*0.85); pupilHolder.add(shine);
      const shine2 = new THREE.Mesh(new THREE.SphereGeometry(eyeR*0.08, 10, 10), new THREE.MeshBasicMaterial({ color:0xffffff }));
      shine2.position.set(-eyeR*0.18, -eyeR*0.05, eyeR*0.85); pupilHolder.add(shine2);
      eye.add(pupilHolder);
      eye.userData.pupil = pupilHolder;
      // Eyelid — thin disc that scales Y to "blink"
      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(eyeR*1.02, 22, 22, 0, Math.PI*2, 0, Math.PI/2),
        new THREE.MeshBasicMaterial({ color: cfg.color || 0xffd9b8 })
      );
      lid.scale.y = 0.0001; // closed amount
      eye.add(lid);
      eye.userData.lid = lid;
      eye.position.set(x, eyeY, eyeZ);
      eyeGroup.add(eye);
    }
  }
  g.add(eyeGroup);
  g.userData.eyes = eyeGroup;

  // ---- Cheek blush ----
  if (level <= 3) {
    const blushMat = new THREE.MeshBasicMaterial({ color:0xff8aa6, transparent:true, opacity:.55 });
    for (const x of [-s.W*0.42, s.W*0.42]) {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), blushMat);
      blush.position.set(x, eyeY-0.16, eyeZ-0.02);
      blush.lookAt(x*5, eyeY-0.16, eyeZ+5);
      g.add(blush);
    }
  }

  // ---- Mouth (toggleable shapes via group) ----
  const mouthGroup = new THREE.Group();
  // Smile (default)
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(.12, .025, 10, 18, Math.PI),
    new THREE.MeshBasicMaterial({ color:0x2a1245 })
  );
  smile.rotation.x = Math.PI;
  smile.position.set(0, eyeY-0.22, eyeZ+0.02);
  mouthGroup.add(smile);
  // Open mouth (hungry/surprised)
  const open = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshBasicMaterial({ color:0x331022 })
  );
  open.scale.set(1, 0.7, 0.5);
  open.position.set(0, eyeY-0.22, eyeZ+0.02);
  open.visible = false;
  mouthGroup.add(open);
  // Sad mouth
  const sad = new THREE.Mesh(
    new THREE.TorusGeometry(.1, .022, 10, 18, Math.PI),
    new THREE.MeshBasicMaterial({ color:0x2a1245 })
  );
  sad.position.set(0, eyeY-0.26, eyeZ+0.02);
  sad.visible = false;
  mouthGroup.add(sad);

  if (level <= 3) g.add(mouthGroup);
  g.userData.mouth = { group: mouthGroup, smile, open, sad };

  // ---- Headlights ----
  const hlightTex = makeRadialTex(new THREE.Color(0xfff2b0));
  for (const x of [-s.W*0.42, s.W*0.42]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: hlightTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity: 0.5 + level*0.1 }));
    sp.position.set(x, -0.02, s.W*0.55);
    sp.scale.set(.6,.6,1);
    g.add(sp);
  }
  // Rear lights
  for (const x of [-s.W*0.42, s.W*0.42]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRadialTex(new THREE.Color(0xff3366)), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity: 0.5 + level*0.1 }));
    sp.position.set(x, 0.08, -s.W*0.55);
    sp.scale.set(.5,.5,1);
    g.add(sp);
  }

  // Sport flame trail at high level
  if (type==='sport' && level >= 4) {
    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.2, 12),
      new THREE.MeshBasicMaterial({ color:0xff7a2a, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false })
    );
    trail.position.set(0, 0.05, -s.W*0.6);
    trail.rotation.x = Math.PI/2;
    g.add(trail);
    g.userData.trail = trail;
  }

  g.scale.setScalar(lvScale);
  g.userData.type = type;
  g.userData.level = level;
  g.userData.colorHex = colorHex;
  g.userData.size = s;

  // Eye blink + idle wobble built-in
  g.userData.idle = {
    phase: Math.random()*Math.PI*2,
    nextBlink: 1.5 + Math.random()*2,
    blinking: 0,
  };
  return g;
}

// Apply expression
function setCarMood(car, mood) {
  if (!car || !car.userData.mouth) return;
  const m = car.userData.mouth;
  m.smile.visible = mood === 'happy';
  m.open.visible  = mood === 'open' || mood === 'hungry';
  m.sad.visible   = mood === 'sad';
  car.userData.mood = mood;
}

// Animate baby car (idle bob, blink, pupil tracking)
function tickCarIdle(car, t, dt, lookAtPoint=null) {
  if (!car) return;
  const u = car.userData.idle;
  if (!u) return;
  // Bob
  car.userData._bobBaseY = car.userData._bobBaseY ?? car.position.y;
  // (We don't override position.y here; callers do their own positioning.)

  // Blink
  u.nextBlink -= dt;
  if (u.blinking > 0) {
    u.blinking -= dt;
    const k = u.blinking < 0.06 ? (0.06 - u.blinking) / 0.06 : 1;
    car.userData.eyes.children.forEach(e => {
      if (e.userData && e.userData.lid) e.userData.lid.scale.y = 1 - Math.min(1, k);
    });
  } else if (u.nextBlink <= 0) {
    u.blinking = 0.12;
    u.nextBlink = 1.5 + Math.random()*3;
  } else {
    car.userData.eyes.children.forEach(e => {
      if (e.userData && e.userData.lid) e.userData.lid.scale.y = 0.0001;
    });
  }

  // Pupil tracking (look at world point)
  if (lookAtPoint) {
    car.userData.eyes.children.forEach(e => {
      if (!e.userData || !e.userData.pupil) return;
      const w = new THREE.Vector3(); e.getWorldPosition(w);
      const dir = lookAtPoint.clone().sub(w);
      // convert to local space relative to parent eye orientation
      const localDir = dir.clone().applyQuaternion(car.quaternion.clone().invert());
      const offX = THREE.MathUtils.clamp(localDir.x*0.05, -0.04, 0.04);
      const offY = THREE.MathUtils.clamp(localDir.y*0.05, -0.04, 0.04);
      e.userData.pupil.position.x = offX;
      e.userData.pupil.position.y = offY;
    });
  }

  // Heart pulse
  if (car.userData.heart) {
    const sc = 1 + Math.sin(t*4 + u.phase)*0.1;
    car.userData.heart.scale.set(sc, sc*0.85, sc);
  }
}

// Replace currentCar in stage: smooth fade+regen
function replaceCar(parent, oldCar, type, level, posY=-.3) {
  if (oldCar) parent.remove(oldCar);
  const c = buildCar(type, level);
  c.position.set(0, posY, 0);
  parent.add(c);
  return c;
}

// ============================================================
// 7. Scenes — banner, select, hatch, kindergarten (stage), race, result
// ============================================================

// 7a. BANNER
const bannerGroup = new THREE.Group();
scene.add(bannerGroup);
sceneGroups.banner = bannerGroup;

(function buildBanner() {
  // Three demo cars rotating
  const types = ['family','sport','compact'];
  const cars = [];
  types.forEach((tp, i) => {
    const c = buildCar(tp, 5);
    c.position.set( Math.cos(i/3*Math.PI*2)*3.2, 0.0, Math.sin(i/3*Math.PI*2)*1.6);
    c.userData.phase = i/3*Math.PI*2;
    bannerGroup.add(c);
    cars.push(c);
  });
  bannerGroup.userData.cars = cars;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(7, 7.4, 128),
    new THREE.MeshBasicMaterial({ color:0x8aa6ff, transparent:true, opacity:.18, side:THREE.DoubleSide })
  );
  ring.rotation.x = Math.PI/2; ring.position.y = -1.2;
  bannerGroup.add(ring);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60,60),
    new THREE.MeshStandardMaterial({ color:0x1a1240, roughness:.85, metalness:.1 })
  );
  floor.rotation.x = -Math.PI/2; floor.position.y = -1.2; floor.receiveShadow = true;
  bannerGroup.add(floor);

  updaters.add(t => {
    if (!bannerGroup.visible) return;
    cars.forEach((c, i) => {
      const a = t*0.4 + i/3*Math.PI*2;
      c.position.x = Math.cos(a)*3.2;
      c.position.z = Math.sin(a)*1.6;
      c.position.y = Math.sin(t*1.4 + c.userData.phase)*0.18;
      c.rotation.y = a + Math.PI/2;
      c.userData.wheels.forEach(w => w.rotation.x = t*1.2);
    });
    ring.rotation.z = t*0.1;
  });
})();

// 7b. SELECT (car type)
const selectGroup = new THREE.Group();
selectGroup.visible = false;
scene.add(selectGroup);
sceneGroups.select = selectGroup;

(function buildSelect() {
  const types = ['family','sport','compact'];
  const cars = [];
  types.forEach((tp, i) => {
    const car = buildCar(tp, 5);
    car.position.set( (i-1)*3.4, 0.1, 0);
    car.userData.tp = tp;
    car.userData.phase = i*0.7;
    car.userData.basePos = car.position.clone();
    selectGroup.add(car);
    cars.push(car);

    // pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.3, .25, 32),
      new THREE.MeshStandardMaterial({ color:0x2a1f55, metalness:.7, roughness:.3, emissive:0x1a1140 })
    );
    ped.position.set(car.position.x, -.85, 0);
    ped.castShadow = true; ped.receiveShadow = true;
    selectGroup.add(ped);

    // Glow halo
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialTex(new THREE.Color(TYPES[tp].color)),
      transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:.55
    }));
    glow.scale.set(4, 4, 1);
    glow.position.set(car.position.x, 0, -0.5);
    selectGroup.add(glow);
    car.userData.glow = glow;
  });
  selectGroup.userData.cars = cars;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60,60),
    new THREE.MeshStandardMaterial({ color:0x150f33, roughness:.9, metalness:.1 })
  );
  floor.rotation.x = -Math.PI/2; floor.position.y = -1.0; floor.receiveShadow = true;
  selectGroup.add(floor);

  updaters.add(t => {
    if (!selectGroup.visible) return;
    cars.forEach(c => {
      const hov = c.userData.hovered ? 1.15 : 1.0;
      const sel = c.userData.selected ? 1.2 : 1.0;
      const target = hov * sel;
      c.scale.x += (target - c.scale.x)*0.12;
      c.scale.y = c.scale.x; c.scale.z = c.scale.x;
      const baseY = c.userData.basePos.y + Math.sin(t*1.6 + c.userData.phase)*0.15;
      c.position.y += (baseY - c.position.y)*0.1;
      c.rotation.y = t*0.5 + c.userData.phase;
      c.userData.wheels.forEach(w => w.rotation.x = t*1.2);
      c.userData.glow.material.opacity = 0.5 + Math.sin(t*2 + c.userData.phase)*0.15 + (c.userData.hovered? 0.3:0);
    });
  });
})();

// 7c. HATCH (egg burst → baby car emerges)
const hatchGroup = new THREE.Group();
hatchGroup.visible = false;
scene.add(hatchGroup);
sceneGroups.hatch = hatchGroup;

(function buildHatch() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
    new THREE.MeshStandardMaterial({ color:0x271d5a, roughness:.6, metalness:.2 })
  );
  floor.rotation.x = -Math.PI/2; floor.position.y = -1; floor.receiveShadow = true;
  hatchGroup.add(floor);

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.5, 6, 64, 1, true),
    new THREE.MeshBasicMaterial({ color:0xffe8b6, transparent:true, opacity:.08, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending })
  );
  cone.position.set(0, 2, 0);
  hatchGroup.add(cone);
})();

function makeEgg(colorHex, scale=1) {
  const group = new THREE.Group();
  const baseColor = new THREE.Color(colorHex);
  const eggGeo = new THREE.SphereGeometry(.7, 64, 64);
  const pos = eggGeo.attributes.position;
  for (let i=0;i<pos.count;i++) {
    const y = pos.getY(i);
    pos.setY(i, y * 1.35);
  }
  eggGeo.computeVertexNormals();
  const eggMat = new THREE.MeshPhysicalMaterial({
    color: baseColor, roughness:.25, metalness:.15, clearcoat:1, clearcoatRoughness:.15,
    sheen:.6, sheenColor: baseColor.clone().multiplyScalar(1.2),
    emissive: baseColor.clone().multiplyScalar(.18),
  });
  const egg = new THREE.Mesh(eggGeo, eggMat);
  egg.castShadow = true; group.add(egg);

  for (let i=0;i<6;i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(.04 + Math.random()*.04, 8,8),
      new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.9 })
    );
    const a = Math.random()*Math.PI*2, b = (Math.random()-.5)*Math.PI;
    const r = .75;
    s.position.set(Math.cos(a)*Math.cos(b)*r, Math.sin(b)*r*1.2, Math.sin(a)*Math.cos(b)*r);
    group.add(s);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRadialTex(baseColor), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:.85 }));
  glow.scale.set(3.8,3.8,1);
  group.add(glow);
  group.userData.egg = egg;
  group.userData.glow = glow;
  group.scale.setScalar(scale);
  return group;
}

// 7d. KINDERGARTEN STAGE
const stageGroup = new THREE.Group();
stageGroup.visible = false;
scene.add(stageGroup);
sceneGroups.stage = stageGroup;

(function buildKinder() {
  // Floor (wooden mat pattern via vertex color trick)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40, 1, 1),
    new THREE.MeshStandardMaterial({ color:0xf2c98a, roughness:.9 })
  );
  floor.rotation.x = -Math.PI/2; floor.position.y = -1.0; floor.receiveShadow = true;
  stageGroup.add(floor);

  // Carpet
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({ color:0x6cdcb4, roughness:.95 })
  );
  rug.rotation.x = -Math.PI/2; rug.position.y = -.99;
  stageGroup.add(rug);

  // Back wall (pastel)
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 12),
    new THREE.MeshStandardMaterial({ color:0xfdd6e3, roughness:1 })
  );
  wall.position.set(0, 4, -8);
  stageGroup.add(wall);

  // Side wall
  const sideL = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 12),
    new THREE.MeshStandardMaterial({ color:0xc9e7ff, roughness:1 })
  );
  sideL.position.set(-12, 4, 0); sideL.rotation.y = Math.PI/2;
  stageGroup.add(sideL);
  const sideR = sideL.clone();
  sideR.position.set(12, 4, 0); sideR.rotation.y = -Math.PI/2;
  stageGroup.add(sideR);

  // Blackboard
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 2.5),
    new THREE.MeshStandardMaterial({ color:0x2a3b22, roughness:.8 })
  );
  board.position.set(0, 4.5, -7.95);
  stageGroup.add(board);

  // "ABC" floating text via canvas plane
  const tex = makeTextTex('A B C  🚗', 512, 128, '#fff');
  const txt = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 1.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent:true })
  );
  txt.position.set(0, 4.5, -7.92);
  stageGroup.add(txt);

  // Toy blocks (cubes scattered)
  const blockColors = [0xff7eb3, 0x7afcff, 0xffd86b, 0xa18cff, 0x6cdcb4];
  for (let i=0;i<10;i++) {
    const cs = 0.4 + Math.random()*0.3;
    const block = new THREE.Mesh(
      new RoundedBoxGeometry(cs, cs, cs, 3, 0.06),
      new THREE.MeshStandardMaterial({ color: blockColors[i%blockColors.length], roughness:.5 })
    );
    const a = Math.random()*Math.PI*2;
    const r = 5 + Math.random()*4;
    block.position.set(Math.cos(a)*r, -1+cs/2, Math.sin(a)*r);
    block.rotation.y = Math.random()*Math.PI;
    block.castShadow = true;
    stageGroup.add(block);
  }

  // Bookshelf (right side)
  const shelf = new THREE.Group();
  for (let i=0;i<3;i++) {
    const sh = new THREE.Mesh(new RoundedBoxGeometry(2.5,.1,.7,2,.04), new THREE.MeshStandardMaterial({ color:0xb8744a, roughness:.7 }));
    sh.position.y = i*0.8; shelf.add(sh);
    for (let k=0;k<5;k++) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(.35, .55, .45, 2, .05), new THREE.MeshStandardMaterial({ color: blockColors[(i*5+k)%blockColors.length], roughness:.5 }));
      b.position.set(-1 + k*.45, .35 + i*.8, 0); shelf.add(b);
    }
  }
  shelf.position.set(-7.5, -.95, -3);
  shelf.rotation.y = Math.PI/3.5;
  stageGroup.add(shelf);

  // Window (left)
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2),
    new THREE.MeshStandardMaterial({ color:0xa6e0ff, emissive:0x88c0ff, emissiveIntensity:.4 })
  );
  win.position.set(-11.95, 3, 0); win.rotation.y = Math.PI/2;
  stageGroup.add(win);
  const cloudTex = makeTextTex('☁️ ☁️', 256, 128);
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(3,2), new THREE.MeshBasicMaterial({ map: cloudTex, transparent:true }));
  cloud.position.set(-11.93, 3, 0); cloud.rotation.y = Math.PI/2;
  stageGroup.add(cloud);

  // Hanging garlands
  for (let i=0;i<6;i++) {
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(.3, .4),
      new THREE.MeshStandardMaterial({ color: blockColors[i%blockColors.length], roughness:.5, side:THREE.DoubleSide })
    );
    flag.position.set(-3 + i*1.2, 6.5, -7.8);
    flag.rotation.z = (i%2? 0.1 : -0.1);
    stageGroup.add(flag);
  }

  // Ceiling lamp
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(.4, 16, 16),
    new THREE.MeshStandardMaterial({ color:0xfff2b0, emissive:0xfff2b0, emissiveIntensity:1 })
  );
  lamp.position.set(0, 7, 1);
  stageGroup.add(lamp);
  const lampLight = new THREE.PointLight(0xffe5a0, 0.7, 12);
  lampLight.position.copy(lamp.position);
  stageGroup.add(lampLight);

  // Glow ring on rug to spotlight car
  const gring = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 2.2, 64),
    new THREE.MeshBasicMaterial({ color:0xffd86b, transparent:true, opacity:.55, blending:THREE.AdditiveBlending, depthWrite:false })
  );
  gring.rotation.x = -Math.PI/2; gring.position.y = -.98;
  stageGroup.add(gring);
  stageGroup.userData.gring = gring;

  // ---- Door (placed at +Z of room so car drives "out" toward camera/right) ----
  const doorGroup = new THREE.Group();
  // Door frame
  const frameMat = new THREE.MeshStandardMaterial({ color:0x8b5a2b, roughness:.7 });
  const doorMat  = new THREE.MeshStandardMaterial({ color:0xffd6a1, roughness:.6, metalness:.05 });
  const doorFrame = new THREE.Mesh(new RoundedBoxGeometry(2.2, 3.0, 0.2, 4, 0.06), frameMat);
  doorFrame.position.set(0, 0.5, 0);
  doorGroup.add(doorFrame);
  const doorPanel = new THREE.Mesh(new RoundedBoxGeometry(1.8, 2.6, 0.12, 4, 0.05), doorMat);
  doorPanel.position.set(0.9, 0.5, 0.06); // hinged at left
  doorPanel.geometry.translate(-0.9, 0, 0); // pivot left edge
  doorGroup.add(doorPanel);
  // door knob
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshStandardMaterial({ color:0xffd86b, metalness:.9, roughness:.2 })
  );
  knob.position.set(0.7, 0.5, 0.13);
  doorPanel.add(knob);
  // Sign "OUT"
  const signTex = makeTextTex('🌳 밖으로', 256, 96, '#ffd86b');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: signTex, transparent:true }));
  sign.position.set(0, 2.2, 0.16);
  doorGroup.add(sign);
  doorGroup.position.set(8.5, -1, 5);
  doorGroup.rotation.y = -Math.PI/2;
  stageGroup.add(doorGroup);
  stageGroup.userData.door = doorGroup;
  stageGroup.userData.doorPanel = doorPanel;

  updaters.add(t => {
    if (!stageGroup.visible) return;
    gring.material.opacity = 0.45 + Math.sin(t*2)*0.15;
    gring.scale.setScalar(1 + Math.sin(t*1.5)*0.04);
    lamp.material.emissiveIntensity = 0.9 + Math.sin(t*3)*0.15;
  });
})();

function makeTextTex(text, w=512, h=128, color='#1a1245') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0,0,w,h);
  g.font = `900 ${Math.floor(h*.55)}px Black Han Sans, sans-serif`;
  g.fillStyle = color; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(text, w/2, h/2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Reference to current car in stage
let stageCar = null;
const Stage = { _activeWander: null };

function clearStageWander() {
  if (Stage._activeWander) {
    updaters.delete(Stage._activeWander.update);
    Stage._activeWander = null;
  }
}

// 7e. RACE (Cookie Run-style side runner)
const raceGroup = new THREE.Group();
raceGroup.visible = false;
scene.add(raceGroup);
sceneGroups.race = raceGroup;

const Race = {
  active:false, elapsed:0, duration:30,
  speed: 8, carX: 0, carY: 0, carVy: 0,
  isJump: false, isSlide: false,
  car: null,
  obstacles: [], coins: [], gems: [],
  segMoveZ: 0,
  hits:0, coinsCt:0, gemsCt:0,
};

(function buildRace() {
  // ---- True 2.5D side-runner.
  // World scrolls in -X. Player at X≈-3.
  // Camera high & back, framing scene ~16 units wide.
  // ----

  // Sky — vertical gradient pink→peach→cream
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 256; skyCanvas.height = 256;
  const skg = skyCanvas.getContext('2d');
  const grad = skg.createLinearGradient(0,0,0,256);
  grad.addColorStop(0,    '#ff5e9d');
  grad.addColorStop(0.45, '#ff9966');
  grad.addColorStop(0.85, '#ffd86b');
  grad.addColorStop(1,    '#fff5d4');
  skg.fillStyle = grad; skg.fillRect(0,0,256,256);
  // Stars sprinkled
  for (let i=0;i<30;i++) {
    skg.fillStyle = `rgba(255,255,255,${.3+Math.random()*.5})`;
    skg.beginPath();
    skg.arc(Math.random()*256, Math.random()*100, Math.random()*1.5+.4, 0, Math.PI*2);
    skg.fill();
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(80, 22), new THREE.MeshBasicMaterial({ map: skyTex }));
  sky.position.set(0, 7, -10);
  raceGroup.add(sky);

  // Big moon/sun behind everything
  const moonGeo = new THREE.CircleGeometry(2.4, 64);
  const moonCanvas = document.createElement('canvas'); moonCanvas.width=moonCanvas.height=256;
  const mctx = moonCanvas.getContext('2d');
  const mg = mctx.createRadialGradient(128,128,30, 128,128,128);
  mg.addColorStop(0, 'rgba(255,255,255,1)');
  mg.addColorStop(0.5, 'rgba(255,236,180,0.9)');
  mg.addColorStop(1, 'rgba(255,176,120,0)');
  mctx.fillStyle = mg; mctx.fillRect(0,0,256,256);
  const moonTex = new THREE.CanvasTexture(moonCanvas);
  const moon = new THREE.Mesh(moonGeo, new THREE.MeshBasicMaterial({ map: moonTex, transparent:true }));
  moon.position.set(3, 5, -9);
  raceGroup.add(moon);
  Race.moon = moon;

  // ---- Ground: candy-stripe road repeating texture ----
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 64; roadCanvas.height = 256;
  const rctx = roadCanvas.getContext('2d');
  rctx.fillStyle = '#3b2563'; rctx.fillRect(0,0,64,256);
  // diagonal stripes
  for (let y=-64;y<320;y+=24) {
    rctx.fillStyle = '#553b87';
    rctx.beginPath();
    rctx.moveTo(0,y); rctx.lineTo(64,y+24); rctx.lineTo(64,y+38); rctx.lineTo(0,y+14);
    rctx.closePath(); rctx.fill();
  }
  // edge highlights
  rctx.fillStyle = 'rgba(255,255,255,0.15)';
  rctx.fillRect(0, 4, 64, 2);
  rctx.fillRect(0, 248, 64, 2);
  const roadTex = new THREE.CanvasTexture(roadCanvas);
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(20, 1);   // road wraps along X
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 4),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness:.7, metalness:.1 })
  );
  ground.rotation.x = -Math.PI/2;
  ground.rotation.z = Math.PI/2;  // align stripes
  ground.position.set(0, -1.2, 0);
  ground.receiveShadow = true;
  raceGroup.add(ground);
  Race.ground = ground;
  Race.roadTex = roadTex;

  // ---- Yellow center dashes (animated) ----
  const stripeMat = new THREE.MeshBasicMaterial({ color:0xffe89a });
  Race.stripes = [];
  for (let i=0;i<40;i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .14), stripeMat);
    s.rotation.x = -Math.PI/2;
    s.position.set(-30 + i*2.5, -1.18, 0);
    raceGroup.add(s);
    Race.stripes.push(s);
  }

  // ---- Glowing curb rails ----
  const railMatTop = new THREE.MeshStandardMaterial({ color:0xffe1ff, emissive:0xff7eb3, emissiveIntensity:1.4 });
  const railMatBot = new THREE.MeshStandardMaterial({ color:0xa1f0ff, emissive:0x4488ff, emissiveIntensity:1.4 });
  for (const [z, mat] of [[-1.95, railMatBot], [1.95, railMatTop]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(120, .14, .14), mat);
    rail.position.set(0, -1.05, z);
    raceGroup.add(rail);
  }

  // ---- Far cloud strip (purple silhouette) ----
  Race.farClouds = [];
  for (let i=0;i<14;i++) {
    const c = new THREE.Mesh(
      new THREE.SphereGeometry(1 + Math.random()*0.6, 10, 10),
      new THREE.MeshStandardMaterial({ color:0x4a2e7a, roughness:.95, flatShading:true })
    );
    c.position.set(-40 + i*6, 1.5 + Math.random()*1.2, -8);
    c.scale.set(2.2 + Math.random()*1, 0.9, 1);
    raceGroup.add(c);
    Race.farClouds.push(c);
  }

  // ---- Mid hills (rounded silhouettes) ----
  Race.midHills = [];
  for (let i=0;i<10;i++) {
    const h = new THREE.Mesh(
      new THREE.SphereGeometry(2 + Math.random()*1.4, 12, 12, 0, Math.PI*2, 0, Math.PI/2),
      new THREE.MeshStandardMaterial({ color:0x2e1a52, roughness:.95 })
    );
    h.position.set(-40 + i*8, -1.4, -5);
    h.scale.set(1.5, 1, 1);
    raceGroup.add(h);
    Race.midHills.push(h);
  }

  // ---- Foreground sugar candy clouds (white-pink) parallax ----
  Race.clouds = [];
  for (let i=0;i<8;i++) {
    const cloud = new THREE.Group();
    const w1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 12),
      new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0xffd1e6, emissiveIntensity:.4 })
    );
    const w2 = w1.clone(); w2.position.set(0.7, -0.1, 0); w2.scale.setScalar(0.85);
    const w3 = w1.clone(); w3.position.set(-0.6, -0.05, 0); w3.scale.setScalar(0.7);
    cloud.add(w1, w2, w3);
    cloud.position.set(-40 + i*9 + Math.random()*3, 3.4 + Math.random()*1.2, -3);
    raceGroup.add(cloud);
    Race.clouds.push(cloud);
  }

  // ---- Roadside lollipop trees ----
  Race.lollies = [];
  for (let i=0;i<6;i++) {
    const lolly = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8),
      new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.4 })
    );
    stem.position.y = -.55;
    const candy = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), .85, .65),
        emissive: new THREE.Color().setHSL(Math.random(), .85, .55),
        emissiveIntensity:.35,
        roughness:.4
      })
    );
    candy.position.y = .0;
    lolly.add(stem, candy);
    lolly.position.set(-30 + i*9, -.6, -1.3);
    raceGroup.add(lolly);
    Race.lollies.push(lolly);
  }

  // ---- Ambient bouncing balloons (foreground) ----
  Race.balloons = [];
  for (let i=0;i<5;i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL((i*0.7)%1, .9, .65),
        emissive: new THREE.Color().setHSL((i*0.7)%1, .9, .5),
        emissiveIntensity:.5
      })
    );
    b.position.set(-30 + i*8, 2 + Math.random(), -1.8);
    b.userData.phase = Math.random()*Math.PI*2;
    raceGroup.add(b);
    Race.balloons.push(b);
  }

  // ---- Speed lines (sprite trails behind player) -- created on demand
  Race.speedLines = [];
})();

function spawnRaceItem(kind, x) {
  let mesh;
  if (kind === 'coin') {
    // Spinning gold coin
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.08, 28),
      new THREE.MeshStandardMaterial({ color:0xffd86b, emissive:0xffaa00, emissiveIntensity:1, metalness:.95, roughness:.18 })
    );
    ring.rotation.x = Math.PI/2;
    g.add(ring);
    // $ marker
    const dot = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.04, 8, 20),
      new THREE.MeshStandardMaterial({ color:0xfff4c4, emissive:0xffd86b, emissiveIntensity:1.1 })
    );
    dot.rotation.y = Math.PI/2;
    dot.position.z = 0.05;
    g.add(dot);
    mesh = g;
    mesh.userData.value = 50;
    mesh.position.set(x, -.4 + Math.random()*0.15, 0);
  } else if (kind === 'gem') {
    mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(.42, 0),
      new THREE.MeshPhysicalMaterial({ color:0xa0fff5, emissive:0x3399ff, emissiveIntensity:1.4, metalness:.5, roughness:.05, clearcoat:1, transmission:.3 })
    );
    mesh.userData.value = 300;
    mesh.position.set(x, .35 + Math.random()*0.4, 0);
  } else if (kind === 'obstacle-low') {
    // ---- Cute spike candy (red) — JUMP over ----
    const g = new THREE.Group();
    // Base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.14, 18),
      new THREE.MeshStandardMaterial({ color:0xff3366, roughness:.4 })
    );
    g.add(base);
    // Spikes (red cones)
    const spikeMat = new THREE.MeshStandardMaterial({ color:0xff5577, emissive:0x661122, emissiveIntensity:.45, roughness:.4 });
    for (let i=0;i<6;i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.46, 8), spikeMat);
      const a = i/6 * Math.PI*2;
      sp.position.set(Math.cos(a)*0.28, 0.22, Math.sin(a)*0.18);
      sp.rotation.x = Math.cos(a)*0.4;
      sp.rotation.z = -Math.sin(a)*0.4;
      g.add(sp);
    }
    // Top spike (tallest)
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 10), spikeMat);
    top.position.y = 0.35;
    g.add(top);
    // Cute angry eyes
    const eyeWhite = new THREE.MeshBasicMaterial({ color:0xffffff });
    const eyePupil = new THREE.MeshBasicMaterial({ color:0x111111 });
    for (const ex of [-0.13, 0.13]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), eyeWhite);
      w.position.set(ex, 0.08, 0.32);
      g.add(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), eyePupil);
      p.position.set(ex, 0.06, 0.38);
      g.add(p);
    }
    mesh = g;
    mesh.position.set(x, -.85, 0);
  } else if (kind === 'obstacle-high') {
    // ---- Floating cotton candy (pink) — SLIDE under ----
    const g = new THREE.Group();
    // Cotton fluff
    const fluffMat = new THREE.MeshStandardMaterial({ color:0xff8fc7, emissive:0xff5599, emissiveIntensity:.4, roughness:.85 });
    for (const [px, py, pz, sc] of [[0,0,0,1],[0.2,0.05,0,0.7],[-0.2,0.04,0,0.75],[0,0.16,0,0.6],[0.1,-0.1,0,0.6]]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), fluffMat);
      f.position.set(px, py, pz); f.scale.setScalar(sc);
      g.add(f);
    }
    // Stick (white)
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
      new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.5 })
    );
    stick.position.y = -0.32;
    g.add(stick);
    // Eyes
    const eyeWhite2 = new THREE.MeshBasicMaterial({ color:0xffffff });
    const eyePupil2 = new THREE.MeshBasicMaterial({ color:0x111111 });
    for (const ex of [-0.09, 0.09]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), eyeWhite2);
      w.position.set(ex, 0.03, 0.22);
      g.add(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), eyePupil2);
      p.position.set(ex, 0.02, 0.27);
      g.add(p);
    }
    mesh = g;
    mesh.position.set(x, 0.55, 0);
    mesh.userData.basePhase = Math.random()*Math.PI*2;
  }
  mesh.userData.kind = kind;
  raceGroup.add(mesh);
  if (kind === 'coin') Race.coins.push(mesh);
  else if (kind === 'gem') Race.gems.push(mesh);
  else Race.obstacles.push(mesh);
}

// 7f. RESULT
const resultGroup = new THREE.Group();
resultGroup.visible = false;
scene.add(resultGroup);
sceneGroups.result = resultGroup;

let resultCar = null;

(function buildResult() {
  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.7, .3, 64),
    new THREE.MeshStandardMaterial({ color:0x2c1d6c, metalness:.6, roughness:.3, emissive:0x150a3a })
  );
  podium.position.y = -.9; podium.castShadow = true; podium.receiveShadow = true;
  resultGroup.add(podium);

  for (let i=0;i<3;i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(2.6+i*.1, 2.7+i*.1, 64),
      new THREE.MeshBasicMaterial({ color:0x7afcff, transparent:true, opacity:.4 - i*.1, side:THREE.DoubleSide })
    );
    r.rotation.x = -Math.PI/2; r.position.y = -.74;
    resultGroup.add(r);
  }

  for (let i=0;i<6;i++) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(.5, 12, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i/6, .7, .65), transparent:true, opacity:.18, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending })
    );
    const a = i/6*Math.PI*2;
    beam.position.set(Math.cos(a)*5, 5, Math.sin(a)*5);
    beam.lookAt(0, 0, 0);
    resultGroup.add(beam);
  }

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(20, 64),
    new THREE.MeshStandardMaterial({ color:0x120a30, roughness:.8 })
  );
  floor.rotation.x = -Math.PI/2; floor.position.y = -1.05; floor.receiveShadow = true;
  resultGroup.add(floor);
})();

// ============================================================
// 8. UI rendering helpers
// ============================================================
function clearUI() { ui.innerHTML = ''; }

function renderHUD(opts) {
  const { step, total } = opts;
  return `
    <div class="hud">
      <div class="card">
        <div class="hud-label">STEP</div>
        <div class="hud-val">${step} / ${total}</div>
      </div>
      <div class="card">
        <div class="hud-label">${(State.babyName||'BABY').toUpperCase()} · LV ${State.level}</div>
        <div class="hud-val">${TYPES[State.carType]?.label || ''}</div>
      </div>
      <div class="card">
        <div class="hud-label">POINTS</div>
        <div class="hud-val">${State.points.toLocaleString()}P</div>
      </div>
    </div>
  `;
}

// ============================================================
// 9. Game flow
// ============================================================

// Main entry
async function goBanner() {
  Audio.startBGM('mystic');
  setActiveScene('banner');
  await moveCam(new THREE.Vector3(0, 1.6, 8.5), new THREE.Vector3(0, 0.5, 0), 600);
  ui.innerHTML = `
    <div class="banner-wrap fade-in">
      <div class="title-h">CBTI</div>
      <div class="subtitle">CAR BUYING TYPE INDICATOR</div>

      <div style="margin-top:10px; color:#ffd86b; font-size: clamp(13px,1.9vh,17px); font-weight:900; letter-spacing:.04em;">
        🚗 내 차 성향(CBTI)을 찾는 5분 게임
      </div>
      <div style="margin-top:6px; color:#dfe9ff; font-size: clamp(11px,1.5vh,13px); line-height:1.55; max-width:560px; margin-left:auto; margin-right:auto;">
        아기차를 골라 함께 키우면서 <b style="color:#ffd86b;">먹이주기 · 친구놀이 · 드라이브 · 수리</b>를 해보세요.<br/>
        당신의 선택이 모여 <b style="color:#7afcff;">나에게 꼭 맞는 차와 금융 플랜</b>을 추천해드려요.
      </div>

      <div style="margin-top:14px; display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; max-width:640px; margin-left:auto; margin-right:auto;">
        <div class="card" style="padding:10px 8px;">
          <div style="font-size:24px;">🚙</div>
          <div style="font-weight:900; font-size: clamp(11px,1.5vh,13px); margin-top:2px;">1. 차 고르기</div>
          <div style="color:#bdd0ff; font-size: clamp(9px,1.2vh,11px); margin-top:1px;">패밀리·스포츠·작은차</div>
        </div>
        <div class="card" style="padding:10px 8px;">
          <div style="font-size:24px;">🍼</div>
          <div style="font-weight:900; font-size: clamp(11px,1.5vh,13px); margin-top:2px;">2. 먹이주기</div>
          <div style="color:#bdd0ff; font-size: clamp(9px,1.2vh,11px); margin-top:1px;">전기·휘발유 선택</div>
        </div>
        <div class="card" style="padding:10px 8px;">
          <div style="font-size:24px;">🏁</div>
          <div style="font-weight:900; font-size: clamp(11px,1.5vh,13px); margin-top:2px;">3. 드라이브</div>
          <div style="color:#bdd0ff; font-size: clamp(9px,1.2vh,11px); margin-top:1px;">쿠키런 미니게임</div>
        </div>
        <div class="card" style="padding:10px 8px;">
          <div style="font-size:24px;">🏆</div>
          <div style="font-weight:900; font-size: clamp(11px,1.5vh,13px); margin-top:2px;">4. 결과 받기</div>
          <div style="color:#bdd0ff; font-size: clamp(9px,1.2vh,11px); margin-top:1px;">CBTI + 추천차</div>
        </div>
      </div>

      <div class="banner-tags" style="margin-top:14px;">
        <span class="tag">⏱️ 약 5분</span>
        <span class="tag">🎁 최대 50,000P</span>
        <span class="tag">📱 가로 모드 최적화</span>
        <span class="tag">🔊 사운드 ON</span>
      </div>
      <button class="btn pulse" id="startBtn" style="margin-top:6px;">✨ 지금 시작하기</button>
    </div>
    <div class="banner-stat">이미 127,483명이 자신의 차를 찾았어요</div>
  `;
  document.getElementById('startBtn').onclick = () => {
    Audio.init(); Audio.sfx.click();
    goSelect();
  };
}

// 9a. Select
async function goSelect() {
  await fadeTransition(async () => {
    setActiveScene('select');
    await moveCam(new THREE.Vector3(0, 1.8, 7.5), new THREE.Vector3(0, 0.4, 0), 500);
  });
  ui.innerHTML = `
    ${renderHUD({step:1, total:7})}
    <div class="scene-card card fade-in">
      <h2>🌟 어떤 아기차와 함께할까요?</h2>
      <p>당신의 직감을 믿고 한 대를 선택하세요. 이 아기차가 당신과 함께 성장합니다.</p>
      <div class="choices">
        <div class="choice" data-tp="family">
          <div class="em">🚙</div>
          <div class="name">${TYPES.family.label}</div>
          <div class="desc">${TYPES.family.desc}</div>
        </div>
        <div class="choice" data-tp="sport">
          <div class="em">🏎️</div>
          <div class="name">${TYPES.sport.label}</div>
          <div class="desc">${TYPES.sport.desc}</div>
        </div>
        <div class="choice" data-tp="compact">
          <div class="em">🚗</div>
          <div class="name">${TYPES.compact.label}</div>
          <div class="desc">${TYPES.compact.desc}</div>
        </div>
      </div>
    </div>
    <div class="hint">▼ 차를 직접 클릭하거나 카드를 선택하세요 ▼</div>
  `;
  ui.querySelectorAll('.choice').forEach(c => {
    c.onmouseenter = () => Audio.sfx.hover();
    c.onclick = () => selectType(c.dataset.tp);
  });
}

function selectType(tp) {
  Audio.sfx.select();
  State.carType = tp;
  // Apply trait bias
  const b = TYPES[tp].bias;
  for (const k in b) State.traits[k] = Math.max(0, Math.min(100, State.traits[k] + b[k]));

  const chosen = selectGroup.userData.cars.find(c => c.userData.tp === tp);
  selectGroup.userData.cars.forEach(c => {
    if (c !== chosen) {
      c.children.forEach(ch => {
        if (ch.material && ch.material.opacity !== undefined) {
          ch.material.transparent = true;
          tween(ch.material, 'opacity', .15, 500);
        }
      });
      tween(c.userData.glow.material, 'opacity', 0, 500);
      tween(c.scale, 'x', .5, 500);
      tween(c.scale, 'y', .5, 500);
      tween(c.scale, 'z', .5, 500);
    } else {
      c.userData.selected = true;
    }
  });

  tween(chosen.position, 'x', 0, 700);
  tween(chosen.position, 'z', 1.2, 700);
  setTimeout(() => goHatch(), 800);
}

// 9b. Hatch
async function goHatch() {
  Audio.stopBGM();
  await fadeTransition(async () => {
    setActiveScene('hatch');
    await moveCam(new THREE.Vector3(0, 1.4, 5.5), new THREE.Vector3(0, .3, 0), 400);
    // create egg of type color
    const egg = makeEgg(TYPES[State.carType].color, 1.5);
    egg.position.set(0, 0.4, 0);
    hatchGroup.add(egg);
    State._egg = egg;
  });
  Audio.startBGM('mystic');
  ui.innerHTML = `<div class="scene-card card fade-in" style="bottom:20px;"><h2>🥚 부화중...</h2><p>아기차가 깨어나고 있어요</p></div>`;
  await shakeEgg(State._egg, 1500);
  Audio.sfx.crack();
  spawnBurst(State._egg.position.clone(), TYPES[State.carType].color, 200, 3.5, 1.2);
  Audio.sfx.flash();
  flashScreen('#fff', 700);
  hatchGroup.remove(State._egg);

  // Spawn baby car
  const baby = buildCar(State.carType, 1);
  baby.position.set(0, -.6, 0);
  baby.scale.setScalar(0.05);
  hatchGroup.add(baby);
  State._babyCar = baby;
  tween(baby.scale, 'x', 0.6, 800, easeOutBack);
  tween(baby.scale, 'y', 0.6, 800, easeOutBack);
  tween(baby.scale, 'z', 0.6, 800, easeOutBack);
  tween(baby.position, 'y', -.3, 800, easeOutBack);

  // Idle: gentle bob + blink + look around
  const phase = Math.random()*Math.PI*2;
  const idle = (t, dt)=> {
    if (!hatchGroup.visible || !State._babyCar) return;
    State._babyCar.position.y = -.3 + Math.sin(t*2 + phase)*.06;
    State._babyCar.rotation.y = Math.sin(t*1)*.25;
    State._babyCar.userData.wheels.forEach(w => w.rotation.x = t*1.2);
    tickCarIdle(State._babyCar, t, dt);
  };
  updaters.add(idle);
  await wait(800);
  Audio.sfx.boing();
  showToast(`🎉 ${TYPES[State.carType].label} 아기차 탄생!`);
  await wait(1400);
  goNaming();
}

async function shakeEgg(egg, ms=1500) {
  const t0 = performance.now();
  return new Promise(res => {
    function tick(now){
      const t = (now-t0)/ms;
      if (t>=1) { egg.rotation.z = 0; res(); return; }
      const intensity = t*t * 1.0;
      egg.rotation.z = Math.sin(now*0.04)*intensity*0.4;
      egg.position.y = .4 + Math.sin(now*0.06)*intensity*0.05;
      egg.userData.glow.material.opacity = 0.6 + Math.sin(now*0.02)*0.3 + intensity*0.5;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// 9c. Naming
function goNaming() {
  const names = TYPES[State.carType].suggestNames;
  ui.innerHTML = `
    ${renderHUD({step:2, total:7})}
    <div class="scene-card card fade-in">
      <h2>💝 특별한 이름을 지어주세요</h2>
      <p>아기차에게 이름을 선물해 보세요. 직접 입력하거나 추천에서 골라도 좋아요.</p>
      <input class="name-input" id="nameIn" maxlength="6" placeholder="이름 입력 (최대 6자)" />
      <div class="name-suggest">
        ${names.map(n => `<div class="nb" data-n="${n}">${n}</div>`).join('')}
      </div>
      <div style="margin-top:10px; display:flex; gap:8px; justify-content:center;">
        <button class="btn" id="confirmName">✅ 이 이름으로!</button>
        <button class="btn ghost" id="skipName">⏭️ 기본값 (부릉이)</button>
      </div>
    </div>
  `;
  const input = document.getElementById('nameIn');
  ui.querySelectorAll('.nb').forEach(b => b.onclick = () => {
    Audio.sfx.click();
    input.value = b.dataset.n;
  });
  document.getElementById('confirmName').onclick = () => {
    const v = input.value.trim() || '부릉이';
    State.babyName = v;
    Audio.sfx.success();
    showToast(`💖 "${State.babyName}" — 정말 멋진 이름이야!`);
    setTimeout(goStage1, 1100);
  };
  document.getElementById('skipName').onclick = () => {
    State.babyName = '부릉이';
    Audio.sfx.click();
    setTimeout(goStage1, 200);
  };
}

// ----------------------------------------------------------------
// 9d. Stage 1: feeding mini-game
// Player moves the baby car (joystick / WASD / arrows) onto food items
// scattered on the floor. Food types: ev_slow/ev_fast/gasoline/premium.
// ----------------------------------------------------------------
const FOODS = {
  ev_slow:  { emoji:'🔌', label:'전기 완속',  color:0x4fd58e, hex:'#4fd58e' },
  ev_fast:  { emoji:'⚡',  label:'전기 급속',  color:0x7afcff, hex:'#7afcff' },
  gasoline: { emoji:'⛽', label:'휘발유',     color:0xffaa55, hex:'#ffaa55' },
  premium:  { emoji:'💎', label:'고급 휘발유', color:0xff7eb3, hex:'#ff7eb3' },
};

async function goStage1() {
  Audio.stopBGM();
  await fadeTransition(async () => {
    if (State._babyCar) hatchGroup.remove(State._babyCar);
    setActiveScene('stage');
    stageCar = buildCar(State.carType, 1);
    stageCar.position.set(0, -.3, 0);
    stageGroup.add(stageCar);
    await moveCam(new THREE.Vector3(0, 3.4, 6), new THREE.Vector3(0, -0.3, 0), 600);
  });
  Audio.startBGM('major');

  // Make sure no leftover wanderer
  clearStageWander();

  // ---- Phase 1: hungry intro ----
  setCarMood(stageCar, 'hungry');
  const tummy = createTummyEffect(stageCar);
  const bubble = createThoughtBubble(stageCar, '🍽️');
  showToast(`${State.babyName}이(가) 배가 고파해요…`);
  Audio.sfx.error(); // small whimper

  // Hungry idle anim
  const hungryIdle = (t, dt) => {
    if (!stageCar) return;
    stageCar.position.y = -.3 + Math.sin(t*5)*.04;            // shaky
    stageCar.rotation.z = Math.sin(t*8)*.02;
    tickCarIdle(stageCar, t, dt);
    if (tummy) tummy.update(t);
    if (bubble) bubble.update(t);
    stageCar.userData.wheels.forEach(w => w.rotation.z = Math.sin(t*6)*.05);
  };
  updaters.add(hungryIdle);

  await wait(2200);
  // Show feed UI now
  updaters.delete(hungryIdle);
  if (tummy) tummy.dispose();
  if (bubble) bubble.dispose();
  setCarMood(stageCar, 'open'); // hungry mouth open

  const feedTarget = 6;
  const tally = { ev_slow:0, ev_fast:0, gasoline:0, premium:0 };
  const items = []; // { mesh, type }

  // Bounds for the play area
  const BOUNDS = { x: 4.5, z: 2.6 };

  function spawnFood() {
    const types = Object.keys(FOODS);
    const type = types[Math.floor(Math.random()*types.length)];
    const cfg = FOODS[type];

    // 3D food: glowing torus + emoji sprite atop
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.32, .07, 12, 24),
      new THREE.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity:1.2, metalness:.5, roughness:.3 })
    );
    ring.rotation.x = Math.PI/2;
    grp.add(ring);

    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeEmojiTex(cfg.emoji, 128), transparent:true, depthWrite:false }));
    sp.scale.set(.7,.7,1);
    sp.position.y = .15;
    grp.add(sp);

    // Soft glow under
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialTex(new THREE.Color(cfg.color)),
      transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:.7
    }));
    halo.scale.set(1.6,1.6,1); halo.position.y = -.3;
    grp.add(halo);

    grp.position.set((Math.random()-.5)*BOUNDS.x*2, -.7, (Math.random()-.5)*BOUNDS.z*2);
    grp.userData.type = type;
    grp.userData.phase = Math.random()*Math.PI*2;
    stageGroup.add(grp);
    items.push(grp);
  }

  // Spawn 5 starting items
  for (let i=0;i<5;i++) spawnFood();

  // UI
  ui.innerHTML = `
    ${renderHUD({step:3, total:7})}
    <div class="feed-meter card">
      <div class="row"><span>먹이주기</span><span id="feedCt">0 / ${feedTarget}</span></div>
      <div class="bar"><div id="feedBar"></div></div>
    </div>
    <div class="scene-card card fade-in" style="bottom: auto; top: 14%;">
      <h2>🍼 ${State.babyName}에게 먹이를 주세요!</h2>
      <p>차를 움직여 음식 위로 가세요. <b style="color:#ffd86b;">전기·휘발유 선택</b>으로 친환경 / 프리미엄 성향을 분석해요.<br/>
        🎮 좌측 조이스틱 · 또는 WASD / 화살표 키 · ${feedTarget}번 먹이면 다음 단계!</p>
    </div>
    <div class="card food-legend">
      <div class="it"><span class="sw" style="background:${FOODS.ev_slow.hex};color:${FOODS.ev_slow.hex};"></span>${FOODS.ev_slow.emoji} ${FOODS.ev_slow.label}</div>
      <div class="it"><span class="sw" style="background:${FOODS.ev_fast.hex};color:${FOODS.ev_fast.hex};"></span>${FOODS.ev_fast.emoji} ${FOODS.ev_fast.label}</div>
      <div class="it"><span class="sw" style="background:${FOODS.gasoline.hex};color:${FOODS.gasoline.hex};"></span>${FOODS.gasoline.emoji} ${FOODS.gasoline.label}</div>
      <div class="it"><span class="sw" style="background:${FOODS.premium.hex};color:${FOODS.premium.hex};"></span>${FOODS.premium.emoji} ${FOODS.premium.label}</div>
    </div>
    <div class="joystick" id="joystick"><div class="knob" id="knob"></div></div>
  `;

  // Controls — joystick + keyboard
  const input = { x:0, z:0 };  // -1..1 vector
  const keyState = { w:0, a:0, s:0, d:0, ArrowUp:0, ArrowLeft:0, ArrowDown:0, ArrowRight:0 };
  function onKey(e, v) {
    const k = e.key.length===1 ? e.key.toLowerCase() : e.key;
    if (k in keyState) { keyState[k] = v; e.preventDefault(); }
  }
  const onKD = e => onKey(e, 1);
  const onKU = e => onKey(e, 0);
  addEventListener('keydown', onKD);
  addEventListener('keyup', onKU);

  // Joystick drag
  const stick = document.getElementById('joystick');
  const knob = document.getElementById('knob');
  const stickRect = () => stick.getBoundingClientRect();
  let stickActive = false, stickPid = null;
  function setStickFromPointer(cx, cy) {
    const r = stickRect();
    const cxC = r.left + r.width/2;
    const cyC = r.top + r.height/2;
    let dx = cx - cxC, dy = cy - cyC;
    const max = r.width/2 - 14;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len > max) { dx = dx/len*max; dy = dy/len*max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.x = dx / max;
    input.z = dy / max;
  }
  function resetStick() {
    knob.style.transform = '';
    input.x = 0; input.z = 0;
  }
  stick.addEventListener('pointerdown', e => {
    e.preventDefault();
    stickActive = true; stickPid = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    setStickFromPointer(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', e => {
    if (!stickActive || e.pointerId !== stickPid) return;
    setStickFromPointer(e.clientX, e.clientY);
  });
  const stickEnd = e => {
    if (e.pointerId !== stickPid) return;
    stickActive = false; stickPid = null;
    resetStick();
  };
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);
  stick.addEventListener('pointerleave', stickEnd);

  // Movement updater (self-disables once feeding is done)
  let feedingDone = false;
  const moveUpdater = (t, dt) => {
    if (feedingDone) return;
    if (!stageGroup.visible) return;
    if (!stageCar || !stageCar.userData || !stageCar.userData.wheels) return;
    // Combine keyboard
    const kx = (keyState.d || keyState.ArrowRight ? 1 : 0) - (keyState.a || keyState.ArrowLeft ? 1 : 0);
    const kz = (keyState.s || keyState.ArrowDown  ? 1 : 0) - (keyState.w || keyState.ArrowUp   ? 1 : 0);
    let dx = input.x + kx;
    let dz = input.z + kz;
    const len = Math.sqrt(dx*dx + dz*dz);
    if (len > 1) { dx /= len; dz /= len; }
    const speed = 3.0;
    stageCar.position.x = THREE.MathUtils.clamp(stageCar.position.x + dx * speed * dt, -BOUNDS.x, BOUNDS.x);
    stageCar.position.z = THREE.MathUtils.clamp(stageCar.position.z + dz * speed * dt, -BOUNDS.z, BOUNDS.z);
    if (len > 0.05) {
      const targetRot = Math.atan2(dx, dz);
      let cur = stageCar.rotation.y;
      let diff = ((targetRot - cur + Math.PI*3) % (Math.PI*2)) - Math.PI;
      stageCar.rotation.y = cur + diff * Math.min(1, dt*8);
      stageCar.userData.wheels.forEach(w => w.rotation.x += dt * speed * 4);
      stageCar.position.y = -.3 + Math.sin(t*10)*.04;
    } else {
      stageCar.position.y = -.3 + Math.sin(t*2)*.04;
    }

    // Animate items + collision (guard against detached items)
    for (let i=items.length-1;i>=0;i--) {
      const it = items[i];
      if (!it || !it.position || !it.parent) {
        items.splice(i,1);
        continue;
      }
      it.position.y = -.7 + Math.sin(t*2 + it.userData.phase)*.12 + .35;
      it.rotation.y += dt*1.2;
      const ddx = it.position.x - stageCar.position.x;
      const ddz = it.position.z - stageCar.position.z;
      if (Math.sqrt(ddx*ddx + ddz*ddz) < 0.7) {
        eatFood(it.userData.type, it.position.clone());
        stageGroup.remove(it);
        items.splice(i,1);
      }
    }

    while (items.length < 4) spawnFood();
  };
  updaters.add(moveUpdater);

  async function eatFood(type, pos) {
    Audio.sfx.eat();
    tally[type]++;
    State.food.push(type);
    State.fuelPref[type] = (State.fuelPref[type]||0) + 1;
    // chomp animation
    setCarMood(stageCar, 'open');

    // Trait shifts
    if (type === 'ev_slow')  { State.traits.economy += 6; State.traits.safety += 2; }
    if (type === 'ev_fast')  { State.traits.activity += 4; State.traits.adventure += 3; State.traits.premium += 2; }
    if (type === 'gasoline') { State.traits.economy += 3; State.traits.activity += 2; }
    if (type === 'premium')  { State.traits.premium += 8; }

    State.points += 100;
    spawnBurst(pos, FOODS[type].color, 50, 1.4, .9);

    // Bounce
    const py = stageCar.position.y;
    tween(stageCar.position, 'y', py + .2, 160, easeOutCubic, ()=> tween(stageCar.position,'y', py, 200, easeOutCubic));

    const total = tally.ev_slow + tally.ev_fast + tally.gasoline + tally.premium;
    const ct = document.getElementById('feedCt'); if (ct) ct.textContent = `${total} / ${feedTarget}`;
    const bar = document.getElementById('feedBar'); if (bar) bar.style.width = `${total/feedTarget*100}%`;
    setTimeout(()=> { if (stageCar) setCarMood(stageCar, total >= feedTarget ? 'happy' : 'open'); }, 250);

    if (total >= feedTarget) {
      // Cleanup — disable updater first so it can't run again
      feedingDone = true;
      updaters.delete(moveUpdater);
      removeEventListener('keydown', onKD);
      removeEventListener('keyup', onKU);
      // Remove remaining items
      items.forEach(it => { if (it && it.parent) stageGroup.remove(it); });
      items.length = 0;

      // Hide joystick & legend
      ui.querySelector('#joystick')?.remove();
      ui.querySelector('.food-legend')?.remove();
      ui.querySelector('.feed-meter')?.remove();

      Audio.sfx.levelUp();
      State.level = 2;
      const oldPos = stageCar.position.clone();
      stageCar = replaceCar(stageGroup, stageCar, State.carType, State.level);
      stageCar.position.copy(oldPos);
      setCarMood(stageCar, 'happy');
      showToast(`✨ 배부르다! 이제 밖으로 나가요`);

      // Cute happy hop
      const py = stageCar.position.y;
      tween(stageCar.position, 'y', py + .35, 200, easeOutCubic, ()=> tween(stageCar.position,'y', py, 220, easeOutCubic));

      await wait(900);

      // Transition: car drives to door
      ui.innerHTML = `${renderHUD({step:4, total:7})}
        <div class="scene-card card fade-in" style="bottom: 12px;">
          <h2>🚪 유치원 밖으로 출발!</h2>
          <p>${State.babyName}이(가) 신나서 밖으로 달려나가요…</p>
        </div>`;

      const doorWorld = stageGroup.userData.door.position.clone();
      // Open the door panel (animate rotation Y)
      const panel = stageGroup.userData.doorPanel;
      tween(panel.rotation, 'y', -Math.PI/2 * 0.9, 700, easeOutCubic);

      await wait(300);
      driveCarTo(stageCar, new THREE.Vector3(7, -.3, 4.5), 1300);

      // Wheel rotation while driving
      const driveAnim = (t, dt) => {
        if (!stageCar) return;
        stageCar.userData.wheels.forEach(w => w.rotation.x += dt * 6);
        tickCarIdle(stageCar, t, dt);
      };
      updaters.add(driveAnim);
      await wait(1300);
      // Continue to "outside" — fade out as car exits
      driveCarTo(stageCar, new THREE.Vector3(11, -.3, 4.5), 800);
      await wait(800);
      updaters.delete(driveAnim);

      goDestinationChoice();
    }
  }
}

// Destination choice replaces old goFriendVisit / goDriveChoice flow
async function goDestinationChoice() {
  await fadeTransition(async () => {
    // Keep stage scene but reset car to center
    setActiveScene('stage');
    if (stageCar) stageGroup.remove(stageCar);
    stageCar = buildCar(State.carType, 2);
    stageCar.position.set(0, -.3, 4);
    stageGroup.add(stageCar);
    setCarMood(stageCar, 'happy');
    // Close door behind
    if (stageGroup.userData.doorPanel) tween(stageGroup.userData.doorPanel.rotation, 'y', 0, 600);
    await moveCam(new THREE.Vector3(0, 2.4, 8.5), new THREE.Vector3(0, 0.5, 4), 600);
  });
  Audio.startBGM('major');

  // Idle wobble
  const phase = Math.random()*Math.PI*2;
  const idle = (t, dt) => {
    if (!stageCar) return;
    stageCar.position.y = -.3 + Math.sin(t*2 + phase)*.05;
    stageCar.userData.wheels.forEach(w => w.rotation.x = Math.sin(t*3)*0.5);
    tickCarIdle(stageCar, t, dt);
  };
  updaters.add(idle);
  Stage._activeIdle = idle;

  ui.innerHTML = `
    ${renderHUD({step:4, total:7})}
    <div class="scene-card card fade-in">
      <h2>🗺️ 어디로 갈까요?</h2>
      <p>밖에 친구가 부르고 있어요! ${State.babyName}이(가) 갈 곳을 정해주세요.</p>
      <div class="choices">
        <div class="choice" data-id="friend"><div class="em">👋</div><div class="name">친구 만나러</div><div class="desc">함께 사이먼 게임!</div></div>
        <div class="choice" data-id="coast"><div class="em">🌅</div><div class="name">해안도로</div><div class="desc">긴 드라이브 · 모험형</div></div>
        <div class="choice" data-id="park"><div class="em">🎢</div><div class="name">놀이공원</div><div class="desc">신나는 길 · 활동형</div></div>
        <div class="choice" data-id="home"><div class="em">🏡</div><div class="name">동네 한 바퀴</div><div class="desc">짧고 안전 · 안전형</div></div>
      </div>
    </div>
  `;
  ui.querySelectorAll('.choice').forEach(c => {
    c.onmouseenter = () => Audio.sfx.hover();
    c.onclick = () => {
      Audio.sfx.click();
      const id = c.dataset.id;
      State.drive = id;
      // Clean up idle updater
      updaters.delete(idle);
      Stage._activeIdle = null;
      // Disable all choices to prevent double-clicks
      ui.querySelectorAll('.choice').forEach(c2 => c2.style.pointerEvents='none');
      console.log('[CBTI] destination chose:', id);
      if (id === 'friend') {
        goFriendVisit().catch(err => console.error('[CBTI] friend error:', err));
      } else {
        if (id==='home')  { State.traits.safety += 12; State.traits.economy += 4; Race.duration = 22; }
        if (id==='coast') { State.traits.adventure += 18; State.traits.activity += 6; Race.duration = 30; }
        if (id==='park')  { State.traits.activity += 14; State.traits.adventure += 6; Race.duration = 26; }
        goRaceRun().catch(err => console.error('[CBTI] race error:', err));
      }
    };
  });
}

function makeEmojiTex(emoji, size=128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.font = `${size*0.78}px serif`; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(emoji, size/2, size/2 + size*0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Create thought bubble above a car (sprite, billboarded)
function createThoughtBubble(car, emoji) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  // bubble background
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath(); g.arc(128, 110, 90, 0, Math.PI*2); g.fill();
  // little tail
  g.beginPath(); g.arc(80, 200, 14, 0, Math.PI*2); g.fill();
  g.beginPath(); g.arc(60, 230, 8, 0, Math.PI*2); g.fill();
  // emoji
  g.font = '120px serif'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(emoji, 128, 110);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent:true, depthWrite:false }));
  sp.scale.set(1.2, 1.2, 1);
  car.add(sp);
  sp.position.set(0.6, 1.5, 0);
  return {
    sprite: sp,
    update(t) {
      sp.position.y = 1.5 + Math.sin(t*2)*0.06;
      sp.material.opacity = 0.85 + Math.sin(t*3)*0.15;
    },
    dispose() { car.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
  };
}

// Tummy growling: small particles spawning under the car
function createTummyEffect(car) {
  let timer = 0;
  return {
    update(t) {
      timer += 0.016;
      if (timer > 0.5) {
        timer = 0;
        const w = new THREE.Vector3();
        car.getWorldPosition(w);
        spawnBurst(w.clone().add(new THREE.Vector3(0, 0.1, 0.5)), 0xff8aa6, 8, 0.6, 0.8);
      }
    },
    dispose() {}
  };
}

// Drive car along a path then run callback when done
function driveCarTo(car, targetPos, ms=1500, onDone) {
  const from = car.position.clone();
  const t0 = performance.now();
  const startRot = car.rotation.y;
  // Compute target rotation (face direction of travel), but for chibi cars front=+Z
  const dir = targetPos.clone().sub(from); dir.y = 0;
  const targetRot = Math.atan2(dir.x, dir.z);
  function tick(now) {
    const t = Math.min(1, (now - t0)/ms);
    const e = easeInOutCubic(t);
    car.position.lerpVectors(from, targetPos, e);
    // Smooth rotation
    let cur = startRot;
    let diff = ((targetRot - startRot + Math.PI*3) % (Math.PI*2)) - Math.PI;
    car.rotation.y = startRot + diff * e;
    if (car.userData.wheels) car.userData.wheels.forEach(w => w.rotation.x += 0.4);
    if (t < 1) requestAnimationFrame(tick); else if (onDone) onDone();
  }
  requestAnimationFrame(tick);
}

function makeWanderer(car, opts={}) {
  const radius = opts.radius || 1.5;
  const speed  = opts.speed  || 0.8;
  let target = new THREE.Vector3((Math.random()-.5)*radius*2, -.3, (Math.random()-.5)*radius);
  let timer = 0;
  const update = (t, dt) => {
    if (!stageGroup.visible) return;
    timer += dt;
    if (timer > 2 || car.position.distanceTo(target) < .3) {
      target.set((Math.random()-.5)*radius*2, -.3, (Math.random()-.5)*radius);
      timer = 0;
    }
    const dir = target.clone().sub(car.position);
    dir.y = 0;
    if (dir.lengthSq() > 1e-4) {
      dir.normalize();
      car.position.x += dir.x * speed * dt;
      car.position.z += dir.z * speed * dt;
      car.rotation.y = Math.atan2(dir.x, dir.z);
    }
    car.userData.wheels.forEach(w => w.rotation.x += dt*4);
    car.position.y = -.3 + Math.sin(t*4 + car.id)*.04;
  };
  return { update, target };
}

// 9e. Friend visit — friend car drives in, simon-says together
async function goFriendVisit() {
  // Pick a friend type different from player's
  const allTypes = ['family','sport','compact'].filter(t => t !== State.carType);
  const friendType = allTypes[Math.floor(Math.random()*allTypes.length)];
  const friendNames = TYPES[friendType].suggestNames;
  const friendName = friendNames[Math.floor(Math.random()*friendNames.length)];

  // Camera to side view
  await moveCam(new THREE.Vector3(0, 2.0, 7.5), new THREE.Vector3(0, 0.3, 0), 600);

  // Move player car back to center first (it might be at edge from feeding)
  if (stageCar) {
    driveCarTo(stageCar, new THREE.Vector3(1.4, -.3, 0), 700);
    await wait(700);
  }

  // Spawn friend car offscreen-left, drive in
  const friend = buildCar(friendType, 2);
  friend.position.set(-9, -.3, 0);
  friend.rotation.y = Math.PI/2; // facing +X (right) toward player
  setCarMood(friend, 'happy');
  stageGroup.add(friend);

  // Friend drives in toward player
  showToast(`👋 친구 "${friendName}"이(가) 놀러왔어요!`);
  Audio.sfx.boing();
  driveCarTo(friend, new THREE.Vector3(-1.4, -.3, 0), 1500);

  // Idle for both cars: player faces friend, friend faces player
  const phase = Math.random()*Math.PI*2;
  const idle = (t, dt) => {
    if (!stageCar) return;
    stageCar.rotation.y = -Math.PI/2 + Math.sin(t*1.5)*0.1; // facing -X (toward friend)
    stageCar.position.y = -.3 + Math.sin(t*2 + phase)*.05;
    stageCar.userData.wheels.forEach(w => w.rotation.x = Math.sin(t*3)*0.4);
    tickCarIdle(stageCar, t, dt, friend.position);

    friend.rotation.y = Math.PI/2 + Math.sin(t*1.5 + 1)*0.1; // facing +X (toward player)
    friend.position.y = -.3 + Math.sin(t*2 + phase + 1)*.05;
    friend.userData.wheels.forEach(w => w.rotation.x = Math.sin(t*3 + 1)*0.4);
    tickCarIdle(friend, t, dt, stageCar.position);
  };
  updaters.add(idle);

  await wait(1700);

  // UI for simon says
  ui.innerHTML = `
    ${renderHUD({step:4, total:7})}
    <div class="scene-card card fade-in" style="bottom: auto; top: 10%;">
      <h2>🎶 ${friendName}와 사이먼 게임!</h2>
      <p>친구가 보여주는 색 순서를 따라 누르세요. 4라운드 도전!</p>
    </div>
    <div class="simon-board">
      <div class="sk" data-i="0" style="background: radial-gradient(circle at 35% 35%, #ffafc6, #ff3b6e);"></div>
      <div class="sk" data-i="1" style="background: radial-gradient(circle at 35% 35%, #b3eaff, #2a8eff);"></div>
      <div class="sk" data-i="2" style="background: radial-gradient(circle at 35% 35%, #fff3a8, #ffb83a);"></div>
      <div class="sk" data-i="3" style="background: radial-gradient(circle at 35% 35%, #c4ffd6, #2cd47a);"></div>
    </div>
    <div class="hint" id="simon-status">친구의 순서를 잘 보세요…</div>
  `;
  const keys = [...ui.querySelectorAll('.sk')];
  const colorTones = [330, 440, 550, 660];

  function flashFriend() {
    // Friend bounces/jumps
    tween(friend.position, 'y', 0.1, 200, easeOutCubic, ()=> tween(friend.position,'y',-.3,200,easeOutCubic));
  }

  const seq = [];
  for (let i=0;i<4;i++) seq.push(Math.floor(Math.random()*4));

  for (let r=1; r<=seq.length; r++) {
    document.getElementById('simon-status').textContent = `라운드 ${r} / 4 — 친구의 순서를 보세요`;
    for (let i=0;i<r;i++) {
      const idx = seq[i];
      keys[idx].classList.add('lit');
      flashFriend();
      const ctx = (window._actx ||= new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type='triangle'; o.frequency.value = colorTones[idx];
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.4);
      await wait(440);
      keys[idx].classList.remove('lit');
      await wait(140);
    }
    document.getElementById('simon-status').textContent = `라운드 ${r} / 4 — 따라 누르세요`;
    let answered = 0;
    let mistake = false;
    await new Promise(res => {
      const handler = (e) => {
        const sk = e.target.closest('.sk');
        if (!sk) return;
        const idx = +sk.dataset.i;
        sk.classList.add('lit');
        // Player car bounces
        tween(stageCar.position, 'y', 0.1, 150, easeOutCubic, ()=> tween(stageCar.position,'y',-.3,180,easeOutCubic));
        const ctx = window._actx;
        if (ctx) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type='triangle'; o.frequency.value = colorTones[idx];
          g.gain.setValueAtTime(0.3, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
          o.connect(g); g.connect(ctx.destination);
          o.start(); o.stop(ctx.currentTime + 0.2);
        }
        setTimeout(()=> sk.classList.remove('lit'), 200);
        if (idx !== seq[answered]) {
          mistake = true;
          Audio.sfx.error();
          ui.removeEventListener('pointerdown', handler);
          res();
          return;
        }
        answered++;
        if (answered === r) {
          ui.removeEventListener('pointerdown', handler);
          res();
        }
      };
      ui.addEventListener('pointerdown', handler);
    });
    if (mistake) {
      State.traits.activity -= 3;
      showToast('🙈 다음 기회에!');
      break;
    } else {
      State.traits.activity += 5;
      Audio.sfx.success();
      State.points += 200;
      // Friend cheers
      spawnBurst(friend.position.clone().add(new THREE.Vector3(0,0.5,0)), 0xffd86b, 30, 1.0, 0.7);
      await wait(500);
    }
  }

  showToast(`🎉 친구가 즐거워해요!`);
  await wait(900);

  // Friend leaves
  setCarMood(friend, 'happy');
  driveCarTo(friend, new THREE.Vector3(9, -.3, 0), 1100, () => {
    stageGroup.remove(friend);
    updaters.delete(idle);
  });

  await wait(1100);
  // Grow to level 3
  State.level = 3;
  const oldPos = stageCar.position.clone();
  stageCar = replaceCar(stageGroup, stageCar, State.carType, State.level);
  stageCar.position.copy(oldPos);
  setCarMood(stageCar, 'happy');
  Audio.sfx.levelUp();
  showToast(`✨ ${State.babyName} Lv.3 청소년차로 성장!`);
  await wait(1300);
  goRaceRun();
}

// 9g. Race — Cookie Run-style runner
async function goRaceRun() {
  Audio.stopBGM();
  // Default duration
  if (!Race.duration || Race.duration < 18) Race.duration = 26;
  Race._finalMode = false;

  await fadeTransition(async () => {
    setActiveScene('race');
    if (Race.car) raceGroup.remove(Race.car);
    const c = buildCar(State.carType, State.level);
    // Race uniform scale (small chibi runner) — overrides level scale
    c.scale.setScalar(0.55);
    c.position.set(-4, -.7, 0);
    c.rotation.y = Math.PI/2; // face +X (right)
    raceGroup.add(c);
    Race.car = c;
    setCarMood(c, 'happy');
    // Far back side-view: see whole runway, true 2.5D feel
    await moveCam(new THREE.Vector3(0, 1.0, 11), new THREE.Vector3(0, 0.0, 0), 600);
  });
  Audio.startBGM('race');

  // Reset race state
  Race.elapsed = 0;
  Race.speed = 8;
  Race.carX = -4; Race.carY = 0; Race.carVy = 0;
  Race.isJump = false; Race.isSlide = false;
  Race.coinsCt = 0; Race.gemsCt = 0; Race.hits = 0;
  Race.obstacles.forEach(o => raceGroup.remove(o)); Race.obstacles = [];
  Race.coins.forEach(o => raceGroup.remove(o)); Race.coins = [];
  Race.gems.forEach(o => raceGroup.remove(o)); Race.gems = [];

  // Pre-spawn — easy 3 coins for tutorial
  spawnRaceItem('coin', 4);
  spawnRaceItem('coin', 6);
  spawnRaceItem('coin', 8);
  // Then a mix
  for (let x=11; x<70; x+=2.4 + Math.random()*1.4) {
    const r = Math.random();
    if (r < 0.5) spawnRaceItem('coin', x);
    else if (r < 0.6) spawnRaceItem('gem', x);
    else if (r < 0.82) spawnRaceItem('obstacle-low', x);
    else spawnRaceItem('obstacle-high', x);
  }

  ui.innerHTML = `
    <div class="race-hud">
      <div class="card race-stat"><div class="hud-label">TIME</div><div class="hud-val" id="race-time">${Race.duration}s</div></div>
      <div class="card race-stat"><div class="hud-label">SCORE</div><div class="hud-val" id="race-score">0P</div></div>
      <div class="card race-stat"><div class="hud-label">${State.babyName}</div><div class="hud-val">LV.${State.level}</div></div>
    </div>
    <div class="speedo"><div class="v" id="race-speed">0</div><div class="u">KM/H</div></div>
    <div class="touch-actions">
      <div class="tbtn" id="btnSlide" title="슬라이드">⬇</div>
      <div class="tbtn" id="btnJump" title="점프">⬆</div>
    </div>
    <div class="controls-hint">
      ⬆ 점프 / ⬇ 슬라이드 · 키보드 <b>Space</b> 점프, <b>↓</b> 슬라이드
    </div>
    <div class="center" id="raceCount" style="font-family:'Black Han Sans'; font-size: clamp(70px, 18vh, 160px);
        background: linear-gradient(135deg,#ffd86b,#ff7eb3 50%,#7afcff);
        -webkit-background-clip:text; background-clip:text; color:transparent;
        text-shadow: 0 0 60px rgba(255,200,255,.4); pointer-events:none; z-index:30;"></div>
  `;

  // Bind controls FIRST (will no-op while Race.active is false)
  Race.active = false;
  bindRaceControls();

  await runCountdown();
  Race.active = true;
}

async function runCountdown() {
  const el = document.getElementById('raceCount');
  if (!el) return;
  for (const v of ['3','2','1']) {
    el.textContent = v;
    el.style.transition = 'none';
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1.4)';
    Audio.sfx.countdown();
    await wait(40);
    el.style.transition = 'opacity .3s ease, transform .3s ease';
    el.style.opacity = '0.4';
    el.style.transform = 'translate(-50%,-50%) scale(0.9)';
    await wait(420);
  }
  el.textContent = 'GO!';
  el.style.transition = 'none';
  el.style.opacity = '1';
  el.style.transform = 'translate(-50%,-50%) scale(1.6)';
  Audio.sfx.go();
  await wait(380);
  el.style.transition = 'opacity .35s ease, transform .35s ease';
  el.style.opacity = '0';
  el.style.transform = 'translate(-50%,-50%) scale(2.2)';
  setTimeout(()=> el.remove(), 400);
}

function bindRaceControls() {
  // Detach any prior listeners first
  if (Race._cleanup) { try { Race._cleanup(); } catch(e){} }

  const jump = () => {
    if (!Race.active) return;
    if (!Race.isJump && !Race.isSlide) {
      Race.isJump = true; Race.carVy = 7.5;
      Audio.sfx.jump();
    }
  };
  const slide = (on) => {
    if (!Race.active) return;
    if (on && !Race.isJump) {
      if (!Race.isSlide) Audio.sfx.slide();
      Race.isSlide = true;
    } else {
      Race.isSlide = false;
    }
  };

  function key(e) {
    if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') jump();
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') slide(true);
  }
  function keyUp(e) {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') slide(false);
  }
  addEventListener('keydown', key);
  addEventListener('keyup', keyUp);

  const bj = document.getElementById('btnJump');
  const bs = document.getElementById('btnSlide');
  bj.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  bs.addEventListener('pointerdown', e => { e.preventDefault(); slide(true); });
  bs.addEventListener('pointerup', e => { e.preventDefault(); slide(false); });
  bs.addEventListener('pointercancel', () => slide(false));

  // Tap top half = jump, bottom half = slide (mobile)
  function touchTap(e) {
    if (e.target.closest('.tbtn')) return;
    if (e.clientY < innerHeight/2) jump();
    else slide(true);
  }
  function touchEnd(e) {
    slide(false);
  }
  renderer.domElement.addEventListener('pointerdown', touchTap);
  renderer.domElement.addEventListener('pointerup', touchEnd);

  Race._cleanup = () => {
    removeEventListener('keydown', key);
    removeEventListener('keyup', keyUp);
    renderer.domElement.removeEventListener('pointerdown', touchTap);
    renderer.domElement.removeEventListener('pointerup', touchEnd);
  };
}

function tickRace(dt) {
  if (!Race.active) return;
  Race.elapsed += dt;
  const remain = Math.max(0, Race.duration - Race.elapsed);
  Race.speed = Math.min(Race.speed + dt*0.3, 18);

  // ---- Player physics ----
  const GRAVITY = 26;
  Race.carVy -= GRAVITY * dt;
  Race.carY += Race.carVy * dt;
  if (Race.carY <= 0) { Race.carY = 0; Race.carVy = 0; Race.isJump = false; }
  const jumpVisualY = Race.carY * 0.7;
  Race.car.position.y = -.7 + jumpVisualY;

  const slideY = Race.isSlide ? 0.55 : 1.0;
  Race.car.scale.set(0.55, 0.55 * slideY, 0.55);

  Race.car.userData.wheels.forEach(w => w.rotation.x += dt * Race.speed * 1.4);
  Race.car.position.x = Race.carX + Math.sin(Race.elapsed*4)*.04;
  Race.car.rotation.z = -Race.carVy * 0.022;

  // ---- World scroll ----
  const moveX = Race.speed * dt;
  if (Race.roadTex) {
    Race.roadTex.offset.x = (Race.roadTex.offset.x - dt*Race.speed*0.06);
  }
  Race.stripes.forEach(s => {
    s.position.x -= moveX;
    if (s.position.x < -30) s.position.x += 100;
  });
  if (Race.farClouds) Race.farClouds.forEach(c => {
    c.position.x -= moveX * 0.05;
    if (c.position.x < -42) c.position.x += 84;
  });
  if (Race.midHills) Race.midHills.forEach(h => {
    h.position.x -= moveX * 0.18;
    if (h.position.x < -42) h.position.x += 84;
  });
  if (Race.clouds) Race.clouds.forEach(c => {
    c.position.x -= moveX * 0.4;
    if (c.position.x < -42) c.position.x += 84;
  });
  if (Race.lollies) Race.lollies.forEach(l => {
    l.position.x -= moveX * 0.85;
    if (l.position.x < -32) l.position.x += 64;
    l.rotation.z = Math.sin(Race.elapsed*2 + l.position.x*0.1)*0.05;
  });
  if (Race.balloons) Race.balloons.forEach(b => {
    b.position.x -= moveX * 0.55;
    if (b.position.x < -32) b.position.x += 64;
    b.position.y = 2 + Math.sin(Race.elapsed*1.8 + b.userData.phase)*0.25;
  });

  // ---- Collision check (smaller car so smaller box) ----
  const carCx = Race.car.position.x;
  const carCy = Race.car.position.y;
  const carHalfX = 0.4;
  const carHalfYTop = Race.isSlide ? 0.16 : 0.36;
  const carHalfYBot = 0.36;

  for (const arr of [Race.coins, Race.gems, Race.obstacles]) {
    for (let i=arr.length-1;i>=0;i--) {
      const it = arr[i];
      it.position.x -= moveX;
      const k = it.userData.kind;
      if (k === 'coin') it.rotation.y += dt*5;
      else if (k === 'gem') { it.rotation.y += dt*3; it.rotation.x += dt*2; }
      else if (k === 'obstacle-high') it.position.y = 0.55 + Math.sin(Race.elapsed*3 + (it.userData.basePhase||0))*0.06;
      else if (k === 'obstacle-low') it.rotation.y += dt*1.4;

      const ddx = Math.abs(it.position.x - carCx);
      if (ddx < (carHalfX + 0.4)) {
        const itHalf = (k==='coin') ? 0.32 : (k==='gem') ? 0.4 : (k==='obstacle-low') ? 0.4 : 0.32;
        const itLow = it.position.y - itHalf;
        const itHi  = it.position.y + itHalf;
        const carLow = carCy - carHalfYBot;
        const carHi  = carCy + carHalfYTop;
        if (carLow < itHi && carHi > itLow) {
          if (k === 'coin') {
            State.points += 50; Race.coinsCt++;
            spawnBurst(it.position.clone(), 0xffd86b, 30, 1.0, 0.8);
            Audio.sfx.coin();
            raceGroup.remove(it); arr.splice(i,1);
          } else if (k === 'gem') {
            State.points += 300; Race.gemsCt++;
            spawnBurst(it.position.clone(), 0x7afcff, 50, 1.5, 1.0);
            Audio.sfx.diamond();
            raceGroup.remove(it); arr.splice(i,1);
          } else {
            Race.hits++;
            spawnBurst(it.position.clone(), 0xff5577, 80, 2.0, 1.0);
            Race.speed = Math.max(5, Race.speed - 4);
            Audio.sfx.crash();
            shakeCamera(280);
            setCarMood(Race.car, 'sad');
            setTimeout(()=> Race.car && setCarMood(Race.car, 'happy'), 400);
            raceGroup.remove(it); arr.splice(i,1);
          }
        }
      }
      if (it.position.x < -10) {
        raceGroup.remove(it); arr.splice(i,1);
      }
    }
  }

  // Dust particles behind car wheels
  Race._dustT = (Race._dustT || 0) + dt;
  if (Race._dustT > 0.1 && !Race.isJump) {
    Race._dustT = 0;
    spawnBurst(
      new THREE.Vector3(Race.car.position.x - 0.3, -1.05, 0),
      0xffe89a, 4, 0.6, 0.4
    );
  }

  // Spawn new — but space them out, never two obstacles back-to-back
  if (Math.random() < dt * 1.6) {
    const r = Math.random();
    const x = 11 + Math.random()*3;
    const lastObs = Race.obstacles[Race.obstacles.length-1];
    const tooClose = lastObs && (x - lastObs.position.x) < 2.5;
    if (r < 0.5) spawnRaceItem('coin', x);
    else if (r < 0.6) spawnRaceItem('gem', x);
    else if (r < 0.82) { tooClose ? spawnRaceItem('coin', x) : spawnRaceItem('obstacle-low', x); }
    else { tooClose ? spawnRaceItem('coin', x) : spawnRaceItem('obstacle-high', x); }
  }

  const ti = document.getElementById('race-time'); if (ti) ti.textContent = remain.toFixed(1) + 's';
  const sc = document.getElementById('race-score'); if (sc) sc.textContent = State.points.toLocaleString() + 'P';
  const sp = document.getElementById('race-speed'); if (sp) sp.textContent = (Race.speed*9.8|0);

  if (Race.elapsed >= Race.duration) {
    Race.active = false;
    if (Race._cleanup) Race._cleanup();
    if (Race._finalMode) {
      Race._finalMode = false;
      setTimeout(goResult, 700);
    } else {
      setTimeout(goAccident, 700);
    }
  }
}

function shakeCamera(ms=400) {
  const t0 = performance.now();
  const orig = camera.position.clone();
  function tick(now){
    const t = (now-t0)/ms;
    if (t>=1) { camera.position.copy(orig); return; }
    const k = (1-t) * 0.18;
    camera.position.x = orig.x + (Math.random()-.5)*k;
    camera.position.y = orig.y + (Math.random()-.5)*k;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// 9h. Accident → Repair choice
async function goAccident() {
  await fadeTransition(async () => {
    setActiveScene('stage');
    // Place car in stage — looking damaged
    if (stageCar) stageGroup.remove(stageCar);
    stageCar = buildCar(State.carType, State.level);
    stageCar.position.set(0, -.3, 0);
    stageCar.rotation.y = Math.PI/8; // tilted from accident
    setCarMood(stageCar, 'sad');
    stageGroup.add(stageCar);
    await moveCam(new THREE.Vector3(0, 1.6, 5.5), new THREE.Vector3(0, 0, 0), 500);
  });
  Audio.startBGM('mystic');
  Audio.sfx.crash();
  flashScreen('rgba(255,80,80,.6)', 600);
  shakeCamera(500);

  showToast(`🚨 ${State.babyName}이(가) 사고를 당했어요`);
  await wait(1300);

  ui.innerHTML = `
    ${renderHUD({step:6, total:7})}
    <div class="scene-card card fade-in">
      <h2>🔧 어떻게 수리할까요?</h2>
      <p>당신의 선택이 금융 성향을 보여줘요. 선택 후 직접 수리 미니게임도 즐겨보세요.</p>
      <div class="choices">
        <div class="choice" data-id="diy"><div class="em">🛠️</div><div class="name">직접 수리</div><div class="desc">스패너로 직접! · 실속형</div></div>
        <div class="choice" data-id="shop"><div class="em">🏪</div><div class="name">정비소</div><div class="desc">완벽 복원 · 균형형</div></div>
        <div class="choice" data-id="premium"><div class="em">💎</div><div class="name">프리미엄</div><div class="desc">신차+코팅 · 고급형</div></div>
        <div class="choice" data-id="insurance"><div class="em">📋</div><div class="name">보험 처리</div><div class="desc">장기 안심 · 안전형</div></div>
      </div>
    </div>
  `;
  ui.querySelectorAll('.choice').forEach(c => {
    c.onmouseenter = () => Audio.sfx.hover();
    c.onclick = () => {
      Audio.sfx.click();
      const id = c.dataset.id;
      State.repair = id;
      if (id==='diy')       { State.traits.economy += 15; }
      if (id==='shop')      { State.traits.economy += 4; State.traits.safety += 4; }
      if (id==='premium')   { State.traits.premium += 25; State.traits.safety += 4; }
      if (id==='insurance') { State.traits.safety += 20; State.traits.economy += 3; }
      finishRepair(id);
    };
  });
}

// Cosmetic repair finish — sparkle, restore mood, advance
async function finishRepair(id) {
  // Quick fix sound + sparkle on the car
  Audio.sfx.fix();
  await wait(180);
  Audio.sfx.success();
  setCarMood(stageCar, 'happy');
  spawnBurst(stageCar.position.clone().add(new THREE.Vector3(0,.4,0)), 0xfff599, 100, 1.8, 1.3);

  // Pick toast message based on choice
  const msg = {
    diy:       '🛠️ 직접 수리 완료!',
    shop:      '🏪 정비소 수리 완료!',
    premium:   '💎 프리미엄 복원 완료!',
    insurance: '📋 보험 처리 완료! 안심돼요',
  }[id] || '✨ 수리 완료!';
  State.points += 500;
  showToast(msg);

  // Tilt car back to normal
  if (stageCar) tween(stageCar.rotation, 'y', 0, 600);

  await wait(1100);
  goFinanceChoice();
}

// 9i. Finance choice
async function goFinanceChoice() {
  // Grow to lv 4 (mature) — repair handled, almost adult
  State.level = 4;
  stageCar = replaceCar(stageGroup, stageCar, State.carType, State.level);
  Audio.sfx.levelUp();
  await wait(800);

  ui.innerHTML = `
    ${renderHUD({step:7, total:7})}
    <div class="scene-card card fade-in">
      <h2>💳 어떻게 차를 가지고 싶으세요?</h2>
      <p>당신의 금융 선호는 추천에 큰 영향을 줍니다.</p>
      <div class="choices">
        <div class="choice" data-id="lump"><div class="em">💰</div><div class="name">일시불</div><div class="desc">한 번에 결제 · 자산형</div></div>
        <div class="choice" data-id="install"><div class="em">📅</div><div class="name">할부</div><div class="desc">매달 나눠 · 균형형</div></div>
        <div class="choice" data-id="lease"><div class="em">🏦</div><div class="name">리스</div><div class="desc">유연한 운용 · 효율형</div></div>
        <div class="choice" data-id="rent"><div class="em">🔄</div><div class="name">장기 렌트</div><div class="desc">관리 부담 ↓ · 자유형</div></div>
      </div>
    </div>
  `;
  ui.querySelectorAll('.choice').forEach(c => {
    c.onmouseenter = () => Audio.sfx.hover();
    c.onclick = () => {
      Audio.sfx.click();
      State.finance = c.dataset.id;
      if (c.dataset.id==='lump')    { State.traits.premium += 12; State.traits.economy -= 4; }
      if (c.dataset.id==='install') { State.traits.economy += 8; }
      if (c.dataset.id==='lease')   { State.traits.economy += 5; State.traits.activity += 3; }
      if (c.dataset.id==='rent')    { State.traits.activity += 6; State.traits.adventure += 4; }
      goUpgradeMemo();
    };
  });
}

// 9j. Memory card upgrade game
async function goUpgradeMemo() {
  // Build 8 cards (4 pairs) from icons
  const icons = ['⚡','🛡️','🎵','✨','🚀','💎','🏆','🔥'];
  const pickPairs = icons.sort(()=>Math.random()-.5).slice(0,4);
  const deck = [...pickPairs, ...pickPairs].sort(()=>Math.random()-.5);

  ui.innerHTML = `
    <div class="scene-card card fade-in" style="bottom:auto; top:8%;">
      <h2>🎴 카드 매칭으로 업그레이드!</h2>
      <p>같은 그림 4쌍을 모두 맞추면 ${State.babyName}이(가) 더 멋진 모습으로!</p>
    </div>
    <div class="memo-board" id="memoBoard">
      ${deck.map((d,i)=>`<div class="memo-card" data-i="${i}" data-v="${d}"><span>${d}</span></div>`).join('')}
    </div>
  `;

  const cards = [...ui.querySelectorAll('.memo-card')];
  let firstCard = null, lock = false, matched = 0;

  cards.forEach(c => {
    c.onclick = () => {
      if (lock) return;
      if (c.classList.contains('flip') || c.classList.contains('matched')) return;
      Audio.sfx.click();
      c.classList.add('flip');
      if (!firstCard) { firstCard = c; return; }
      if (c.dataset.v === firstCard.dataset.v) {
        c.classList.add('matched'); firstCard.classList.add('matched');
        firstCard = null; matched++;
        Audio.sfx.success();
        if (matched === 4) finish();
      } else {
        lock = true;
        Audio.sfx.error();
        setTimeout(()=> {
          c.classList.remove('flip'); firstCard.classList.remove('flip');
          firstCard = null; lock = false;
        }, 700);
      }
    };
  });

  async function finish() {
    State.points += 1500;
    State.traits.premium += 8;
    showToast('✨ 업그레이드 성공!');
    await wait(900);
    // Visible upgrade: special burst around car
    spawnBurst(new THREE.Vector3(0,.2,0), 0xa18cff, 200, 3.0, 1.4);
    Audio.sfx.fanfare();
    await wait(800);
    goFinalRace();
  }
}

// 9k. Final race (faster, stronger version)
async function goFinalRace() {
  Race.duration = 28;
  Race.speed = 12;
  await goRaceRunFinal();
}
async function goRaceRunFinal() {
  Audio.stopBGM();
  await fadeTransition(async () => {
    setActiveScene('race');
    if (Race.car) raceGroup.remove(Race.car);
    State.level = 5;
    const c = buildCar(State.carType, 5);
    c.scale.setScalar(0.55);
    c.position.set(-4, -.7, 0);
    c.rotation.y = Math.PI/2;
    raceGroup.add(c);
    Race.car = c;
    await moveCam(new THREE.Vector3(0, 1.0, 11), new THREE.Vector3(0, 0.0, 0), 500);
  });
  Audio.startBGM('race');

  Race.elapsed = 0;
  Race.speed = 12;
  Race.carX = -4; Race.carY = 0; Race.carVy = 0;
  Race.isJump = false; Race.isSlide = false;
  Race.coinsCt = 0; Race.gemsCt = 0; Race.hits = 0;
  Race.obstacles.forEach(o => raceGroup.remove(o)); Race.obstacles = [];
  Race.coins.forEach(o => raceGroup.remove(o)); Race.coins = [];
  Race.gems.forEach(o => raceGroup.remove(o)); Race.gems = [];

  spawnRaceItem('coin', 4);
  spawnRaceItem('coin', 6);
  for (let x=10; x<80; x+=2.2 + Math.random()*1.4) {
    const r = Math.random();
    if (r < 0.4) spawnRaceItem('coin', x);
    else if (r < 0.55) spawnRaceItem('gem', x);
    else if (r < 0.82) spawnRaceItem('obstacle-low', x);
    else spawnRaceItem('obstacle-high', x);
  }

  ui.innerHTML = `
    <div class="race-hud">
      <div class="card race-stat"><div class="hud-label">🏁 FINAL</div><div class="hud-val" id="race-time">${Race.duration}s</div></div>
      <div class="card race-stat"><div class="hud-label">SCORE</div><div class="hud-val" id="race-score">0P</div></div>
      <div class="card race-stat"><div class="hud-label">${State.babyName}</div><div class="hud-val">LV.5</div></div>
    </div>
    <div class="speedo"><div class="v" id="race-speed">0</div><div class="u">KM/H</div></div>
    <div class="touch-actions">
      <div class="tbtn" id="btnSlide">⬇</div>
      <div class="tbtn" id="btnJump">⬆</div>
    </div>
    <div class="controls-hint">🏁 파이널 레이스! ⬆ 점프 / ⬇ 슬라이드</div>
    <div class="center" id="raceCount" style="font-family:'Black Han Sans'; font-size: clamp(70px, 18vh, 160px);
        background: linear-gradient(135deg,#ffd86b,#ff7eb3 50%,#7afcff);
        -webkit-background-clip:text; background-clip:text; color:transparent; pointer-events:none; z-index:30;"></div>
  `;
  Race._finalMode = true;
  Race.active = false;
  bindRaceControls();
  await runCountdown();
  Race.active = true;
}

// ============================================================
// 10. Result
// ============================================================
function computeCBTI() {
  const t = State.traits;
  // Axis 1: Activity — A(ctive) / R(outine)
  const A = (t.activity + t.adventure)/2;
  // Axis 2: Spend  — P(remium) / E(conomy)
  const P = t.premium - t.economy + 50;
  // Axis 3: Safety — S(afe) / T(hrill)
  const S = t.safety - (t.adventure*0.4) + 25;
  // Axis 4: Finance — I(nvest=lump/install) / F(lex=lease/rent)
  const Fmap = { lump:80, install:65, lease:30, rent:15 };
  const F = Fmap[State.finance] ?? 50;

  const code = (A>=50?'A':'R') + (P>=50?'P':'E') + (S>=50?'S':'T') + (F>=50?'I':'F');
  State.axes = { A, P, S, F, code };

  // Fuel preference analysis
  const fp = State.fuelPref;
  const evCount  = (fp.ev_slow||0) + (fp.ev_fast||0);
  const gasCount = (fp.gasoline||0) + (fp.premium||0);
  const isEV = evCount > gasCount;
  const isFastCharge = (fp.ev_fast||0) > (fp.ev_slow||0);
  const isPremiumFuel = (fp.premium||0) >= Math.max(1, gasCount*0.5);

  let fuelTag, fuelInsight;
  if (isEV && isFastCharge) {
    fuelTag = '⚡ 급속 EV 선호';
    fuelInsight = '시간을 아끼는 효율형 EV 사용자';
  } else if (isEV) {
    fuelTag = '🔌 완속 EV 선호';
    fuelInsight = '집·직장에서 차분히 충전하는 친환경 사용자';
  } else if (isPremiumFuel) {
    fuelTag = '💎 프리미엄 연료';
    fuelInsight = '엔진 성능과 연료 품질을 중시하는 운전자';
  } else {
    fuelTag = '⛽ 휘발유 선호';
    fuelInsight = '익숙하고 검증된 내연기관 운전자';
  }

  // Pick recommended car based on fuel pref
  let recCar;
  if (isEV && isFastCharge) {
    recCar = {
      family:  { name:'기아 EV9',     meta:'대형 전기 SUV · 7인승 · 350kW 급속충전' },
      sport:   { name:'포르쉐 타이칸', meta:'전기 스포츠카 · 800V 급속 · 즉각 가속' },
      compact: { name:'현대 코나 EV',  meta:'소형 전기 SUV · 350km 주행 · 도심 최적' }
    }[State.carType];
  } else if (isEV) {
    recCar = {
      family:  { name:'기아 EV6',      meta:'중형 전기 SUV · 패밀리 · 친환경' },
      sport:   { name:'테슬라 모델 3', meta:'전기 세단 · 다이나믹 · 자율주행' },
      compact: { name:'현대 캐스퍼 EV',meta:'경형 전기 SUV · 도심 통근 · 경제' }
    }[State.carType];
  } else if (isPremiumFuel) {
    recCar = {
      family:  { name:'제네시스 GV80', meta:'프리미엄 SUV · 정숙 · 안전 최상' },
      sport:   { name:'BMW M4',        meta:'고성능 쿠페 · 럭셔리 · 스피드' },
      compact: { name:'미니 쿠퍼 S',   meta:'프리미엄 컴팩트 · 디자인 · 개성' }
    }[State.carType];
  } else {
    recCar = TYPES[State.carType].finalCar;
  }

  // Type label combining
  const types = {
    family: { 'AP':'Family Premium Voyager','AE':'Family Smart Cruiser','RP':'Cozy Premium Keeper','RE':'Family Practical Pro' },
    sport:  { 'AP':'Apex Predator','AE':'Smart Sprinter','RP':'Refined Stylist','RE':'Track Tactician' },
    compact:{ 'AP':'Refined Minimalist','AE':'City Sprinter','RP':'Cozy City Owner','RE':'Practical Compact Pro' }
  };
  const sub = code.slice(0,2);
  const name = (types[State.carType] && types[State.carType][sub]) || 'Cruiser';

  const planText = {
    lump: '일시불 결제 · 한 번에 OWNERSHIP',
    install: '60개월 할부 · 월 안정 납입',
    lease: '오픈 리스 · 4년 운용 + 유연한 교체',
    rent: '장기 렌트 · 보험·세금·정비 포함'
  }[State.finance] || '맞춤 금융';

  State.cbti = {
    code,
    name,
    desc: `${TYPES[State.carType].label} 성향 · ${fuelTag}`,
    car: recCar.name,
    meta: recCar.meta,
    plan: planText,
    fuelTag,
    fuelInsight
  };
}

async function goResult() {
  computeCBTI();
  Audio.stopBGM();
  await fadeTransition(async () => {
    setActiveScene('result');
    if (resultCar) resultGroup.remove(resultCar);
    resultCar = buildCar(State.carType, 5);
    resultCar.position.set(0, -.6, 0);
    resultCar.scale.setScalar(0.05);
    resultGroup.add(resultCar);
    tween(resultCar.scale, 'x', 1.2, 1100, easeOutBack);
    tween(resultCar.scale, 'y', 1.2, 1100, easeOutBack);
    tween(resultCar.scale, 'z', 1.2, 1100, easeOutBack);
    await moveCam(new THREE.Vector3(0, 1.6, 7), new THREE.Vector3(0, 0, 0), 400);
  });
  Audio.startBGM('result');
  Audio.sfx.fanfare();

  for (let i=0;i<8;i++) {
    setTimeout(()=> spawnBurst(new THREE.Vector3((Math.random()-.5)*5, 2+Math.random()*2, 0),
      [0xff7eb3,0xffd86b,0x7afcff,0xa18cff][i%4], 80, 3, 2), i*150);
  }

  renderResultUI();
}

function renderResultUI() {
  const t = State.traits;
  const cb = State.cbti;
  ui.innerHTML = `
    <div class="result-wrap">
      <div class="card result fade-in">
        <div class="cbti-badge">YOUR CBTI</div>
        <div class="cbti-code">${cb.code}</div>
        <div class="cbti-name">${cb.name}</div>
        <div class="cbti-tag">${cb.desc}</div>

        <div class="radar-row">
          <canvas id="radar" width="380" height="300" style="width:100%; max-width:380px; aspect-ratio:380/300;"></canvas>
          <div class="traits">
            ${[
              ['adventure','모험심'],
              ['safety','안전의식'],
              ['economy','실속'],
              ['activity','활동성'],
              ['premium','고급지향'],
            ].map(([k,label]) => {
              const v = Math.max(0, Math.min(100, t[k]));
              return `<div class="trait">
                <div class="row"><span>${label}</span><span>${v|0}%</span></div>
                <div class="bar"><div style="width:0%" data-v="${v}"></div></div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="car-rec">
          <div class="car-card">
            <div class="hud-label">RECOMMENDED CAR</div>
            <div class="name">🚗 ${cb.car}</div>
            <div class="meta">${cb.meta}</div>
          </div>
          <div class="car-card">
            <div class="hud-label">FINANCING & FUEL</div>
            <div class="name">💳 ${cb.plan}</div>
            <div class="meta">${cb.fuelTag} — ${cb.fuelInsight}<br/>${State.points.toLocaleString()}P 적립 · 시승 우선권 · 첫해 보험료 50% 할인</div>
          </div>
        </div>

        <div class="actions">
          <button class="btn" id="restart">🔄 다시 플레이</button>
          <button class="btn ghost" id="share">🔗 결과 공유</button>
        </div>
      </div>
    </div>
  `;

  setTimeout(()=> {
    ui.querySelectorAll('.bar > div').forEach(b => { b.style.width = `${b.dataset.v}%`; });
  }, 80);

  drawRadar(document.getElementById('radar'), [
    ['모험심', t.adventure],
    ['안전', t.safety],
    ['실속', t.economy],
    ['활동성', t.activity],
    ['고급', t.premium],
  ]);

  document.getElementById('restart').onclick = () => location.reload();
  document.getElementById('share').onclick = () => {
    const text = `나의 CBTI ${State.cbti.code} [${State.cbti.name}]\n추천차: ${State.cbti.car}\n금융: ${State.cbti.plan}\n적립: ${State.points.toLocaleString()}P`;
    if (navigator.share) navigator.share({ title:'My CBTI', text }).catch(()=>{});
    else { navigator.clipboard?.writeText(text); showToast('결과가 복사됐어요!'); }
  };
}

function drawRadar(canvas, items) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2 + 6;
  const R = Math.min(W,H)*0.4;
  const N = items.length;

  let frame = 0;
  function paint() {
    const k = Math.min(1, frame/40);
    g.clearRect(0,0,W,H);

    for (let r=1;r<=4;r++) {
      g.beginPath();
      for (let i=0;i<N;i++) {
        const a = -Math.PI/2 + i/N*Math.PI*2;
        const x = cx + Math.cos(a)*R*(r/4);
        const y = cy + Math.sin(a)*R*(r/4);
        if (i===0) g.moveTo(x,y); else g.lineTo(x,y);
      }
      g.closePath();
      g.strokeStyle = `rgba(255,255,255,${.08 + r*0.04})`;
      g.stroke();
    }
    for (let i=0;i<N;i++) {
      const a = -Math.PI/2 + i/N*Math.PI*2;
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a)*R, cy + Math.sin(a)*R);
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.stroke();
    }
    g.beginPath();
    for (let i=0;i<N;i++) {
      const a = -Math.PI/2 + i/N*Math.PI*2;
      const v = Math.min(1, items[i][1]/100) * k;
      const x = cx + Math.cos(a)*R*v;
      const y = cy + Math.sin(a)*R*v;
      if (i===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.closePath();
    const grad = g.createLinearGradient(0,0,W,H);
    grad.addColorStop(0,'rgba(255,126,179,.55)');
    grad.addColorStop(1,'rgba(122,252,255,.55)');
    g.fillStyle = grad; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    for (let i=0;i<N;i++) {
      const a = -Math.PI/2 + i/N*Math.PI*2;
      const v = Math.min(1, items[i][1]/100) * k;
      const x = cx + Math.cos(a)*R*v;
      const y = cy + Math.sin(a)*R*v;
      g.beginPath(); g.arc(x,y,4,0,Math.PI*2); g.fillStyle='#ffd86b'; g.fill();
    }
    g.fillStyle='#cfe6ff'; g.font='600 13px Jua, sans-serif'; g.textAlign='center';
    for (let i=0;i<N;i++) {
      const a = -Math.PI/2 + i/N*Math.PI*2;
      const x = cx + Math.cos(a)*(R+18);
      const y = cy + Math.sin(a)*(R+18) + 4;
      g.fillText(items[i][0], x, y);
    }

    if (frame < 50) { frame++; requestAnimationFrame(paint); }
  }
  paint();
}

// ============================================================
// 11. Main loop
// ============================================================
let last = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(.05, (now - last)/1000);
  last = now;
  const t = now/1000;

  for (const fn of updaters) fn(t, dt);

  // Bursts
  for (let i=bursts.length-1;i>=0;i--) {
    const b = bursts[i];
    b.age += dt;
    const pos = b.pts.geometry.attributes.position;
    const N = pos.count;
    for (let k=0;k<N;k++) {
      pos.array[k*3]   += b.vel[k*3]*dt;
      pos.array[k*3+1] += b.vel[k*3+1]*dt - 0.6*dt*b.age;
      pos.array[k*3+2] += b.vel[k*3+2]*dt;
    }
    pos.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, 1 - b.age/b.life);
    if (b.age >= b.life) {
      scene.remove(b.pts);
      b.pts.geometry.dispose(); b.pts.material.dispose();
      bursts.splice(i,1);
    }
  }

  // Rotate result car
  if (resultGroup.visible && resultCar) resultCar.rotation.y += dt * 0.4;

  tickRace(dt);

  composer.render();
  requestAnimationFrame(loop);
}

// ============================================================
// 12. Pointer raycast (select car click)
// ============================================================
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();

addEventListener('pointermove', e => {
  mouse.x = (e.clientX/innerWidth)*2 - 1;
  mouse.y = -(e.clientY/innerHeight)*2 + 1;
  if (selectGroup.visible) {
    ray.setFromCamera(mouse, camera);
    selectGroup.userData.cars.forEach(c => c.userData.hovered = false);
    const hits = ray.intersectObjects(selectGroup.userData.cars, true);
    if (hits.length) {
      let p = hits[0].object;
      while (p && !p.userData.tp) p = p.parent;
      if (p) p.userData.hovered = true;
    }
  }
});
addEventListener('pointerdown', e => {
  if (selectGroup.visible) {
    mouse.x = (e.clientX/innerWidth)*2 - 1;
    mouse.y = -(e.clientY/innerHeight)*2 + 1;
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(selectGroup.userData.cars, true);
    if (hits.length) {
      let p = hits[0].object;
      while (p && !p.userData.tp) p = p.parent;
      if (p) selectType(p.userData.tp);
    }
  }
});

// ============================================================
// 13. Mute button
// ============================================================
document.getElementById('mute').onclick = () => {
  Audio.init();
  const m = !Audio.isMuted();
  Audio.setMuted(m);
  document.getElementById('mute').textContent = m ? '🔇' : '🔊';
};

// ============================================================
// 14. Boot
// ============================================================
loop();

// Debug shortcuts via URL hash (#race, #result, #select, #stage, #destination)
const hash = location.hash.replace('#','');
if (hash === 'race') {
  State.carType = 'sport';
  State.babyName = '터보';
  State.level = 3;
  Race.duration = 26;
  goRaceRun();
} else if (hash === 'destination') {
  State.carType = 'family';
  State.babyName = '해피';
  State.level = 2;
  goDestinationChoice();
} else if (hash === 'friend') {
  State.carType = 'family';
  State.babyName = '해피';
  State.level = 2;
  setActiveScene('stage');
  stageCar = buildCar(State.carType, 2);
  stageCar.position.set(0, -.3, 0);
  stageGroup.add(stageCar);
  moveCam(new THREE.Vector3(0, 2.0, 7.5), new THREE.Vector3(0, 0.3, 0), 400)
    .then(() => goFriendVisit());
} else if (hash === 'result') {
  State.carType = 'family';
  State.babyName = '부릉이';
  State.level = 5;
  State.points = 8500;
  State.fuelPref = { ev_slow:1, ev_fast:3, gasoline:0, premium:1 };
  State.finance = 'install';
  goResult();
} else if (hash === 'select') {
  goSelect();
} else if (hash === 'stage') {
  State.carType = 'family';
  State.babyName = '해피';
  goStage1();
} else {
  goBanner();
}

// Catch ANY uncaught errors and show them on screen
window.addEventListener('error', e => {
  console.error('[CBTI] uncaught:', e.error || e.message);
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed; left:8px; bottom:8px; z-index:999; padding:8px 12px; background:rgba(180,0,0,0.85); color:#fff; font-size:12px; border-radius:8px; max-width:80vw; font-family:monospace;';
  div.textContent = `⚠️ ${e.message}`;
  document.body.appendChild(div);
  setTimeout(()=> div.remove(), 8000);
});
window.addEventListener('unhandledrejection', e => {
  console.error('[CBTI] unhandled rejection:', e.reason);
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed; left:8px; bottom:8px; z-index:999; padding:8px 12px; background:rgba(180,0,0,0.85); color:#fff; font-size:12px; border-radius:8px; max-width:80vw; font-family:monospace;';
  div.textContent = `⚠️ Promise: ${e.reason && e.reason.message || e.reason}`;
  document.body.appendChild(div);
  setTimeout(()=> div.remove(), 8000);
});
