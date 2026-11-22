'use strict';

const rankStat = document.querySelector('#rank-stat');
const playerRank = document.querySelector('#player-rank');
const leaderboard = document.querySelector('#leaderboard');
const leaderboardStatus = document.querySelector('#leaderboard-status');
const leaderboardScores = document.querySelector('#leaderboard-scores');
const leaderboardStrip = document.querySelector('.leaderboard-strip');
const scoresPrev = document.querySelector('#scores-prev');
const scoresNext = document.querySelector('#scores-next');
const countryNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const leaderboardCalendar = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York' });
let displayedLeaderboardDay;
let leaderboardRequest = 0;
let topDriversDay;
let topDrivers = [];

function leaderboardDay() {
  return leaderboardCalendar.format(new Date());
}
let leaderboardToken;
let submissions = Promise.resolve();

const sampleScores = [
  { name: 'Milo Drift', meters: 842, country: 'SG' },
  { name: 'Luna Lane', meters: 716, country: 'US' },
  { name: 'Theo Turn', meters: 604, country: 'GB' },
  { name: 'Nova Road', meters: 553 },
  { name: 'Ivy Gear', meters: 477 },
  { name: 'Finn Coast', meters: 429 },
  { name: 'Rory Ridge', meters: 368 },
  { name: 'Sage Lane', meters: 308 },
  { name: 'Remy Roll', meters: 251 },
  { name: 'Jules Dash', meters: 194 },
];

function isLeaderboardDemo() {
  const { protocol, hostname, search } = window.location;
  return protocol === 'file:' || (
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    && new URLSearchParams(search).get('demoLeaderboard') === '1'
  );
}

function getTopDrivers() {
  return topDriversDay === leaderboardDay() ? topDrivers : [];
}

function renderScores(scores) {
  topDriversDay = displayedLeaderboardDay;
  topDrivers = scores.slice(0, 10);
  leaderboardScores.replaceChildren();
  for (const [index, entry] of topDrivers.entries()) {
    const row = document.createElement('li');
    const driver = document.createElement('span');
    const rank = document.createElement('span');
    const name = document.createElement('span');
    const score = document.createElement('strong');
    driver.className = 'leaderboard-driver';
    rank.textContent = String(index + 1).padStart(2, '0') + '.';
    driver.append(rank);
    if (/^[A-Z]{2}$/.test(entry.country ?? '') && entry.country !== 'XX') {
      const flag = document.createElement('span');
      flag.className = 'leaderboard-flag';
      flag.textContent = String.fromCodePoint(...Array.from(entry.country, letter => letter.charCodeAt(0) + 0x1f1a5));
      flag.setAttribute('role', 'img');
      flag.setAttribute('aria-label', countryNames?.of(entry.country) || entry.country);
      driver.append(flag);
    }
    name.className = 'leaderboard-name';
    name.textContent = playerNameCharacters(entry.name).slice(0, 6).join('');
    driver.append(name);
    score.textContent = `${entry.meters}m`;
    row.append(score, driver);
    leaderboardScores.append(row);
  }
  leaderboard.hidden = !scores.length;
  leaderboardStatus.textContent = '';
  leaderboardStrip.hidden = !scores.length;
  updateScrollButtons();
  window.dispatchEvent(new Event('bumper-leaderboard-updated'));
}

function getLeaderboardToken() {
  if (leaderboardToken) return leaderboardToken;
  leaderboardToken = readStorage('brake.leaderboardToken');
  if (!/^[a-f0-9]{32}$/.test(leaderboardToken ?? '')) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    leaderboardToken = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    writeStorage('brake.leaderboardToken', leaderboardToken);
  }
  return leaderboardToken;
}

function hideLeaderboard() {
  leaderboardRequest++;
  rankStat.hidden = true;
}

async function requestLeaderboard(endpoint, name, meters) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(endpoint, name ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, meters, token: getLeaderboardToken() }),
      signal: controller.signal,
    } : { signal: controller.signal });

    if (response.status === 503) return { status: 'Leaderboard is offline.' };
    if (!response.ok) throw new Error('Leaderboard unavailable');
    const payload = await response.json();
    if (!Array.isArray(payload.scores)) throw new Error('Invalid leaderboard response');
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function showLeaderboardStatus(message) {
  leaderboardStatus.textContent = message;
  leaderboard.hidden = false;
}

async function showLeaderboard(name, meters, opening = true) {
  const request = ++leaderboardRequest;
  displayedLeaderboardDay = leaderboardDay();
  const endpoint = window.bumperLeaderboardEndpoint;
  rankStat.hidden = true;
  if (opening) {
    leaderboardScores.replaceChildren();
    leaderboardStrip.hidden = true;
    leaderboard.hidden = true;
    leaderboardStatus.textContent = '';
    leaderboardScores.scrollLeft = 0;
  }

  if (isLeaderboardDemo()) {
    renderScores(sampleScores);
    return;
  }
  if (!endpoint) {
    showLeaderboardStatus('Leaderboard is offline.');
    return;
  }

  try {
    const pending = submissions.then(() => requestLeaderboard(endpoint, name, meters));
    submissions = pending.catch(() => {});
    const payload = await pending;
    if (request !== leaderboardRequest) return;
    if (payload.status) {
      showLeaderboardStatus(payload.status);
      return;
    }
    renderScores(payload.scores);
    if (Number.isSafeInteger(payload.rank) && payload.rank > 0) {
      playerRank.textContent = String(payload.rank);
      rankStat.hidden = false;
    }
  } catch {
    if (request === leaderboardRequest) showLeaderboardStatus('Leaderboard is unavailable.');
  }
}

// Let a mouse wheel browse the strip, while touch and trackpads can pan directly.
leaderboardScores.addEventListener('wheel', event => {
  if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  if (leaderboardScores.scrollWidth <= leaderboardScores.clientWidth) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? leaderboardScores.clientWidth : 1;
  leaderboardScores.scrollBy({ left: event.deltaY * unit, behavior: 'instant' });
}, { passive: false });

function updateScrollButtons() {
  const { scrollLeft, scrollWidth, clientWidth } = leaderboardScores;
  scoresPrev.disabled = scrollLeft <= 1;
  scoresNext.disabled = scrollLeft + clientWidth >= scrollWidth - 1;
}

scoresPrev.addEventListener('click', () => leaderboardScores.scrollBy({ left: -leaderboardScores.clientWidth }));
scoresNext.addEventListener('click', () => leaderboardScores.scrollBy({ left: leaderboardScores.clientWidth }));
leaderboardScores.addEventListener('scroll', updateScrollButtons, { passive: true });
new ResizeObserver(updateScrollButtons).observe(leaderboardScores);
