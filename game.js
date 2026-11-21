'use strict';

const game = document.querySelector('#game');
const canvas = document.querySelector('#road');
const ink = canvas.getContext('2d');
const play = document.querySelector('#play');
const menu = document.querySelector('.menu');
const hint = document.querySelector('#hint');
const distance = document.querySelector('#distance');
const bestOutput = document.querySelector('#best');
const mute = document.querySelector('#mute');
const soundIcon = document.querySelector('#sound-icon');

const ANGLE = Math.PI / 12;
const CAR_SCALE = 1.25;
const CAMERA_ZOOM = 1.4;
const BODY_HALF_LENGTH = 27;
const HALF_LENGTH = BODY_HALF_LENGTH * CAR_SCALE;
const OUTER_GAP = 27;
const WHEEL_RADIUS = 5.5 * CAR_SCALE;
const WHEEL_OFFSETS = [-16 * CAR_SCALE, 16 * CAR_SCALE];
const TURN = 2 * Math.PI;
const STEP = 1 / 120;
const METERS_PER_UNIT = 0.12;
const SCORE_STEP_METERS = 5;
const SCORE_ROLL_DURATION = 0.15;
const MILESTONE_METERS = 20;
const MILESTONE_INTERVAL = MILESTONE_METERS / METERS_PER_UNIT;
const STAMP_DURATION = 0.56;
const IMPACT_DURATION = 0.42;
// Profiles run from the rear lamp corner to the front bumper.
const carProfiles = {
  compact: [[-27, -8], [-20, -10], [-11, -18], [7, -18], [16, -10], [24, -8], [27, -4]],
  fastback: [[-27, -6], [-21, -9], [-13, -14], [-5, -17], [6, -17], [15, -11], [24, -9], [27, -4]],
  sedan: [[-27, -8], [-23, -10], [-15, -10], [-8, -17], [8, -17], [15, -10], [24, -10], [27, -5]],
  wagon: [[-27, -12], [-23, -19], [5, -19], [14, -11], [24, -10], [27, -5]],
  suv: [[-27, -15], [-23, -22], [4, -22], [12, -14], [24, -13], [27, -8]],
  pickup: [[-27, -10], [-22, -11], [-9, -11], [-9, -21], [4, -21], [12, -12], [24, -12], [27, -7]],
  van: [[-27, -17], [-23, -22], [9, -22], [18, -17], [25, -12], [27, -7]],
};

const settings = Object.freeze({
  frontGap: 35,
  rearGap: 40,
  baseSpeed: 140,
  releaseAcceleration: 140,
  braking: 160,
  minimumSpeed: 35,
  bumpHeight: 0,
  bumpFrequency: 1,
  suspension: 1,
  aggression: 34,
  progression: 1,
});
const palette = {
  background: '#000000', score: '#ffffff',
  nearMountain: '#17171b', farMountain: '#2b2b30',
  road: '#727272', stone: '#444444', brightStone: '#5c5c5c',
  milestonePost: '#707070', milestoneText: '#939393',
  check: '#a0a0a0', stamp: '#d8d8d8',
  outerCar: '#777777', traffic: [145, 145, 145], danger: [255, 73, 73],
  warning: '#ff4949', brakeLight: '#ff4e4e',
};
const pointers = new Set();

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Keep the session usable. */ }
}

let state = 'ready';
let best = Math.max(0, Number(readStorage('brake.best')) || 0);
let muted = readStorage('brake.muted') === 'true';
let spaceHeld = false;
let audio;
let run;
let runs = 0;
let impactTime = 0;
let lastFrame = null;
let idleTime = 0;
let windowActive = true;
let accumulator = 0;
let width = 0;
let height = 0;
let pixelRatio = 1;
let scale = 1;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function approach(value, target, delta) {
  return value + clamp(target - value, -delta, delta);
}

