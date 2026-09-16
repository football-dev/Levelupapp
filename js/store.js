// In-memory app state plus every mutation the UI can perform. Each action
// writes through to storage and notifies subscribers. Level-ups and
// milestone achievements are collected in `events` for the UI to celebrate.
import { openStorage } from './db.js';
import { toISODate, mondayOf } from './dates.js';
import {
  levelFromXP, playerXP, categoryStreak, shortId, WEEKLY_BONUS_XP, completionOn,
} from './xp.js';

/** How a category earns XP: 'daily' = habit checklist + streak, 'goals' = weekly goals + milestones. */
export const MODES = ['daily', 'goals'];

/** The v1 category set, created on first launch (and after a reset). No tasks are pre-populated. */
export const SEED_CATEGORIES = [
  { name: 'Career Growth', icon: '💼', colour: '#7EC8E3', mode: 'goals' },
  { name: 'Health', icon: '🏃', colour: '#8FD14F', mode: 'daily' },
  { name: 'Reading/Learning', icon: '📚', colour: '#FFC93C', mode: 'daily' },
  { name: 'Mindset/Discipline', icon: '🧠', colour: '#F2784B', mode: 'daily' },
];

export const DEFAULT_COLOURS = ['#8FD14F', '#FFC93C', '#F2784B', '#7EC8E3', '#C39BD3', '#F58FB0', '#5DADE2', '#A3E4D7'];
export const DEFAULT_ICONS = ['⚽', '🏋️', '📚', '🧠', '💛', '🌱', '🎨', '🎸', '💼', '🏃', '🥗', '🧘', '💰', '🛠️', '🎯', '🍎'];

const META_ID = 'app';

function emptyMeta() {
  return {
    id: META_ID,
    lastOpened: null,
    lastReviewedWeek: null,
    weeklyBonuses: {}, // `${categoryId}:${weekOf}` -> true
    installPromptDismissed: false,
    highestPlayerLevel: 1, // celebrations only fire for a new personal best
    seeded: false, // default categories created once; deleting them is respected
  };
}

