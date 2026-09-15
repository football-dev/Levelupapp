import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup } from '../js/backup.js';

const state = {
  categories: [{ id: 'c1', name: 'Fitness', colour: '#8FD14F', icon: '🏋️', createdAt: '2026-01-01T00:00:00.000Z', order: 0, totalXP: 120, level: 2, streakCount: 3, lastActivityDate: '2026-09-15' }],
  dailyTasks: [{ id: 't1', categoryId: 'c1', title: 'Gym', xpValue: 10, completedDates: ['2026-09-15', '2026-09-14'], createdAt: '2026-01-01T00:00:00.000Z' }],
  weeklyGoals: [{ id: 'g1', categoryId: 'c1', title: '3 sessions', xpValue: 30, weekOf: '2026-09-14', completed: false, createdAt: '2026-01-01T00:00:00.000Z' }],
  milestones: [{ id: 'm1', categoryId: 'c1', title: 'Level 5', targetLevel: 5, achieved: false, achievedAt: null, createdAt: '2026-01-01T00:00:00.000Z' }],
  meta: { id: 'app', lastOpened: '2026-09-15T00:00:00.000Z', lastReviewedWeek: '2026-09-14', weeklyBonuses: { 'c1:2026-09-07': true }, installPromptDismissed: false },
};

test('backup round-trips through JSON', () => {
  const json = JSON.stringify(buildBackup(state));
  const parsed = parseBackup(json);
  assert.equal(parsed.categories[0].totalXP, 120);
  assert.deepEqual(parsed.dailyTasks[0].completedDates, ['2026-09-14', '2026-09-15']);
  assert.equal(parsed.weeklyGoals[0].weekOf, '2026-09-14');
  assert.equal(parsed.milestones[0].targetLevel, 5);
  assert.deepEqual(parsed.meta.weeklyBonuses, { 'c1:2026-09-07': true });
  assert.equal(parsed.meta.lastReviewedWeek, '2026-09-14');
});

test('parseBackup rejects foreign or malformed files', () => {
  assert.throws(() => parseBackup('{"hello":1}'), /not exported by Levelling Up/);
  assert.throws(() => parseBackup({ app: 'levelling-up', version: 99, categories: [], dailyTasks: [], weeklyGoals: [], milestones: [] }), /newer/);
  assert.throws(() => parseBackup({ app: 'levelling-up', version: 1, categories: 'x' }), /missing "categories"/);
  assert.throws(() => parseBackup({ app: 'levelling-up', version: 1, categories: [{ id: 'c' }], dailyTasks: [], weeklyGoals: [], milestones: [] }), /Category 1/);
});

test('parseBackup drops orphaned children and bad dates', () => {
  const parsed = parseBackup({
    app: 'levelling-up', version: 1,
    categories: [{ id: 'c1', name: 'A' }],
    dailyTasks: [{ id: 't1', categoryId: 'c1', title: 'ok', completedDates: ['2026-09-15', 'nope', '2026-09-15'] }, { id: 't2', categoryId: 'ghost', title: 'orphan' }],
    weeklyGoals: [{ id: 'g1', categoryId: 'ghost', title: 'orphan', weekOf: '2026-09-14' }],
    milestones: [],
  });
  assert.equal(parsed.dailyTasks.length, 1);
  assert.deepEqual(parsed.dailyTasks[0].completedDates, ['2026-09-15']);
  assert.equal(parsed.weeklyGoals.length, 0);
  assert.equal(parsed.categories[0].colour, '#8FD14F');
});