// The terrain is defined in downhill coordinates. Position never wraps.
function roadHeight(position) {
  if (settings.bumpHeight === 0) return 0;
  const x = position * settings.bumpFrequency;
  return settings.bumpHeight * (
    0.60 * Math.sin(x / 19)
    + 0.25 * Math.sin(x / 11 + 0.8)
    + 0.15 * Math.sin(x / 39 - 1.4)
  );
}

function roadSlope(position) {
  return (roadHeight(position + 0.5) - roadHeight(position - 0.5));
}

function createCar(position, profile) {
  const rearHeight = roadHeight(position + WHEEL_OFFSETS[0]);
  const frontHeight = roadHeight(position + WHEEL_OFFSETS[1]);
  return {
    position,
    profile,
    speed: settings.baseSpeed,
    bodyHeight: (rearHeight + frontHeight) / 2,
    bodyVelocity: 0,
    brakeLight: 0,
  };
}

function shuffleProfiles() {
  const profiles = Object.values(carProfiles);
  for (let index = profiles.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [profiles[index], profiles[swap]] = [profiles[swap], profiles[index]];
  }
  return profiles;
}

function freshRun() {
  const profiles = shuffleProfiles();
  return {
    lead: createCar(settings.frontGap + 4 * HALF_LENGTH + OUTER_GAP, profiles[0]),
    front: createCar(settings.frontGap + 2 * HALF_LENGTH, profiles[1]),
    player: createCar(0, profiles[2]),
    rear: createCar(-settings.rearGap - 2 * HALF_LENGTH, profiles[3]),
    tail: createCar(-settings.rearGap - 4 * HALF_LENGTH - OUTER_GAP, profiles[4]),
    time: 0,
    trafficPhase: 0,
    releaseTime: 1,
    hasBraked: false,
    braking: false,
    impact: null,
    brakePitch: 0,
    nearMiss: {
      front: { armed: false, glow: 0 },
      rear: { armed: false, glow: 0 },
    },
    lastNearMiss: -Infinity,
    milestoneStamp: null,
    scoreRoll: { current: 0, previous: 0, startedAt: 0 },
  };
}

function score() {
  return Math.floor(run.player.position * METERS_PER_UNIT);
}

function updateScore() {
  const current = `${score()} m`;
  const record = `${best} m`;
  if (distance.textContent !== current) distance.textContent = current;
  if (bestOutput.textContent !== record) bestOutput.textContent = record;
}

function setState(next) {
  state = next;
  game.dataset.state = next;
  menu.hidden = next === 'running' || next === 'impact';
  mute.hidden = menu.hidden;
  hint.hidden = next !== 'running' || runs !== 1;
}

function primeAudio() {
  if (muted) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ||= new Audio();
    if (audio.state !== 'running') audio.resume().catch(() => {});
  } catch { /* Audio is optional. */ }
}

const sounds = {
  brake: { length: 0.13, type: 'sine', from: 240, to: 125, volume: 0.054 },
  impact: { length: 0.21, type: 'triangle', from: 112, to: 44, volume: 0.13 },
  escape: { length: 0.065, type: 'sine', from: 690, to: 510, volume: 0.032 },
};

function sound(event) {
  if (muted || audio?.state !== 'running') return;
  const now = audio.currentTime;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  const { length, type, from, to, volume } = sounds[event];
  tone.type = type;
  tone.frequency.setValueAtTime(from, now);
  tone.frequency.exponentialRampToValueAtTime(to, now + length);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + length);
  tone.connect(gain).connect(audio.destination);
  tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  tone.start(now);
  tone.stop(now + length);
}

function clearInput() {
  pointers.clear();
  spaceHeld = false;
  run.braking = false;
}

function start() {
  primeAudio();
  if (state !== 'ready') run = freshRun();
  runs++;
  accumulator = 0;
  lastFrame = null;
  clearInput();
  updateScore();
  setState('running');
}

function gaps() {
  return {
    front: run.front.position - run.player.position - 2 * HALF_LENGTH,
    rear: run.player.position - run.rear.position - 2 * HALF_LENGTH,
  };
}

