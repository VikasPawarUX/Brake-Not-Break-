'use strict';

const game = document.querySelector('#game');
const launchScreen = document.querySelector('#launch-screen');
const platform = window.bumperPlatform;
const pauseGame = document.querySelector('#pause-game');
const canvas = document.querySelector('#road');
const ink = canvas.getContext('2d');
const play = document.querySelector('#play');
const playIcon = document.querySelector('#play-icon');
const playLabel = document.querySelector('#play-label');
const driverName = document.querySelector('#driver-name');
const editDriver = document.querySelector('#edit-driver');
const driverDialog = document.querySelector('#driver-dialog');
const driverForm = document.querySelector('#driver-form');
const cancelDriver = document.querySelector('#cancel-driver');
const panelStatus = document.querySelector('#panel-status');
const panelBest = document.querySelector('#panel-best');
const menu = document.querySelector('.menu');
const hint = document.querySelector('#hint');
const distance = document.querySelector('#distance');
const mute = document.querySelector('#mute');
const soundIcon = document.querySelector('#sound-icon');
const themeToggle = document.querySelector('#theme-toggle');
const themeIcon = document.querySelector('#theme-icon');
const themeColor = document.querySelector('meta[name="theme-color"]');

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
const LAUNCH_DURATION = 0.75;
const METERS_PER_UNIT = 0.12;
const SCORE_STEP_METERS = 5;
const SCORE_ROLL_DURATION = 0.15;
const MILESTONE_METERS = 50;
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
  background: '#000000', score: '#FFF8E4', playerOutline: '#FFF8E4',
  nearMountain: '#17171b', farMountain: '#2b2b30',
  road: '#727272', stone: '#444444', brightStone: '#5c5c5c',
  milestonePost: '#707070', milestoneText: '#AAA592',
  check: '#B7B19E', stamp: '#E2DCC9',
  outerCar: '#777777', traffic: [145, 145, 145], danger: [255, 73, 73],
  warning: '#ff4949',
};
const pointers = new Map();

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Keep the session usable. */ }
}

const defaultPalette = { ...palette };

function rgbChannels(hex) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

const lightPalette = {
  background: '#ebebeb', score: '#111111', playerOutline: '#111111',
  nearMountain: '#d7d7d7', farMountain: '#c6c6c6',
  road: '#818181', stone: '#b5b5b5', brightStone: '#a0a0a0',
  milestonePost: '#717171', milestoneText: '#4d4d4d',
  check: '#4d4d4d', stamp: '#111111',
  outerCar: '#777777', traffic: [91, 91, 91], danger: [142, 21, 51],
  warning: '#8e1533',
};

let activeTheme = 'dark';

function applyTheme(theme) {
  const light = theme === 'light';
  activeTheme = light ? 'light' : 'dark';
  document.documentElement.dataset.theme = activeTheme;
  Object.assign(palette, light ? lightPalette : defaultPalette);
  themeColor.content = palette.background;
  themeIcon.src = light ? 'assets/icon/dark.svg' : 'assets/icon/light.svg';
  const label = light ? 'Switch to Dark theme' : 'Switch to Light theme';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
}

function createGuestNickname() {
  const [digits] = crypto.getRandomValues(new Uint32Array(1));
  const name = `Guest ${String(digits).padStart(10, '0')}`;
  writeStorage('brake.guestName', name);
  return name;
}

let state = 'ready';
let best = Math.max(0, Number(readStorage('brake.best')) || 0);
let muted = readStorage('brake.muted') === 'true';
const savedGuest = readStorage('brake.guestName');
const savedNickname = readStorage('brake.driverName');
const firstVisit = savedGuest === null && savedNickname === null &&
  readStorage('brake.best') === null && readStorage('brake.muted') === null;
const guestNickname = savedGuest || createGuestNickname();
let driverNickname = savedNickname?.trim() || guestNickname;
const brakeKeys = new Set(['Space', 'ArrowDown']);
const heldBrakeKeys = new Set();
let audio;
let run;
let brakeHintComplete = false;
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

const introductoryGapStages = [
  [0, 1], [50, 1], [100, 0.95], [150, 0.90], [200, 0.80],
  [250, 0.70], [350, 0.60], [450, 0.45], [600, 0.30], [800, 0.15],
];

const trafficGapVariationStages = [
  [0, 0.05], [100, 0.05], [150, 0.08], [200, 0.08], [250, 0.10],
  [350, 0.10], [450, 0.12], [600, 0.15], [800, 0.15], [900, 0.20],
];

function easeProgress(progress) {
  return progress ** 2 * (3 - 2 * progress);
}

function distanceStageValue(stages, meters) {
  const stage = stages.findIndex(([end]) => meters <= end);
  if (stage <= 0) return (stage === 0 ? stages[0] : stages.at(-1))[1];
  const [start, low] = stages[stage - 1];
  const [end, high] = stages[stage];
  return low + (high - low) * easeProgress((meters - start) / (end - start));
}

function introductoryGapBonus(meters) {
  return distanceStageValue(introductoryGapStages, meters);
}

