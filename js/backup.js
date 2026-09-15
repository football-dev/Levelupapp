// JSON export / import. The export is the whole AppState plus a version tag,
// so it doubles as the migration path to any future sync backend.
export const BACKUP_VERSION = 1;

export function buildBackup(state) {
  return {
    app: 'levelling-up',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    dailyTasks: state.dailyTasks,
    weeklyGoals: state.weeklyGoals,
    milestones: state.milestones,
    meta: {
      lastOpened: state.meta.lastOpened,
      lastReviewedWeek: state.meta.lastReviewedWeek,
      weeklyBonuses: state.meta.weeklyBonuses || {},
      installPromptDismissed: !!state.meta.installPromptDismissed,
      highestPlayerLevel: state.meta.highestPlayerLevel || 1,
    },
  };
}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Validate and normalise a parsed backup. Throws with a readable message on
 * anything structurally wrong; tolerates missing optional fields.
 */
export function parseBackup(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object') throw new Error('Not a backup file.');
  if (data.app !== 'levelling-up') throw new Error('This file was not exported by Levelling Up.');
  if (!isNum(data.version) || data.version > BACKUP_VERSION) {
    throw new Error(`Backup version ${data.version} is newer than this app understands.`);
  }
  for (const key of ['categories', 'dailyTasks', 'weeklyGoals', 'milestones']) {
    if (!Array.isArray(data[key])) throw new Error(`Backup is missing "${key}".`);
  }

  const categories = data.categories.map((c, i) => {
    if (!isStr(c.id) || !isStr(c.name)) throw new Error(`Category ${i + 1} is malformed.`);
    return {
      id: c.id, name: c.name, colour: isStr(c.colour) ? c.colour : '#8FD14F',
      icon: isStr(c.icon) ? c.icon : '⭐', createdAt: isStr(c.createdAt) ? c.createdAt : new Date().toISOString(),
      order: isNum(c.order) ? c.order : i, totalXP: isNum(c.totalXP) ? Math.max(0, c.totalXP) : 0,
      level: 1, highestLevel: isNum(c.highestLevel) ? c.highestLevel : 1, streakCount: 0, lastActivityDate: null,
    };
  });
  const catIds = new Set(categories.map((c) => c.id));

  const dailyTasks = data.dailyTasks
    .filter((t) => catIds.has(t.categoryId))
    .map((t, i) => {
      if (!isStr(t.id) || !isStr(t.title)) throw new Error(`Daily task ${i + 1} is malformed.`);
      return {
        id: t.id, categoryId: t.categoryId, title: t.title,
        xpValue: isNum(t.xpValue) ? t.xpValue : 10,
        completedDates: Array.isArray(t.completedDates) ? [...new Set(t.completedDates.filter(isISODate))].sort() : [],
        createdAt: isStr(t.createdAt) ? t.createdAt : new Date().toISOString(),
      };
    });

  const weeklyGoals = data.weeklyGoals
    .filter((g) => catIds.has(g.categoryId))
    .map((g, i) => {
      if (!isStr(g.id) || !isStr(g.title) || !isISODate(g.weekOf)) throw new Error(`Weekly goal ${i + 1} is malformed.`);
      return {
        id: g.id, categoryId: g.categoryId, title: g.title,
        xpValue: isNum(g.xpValue) ? g.xpValue : 25, weekOf: g.weekOf, completed: !!g.completed,
        createdAt: isStr(g.createdAt) ? g.createdAt : new Date().toISOString(),
      };
    });

  const milestones = data.milestones
    .filter((m) => catIds.has(m.categoryId))
    .map((m, i) => {
      if (!isStr(m.id) || !isStr(m.title) || !isNum(m.targetLevel)) throw new Error(`Milestone ${i + 1} is malformed.`);
      return {
        id: m.id, categoryId: m.categoryId, title: m.title, targetLevel: m.targetLevel,
        achieved: !!m.achieved, achievedAt: isStr(m.achievedAt) ? m.achievedAt : null,
        createdAt: isStr(m.createdAt) ? m.createdAt : new Date().toISOString(),
      };
    });

  const meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
  return {
    categories, dailyTasks, weeklyGoals, milestones,
    meta: {
      lastOpened: isStr(meta.lastOpened) ? meta.lastOpened : null,
      lastReviewedWeek: isISODate(meta.lastReviewedWeek) ? meta.lastReviewedWeek : null,
      weeklyBonuses: meta.weeklyBonuses && typeof meta.weeklyBonuses === 'object' ? meta.weeklyBonuses : {},
      installPromptDismissed: !!meta.installPromptDismissed,
      highestPlayerLevel: isNum(meta.highestPlayerLevel) ? meta.highestPlayerLevel : 1,
    },
  };
}

export function backupFilename(date = new Date()) {
  const iso = date.toISOString().slice(0, 10);
  return `levelling-up-backup-${iso}.json`;
}