function trafficPulse(phase) {
  return Math.max(0, Math.sin(phase)) ** 2;
}

function updateBrakeLight(car, previousSpeed, dt) {
  const deceleration = (previousSpeed - car.speed) / dt;
  const target = clamp((deceleration - 5) / 22, 0, 1);
  car.brakeLight = approach(car.brakeLight, target, (target > car.brakeLight ? 16 : 5) * dt);
}

function updateTraffic(dt) {
  const { lead, front, player, rear, tail, time } = run;
  const difficulty = 1 - Math.exp(-Math.max(0, score() - 22) * settings.progression / 155);
  const intro = clamp((time - 1.15) / 3.4, 0, 1);
  const pressure = settings.aggression * intro * (0.82 + 0.30 * difficulty);
  run.trafficPhase += (1.55 + 0.52 * difficulty) * dt;

  const frontPhase = run.trafficPhase - 0.75;
  const rearPhase = run.trafficPhase - 3.1;
  // Alternate stronger paired waves with quieter, independent traffic.
  const pairStrength = (0.5 + 0.5 * Math.cos(run.trafficPhase / 2 - 0.7)) ** 2;
  const formation = pairStrength * clamp(pressure / 34, 0, 1);
  const frontPulse = trafficPulse(frontPhase) * (0.95 + 0.12 * pairStrength);
  const rearPulse = trafficPulse(rearPhase) * (0.95 + 0.12 * pairStrength);
  const pace = pressure * 0.21 * Math.sin(run.trafficPhase * 0.43);
  const openSpace = front.position - rear.position - 4 * HALF_LENGTH;
  const preferredSpace = settings.frontGap + settings.rearGap - 16 * difficulty;
  const correction = clamp((preferredSpace - openSpace) * 0.19, 0, 8);

  let frontTarget = settings.baseSpeed + pace - pressure * frontPulse + correction;
  let rearTarget = settings.baseSpeed + pace + pressure * rearPulse - correction;

  // Cap the rate at which the traffic can squeeze the player. The cap
  // leaves room for the AI to ease out of a squeeze at its own acceleration.
  const minimumSpace = 42;
  const trafficAcceleration = 34 + 9 * difficulty;
  const room = Math.max(0, openSpace - minimumSpace);
  const closingLimit = Math.min(room * 1.15, Math.sqrt(2 * trafficAcceleration * room));
  const excessClosing = Math.max(0, rearTarget - frontTarget - closingLimit) / 2;
  frontTarget += excessClosing;
  rearTarget -= excessClosing;

  const closingSpeed = Math.max(0, rear.speed - front.speed);
  const brakingRoom = closingSpeed * dt + closingSpeed ** 2 / (4 * trafficAcceleration);
  if (closingSpeed > 0 && room <= brakingRoom) {
    frontTarget = Math.max(frontTarget, front.speed + trafficAcceleration * dt);
    rearTarget = Math.min(rearTarget, rear.speed - trafficAcceleration * dt);
  }
  const frontBefore = front.speed;
  const leadBefore = lead.speed;
  front.speed = approach(front.speed, clamp(frontTarget, 60, 245), trafficAcceleration * dt);
  rear.speed = approach(rear.speed, clamp(rearTarget, 60, 245), trafficAcceleration * dt);

  // The lead car slows first. The tail car closes toward its neighbor before a rear surge.
  const leadGap = OUTER_GAP - 11 * formation * trafficPulse(frontPhase + 1.55);
  const tailGap = OUTER_GAP - 13 * formation * trafficPulse(rearPhase + 1.55);
  followTraffic(lead, front, 1, leadGap);
  followTraffic(tail, rear, -1, tailGap);
  updateBrakeLight(lead, leadBefore, dt);
  updateBrakeLight(front, frontBefore, dt);

  const playerBefore = player.speed;

  const braking = pointers.size > 0 || spaceHeld;
  if (braking && !run.braking) sound('brake');
  run.braking = braking;
  if (braking) {
    run.hasBraked = true;
    run.releaseTime = 0;
    const floor = Math.min(player.speed, settings.minimumSpeed);
    player.speed = approach(player.speed, floor, settings.braking * dt);
  } else {
    // Most of the release boost fades within the first half second.
    const boost = 0.54 + 0.46 * Math.exp(-run.releaseTime / 0.23);
    // A same-speed roll-in gives the player time to read the close gaps.
    const opening = run.hasBraked ? 1 : 0.30 + 0.70 * clamp((time - 0.25) / 1.1, 0, 1);
    player.speed = approach(player.speed, Math.max(255, settings.baseSpeed + 85), settings.releaseAcceleration * boost * opening * dt);
    run.releaseTime += dt;
  }
  const brakeLoad = clamp((playerBefore - player.speed) / (dt * 160), 0, 1);
  run.brakePitch = approach(run.brakePitch, 0.055 * brakeLoad, 0.38 * dt);
}