function trafficGapVariationLimit(meters) {
  return distanceStageValue(trafficGapVariationStages, meters);
}

function createGapVariation(value = Math.random(), startedAt = 0) {
  return { from: value, to: Math.random(), startedAt, duration: 2 + Math.random() * 3 };
}

function sampleGapVariation(variation, time) {
  if (time >= variation.startedAt + variation.duration) {
    Object.assign(variation, createGapVariation(variation.to, time));
  }
  const progress = (time - variation.startedAt) / variation.duration;
  return variation.from + (variation.to - variation.from) * progress ** 2 * (3 - 2 * progress);
}

function freshRun() {
  const profiles = shuffleProfiles();
  const gapMultiplier = 1 + introductoryGapBonus(0);
  const frontVariation = createGapVariation();
  const rearVariation = createGapVariation();
  const variationLimit = trafficGapVariationLimit(0);
  const frontGap = settings.frontGap * (gapMultiplier + variationLimit * frontVariation.from);
  const rearGap = settings.rearGap * (gapMultiplier + variationLimit * rearVariation.from);
  return {
    lead: createCar(frontGap + 4 * HALF_LENGTH + OUTER_GAP, profiles[0]),
    front: createCar(frontGap + 2 * HALF_LENGTH, profiles[1]),
    player: createCar(0, profiles[2]),
    rear: createCar(-rearGap - 2 * HALF_LENGTH, profiles[3]),
    tail: createCar(-rearGap - 4 * HALF_LENGTH - OUTER_GAP, profiles[4]),
    time: 0,
    rainStart: 3 + Math.random() * 12,
    rainDuration: 5 + Math.random() * 4,
    launchTime: 0,
    trafficPhase: 0,
    recoveryPhase: Math.random() * TURN,
    frontVariation,
    rearVariation,
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
    rearHornEncounter: false,
    lastRearHorn: -Infinity,
    milestoneStamp: null,
    overtakeMarkers: [],
    replacedMilestones: new Set(),
    scoreRoll: { current: 0, previous: 0, startedAt: 0 },
  };
}

function score() {
  return Math.floor(run.player.position * METERS_PER_UNIT);
}

function updateScore() {
  const current = `${score()}m`;
  const record = `${best}m`;
  if (distance.textContent !== current) distance.textContent = current;
  if (panelBest.textContent !== record) panelBest.textContent = record;
}

const startMessages = [
  'Ready for the ride?',
  'Keep your distance!',
  'Brake smart. Drive far.',
  'Stay sharp. Stay alive.',
  'How far can you go?',
];

const gameOverMessages = [
  'Oops! Too close.',
  'Well, that escalated quickly.',
  'One more try?',
  'So close. So far.',
  'The traffic wins this round.',
];

function pickStatusMessage(messages) {
  return messages[Math.floor(Math.random() * messages.length)];
}

function setState(next) {
  state = next;
  game.dataset.state = next;
  menu.hidden = next === 'running' || next === 'impact';
  if (next === 'over') panelStatus.textContent = pickStatusMessage(gameOverMessages);
  if (next === 'paused') panelStatus.textContent = 'Paused';
  if (pauseGame) pauseGame.hidden = next !== 'running';
  hint.hidden = next !== 'running';
  updateDrivingAudio();
  syncPlatformGameplay();
}

function syncPlatformGameplay() {
  platform?.setPlaying(state === 'running' && !document.hidden && windowActive);
}

function primeAudio() {
  if (muted) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    if (!audio) {
      const context = new Audio();
      const master = context.createGain();
      const engine = context.createOscillator();
      const engineFilter = context.createBiquadFilter();
      const engineLevel = context.createGain();
      const rainLevel = context.createGain();
      const rainFilter = context.createBiquadFilter();
      const rainNoise = context.createBufferSource();
      const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.65), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

      master.gain.value = 0;
      master.connect(context.destination);
      engine.type = 'sawtooth';
      engine.frequency.value = 38;
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 130;
      engineLevel.gain.value = 0;
      engine.connect(engineFilter).connect(engineLevel).connect(master);
      engine.start();
      rainNoise.buffer = noise;
      rainNoise.loop = true;
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 2100;
      rainFilter.Q.value = 0.6;
      rainLevel.gain.value = 0;
      rainNoise.connect(rainFilter).connect(rainLevel).connect(master);
      rainNoise.start();
      audio = { context, master, engine, engineFilter, engineLevel, noise, rainLevel };
    }
    syncAudioLevel();
    if (audio.context.state !== 'running') {
      return audio.context.resume().then(() => {
        syncAudioLevel();
        updateDrivingAudio();
      }).catch(() => {});
    }
  } catch { /* Audio is optional. */ }
}

function syncAudioLevel() {
  if (!audio) return;
  const { context, master } = audio;
  if (platform?.adPlaying) {
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(0, context.currentTime);
    return;
  }
  master.gain.setTargetAtTime(muted || document.hidden || !windowActive ? 0 : 0.65,
    context.currentTime, 0.025);
}

