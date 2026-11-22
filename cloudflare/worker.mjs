const nameSegmenter = new Intl.Segmenter();

function validPlayerName(name) {
  return Boolean(name) && !/\p{Cc}/u.test(name) &&
    (/^Guest \d{10}$/.test(name) || Array.from(nameSegmenter.segment(name)).length <= 15);
}

const rankOrder = 'meters DESC, reached_at ASC, driver_id ASC';
const topScores = `SELECT name, meters, country FROM daily_leaderboard WHERE day = ? ORDER BY ${rankOrder} LIMIT 10`;
const dailyCalendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

function leaderboardDay(timestamp) {
  const [month, day, year] = dailyCalendar.format(timestamp).split('/');
  return `${year}-${month}-${day}`;
}

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

async function readSubmission(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function leaderboard(request, database) {
  const timestamp = Date.now();
  const day = leaderboardDay(timestamp);
  if (request.method === 'GET') {
    const { results } = await database.prepare(topScores).bind(day).all();
    return json({ scores: results });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
  }

  const data = await readSubmission(request);
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const meters = data?.meters;
  const token = data?.token;
  if (!validPlayerName(name) || !Number.isSafeInteger(meters) || meters < 0 ||
      typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    return json({ error: 'Invalid nickname or score.' }, 400);
  }

  const edgeCountry = request.cf?.country;
  const country = /^[A-Z]{2}$/.test(edgeCountry ?? '') && edgeCountry !== 'XX' ? edgeCountry : null;

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const driverId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const [, { results: scores }, { results: [standing] }] = await database.batch([
    database.prepare(`
      INSERT INTO daily_leaderboard (day, driver_id, name, meters, reached_at, country) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (day, driver_id) DO UPDATE SET
        name = excluded.name,
        country = CASE WHEN daily_leaderboard.country IS NULL OR excluded.meters > daily_leaderboard.meters
          THEN COALESCE(excluded.country, daily_leaderboard.country) ELSE daily_leaderboard.country END,
        meters = MAX(daily_leaderboard.meters, excluded.meters),
        reached_at = CASE WHEN excluded.meters > daily_leaderboard.meters
          THEN excluded.reached_at ELSE daily_leaderboard.reached_at END
    `).bind(day, driverId, name, meters, timestamp, country),
    database.prepare(topScores).bind(day),
    database.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM daily_leaderboard AS driver
      JOIN daily_leaderboard AS rival
        ON rival.day = driver.day AND (
          rival.meters > driver.meters OR (rival.meters = driver.meters AND
            (rival.reached_at, rival.driver_id) < (driver.reached_at, driver.driver_id))
        )
      WHERE driver.day = ? AND driver.driver_id = ?
    `).bind(day, driverId),
  ]);
  return json({ scores, rank: standing.rank });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/btb') {
      url.pathname = '/btb/';
      return Response.redirect(url, 308);
    }
    if (url.pathname === '/btb/api/leaderboard') {
      try {
        return await leaderboard(request, env.DB);
      } catch (error) {
        console.error('Leaderboard database request failed.', error);
        return json({ error: 'Leaderboard is unavailable.' }, 503);
      }
    }
    if (url.pathname.startsWith('/btb/')) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