function collide(side) {
  run.impact = side;
  impactTime = 0;
  clearInput();
  if (score() > best) {
    best = score();
    writeStorage('brake.best', String(best));
  }
  updateScore();
  sound('impact');
  setState('impact');
}

function followTraffic(car, neighbor, side, targetGap) {
  const gap = side * (car.position - neighbor.position) - 2 * HALF_LENGTH;
  car.speed = neighbor.speed + side * (targetGap - gap);
}

function moveCar(car, dt) {
  car.position += car.speed * dt;

  const axleHeight = (roadHeight(car.position + WHEEL_OFFSETS[0])
    + roadHeight(car.position + WHEEL_OFFSETS[1])) / 2;
  // A damped spring lags the axles on fast bumps. Collisions use position only.
  car.bodyVelocity += ((axleHeight - car.bodyHeight) * 175 - car.bodyVelocity * 19) * dt;
  car.bodyHeight += car.bodyVelocity * dt;
}

function simulate(dt) {
  const before = gaps();
  const previousMarker = Math.floor(run.player.position / MILESTONE_INTERVAL);
  run.time += dt;
  updateTraffic(dt);

  const frontClosing = (run.player.speed - run.front.speed) * dt;
  const rearClosing = (run.rear.speed - run.player.speed) * dt;
  const frontContact = frontClosing > 0 ? before.front / frontClosing : Infinity;
  const rearContact = rearClosing > 0 ? before.rear / rearClosing : Infinity;
  const firstContact = Math.min(frontContact, rearContact);
  const travelTime = dt * Math.min(1, firstContact);

  for (const car of [run.lead, run.front, run.player, run.rear, run.tail]) {
    moveCar(car, travelTime);
  }
  const passedMarker = Math.floor(run.player.position / MILESTONE_INTERVAL);
  if (passedMarker > previousMarker) {
    run.milestoneStamp = { marker: passedMarker, age: 0 };
  }
  const displayScore = Math.floor(score() / SCORE_STEP_METERS) * SCORE_STEP_METERS;
  if (displayScore !== run.scoreRoll.current) {
    run.scoreRoll = { current: displayScore, previous: run.scoreRoll.current, startedAt: run.time };
  }
  if (firstContact <= 1) {
    collide(frontContact <= rearContact ? 'front' : 'rear');
  } else {
    updateNearMisses(before, dt);
  }
}

function updateNearMisses(before, dt) {
  const after = gaps();
  for (const side of ['front', 'rear']) {
    const cue = run.nearMiss[side];
    const opening = after[side] - before[side];
    cue.glow = Math.max(0, cue.glow - dt / 0.35);
    if (after[side] <= 12 && opening < 0) cue.armed = true;
    if (cue.armed && after[side] >= 17 && opening > 0) {
      cue.armed = false;
      cue.glow = 1;
      if (run.time - run.lastNearMiss >= 0.6) {
        run.lastNearMiss = run.time;
        sound('escape');
      }
    }
  }
}

function resize() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  scale = clamp(width / 495, 0.45, 1.45) * CAMERA_ZOOM;
}