function playAudioVoice(source, output, start, length, volume, attack = 0.012) {
  const envelope = audio.context.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(volume, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
  output.connect(envelope).connect(audio.master);
  source.onended = () => {
    source.disconnect();
    if (output !== source) output.disconnect();
    envelope.disconnect();
  };
  source.start(start);
  source.stop(start + length);
}

function playTone(type, from, to, start, length, volume, attack) {
  const tone = audio.context.createOscillator();
  tone.type = type;
  tone.frequency.setValueAtTime(from, start);
  tone.frequency.exponentialRampToValueAtTime(to, start + length);
  playAudioVoice(tone, tone, start, length, volume, attack);
}

function playNoise(type, from, to, start, length, volume, attack) {
  const source = audio.context.createBufferSource();
  const filter = audio.context.createBiquadFilter();
  source.buffer = audio.noise;
  filter.type = type;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + length);
  source.connect(filter);
  playAudioVoice(source, filter, start, length, volume, attack);
}

function sound(event) {
  if (muted || audio?.context.state !== 'running') return;
  const now = audio.context.currentTime;
  switch (event) {
    case 'brake':
      playNoise('bandpass', 3100, 2300, now, 0.16, 0.037, 0.035);
      break;
    case 'impact':
      playNoise('lowpass', 3200, 170, now, 0.48, 0.31);
      playTone('triangle', 135, 36, now, 0.34, 0.24, 0.006);
      playNoise('bandpass', 1100, 420, now + 0.05, 0.2, 0.11);
      break;
    case 'milestone':
      playTone('sine', 660, 660, now, 0.1, 0.055, 0.008);
      playTone('sine', 880, 880, now + 0.055, 0.16, 0.045, 0.008);
      break;
    case 'horn':
      playTone('triangle', 435, 425, now, 0.24, 0.095, 0.022);
      playTone('triangle', 540, 530, now, 0.20, 0.047, 0.027);
      break;
    case 'escape':
      playTone('sine', 690, 510, now, 0.065, 0.032);
      break;
    case 'ui':
      playTone('triangle', 570, 390, now, 0.085, 0.08, 0.005);
      break;
  }
}

function rainIntensity() {
  if (state !== 'running') return 0;
  const elapsed = run.time - run.rainStart;
  return clamp(Math.min(elapsed / 1.2, (run.rainDuration - elapsed) / 1.4), 0, 1);
}

function updateRain() {
  if (run.time < run.rainStart + run.rainDuration) return;
  run.rainStart = run.time + 9 + Math.random() * 16;
  run.rainDuration = 5 + Math.random() * 4;
}

function updateDrivingAudio() {
  if (audio?.context.state !== 'running') return;
  const now = audio.context.currentTime;
  const driving = state === 'running' && !muted;
  const speed = clamp(run.player.speed / 255, 0, 1.1);
  audio.engine.frequency.setTargetAtTime(35 + speed * 58 + (run.braking ? 0 : 7), now, 0.075);
  audio.engineFilter.frequency.setTargetAtTime(115 + speed * (run.braking ? 85 : 160), now, 0.1);
  audio.engineLevel.gain.setTargetAtTime(driving ? 0.052 + speed * 0.039 : 0, now, 0.09);
  audio.rainLevel.gain.setTargetAtTime(driving ? rainIntensity() * 0.04 : 0, now, 0.22);
}

function playButtonSound() {
  const resume = primeAudio();
  if (resume) resume.then(() => sound('ui'));
  else sound('ui');
}

function triggerHaptic(type) {
  if (document.hidden || !windowActive || reducedMotion?.matches ||
      navigator.userActivation?.hasBeenActive === false ||
      typeof navigator.vibrate !== 'function') return;

  try {
    navigator.vibrate(type === 'heavy' ? 100 : 12);
  } catch {
    // Haptics are optional.
  }
}

function fadeTouchRing(ring) {
  if (!ring) return;
  ring.classList.add('is-released');
  setTimeout(() => ring.remove(), 220);
}

function clearInput() {
  for (const ring of pointers.values()) fadeTouchRing(ring);
  pointers.clear();
  heldBrakeKeys.clear();
  if (!brakeHintComplete) hint.classList.remove('is-held');
  run.braking = false;
}

