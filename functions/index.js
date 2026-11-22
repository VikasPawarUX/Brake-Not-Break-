'use strict';

const { createHash } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

initializeApp();

const db = getFirestore();
const leaderboard = db.doc('leaderboards/bumper-to-bumper');
const nameSegmenter = new Intl.Segmenter();

function validPlayerName(name) {
  return Boolean(name) && !/\p{Cc}/u.test(name) &&
    (/^Guest \d{10}$/.test(name) || Array.from(nameSegmenter.segment(name)).length <= 15);
}

const topLimit = 10;

exports.bumperLeaderboard = onCall({ maxInstances: 3 }, async request => {
  const data = request.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Expected leaderboard data.');
  }
  let scores;
  if (Object.keys(data).length === 0) {
    scores = (await leaderboard.get()).get('scores') ?? [];
  } else {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const { meters, token } = data;
    if (!validPlayerName(name) ||
        !Number.isSafeInteger(meters) || meters < 0 ||
        typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
      throw new HttpsError('invalid-argument', 'Invalid driver name, score, or browser identifier.');
    }
    const id = createHash('sha256').update(token).digest('hex');
    const reachedAt = Date.now();
    scores = await db.runTransaction(async transaction => {
      const current = (await transaction.get(leaderboard)).get('scores') ?? [];
      const previous = current.find(entry => entry.id === id);
      if (previous && previous.meters >= meters) return current;
      const ranked = current.filter(entry => entry.id !== id);
      ranked.push({ id, name, meters, reachedAt });
      ranked.sort((a, b) => b.meters - a.meters || a.reachedAt - b.reachedAt || a.id.localeCompare(b.id));
      const top = ranked.slice(0, topLimit);
      if (top.some(entry => entry.id === id)) transaction.set(leaderboard, { scores: top });
      return top;
    });
  }

  return { scores: scores.map(({ name, meters }) => ({ name, meters })) };
});
