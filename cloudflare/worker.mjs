const rankOrder = 'meters DESC, reached_at ASC, driver_id ASC';
const topScores = `SELECT name, meters FROM leaderboard ORDER BY ${rankOrder} LIMIT 10`;

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
  if (request.method === 'GET') {
    const { results } = await database.prepare(topScores).all();
    return json({ scores: results });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
  }

  const data = await readSubmission(request);
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  const meters = data?.meters;
  const token = data?.token;
  if (!/^[^\p{Cc}]{1,24}$/u.test(name) || !Number.isSafeInteger(meters) || meters < 0 ||
      typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    return json({ error: 'Invalid nickname or score.' }, 400);
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const driverId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const [, { results: scores }, { results: [standing] }] = await database.batch([
    database.prepare(`
      INSERT INTO leaderboard (driver_id, name, meters, reached_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (driver_id) DO UPDATE SET
        name = excluded.name,
        meters = MAX(leaderboard.meters, excluded.meters),
        reached_at = CASE WHEN excluded.meters > leaderboard.meters
          THEN excluded.reached_at ELSE leaderboard.reached_at END
    `).bind(driverId, name, meters, Date.now()),
    database.prepare(topScores),
    database.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM leaderboard AS driver
      JOIN leaderboard AS rival
        ON rival.meters > driver.meters
        OR (rival.meters = driver.meters AND
            (rival.reached_at, rival.driver_id) < (driver.reached_at, driver.driver_id))
      WHERE driver.driver_id = ?
    `).bind(driverId),
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