function start(nextRun = state === 'ready' ? run : freshRun()) {
  primeAudio();
  run = nextRun;
  run.driverName = driverNickname;
  if (!platform) {
    setOvertakeMarkers();
    hideLeaderboard();
  }
  brakeHintComplete = false;
  hint.classList.remove('is-held', 'is-complete');
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

function trafficPulse(phase, shape = 2) {
  return Math.max(0, Math.sin(phase)) ** shape;
}

const pressureStages = [
  [0, 0], [150, 0.05], [250, 0.15], [400, 0.35],
  [600, 0.60], [800, 0.85], [1000, 1],
];

function trafficPressure(meters) {
  return distanceStageValue(pressureStages, meters);
}

function updateTraffic(dt) {
  const { lead, front, player, rear, tail, time } = run;
  const difficulty = 1 - Math.exp(-Math.max(0, Math.min(score(), 600) - 22) * settings.progression / 155);
  const meters = player.position * METERS_PER_UNIT;
  const extraPressure = trafficPressure(meters);
  const intro = clamp((time - 1.15) / 3.4, 0, 1);
  run.trafficPhase += (1.55 + 0.52 * difficulty + 0.43 * extraPressure)
    * (0.62 + 0.38 * extraPressure) * dt;
  const recoveryWave = 0.5 + 0.5 * Math.sin(run.trafficPhase * 0.31 + run.recoveryPhase
    + 0.32 * Math.sin(time * 0.43 + run.recoveryPhase));
  const intensity = extraPressure * (0.42 + 0.58 * easeProgress(recoveryWave));
  const pressure = settings.aggression * intro * (0.82 + 0.30 * difficulty)
    * (1 + 0.20 * extraPressure) * intensity;

  // Smooth timing offsets let the pressure waves overlap without speeding up the cars abruptly.
  const frontPhase = run.trafficPhase - 0.75 + extraPressure * 0.24 * Math.sin(time * 0.67);
  const rearPhase = run.trafficPhase - 3.1 + extraPressure
    * (0.42 + 0.36 * Math.sin(time * 0.47 + 1.2) + 0.15 * Math.sin(time * 0.79));
  const pulseShape = 2 - 0.62 * extraPressure;
  // Alternate stronger paired waves with quieter, independent traffic.
  const pairStrength = (0.5 + 0.5 * Math.cos(run.trafficPhase / 2 - 0.7)) ** 2;
  const formation = pairStrength * clamp(pressure / 34, 0, 1);
  const frontPulse = trafficPulse(frontPhase, pulseShape) * (0.95 + 0.12 * pairStrength);
  const rearPulse = trafficPulse(rearPhase, pulseShape) * (0.95 + 0.12 * pairStrength);
  const pace = pressure * 0.21 * Math.sin(run.trafficPhase * 0.43);
  const openSpace = front.position - rear.position - 4 * HALF_LENGTH;
  const gapBonus = introductoryGapBonus(meters);
  const preferredSpace = (settings.frontGap + settings.rearGap) * (1 + gapBonus) - 16 * difficulty;
  const variationLimit = trafficGapVariationLimit(meters);
  const frontExtraGap = settings.frontGap * variationLimit * sampleGapVariation(run.frontVariation, time);
  const rearExtraGap = settings.rearGap * variationLimit * sampleGapVariation(run.rearVariation, time);
  // Split the existing spacing correction so the two gap targets can vary independently.
  const spaceDeficit = preferredSpace - openSpace;
  const frontCorrection = clamp((spaceDeficit + 2 * frontExtraGap) * 0.19, 0, 8);
  const rearCorrection = clamp((spaceDeficit + 2 * rearExtraGap) * 0.19, 0, 8);

  // Preserve independent waves, but soften their overlap during the learning stages.
  const coordination = 0.62 * easeProgress(clamp((meters - 250) / 350, 0, 1))
    + 0.24 * easeProgress(clamp((meters - 600) / 200, 0, 1));
  const overlap = Math.min(frontPulse, rearPulse) * (1 - coordination);
  let frontTarget = settings.baseSpeed + pace - pressure * (frontPulse - overlap) + frontCorrection;
  let rearTarget = settings.baseSpeed + pace + pressure * (rearPulse - overlap) - rearCorrection;

  // Cap the rate at which the traffic can squeeze the player. The cap
  // leaves room for the AI to ease out of a squeeze at its own acceleration.
  const originalMinimumSpace = 42;
  // Protect the extra room early, then ease toward the smaller late-run buffer.
  const minimumSpace = originalMinimumSpace + (preferredSpace - originalMinimumSpace) * gapBonus;
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
  front.speed = approach(front.speed, clamp(frontTarget, 60, 245), trafficAcceleration * dt);
  rear.speed = approach(rear.speed, clamp(rearTarget, 60, 245), trafficAcceleration * dt);

  // The lead car slows first. The tail car closes toward its neighbor before a rear surge.
  const leadGap = OUTER_GAP - 11 * formation * trafficPulse(frontPhase + 1.55);
  const tailGap = OUTER_GAP - 13 * formation * trafficPulse(rearPhase + 1.55);
  followTraffic(lead, front, 1, leadGap);
  followTraffic(tail, rear, -1, tailGap);

  const playerBefore = player.speed;

  const braking = pointers.size > 0 || heldBrakeKeys.size > 0;
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
  triggerHaptic('heavy');
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
  let checkmark = false;
  for (let marker = previousMarker + 1; marker <= passedMarker; marker++) {
    if (run.replacedMilestones.has(marker)) continue;
    run.milestoneStamp = { marker, age: 0 };
    checkmark = true;
  }
  const displayScore = Math.floor(score() / SCORE_STEP_METERS) * SCORE_STEP_METERS;
  if (displayScore !== run.scoreRoll.current) {
    run.scoreRoll = { current: displayScore, previous: run.scoreRoll.current, startedAt: run.time };
  }
  if (firstContact <= 1) {
    collide(frontContact <= rearContact ? 'front' : 'rear');
  } else {
    updateNearMisses(before, dt);
    const overtookDriver = markOvertakes(score());
    if (checkmark || overtookDriver) sound('milestone');
  }
}

function updateRearHorn(gap, previousGap) {
  const closing = run.rear.speed - run.player.speed;
  const warningGap = trafficWarningGap(closing) + 6;
  if (gap > warningGap + 10) run.rearHornEncounter = false;
  if (run.rearHornEncounter || closing <= 0 || gap >= previousGap || gap > warningGap) return;
  run.rearHornEncounter = true;
  if (run.time - run.lastRearHorn < 6 || Math.random() >= 0.65) return;
  run.lastRearHorn = run.time;
  sound('horn');
}

function updateNearMisses(before, dt) {
  const after = gaps();
  updateRearHorn(after.rear, before.rear);
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

function setOvertakeMarkers() {
  run.overtakeMarkers = getTopDrivers()
    .filter(driver => Number.isSafeInteger(driver.meters) && driver.meters >= 0)
    .map(driver => ({
      name: driver.name,
      meters: driver.meters,
      position: (driver.meters + 1) / METERS_PER_UNIT,
      passedAt: null,
      lane: 0,
    }))
    .sort((a, b) => a.position - b.position);
  run.replacedMilestones = new Set(run.overtakeMarkers.map(marker =>
    Math.max(1, Math.round(marker.meters / MILESTONE_METERS))));
  layoutOvertakeMarkers();
}

function layoutOvertakeMarkers() {
  const laneEnds = [];
  for (const marker of run.overtakeMarkers) {
    const available = laneEnds.findIndex(end => (marker.position - end) * scale >= 118);
    marker.lane = available === -1 ? laneEnds.length : available;
    laneEnds[marker.lane] = marker.position;
  }
}

function markOvertakes(meters) {
  let overtookDriver = false;
  for (const marker of run.overtakeMarkers) {
    if (marker.meters >= meters) break;
    if (marker.passedAt !== null) continue;
    marker.passedAt = run.time;
    overtookDriver = true;
  }
  return overtookDriver;
}

window.addEventListener('bumper-leaderboard-updated', () => {
  if (state === 'ready') setOvertakeMarkers();
});

function resize() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  scale = clamp(width / 495, 0.45, 1.45) * CAMERA_ZOOM;
  layoutOvertakeMarkers();
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

function drawMilestonePost(label, color, maxWidth) {
  ink.lineWidth = 1;
  ink.strokeStyle = palette.milestonePost;
  ink.strokeRect(-1.5, -9.5, 3, 10);
  ink.fillStyle = palette.milestoneText;
  ink.fillRect(-1, -9, 2, 2);
  ink.fillStyle = color;
  ink.font = '400 13px "Inter", sans-serif';
  ink.textAlign = 'center';
  ink.textBaseline = 'top';
  ink.fillText(label, 0, 4, maxWidth);
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
    if (run.replacedMilestones.has(marker)) continue;
    const position = marker * MILESTONE_INTERVAL;
    ink.save();
    ink.translate(position - origin, roadHeight(position) + 22 / scale);
    ink.rotate(-ANGLE);
    ink.scale(1 / scale, 1 / scale);
    if (marker <= passedMarker) {
      drawMilestoneCheck(stamp?.marker === marker ? stamp.age : Infinity);
    } else {
      drawMilestonePost(`${marker * MILESTONE_METERS}m`, palette.milestoneText, 112);
    }
    ink.restore();
  }
  drawOvertakeMarkers(origin, start, end);
}

function drawOvertakeMarkers(origin, start, end) {
  for (const marker of run.overtakeMarkers) {
    if (marker.position < start || marker.position > end) continue;

    ink.save();
    ink.translate(marker.position - origin, roadHeight(marker.position) + (22 + marker.lane * 31) / scale);
    ink.rotate(-ANGLE);
    ink.scale(1 / scale, 1 / scale);
    if (marker.passedAt !== null) {
      const age = reducedMotion?.matches || run.impact ? Infinity : run.time - marker.passedAt;
      drawMilestoneCheck(age);
    } else {
      drawMilestonePost(marker.name, palette.milestoneText, 112);
    }
    ink.restore();
  }
}

function drawCar(car, origin, color, brakePitch = 0, warningFill = 0) {
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
  ink.fillStyle = warningFill > 0
    ? dangerColor(warningFill * 0.16, rgbChannels(palette.background))
    : palette.background;

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
  if (car === run.player) {
    ink.clip();
    ink.globalAlpha = 0.19;
    ink.lineWidth = 1;
    ink.beginPath();
    for (let x = -BODY_HALF_LENGTH - 20; x <= BODY_HALF_LENGTH; x += 2.5) {
      ink.moveTo(x, 0);
      ink.lineTo(x + 16, -28);
    }
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

function trafficWarningGap(closing) {
  return 9 + Math.max(0, closing) * 0.52;
}

function dangerLevel(gap, closing, glow) {
  const threshold = trafficWarningGap(closing);
  return Math.max(glow * 0.65, clamp((threshold - gap + 12) / 20, 0, 1));
}

function dangerColor(danger, base = palette.traffic) {
  const channels = base.map((channel, index) =>
    Math.round(channel + (palette.danger[index] - channel) * danger));
  return `rgb(${channels.join(', ')})`;
}

function scoreFontSize() {
  const desktopSize = Math.min(150, width * 0.22, height * 0.16);
  if (width > 560) return desktopSize;
  return Math.max(desktopSize, Math.min(width * 0.29, 118, height * 0.20));
}

function sceneryLift() {
  const baseLift = Math.min(height * 0.045, 42);
  // Leave room between the fixed score and the name on short landscape screens.
  const landscapeLift = width > height ? clamp((420 - height) * 0.34, 0, height * 0.10) : 0;
  return baseLift + landscapeLift;
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
  const center = width / 2 - fontSize * 0.13;
  const baseline = scoreBaseline(fontSize);
  ink.save();
  ink.textAlign = 'center';
  ink.textBaseline = 'alphabetic';

  ink.font = `400 ${fontSize}px "Inter", sans-serif`;
  ink.fillStyle = palette.score;
  const digitWidth = ink.measureText('0').width;
  const digitStep = digitWidth - fontSize * 0.035;
  const lastDigitX = center + (digits.length - 1) / 2 * digitStep;
  const progress = rolling
    ? clamp((run.time - run.scoreRoll.startedAt) / SCORE_ROLL_DURATION, 0, 1)
    : 1;
  const slide = progress * progress * (3 - 2 * progress);

  for (let index = 0; index < digits.length; index++) {
    const x = center + (index - (digits.length - 1) / 2) * digitStep;
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
  const unitSize = Math.max(10, fontSize * 0.24);
  ink.font = `400 ${unitSize}px "Inter", sans-serif`;
  ink.fillText('m', lastDigitX + digitWidth / 2 + ink.measureText('m').width / 2, baseline);
  ink.restore();
}

function drawCollisionWarning(playerPosition) {
  const contact = run.impact === 'front' ? HALF_LENGTH : -HALF_LENGTH;
  const pop = reducedMotion?.matches ? 1 : clamp(impactTime / 0.14, 0, 1);
  const jiggle = reducedMotion?.matches ? 1 : clamp(impactTime / 0.34, 0, 1);
  const resultsTime = reducedMotion?.matches ? 0 : Math.max(0, impactTime - IMPACT_DURATION);
  const tilt = Math.sin(jiggle * TURN * 2.5) * 0.28 * (1 - jiggle) ** 1.5
    + Math.sin(resultsTime * TURN * 1.75) * 0.1;
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

const rainDrops = Array.from({ length: 112 }, () => ({
  x: Math.random(),
  y: Math.random(),
  speed: 230 + Math.random() * 290,
  slant: 0.19 + Math.random() * 0.04,
  length: 9 + Math.random() * 11,
}));

function drawRain() {
  const intensity = rainIntensity();
  if (intensity <= 0 || reducedMotion?.matches) return;
  const count = clamp(Math.round(width * height / 10000), 16, rainDrops.length);
  const streakScale = clamp(Math.sqrt(width * height / (540 * 650)), 1, 2.2);
  const elapsed = run.time - run.rainStart;
  const wrapWidth = width + 40;
  const wrapHeight = height + 64;
  ink.save();
  ink.globalAlpha = intensity * (activeTheme === 'light' ? 0.15 : 0.18);
  ink.strokeStyle = palette.score;
  ink.lineWidth = Math.min(1.5, streakScale);
  ink.beginPath();
  for (let index = 0; index < count; index++) {
    const drop = rainDrops[index];
    const x = (drop.x * wrapWidth + elapsed * drop.speed * drop.slant) % wrapWidth - 20;
    const y = (drop.y * wrapHeight + elapsed * drop.speed) % wrapHeight - 32;
    const length = drop.length * streakScale;
    ink.moveTo(x, y);
    ink.lineTo(x + length * drop.slant, y + length);
  }
  ink.stroke();
  ink.restore();
}

function render() {
  ink.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ink.clearRect(0, 0, width, height);
  if (state === 'impact' && !reducedMotion?.matches) {
    const shake = clamp(impactTime / 0.24, 0, 1);
    const strength = 4 * (1 - shake) ** 2;
    ink.translate(Math.sin(shake * TURN * 2.5) * strength,
      Math.sin(shake * TURN * 3) * strength * 0.5);
  }
  const { front, player, rear } = run;
  drawRunScore();
  const idleDrift = reducedMotion?.matches ? 0 : Math.sin(idleTime * 0.55) * 110;
  const driftBlend = state === 'ready' ? 1 : Math.max(0, 1 - run.time / 0.8);
  const backdropPosition = player.position + idleDrift * driftBlend;
  for (const range of mountainRanges) drawMountainRange(backdropPosition, range);
  drawRain();
  ink.translate(width / 2, height * 0.51 + Math.min(height * 0.025, 20));
  ink.rotate(ANGLE);
  ink.scale(scale, scale);
  drawRoad(player.position);

  const gap = gaps();
  const frontDanger = dangerLevel(gap.front, player.speed - front.speed, run.nearMiss.front.glow);
  const rearDanger = dangerLevel(gap.rear, rear.speed - player.speed, run.nearMiss.rear.glow);
  const frontImpact = run.impact === 'front';
  const rearImpact = run.impact === 'rear';
  const playerDanger = run.impact ? 1 : Math.max(frontDanger, rearDanger);
  const playerColor = run.impact ? palette.warning : playerDanger > 0 ? dangerColor(playerDanger) : palette.playerOutline;

  drawCar(run.tail, player.position, palette.outerCar);
  drawCar(rear, player.position, rearImpact ? palette.warning : dangerColor(rearDanger),
    0, rearImpact ? 1 : rearDanger);
  drawCar(player, player.position, playerColor, run.brakePitch, playerDanger);
  drawCar(front, player.position, frontImpact ? palette.warning : dangerColor(frontDanger),
    0, frontImpact ? 1 : frontDanger);
  drawCar(run.lead, player.position, palette.outerCar);

  if (run.impact) drawCollisionWarning(player.position);
}

function finishRun() {
  playLabel.textContent = 'Restart';
  playIcon.src = 'assets/icon/restart.svg?v=assets-2';
  setState('over');
  if (!platform) {
    run.leaderboardDay = leaderboardDay();
    showLeaderboard(run.driverName, score());
  }
}

function launchDelay(elapsed) {
  const progress = Math.min(elapsed / LAUNCH_DURATION, 1);
  // Integrate the slowdown so the roll-in feels the same at different frame rates.
  return LAUNCH_DURATION * 0.9 * (progress - progress ** 3 + 0.5 * progress ** 4);
}

function showReleaseHint() {
  if (!brakeHintComplete) hint.classList.add('is-held');
}

function finishBrakeHint() {
  if (state !== 'running' || brakeHintComplete || !hint.classList.contains('is-held') || heldBrakeKeys.size || pointers.size) return;
  brakeHintComplete = true;
  hint.classList.add('is-complete');
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
      const previousLaunchTime = run.launchTime;
      run.launchTime = Math.min(LAUNCH_DURATION, previousLaunchTime + dt);
      accumulator += dt + launchDelay(previousLaunchTime) - launchDelay(run.launchTime);
      while (accumulator >= STEP && state === 'running') {
        simulate(STEP);
        accumulator -= STEP;
      }
      updateRain();
      updateScore();
    } else if (state === 'impact') {
      impactTime += dt;
      if (impactTime >= IMPACT_DURATION) finishRun();
    } else if (state === 'over' && !reducedMotion?.matches) {
      impactTime += dt;
    }
    updateDrivingAudio();
    render();
  }
  requestAnimationFrame(frame);
}

function updateMute() {
  soundIcon.src = muted ? 'assets/icon/sound%20off.svg?v=assets-2' : 'assets/icon/sound%20on.svg?v=assets-2';
  mute.setAttribute('aria-pressed', String(muted));
}

game.addEventListener('pointerdown', event => {
  if (state !== 'running' || event.button !== 0 || event.target.closest('button')) return;
  event.preventDefault();
  primeAudio();
  let ring = null;
  if (event.pointerType === 'touch') {
    ring = document.createElement('span');
    ring.className = 'touch-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${event.clientX}px`;
    ring.style.top = `${event.clientY}px`;
    game.append(ring);
  }
  pointers.set(event.pointerId, ring);
  showReleaseHint();
  game.setPointerCapture(event.pointerId);
});

function releasePointer(event) {
  if (!pointers.has(event.pointerId)) return;
  fadeTouchRing(pointers.get(event.pointerId));
  pointers.delete(event.pointerId);
  if (event.type === 'pointerup') finishBrakeHint();
  else if (!pointers.size && !heldBrakeKeys.size && !brakeHintComplete) hint.classList.remove('is-held');
}

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  window.addEventListener(eventName, releasePointer);
}
game.addEventListener('contextmenu', event => {
  if (!event.target.closest('button')) event.preventDefault();
});
window.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      event.shiftKey || game.inert || driverDialog.open) return;
  if (platform && event.key === 'Escape' && (state === 'running' || state === 'paused')) {
    event.preventDefault();
    if (!event.repeat) {
      if (state === 'running') pauseRun();
      else play.click();
    }
    return;
  }
  if (event.target.closest?.('button, input, textarea, select, a, [contenteditable], #leaderboard-scores')) return;

  if (event.key === 'Enter' && (state === 'ready' || state === 'over' || state === 'paused')) {
    event.preventDefault();
    if (!event.repeat && !menu.inert) play.click();
    return;
  }

  if (platform && (brakeKeys.has(event.code) || event.code === 'ArrowUp')) event.preventDefault();
  if (state !== 'running' || !brakeKeys.has(event.code)) return;
  event.preventDefault();
  if (!event.repeat) {
    primeAudio();
    heldBrakeKeys.add(event.code);
    showReleaseHint();
  }
});
window.addEventListener('keyup', event => {
  if (heldBrakeKeys.delete(event.code)) finishBrakeHint();
});

