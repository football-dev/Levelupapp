// XP, levelling and streak maths. Pure functions, no DOM, no storage.
import { addDays, diffDays } from './dates.js';

export const WEEKLY_BONUS_XP = 20;
export const MAX_LEVEL = 99;

/**
 * Cumulative XP needed to *complete* level n (i.e. to reach level n + 1).
 * Everyone starts at level 1 with 0 XP; 50 XP takes you to level 2,
 * 141 to level 3, 260 to level 4, 1000 to level 8 and so on.
 */
export function xpForLevel(n) {
  return Math.round(50 * Math.pow(n, 1.5));
}

export function levelFromXP(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level)) level++;
  return level;
}

/** Progress within the current level, for drawing the XP bar. */
export function levelProgress(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  const level = levelFromXP(xp);
  const start = level === 1 ? 0 : xpForLevel(level - 1);
  const end = xpForLevel(level);
  const needed = end - start;
  const current = Math.min(xp - start, needed);
  return {
    level,
    current,
    needed,
    remaining: Math.max(0, end - xp),
    fraction: needed === 0 ? 1 : Math.min(1, current / needed),
  };
}

export function playerXP(categories) {
  return categories.reduce((sum, c) => sum + (Number(c.totalXP) || 0), 0);
}

/**
 * Streak from a set/array of ISO dates on which something was done.
 * A streak is a run of consecutive days ending today or yesterday
 * (yesterday keeps it alive until the day is out). Anything older is 0.
 */
export function computeStreak(dates, today) {
  const set = new Set(dates);
  if (set.size === 0) return { streakCount: 0, lastActivityDate: null };

  const lastActivityDate = [...set].sort().at(-1);
  let cursor = today;
  if (!set.has(cursor)) {
    cursor = addDays(today, -1);
    if (!set.has(cursor)) return { streakCount: 0, lastActivityDate };
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return { streakCount: streak, lastActivityDate };
}

/**
 * A task's log for a day: `{ date, done, note? }`. `done` defaults to true
 * when absent (the original spec shape), so an entry with `done: false` is a
 * note-only log such as "why I skipped it".
 */
export function completionOn(task, date) {
  return (task.completions || []).find((c) => c.date === date) || null;
}

export function isDoneOn(task, date) {
  const c = completionOn(task, date);
  return !!c && c.done !== false;
}

export function doneDates(task) {
  return (task.completions || []).filter((c) => c.done !== false).map((c) => c.date);
}

/** Streak for a category = days on which at least one of its tasks was completed. */
export function categoryStreak(tasks, today) {
  const dates = tasks.flatMap(doneDates);
  return computeStreak(dates, today);
}

/** True when the streak is alive but nothing has been done today yet. */
export function streakAtRisk(lastActivityDate, today) {
  return !!lastActivityDate && diffDays(lastActivityDate, today) === 1;
}

export function shortId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
