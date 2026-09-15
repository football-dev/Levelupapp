import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toISODate, addDays, diffDays, mondayOf, formatWeek, parseISODate } from '../js/dates.js';

test('toISODate uses local calendar date', () => {
  assert.equal(toISODate(new Date(2026, 8, 15, 23, 30)), '2026-09-15');
  assert.equal(toISODate(new Date(2026, 0, 1)), '2026-01-01');
});

test('parseISODate round-trips', () => {
  assert.equal(toISODate(parseISODate('2026-02-28')), '2026-02-28');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('diffDays', () => {
  assert.equal(diffDays('2026-09-10', '2026-09-15'), 5);
  assert.equal(diffDays('2026-09-15', '2026-09-10'), -5);
});

test('mondayOf returns the Monday of the ISO week', () => {
  assert.equal(mondayOf('2026-09-15'), '2026-09-14'); // Tuesday
  assert.equal(mondayOf('2026-09-14'), '2026-09-14'); // Monday
  assert.equal(mondayOf('2026-09-20'), '2026-09-14'); // Sunday
  assert.equal(mondayOf('2026-09-21'), '2026-09-21'); // next Monday
});

test('formatWeek labels', () => {
  assert.equal(formatWeek('2026-09-14'), '14 – 20 Sep');
  assert.equal(formatWeek('2026-09-28'), '28 Sep – 4 Oct');
});