function interruptFrame() {
  syncPlatformGameplay();
  syncAudioLevel();
  clearInput();
  lastFrame = null;
  accumulator = 0;
}

document.addEventListener('visibilitychange', () => {
  interruptFrame();
  if (!document.hidden && audio) primeAudio();
  if (!platform) refreshLeaderboardDay();
});
window.addEventListener('blur', () => {
  windowActive = false;
  interruptFrame();
});
window.addEventListener('focus', () => {
  windowActive = true;
  interruptFrame();
  if (audio) primeAudio();
});
window.addEventListener('pagehide', () => {
  if (platform) windowActive = false;
  interruptFrame();
});
window.addEventListener('pageshow', () => {
  if (!platform) return;
  windowActive = document.hasFocus();
  interruptFrame();
});
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
document.addEventListener('click', event => {
  if (event.isTrusted && audio?.context.state !== 'running' &&
      !event.target.closest?.('button')) primeAudio();
}, { capture: true });
game.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button && button !== mute && !button.disabled) playButtonSound();
  if (event.isTrusted && button && !button.disabled && !button.closest('[inert]')) {
    triggerHaptic('soft');
  }
}, { capture: true });
function openDriverDialog(setup = false) {
  driverName.value = setup ? '' : driverNickname;
  cancelDriver.textContent = setup ? 'Skip' : 'Cancel';
  const focusTarget = setup ? cancelDriver : driverName;
  focusTarget.setAttribute('autofocus', '');
  driverDialog.showModal();
  focusTarget.removeAttribute('autofocus');
  if (!setup) driverName.select();
}