function drawMilestoneCheck(age) {
  if (age >= 0.12 && age < STAMP_DURATION) {
    const progress = (age - 0.12) / (STAMP_DURATION - 0.12);
    const radius = 4 + 13 * (1 - (1 - progress) ** 2);
    ink.lineWidth = 1.15;
    ink.strokeStyle = palette.stamp;
    ink.globalAlpha = 0.65 * (1 - progress);
    ink.beginPath();
    ink.arc(0.5, -4.5, radius, 0, TURN);
    ink.stroke();
    ink.globalAlpha = 1;
  }

  if (age < 0.18) {
    const stampScale = age < 0.075
      ? 0.65 + 0.55 * age / 0.075
      : 1 + 0.20 * (0.18 - age) / 0.105;
    ink.translate(0.5, -4.5);
    ink.scale(stampScale, stampScale);
    ink.translate(-0.5, 4.5);
  }
  ink.lineWidth = 1.5;
  ink.lineJoin = 'round';
  ink.lineCap = 'round';
  ink.strokeStyle = age < STAMP_DURATION ? palette.stamp : palette.check;
  ink.beginPath();
  ink.moveTo(-4, -4);
  ink.lineTo(-1, -1);
  ink.lineTo(5, -8);
  ink.stroke();
}

function drawRoad(origin) {
  const start = origin - width / scale - 20;
  const end = origin + width / scale + 20;
  ink.lineWidth = 1 / scale;
  ink.strokeStyle = palette.road;
  ink.beginPath();
  ink.moveTo(start - origin, roadHeight(start));
  for (let position = start + 3; position <= end; position += 3) {
    ink.lineTo(position - origin, roadHeight(position));
  }
  ink.stroke();

  // Stones and distance posts stay fixed in world coordinates.
  const spacing = 61;
  for (let cell = Math.floor(start / spacing); cell * spacing < end; cell++) {
    const position = cell * spacing + 12 + 18 * Math.sin(cell * 12.9898);
    const offset = 7 + 9 * Math.abs(Math.sin(cell * 4.23));
    ink.fillStyle = cell % 3 === 0 ? palette.brightStone : palette.stone;
    ink.beginPath();
    ink.ellipse(position - origin, roadHeight(position) + offset,
      cell % 3 === 0 ? 2.2 : 1.2, 0.85, 0, 0, TURN);
    ink.fill();
  }

  const first = Math.max(1, Math.ceil(start / MILESTONE_INTERVAL));
  const stamp = run.milestoneStamp;
  const passedMarker = Math.floor(origin / MILESTONE_INTERVAL);
  for (let marker = first; marker * MILESTONE_INTERVAL <= end; marker++) {
    const position = marker * MILESTONE_INTERVAL;
    ink.save();
    ink.translate(position - origin, roadHeight(position) + 22 / scale);
    ink.rotate(-ANGLE);
    ink.scale(1 / scale, 1 / scale);
    if (marker <= passedMarker) {
      drawMilestoneCheck(stamp?.marker === marker ? stamp.age : Infinity);
    } else {
      ink.lineWidth = 1;
      ink.strokeStyle = palette.milestonePost;
      ink.strokeRect(-1.5, -9.5, 3, 10);
      ink.fillStyle = palette.milestoneText;
      ink.fillRect(-1, -9, 2, 2);
      ink.font = '500 10px "Martian Mono", monospace';
      ink.textAlign = 'center';
      ink.textBaseline = 'top';
      ink.fillText(`${marker * MILESTONE_METERS} m`, 0, 4);
    }
    ink.restore();
  }
}

