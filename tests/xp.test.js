import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  xpForLevel, levelFromXP, levelProgress, playerXP,
  computeStreak, categoryStreak, streakAtRisk, MAX_LEVEL,
} from '../js/xp.js';

test('xpForLevel follows 50 * n^1.5 rounded', () => {
  assert.equal(xpForLevel(1), 50);
  assert.equal(xpForLevel(2), 141);
  assert.equal(xpForLevel(3), 260);
  assert.equal(xpForLevel(4), 400);
  assert.equal(xpForLevel(10), 1581);
});

test('levelFromXP starts at 1 and crosses thresholds exactly', () => {
  assert.equal(levelFromXP(0), 1);
  assert.equal(levelFromXP(49), 1);
  assert.equal(levelFromXP(50), 2);
  assert.equal(levelFromXP(140), 2);
  assert.equal(levelFromXP(141), 3);
  assert.equal(levelFromXP(-10), 1);
  assert.equal(levelFromXP(undefined), 1);
  assert.equal(levelFromXP(1e12), MAX_LEVEL);
});

test('levelProgress reports progress within the current level', () => {
  assert.deepEqual(levelProgress(0), { level: 1, current: 0, needed: 50, remaining: 50, fraction: 0 });
  const p = levelProgress(100);
  assert.equal(p.level, 2);
  assert.equal(p.current, 50);
  assert.equal(p.needed, 91);
  assert.equal(p.remaining, 41);
  assert.ok(Math.abs(p.fraction - 50 / 91) < 1e-9);
});

test('playerXP sums category XP', () => {
  assert.equal(playerXP([{ totalXP: 10 }, { totalXP: 25 }, {}]), 35);
});

test('computeStreak counts consecutive days ending today', () => {
  const r = computeStreak(['2026-09-13', '2026-09-14', '2026-09-15'], '2026-09-15');
  assert.deepEqual(r, { streakCount: 3, lastActivityDate: '2026-09-15' });
});

test('computeStreak stays alive when yesterday was the last day', () => {
  const r = computeStreak(['2026-09-13', '2026-09-14'], '2026-09-15');
  assert.equal(r.streakCount, 2);
  assert.equal(streakAtRisk(r.lastActivityDate, '2026-09-15'), true);
});

test('computeStreak resets after a missed day', () => {
  const r = computeStreak(['2026-09-10', '2026-09-11'], '2026-09-15');
  assert.deepEqual(r, { streakCount: 0, lastActivityDate: '2026-09-11' });
  assert.equal(streakAtRisk(r.lastActivityDate, '2026-09-15'), false);
});

test('computeStreak ignores duplicates and gaps before the run', () => {
  const r = computeStreak(['2026-09-01', '2026-09-14', '2026-09-14', '2026-09-15'], '2026-09-15');
  assert.equal(r.streakCount, 2);
});

test('computeStreak with no dates', () => {
  assert.deepEqual(computeStreak([], '2026-09-15'), { streakCount: 0, lastActivityDate: null });
});

test('categoryStreak merges dates across tasks', () => {
  const tasks = [
    { completedDates: ['2026-09-14'] },
    { completedDates: ['2026-09-15'] },
    { completedDates: [] },
  ];
  assert.equal(categoryStreak(tasks, '2026-09-15').streakCount, 2);
});