editDriver.addEventListener('click', () => {
  if (!menu.inert) openDriverDialog();
});
cancelDriver.addEventListener('click', () => driverDialog.close());
driverForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = driverName.value.trim() || guestNickname;
  if (name.length > driverName.maxLength && name !== guestNickname && name !== driverNickname) return;
  if (name !== driverNickname) {
    driverNickname = name;
    writeStorage('brake.driverName', name);
    if (state === 'over') {
      run.driverName = name;
      if (run.leaderboardDay === leaderboardDay()) showLeaderboard(name, score(), false);
    }
  }
  driverDialog.close();
});
function pauseRun() {
  if (state !== 'running') return;
  clearInput();
  playLabel.textContent = 'Resume';
  playIcon.src = 'assets/icon/start.svg?v=assets-2';
  setState('paused');
}

pauseGame?.addEventListener('click', pauseRun);

play.addEventListener('click', async () => {
  if (menu.inert || game.inert) return;
  play.blur();
  if (platform && (state === 'over' || state === 'paused')) {
    const resume = state === 'paused';
    primeAudio();
    menu.inert = true;
    game.inert = true;
    try {
      await platform.commercialBreak(syncAudioLevel);
    } finally {
      game.inert = false;
      menu.inert = false;
      syncAudioLevel();
    }
    if (resume) {
      lastFrame = null;
      accumulator = 0;
      setState('running');
      return;
    }
  }
  if (state !== 'over' || reducedMotion?.matches || !menu.animate) {
    start();
    return;
  }

  primeAudio();
  menu.inert = true;
  const nextRun = freshRun();
  run = nextRun;
  render();
  const opacity = getComputedStyle(menu).opacity;
  const exit = menu.animate([{ opacity }, { opacity: 0 }], {
    duration: 230,
    easing: 'ease-in-out',
    fill: 'forwards',
  });
  try {
    await exit.finished;
  } catch {
    // The next run can still start if the animation is interrupted.
  } finally {
    start(nextRun);
    exit.cancel();
    menu.inert = false;
  }
});
mute.addEventListener('click', () => {
  if (!muted) sound('ui');
  muted = !muted;
  updateMute();
  writeStorage('brake.muted', String(muted));
  if (muted) syncAudioLevel();
  else playButtonSound();
  updateDrivingAudio();
  mute.blur();
});

themeToggle.addEventListener('click', () => {
  const theme = activeTheme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  writeStorage('brake.theme', theme);
});
applyTheme(readStorage('brake.theme'));

document.fonts?.load('400 16px "Inter"').catch(() => {});
run = freshRun();
panelStatus.textContent = pickStatusMessage(startMessages);
updateScore();
updateMute();
resize();
if (!platform) showLeaderboard();
requestAnimationFrame(frame);

async function finishLoading() {
  if (platform) {
    await platform.ready;
    await document.fonts?.ready;
  }
  if (!reducedMotion?.matches && launchScreen.animate) {
    const fade = launchScreen.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
      easing: 'ease-out',
      fill: 'forwards',
    });
    await fade.finished.catch(() => {});
  }
  launchScreen.hidden = true;
  game.inert = false;
  platform?.loadingFinished();
  if (!platform && firstVisit) openDriverDialog(true);
}

if (platform) finishLoading();
else setTimeout(finishLoading, 1800);

function refreshLeaderboardDay() {
  if (!document.hidden && (state === 'ready' || state === 'over') &&
      displayedLeaderboardDay !== leaderboardDay()) showLeaderboard();
}

if (!platform) setInterval(refreshLeaderboardDay, 15000);