function drawCar(car, origin, color, light = 0, brakePitch = 0) {
  const wheels = WHEEL_OFFSETS.map(offset => {
    const position = car.position + offset;
    const slope = roadSlope(position);
    const normal = Math.hypot(1, slope);
    return {
      x: offset + WHEEL_RADIUS * slope / normal,
      y: roadHeight(position) - WHEEL_RADIUS / normal,
    };
  });
  const [rear, front] = wheels;
  const axleHeight = (rear.y + front.y) / 2 + WHEEL_RADIUS;
  const bounce = clamp((car.bodyHeight - axleHeight) * settings.suspension, -4, 4);
  const pitch = clamp(Math.atan2(front.y - rear.y, front.x - rear.x), -0.20, 0.20)
    + brakePitch;
  const chassisHeight = axleHeight + bounce;

  ink.save();
  ink.translate(car.position - origin, 0);
  ink.lineJoin = 'round';
  ink.lineCap = 'round';
  ink.lineWidth = 1.5 / scale;
  ink.strokeStyle = color;
  ink.fillStyle = palette.background;

  ink.save();
  ink.translate(0, chassisHeight - 8 * CAR_SCALE);
  ink.rotate(pitch);
  ink.scale(CAR_SCALE, CAR_SCALE);
  ink.lineWidth = 1.5 / (scale * CAR_SCALE);
  ink.beginPath();
  ink.moveTo(-BODY_HALF_LENGTH, 0);
  for (const [x, y] of car.profile) ink.lineTo(x, y);
  ink.lineTo(BODY_HALF_LENGTH, 0);
  ink.closePath();
  ink.fill();
  ink.stroke();
  // The lamp follows the rear corner of the existing body outline.
  if (light > 0) {
    ink.strokeStyle = palette.brakeLight;
    ink.globalAlpha = light;
    ink.lineWidth = 2 / (scale * CAR_SCALE);
    ink.beginPath();
    const [[cornerX, cornerY], [shoulderX, shoulderY]] = car.profile;
    const shoulderSlope = (shoulderY - cornerY) / (shoulderX - cornerX);
    ink.moveTo(cornerX, cornerY + 3.5);
    ink.lineTo(cornerX, cornerY);
    ink.lineTo(cornerX + 3, cornerY + 3 * shoulderSlope);
    ink.stroke();
  }
  ink.restore();

  for (const { x, y } of wheels) {
    ink.beginPath();
    ink.arc(x, y, WHEEL_RADIUS, 0, TURN);
    ink.fill();
    ink.stroke();
  }
  ink.restore();
}

function dangerColor(gap, closing, glow) {
  const threshold = 9 + Math.max(0, closing) * 0.52;
  const danger = Math.max(glow * 0.65, clamp((threshold - gap + 12) / 20, 0, 1));
  const channels = palette.traffic.map((channel, index) =>
    Math.round(channel + (palette.danger[index] - channel) * danger));
  return `rgb(${channels.join(', ')})`;
}

function scoreFontSize() {
  const desktopSize = Math.min(150, width * 0.22, height * 0.16);
  if (width > 560) return desktopSize;
  return Math.max(desktopSize, Math.min(width * 0.29, 118, height * 0.20));
}

function sceneryLift() {
  return Math.min(height * 0.045, 42);
}

function scoreBaseline(fontSize) {
  if (width <= 560) return height * 0.29 + fontSize * 0.10 - sceneryLift();
  return height * mountainRanges[0].heightRatio
    - clamp(height * 0.20, 42, 160) * 0.90 + fontSize * 0.20 - sceneryLift();
}

function ridgePointHeight(point, range) {
  const wave = 0.52 + 0.32 * Math.sin(point * 0.81 + range.phase)
    + 0.16 * Math.sin(point * 1.97 - range.phase);
  const relief = clamp(height * 0.20, 42, 160);
  if (width <= 560) {
    if (range.color === 'farMountain') {
      const fontSize = scoreFontSize();
      // Keep a shallow overlap at the bottom of the fixed score.
      return scoreBaseline(fontSize) - 6 - Math.min(fontSize * 0.30, 32) * wave;
    }
    return height * range.heightRatio - relief * wave - Math.min(height * 0.07, 56) - sceneryLift();
  }
  return height * range.heightRatio - relief * wave - sceneryLift();
}