export function createStore() {
  const state = {
    categories: [],
    dailyTasks: [],
    weeklyGoals: [],
    milestones: [],
    meta: emptyMeta(),
    storageKind: 'memory',
    ready: false,
  };
  let storage = null;
  const listeners = new Set();
  const events = [];

  const notify = () => listeners.forEach((fn) => fn(state));
  const today = () => toISODate();

  // ---- persistence helpers -------------------------------------------------
  const persist = (store, obj) => storage.put(store, obj);
  const remove = (store, id) => storage.delete(store, id);
  const persistMeta = () => persist('meta', state.meta);

  // ---- derived -----------------------------------------------------------
  function recalcCategory(cat) {
    if (!MODES.includes(cat.mode)) cat.mode = 'daily';
    const tasks = state.dailyTasks.filter((t) => t.categoryId === cat.id);
    const { streakCount, lastActivityDate } = categoryStreak(tasks, today());
    // Streaks are a daily-habit concept; project-style categories don't carry one.
    cat.streakCount = cat.mode === 'goals' ? 0 : streakCount;
    cat.lastActivityDate = lastActivityDate;
    cat.level = levelFromXP(cat.totalXP);
  }

  /** Upgrade records written by earlier versions of the app. */
  function migrate() {
    for (const t of state.dailyTasks) {
      if (!Array.isArray(t.completions)) {
        t.completions = (t.completedDates || []).map((date) => ({ date, done: true }));
        delete t.completedDates;
        t._dirty = true;
      }
    }
  }

  async function seedDefaults() {
    const now = new Date().toISOString();
    state.categories = SEED_CATEGORIES.map((c, i) => ({
      id: shortId(), ...c, createdAt: now, order: i,
      totalXP: 0, level: 1, highestLevel: 1, streakCount: 0, lastActivityDate: null,
    }));
    await storage.putMany('categories', state.categories);
    state.meta.seeded = true;
  }

  function recalcAll() {
    state.categories.forEach(recalcCategory);
  }

  function snapshotLevels() {
    return {
      player: levelFromXP(playerXP(state.categories)),
      cats: Object.fromEntries(state.categories.map((c) => [c.id, levelFromXP(c.totalXP)])),
    };
  }

  /**
   * Compare levels before/after an XP change and queue celebration events.
   * A level-up only celebrates when it beats the previous best, so unticking
   * and re-ticking a task the same day doesn't replay the fanfare.
   */
  async function detectLevelUps(before) {
    const after = snapshotLevels();
    let metaDirty = false;
    for (const cat of state.categories) {
      const was = before.cats[cat.id];
      const now = after.cats[cat.id];
      const best = cat.highestLevel || 1;
      if (was !== undefined && now > was && now > best) {
        events.push({ type: 'category', category: cat, from: was, to: now });
      }
      if (now > best) {
        cat.highestLevel = now;
        await persist('categories', cat);
      }
      // Milestones whose target level has now been reached.
      for (const m of state.milestones) {
        if (m.categoryId === cat.id && !m.achieved && after.cats[cat.id] >= m.targetLevel) {
          m.achieved = true;
          m.achievedAt = new Date().toISOString();
          await persist('milestones', m);
          events.push({ type: 'milestone', category: cat, milestone: m });
        }
      }
    }
    const bestPlayer = state.meta.highestPlayerLevel || 1;
    if (after.player > before.player && after.player > bestPlayer) {
      events.push({ type: 'player', from: before.player, to: after.player });
    }
    if (after.player > bestPlayer) {
      state.meta.highestPlayerLevel = after.player;
      metaDirty = true;
    }
    if (metaDirty) await persistMeta();
  }

  async function addXP(categoryId, amount) {
    const cat = state.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    cat.totalXP = Math.max(0, (cat.totalXP || 0) + amount);
    recalcCategory(cat);
    await persist('categories', cat);
  }

  // ---- public API --------------------------------------------------------
  const api = {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    takeEvents() { return events.splice(0, events.length); },

    async init() {
      storage = await openStorage();
      state.storageKind = storage.kind;
      const [categories, dailyTasks, weeklyGoals, milestones, metas] = await Promise.all([
        storage.getAll('categories'), storage.getAll('dailyTasks'), storage.getAll('weeklyGoals'),
        storage.getAll('milestones'), storage.getAll('meta'),
      ]);
      state.categories = categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
      state.dailyTasks = dailyTasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      state.weeklyGoals = weeklyGoals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      state.milestones = milestones.sort((a, b) => a.targetLevel - b.targetLevel);
      state.meta = { ...emptyMeta(), ...(metas.find((m) => m.id === META_ID) || {}) };
      migrate();
      const dirty = state.dailyTasks.filter((t) => t._dirty);
      if (dirty.length) {
        dirty.forEach((t) => delete t._dirty);
        await storage.putMany('dailyTasks', dirty);
      }
      if (!state.categories.length && !state.meta.seeded) await seedDefaults();
      recalcAll();
      state.categories.forEach((c) => { c.highestLevel = Math.max(c.highestLevel || 1, c.level); });
      state.meta.highestPlayerLevel = Math.max(state.meta.highestPlayerLevel || 1, levelFromXP(playerXP(state.categories)));
      state.meta.lastOpened = new Date().toISOString();
      await persistMeta();
      state.ready = true;
      notify();
    },

    /** Re-derive streaks (call when the date may have changed, e.g. app resumed). */
    refresh() { recalcAll(); notify(); },

    // ---- categories ----
    async addCategory({ name, colour, icon, mode = 'daily' }) {
      const cat = {
        id: shortId(), name: name.trim(), colour, icon, mode: MODES.includes(mode) ? mode : 'daily',
        createdAt: new Date().toISOString(),
        order: state.categories.length,
        totalXP: 0, level: 1, highestLevel: 1, streakCount: 0, lastActivityDate: null,
      };
      state.categories.push(cat);
      await persist('categories', cat);
      notify();
      return cat;
    },

    async updateCategory(id, patch) {
      const cat = state.categories.find((c) => c.id === id);
      if (!cat) return;
      Object.assign(cat, patch, { name: (patch.name ?? cat.name).trim() });
      recalcCategory(cat);
      await persist('categories', cat);
      notify();
    },

    async deleteCategory(id) {
      state.categories = state.categories.filter((c) => c.id !== id);
      const goneTasks = state.dailyTasks.filter((t) => t.categoryId === id);
      const goneGoals = state.weeklyGoals.filter((g) => g.categoryId === id);
      const goneMs = state.milestones.filter((m) => m.categoryId === id);
      state.dailyTasks = state.dailyTasks.filter((t) => t.categoryId !== id);
      state.weeklyGoals = state.weeklyGoals.filter((g) => g.categoryId !== id);
      state.milestones = state.milestones.filter((m) => m.categoryId !== id);
      await remove('categories', id);
      await Promise.all([
        ...goneTasks.map((t) => remove('dailyTasks', t.id)),
        ...goneGoals.map((g) => remove('weeklyGoals', g.id)),
        ...goneMs.map((m) => remove('milestones', m.id)),
      ]);
      for (const key of Object.keys(state.meta.weeklyBonuses)) {
        if (key.startsWith(`${id}:`)) delete state.meta.weeklyBonuses[key];
      }
      await persistMeta();
      notify();
    },

    async moveCategory(id, direction) {
      const idx = state.categories.findIndex((c) => c.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= state.categories.length) return;
      const [cat] = state.categories.splice(idx, 1);
      state.categories.splice(target, 0, cat);
      state.categories.forEach((c, i) => { c.order = i; });
      await storage.putMany('categories', state.categories);
      notify();
    },

    // ---- daily tasks ----
    async addTask({ categoryId, title, xpValue }) {
      const task = {
        id: shortId(), categoryId, title: title.trim(),
        xpValue: clampXP(xpValue), completions: [],
        createdAt: new Date().toISOString(),
      };
      state.dailyTasks.push(task);
      await persist('dailyTasks', task);
      notify();
      return task;
    },

    async updateTask(id, patch) {
      const task = state.dailyTasks.find((t) => t.id === id);
      if (!task) return;
      if (patch.title !== undefined) task.title = patch.title.trim();
      if (patch.xpValue !== undefined) task.xpValue = clampXP(patch.xpValue);
      await persist('dailyTasks', task);
      notify();
    },

    async deleteTask(id) {
      const task = state.dailyTasks.find((t) => t.id === id);
      if (!task) return;
      state.dailyTasks = state.dailyTasks.filter((t) => t.id !== id);
      await remove('dailyTasks', task.id);
      const cat = state.categories.find((c) => c.id === task.categoryId);
      if (cat) { recalcCategory(cat); await persist('categories', cat); }
      notify();
    },

    /** Tick or untick a daily task for today. XP is awarded at most once per day per task. */
    async toggleTaskToday(id) {
      const task = state.dailyTasks.find((t) => t.id === id);
      if (!task) return;
      const day = today();
      const before = snapshotLevels();
      const entry = completionOn(task, day);
      if (entry && entry.done !== false) {
        // Untick. Keep the entry if it carries a note, otherwise drop it.
        if (entry.note) entry.done = false;
        else task.completions = task.completions.filter((c) => c !== entry);
        await persist('dailyTasks', task);
        await addXP(task.categoryId, -task.xpValue);
      } else {
        if (entry) entry.done = true;
        else task.completions = [...task.completions, { date: day, done: true }].sort((a, b) => a.date.localeCompare(b.date));
        await persist('dailyTasks', task);
        await addXP(task.categoryId, task.xpValue);
      }
      await detectLevelUps(before);
      notify();
    },

    /** Attach a free-text note to a task's log for a day. Notes aren't scored. */
    async setTaskNote(id, date, note) {
      const task = state.dailyTasks.find((t) => t.id === id);
      if (!task) return;
      const text = (note || '').trim().slice(0, 500);
      const entry = completionOn(task, date);
      if (entry) {
        if (text) entry.note = text;
        else if (entry.done !== false) delete entry.note;
        else task.completions = task.completions.filter((c) => c !== entry);
      } else if (text) {
        task.completions = [...task.completions, { date, done: false, note: text }].sort((a, b) => a.date.localeCompare(b.date));
      }
      await persist('dailyTasks', task);
      notify();
    },

    // ---- weekly goals ----
    async addGoal({ categoryId, title, xpValue, weekOf }) {
      const goal = {
        id: shortId(), categoryId, title: title.trim(),
        xpValue: clampXP(xpValue), weekOf: weekOf || mondayOf(today()),
        completed: false, createdAt: new Date().toISOString(),
      };
      state.weeklyGoals.push(goal);
      await persist('weeklyGoals', goal);
      // Adding an open goal to a fully-completed week withdraws that week's bonus.
      await reconcileBonus(goal.categoryId, goal.weekOf);
      notify();
      return goal;
    },

    async updateGoal(id, patch) {
      const goal = state.weeklyGoals.find((g) => g.id === id);
      if (!goal) return;
      if (patch.title !== undefined) goal.title = patch.title.trim();
      if (patch.xpValue !== undefined) goal.xpValue = clampXP(patch.xpValue);
      await persist('weeklyGoals', goal);
      notify();
    },

    async deleteGoal(id) {
      const goal = state.weeklyGoals.find((g) => g.id === id);
      if (!goal) return;
      state.weeklyGoals = state.weeklyGoals.filter((g) => g.id !== id);
      await remove('weeklyGoals', id);
      await reconcileBonus(goal.categoryId, goal.weekOf);
      notify();
    },

    async toggleGoal(id) {
      const goal = state.weeklyGoals.find((g) => g.id === id);
      if (!goal) return;
      const before = snapshotLevels();
      goal.completed = !goal.completed;
      await persist('weeklyGoals', goal);
      await addXP(goal.categoryId, goal.completed ? goal.xpValue : -goal.xpValue);
      await reconcileBonus(goal.categoryId, goal.weekOf);
      await detectLevelUps(before);
      notify();
    },

    bonusAwarded(categoryId, weekOf) {
      return !!state.meta.weeklyBonuses[`${categoryId}:${weekOf}`];
    },

    async markWeekReviewed(weekOf) {
      state.meta.lastReviewedWeek = weekOf;
      await persistMeta();
      notify();
    },

    // ---- milestones ----
    async addMilestone({ categoryId, title, targetLevel }) {
      const cat = state.categories.find((c) => c.id === categoryId);
      const level = Math.max(2, Math.min(99, Math.round(Number(targetLevel) || 2)));
      const m = {
        id: shortId(), categoryId, title: title.trim(), targetLevel: level,
        achieved: false, achievedAt: null, createdAt: new Date().toISOString(),
      };
      if (cat && levelFromXP(cat.totalXP) >= level) {
        m.achieved = true;
        m.achievedAt = new Date().toISOString();
      }
      state.milestones.push(m);
      state.milestones.sort((a, b) => a.targetLevel - b.targetLevel);
      await persist('milestones', m);
      notify();
      return m;
    },

    async deleteMilestone(id) {
      state.milestones = state.milestones.filter((m) => m.id !== id);
      await remove('milestones', id);
      notify();
    },

    // ---- misc ----
    async dismissInstallPrompt() {
      state.meta.installPromptDismissed = true;
      await persistMeta();
      notify();
    },

    /** Replace everything with an imported snapshot (already validated). */
    async replaceAll(snapshot) {
      await Promise.all(['categories', 'dailyTasks', 'weeklyGoals', 'milestones', 'meta'].map((s) => storage.clear(s)));
      state.categories = snapshot.categories;
      state.dailyTasks = snapshot.dailyTasks;
      state.weeklyGoals = snapshot.weeklyGoals;
      state.milestones = snapshot.milestones;
      state.meta = { ...emptyMeta(), ...snapshot.meta, id: META_ID, seeded: true };
      migrate();
      state.dailyTasks.forEach((t) => delete t._dirty);
      recalcAll();
      await Promise.all([
        storage.putMany('categories', state.categories),
        storage.putMany('dailyTasks', state.dailyTasks),
        storage.putMany('weeklyGoals', state.weeklyGoals),
        storage.putMany('milestones', state.milestones),
        persistMeta(),
      ]);
      notify();
    },

    /** Back to the fresh-install state: the four default categories, nothing else. */
    async resetAll() {
      await api.replaceAll({ categories: [], dailyTasks: [], weeklyGoals: [], milestones: [], meta: emptyMeta() });
      await seedDefaults();
      await persistMeta();
      notify();
    },
  };

  /**
   * Award the +20 XP consistency bonus when every goal a category set for a
   * week is complete; withdraw it if that stops being true.
   */
  async function reconcileBonus(categoryId, weekOf) {
    const key = `${categoryId}:${weekOf}`;
    const goals = state.weeklyGoals.filter((g) => g.categoryId === categoryId && g.weekOf === weekOf);
    const allDone = goals.length > 0 && goals.every((g) => g.completed);
    const has = !!state.meta.weeklyBonuses[key];
    if (allDone && !has) {
      state.meta.weeklyBonuses[key] = true;
      await addXP(categoryId, WEEKLY_BONUS_XP);
      await persistMeta();
      events.push({ type: 'bonus', category: state.categories.find((c) => c.id === categoryId), weekOf });
    } else if (!allDone && has) {
      delete state.meta.weeklyBonuses[key];
      await addXP(categoryId, -WEEKLY_BONUS_XP);
      await persistMeta();
    }
  }

  return api;
}

function clampXP(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(500, n));
}