function drawMountainRange(position, range) {
  const step = clamp(width * range.spacing, 45, 145);
  const shift = position * scale * range.parallax;
  const first = Math.floor(shift / step);
  const last = Math.ceil((shift + width) / step);

  ink.fillStyle = palette[range.color];
  ink.beginPath();
  ink.moveTo(0, height);
  for (let point = first; point <= last; point++) {
    ink.lineTo(point * step - shift, ridgePointHeight(point, range));
  }
  ink.lineTo(width, height);
  ink.closePath();
  ink.fill();
}

const mountainRanges = [
  { color: 'farMountain', parallax: 0.09, spacing: 0.17, heightRatio: 0.49, phase: 1.2 },
  { color: 'nearMountain', parallax: 0.19, spacing: 0.13, heightRatio: 0.59, phase: 3.4 },
];

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function drawRunScore() {
  const rolling = state === 'running' && !reducedMotion?.matches;
  const displayed = state === 'running' ? run.scoreRoll.current : score();
  const digits = String(displayed);
  const previous = String(run.scoreRoll.previous).padStart(digits.length);
  const fontSize = scoreFontSize();
  const center = width / 2;
  const baseline = scoreBaseline(fontSize);
  ink.save();
  ink.textAlign = 'center';
  ink.textBaseline = 'alphabetic';

  ink.font = `500 ${fontSize}px "Martian Mono", monospace`;
  ink.fillStyle = palette.score;
  const digitWidth = fontSize * 0.62;
  const progress = rolling
    ? clamp((run.time - run.scoreRoll.startedAt) / SCORE_ROLL_DURATION, 0, 1)
    : 1;
  const slide = progress * progress * (3 - 2 * progress);

  for (let index = 0; index < digits.length; index++) {
    const x = center + (index - (digits.length - 1) / 2) * digitWidth;
    if (slide < 1 && digits[index] !== previous[index]) {
      ink.globalAlpha = (1 - slide) ** 2.5;
      ink.fillText(previous[index], x, baseline - slide * fontSize * 0.24);
      ink.globalAlpha = slide;
      ink.fillText(digits[index], x, baseline + (1 - slide) * fontSize * 0.52);
      ink.globalAlpha = 1;
    } else {
      ink.fillText(digits[index], x, baseline);
    }
  }
  ink.restore();
}

function drawCollisionWarning(playerPosition) {
  const contact = run.impact === 'front' ? HALF_LENGTH : -HALF_LENGTH;
  const pop = reducedMotion?.matches ? 1 : clamp(impactTime / 0.14, 0, 1);
  const jiggle = reducedMotion?.matches ? 1 : clamp(impactTime / 0.34, 0, 1);
  const tilt = Math.sin(jiggle * TURN * 2.5) * 0.28 * (1 - jiggle) ** 1.5;
  const size = (0.72 + 0.28 * (1 - (1 - pop) ** 2)) / scale;

  ink.save();
  ink.translate(contact, roadHeight(playerPosition + contact) - 17 * CAR_SCALE);
  ink.rotate(-ANGLE);
  ink.scale(size, size);
  ink.translate(0, -13);
  ink.rotate(tilt);
  ink.translate(0, 13);
  ink.fillStyle = palette.background;
  ink.strokeStyle = palette.warning;
  ink.lineWidth = 2;
  ink.lineJoin = 'round';
  ink.lineCap = 'round';
  ink.beginPath();
  ink.moveTo(0, -24);
  ink.lineTo(13, -2);
  ink.lineTo(-13, -2);
  ink.closePath();
  ink.fill();
  ink.stroke();

  ink.beginPath();
  ink.moveTo(0, -16);
  ink.lineTo(0, -10);
  ink.stroke();
  ink.fillStyle = palette.warning;
  ink.beginPath();
  ink.arc(0, -6, 1.15, 0, TURN);
  ink.fill();
  ink.restore();
}

function render() {
  ink.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ink.clearRect(0, 0, width, height);
  const { front, player, rear } = run;
  drawRunScore();
  const idleDrift = reducedMotion?.matches ? 0 : Math.sin(idleTime * 0.55) * 110;
  const driftBlend = state === 'ready' ? 1 : Math.max(0, 1 - run.time / 0.8);
  const backdropPosition = player.position + idleDrift * driftBlend;
  for (const range of mountainRanges) drawMountainRange(backdropPosition, range);
  ink.translate(width / 2, height * 0.51);
  ink.rotate(ANGLE);
  ink.scale(scale, scale);
  drawRoad(player.position);

  const gap = gaps();
  const frontColor = run.impact === 'front' ? palette.warning
    : dangerColor(gap.front, player.speed - front.speed, run.nearMiss.front.glow);
  const rearColor = run.impact === 'rear' ? palette.warning
    : dangerColor(gap.rear, rear.speed - player.speed, run.nearMiss.rear.glow);

  drawCar(run.tail, player.position, palette.outerCar);
  drawCar(rear, player.position, rearColor);
  drawCar(player, player.position, run.impact ? palette.warning : palette.score,
    Number(run.braking), run.brakePitch);
  drawCar(front, player.position, frontColor, front.brakeLight);
  drawCar(run.lead, player.position, palette.outerCar, run.lead.brakeLight);

  if (run.impact) drawCollisionWarning(player.position);
}

function finishRun() {
  play.textContent = 'Retry';
  setState('over');
}

function frame(now) {
  if (document.hidden || !windowActive) {
    lastFrame = null;
  } else {
    const dt = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (state === 'ready' && !reducedMotion?.matches) idleTime += dt;
    if (run.milestoneStamp) {
      run.milestoneStamp.age += dt;
      if (run.milestoneStamp.age >= STAMP_DURATION) run.milestoneStamp = null;
    }
    if (state === 'running') {
      accumulator += dt;
      while (accumulator >= STEP && state === 'running') {
        simulate(STEP);
        accumulator -= STEP;
      }
      updateScore();
    } else if (state === 'impact') {
      impactTime += dt;
      if (impactTime >= IMPACT_DURATION) finishRun();
    }
    render();
  }
  requestAnimationFrame(frame);
}

function updateMute() {
  soundIcon.src = muted ? 'assets/icon/sound%20off.svg' : 'assets/icon/sound%20on.svg';
  mute.setAttribute('aria-pressed', String(muted));
}

game.addEventListener('pointerdown', event => {
  if (state !== 'running' || event.button !== 0 || event.target.closest('button')) return;
  event.preventDefault();
  primeAudio();
  pointers.add(event.pointerId);
  game.setPointerCapture(event.pointerId);
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  window.addEventListener(eventName, event => pointers.delete(event.pointerId));
}
game.addEventListener('contextmenu', event => {
  if (!event.target.closest('button')) event.preventDefault();
});
window.addEventListener('keydown', event => {
  if (event.code !== 'Space' || state !== 'running' || event.target.closest?.('button')) return;
  event.preventDefault();
  if (!event.repeat) {
    primeAudio();
    spaceHeld = true;
  }
});
window.addEventListener('keyup', event => {
  if (event.code === 'Space') spaceHeld = false;
});

function interruptFrame() {
  clearInput();
  lastFrame = null;
  accumulator = 0;
}

document.addEventListener('visibilitychange', interruptFrame);
window.addEventListener('blur', () => {
  windowActive = false;
  interruptFrame();
});
window.addEventListener('focus', () => {
  windowActive = true;
  interruptFrame();
});
window.addEventListener('pagehide', interruptFrame);
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
play.addEventListener('click', () => {
  start();
  play.blur();
});
mute.addEventListener('click', () => {
  muted = !muted;
  updateMute();
  writeStorage('brake.muted', String(muted));
  if (!muted) primeAudio();
  mute.blur();
});

document.fonts?.load('500 16px "Martian Mono"').catch(() => {});
run = freshRun();
updateScore();
updateMute();
resize();
requestAnimationFrame(frame);
