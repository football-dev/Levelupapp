// Screen templates. Pure functions from state to HTML strings; all
// interaction is wired through data-action attributes handled in app.js.
import { levelProgress, playerXP, streakAtRisk, xpForLevel, WEEKLY_BONUS_XP } from './xp.js';
import { toISODate, mondayOf, addDays, formatWeek } from './dates.js';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const attr = (s) => esc(s);

// ---- shared pieces ---------------------------------------------------------
export function xpBar(totalXP, { large = false, fill = 'var(--sun)' } = {}) {
  const p = levelProgress(totalXP);
  return `
    <div class="xpbar ${large ? 'xpbar--lg' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${p.needed}" aria-valuenow="${p.current}">
      <div class="xpbar__fill" style="--pct:${(p.fraction * 100).toFixed(1)}%; --fill:${attr(fill)}"></div>
      <div class="xpbar__notches"></div>
    </div>
    <div class="xpbar__label"><span>${p.current} / ${p.needed} XP</span><span>${p.remaining} to Lv ${p.level + 1}</span></div>`;
}

export function streakBadge(cat, today) {
  if (!cat.streakCount) return `<span class="streak streak--cold" title="No streak yet">🔥 0</span>`;
  const risk = streakAtRisk(cat.lastActivityDate, today);
  return `<span class="streak ${risk ? 'streak--risk' : ''}" title="${risk ? 'Do something today to keep it' : 'Streak'}">🔥 ${cat.streakCount}</span>`;
}

function taskItem(t, today) {
  const done = t.completedDates.includes(today);
  return `
    <div class="item ${done ? 'item--done' : ''}">
      <button class="item__check" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Untick' : 'Tick'} ${attr(t.title)}" data-action="toggle-task" data-id="${attr(t.id)}">${done ? '✓' : ''}</button>
      <div class="item__body">
        <div class="item__title">${esc(t.title)}</div>
        <div class="item__meta">${t.completedDates.length} day${t.completedDates.length === 1 ? '' : 's'} done</div>
      </div>
      <span class="item__xp">+${t.xpValue}</span>
      <button class="item__more" aria-label="Task options" data-action="task-menu" data-id="${attr(t.id)}">⋯</button>
    </div>`;
}

function goalItem(g, { showCategory, categories } = {}) {
  const cat = showCategory && categories.find((c) => c.id === g.categoryId);
  return `
    <div class="item ${g.completed ? 'item--done' : ''}">
      <button class="item__check" role="checkbox" aria-checked="${g.completed}" aria-label="${g.completed ? 'Untick' : 'Tick'} ${attr(g.title)}" data-action="toggle-goal" data-id="${attr(g.id)}">${g.completed ? '✓' : ''}</button>
      <div class="item__body">
        <div class="item__title">${esc(g.title)}</div>
        ${cat ? `<div class="item__meta">${esc(cat.icon)} ${esc(cat.name)}</div>` : ''}
      </div>
      <span class="item__xp">+${g.xpValue}</span>
      <button class="item__more" aria-label="Goal options" data-action="goal-menu" data-id="${attr(g.id)}">⋯</button>
    </div>`;
}

function milestoneItem(m) {
  return `
    <div class="item item--milestone ${m.achieved ? 'item--done' : ''}">
      <div class="item__check" aria-hidden="true">${m.achieved ? '🏆' : '🎯'}</div>
      <div class="item__body">
        <div class="item__title">${esc(m.title)}</div>
        <div class="item__meta">${m.achieved ? 'Achieved' : `Reach level ${m.targetLevel}`}</div>
      </div>
      <button class="item__more" aria-label="Milestone options" data-action="milestone-menu" data-id="${attr(m.id)}">⋯</button>
    </div>`;
}

// ---- Dashboard -------------------------------------------------------------
export function renderDashboard(state, ctx) {
  const today = toISODate();
  const { categories } = state;
  const total = playerXP(categories);
  const p = levelProgress(total);
  const thisWeek = mondayOf(today);
  const lastWeek = addDays(thisWeek, -7);

  const banners = [];
  if (ctx.showInstallPrompt) {
    banners.push(`
      <div class="panel banner">
        <div class="banner__icon">📲</div>
        <div class="banner__body"><b>Install for the full experience.</b> Tap the Share button in Safari, then <b>Add to Home Screen</b>. Installed apps keep your data safer and open full-screen.</div>
        <button class="btn btn--cream btn--icon" aria-label="Dismiss" data-action="dismiss-install">✕</button>
      </div>`);
  }
  if (categories.length && state.meta.lastReviewedWeek !== thisWeek) {
    const hadGoals = state.weeklyGoals.some((g) => g.weekOf === lastWeek);
    banners.push(`
      <a class="panel panel--tap panel--accent banner" href="#/weekly">
        <div class="banner__icon">🗓️</div>
        <div class="banner__body"><b>New week!</b> ${hadGoals ? 'Review last week’s goals and set this week’s.' : 'Set a few goals for this week.'}</div>
        <span class="btn btn--sun btn--sm">Go</span>
      </a>`);
  }

  const hero = `
    <section class="panel panel--hero">
      <div class="hero-level"><span class="label">Player level</span><span class="num display">${p.level}</span></div>
      ${xpBar(total, { large: true, fill: 'var(--grass)' })}
      <div class="hero-stats">
        <span><b>${total}</b> XP total</span>
        <span><b>${categories.length}</b> ${categories.length === 1 ? 'category' : 'categories'}</span>
        <span><b>${countDoneToday(state, today)}</b> done today</span>
      </div>
    </section>`;

  const panels = categories.map((cat) => {
    const tasks = state.dailyTasks.filter((t) => t.categoryId === cat.id);
    const doneToday = tasks.filter((t) => t.completedDates.includes(today)).length;
    const cp = levelProgress(cat.totalXP);
    return `
      <a class="panel panel--tap" href="#/category/${attr(cat.id)}">
        <div class="panel__row">
          <div class="icon-badge" style="background:${attr(cat.colour)}">${esc(cat.icon)}</div>
          <div style="flex:1;min-width:0">
            <h2 class="panel__title"><span class="name">${esc(cat.name)}</span>${streakBadge(cat, today)}</h2>
            <div class="panel__sub">${tasks.length ? `${doneToday}/${tasks.length} daily tasks done` : 'No daily tasks yet'}</div>
          </div>
          <span class="level-chip">Lv <b>${cp.level}</b></span>
        </div>
        ${xpBar(cat.totalXP, { fill: cat.colour })}
      </a>`;
  }).join('');

  const empty = `
    <section class="panel empty empty--big">
      <div class="big-emoji">🌱</div>
      <h2>Start your first category</h2>
      <p>Coaching, Fitness, Personal, whatever you want to level up. Each one earns XP from daily check-ins and weekly goals.</p>
      <a class="btn btn--block" href="#/category/new">＋ Create a category</a>
    </section>`;

  return `
    <div class="topbar"><h1>Levelling Up</h1></div>
    ${banners.join('')}
    ${hero}
    ${categories.length ? `<div class="section-title">Your stats</div>${panels}
      <a class="btn btn--cream btn--block" href="#/category/new">＋ Add category</a>` : empty}`;
}

function countDoneToday(state, today) {
  return state.dailyTasks.filter((t) => t.completedDates.includes(today)).length;
}

// ---- Category detail -------------------------------------------------------
export function renderCategory(state, cat) {
  const today = toISODate();
  const thisWeek = mondayOf(today);
  const tasks = state.dailyTasks.filter((t) => t.categoryId === cat.id);
  const goals = state.weeklyGoals.filter((g) => g.categoryId === cat.id && g.weekOf === thisWeek);
  const milestones = state.milestones.filter((m) => m.categoryId === cat.id);
  const p = levelProgress(cat.totalXP);
  const doneToday = tasks.filter((t) => t.completedDates.includes(today)).length;
  const allGoalsDone = goals.length > 0 && goals.every((g) => g.completed);

  return `
    <div class="topbar">
      <a class="btn btn--cream btn--icon" href="#/" aria-label="Back">‹</a>
      <h1>${esc(cat.name)}</h1>
      <a class="btn btn--cream btn--icon" href="#/category/${attr(cat.id)}/edit" aria-label="Edit category">✎</a>
    </div>

    <section class="panel panel--hero">
      <div class="panel__row">
        <div class="icon-badge icon-badge--lg" style="background:${attr(cat.colour)}">${esc(cat.icon)}</div>
        <div style="flex:1">
          <div class="hero-level"><span class="label">Level</span><span class="num display">${p.level}</span></div>
        </div>
        ${streakBadge(cat, today)}
      </div>
      ${xpBar(cat.totalXP, { large: true, fill: cat.colour })}
      <div class="stat-grid">
        <div class="stat"><b>${cat.totalXP}</b><span>Total XP</span></div>
        <div class="stat"><b>${cat.streakCount}</b><span>Day streak</span></div>
        <div class="stat"><b>${doneToday}/${tasks.length}</b><span>Today</span></div>
      </div>
    </section>

    <div class="section-title">Today's check-in</div>
    <section class="panel">
      ${tasks.length ? `<div class="list">${tasks.map((t) => taskItem(t, today)).join('')}</div>`
        : `<div class="empty">Add the small things you want to do every day. Each tick earns XP once per day.</div>`}
      <button class="btn btn--cream btn--block" style="margin-top:12px" data-action="add-task" data-category="${attr(cat.id)}">＋ Add daily task</button>
    </section>

    <div class="section-title">This week's goals · ${formatWeek(thisWeek)}</div>
    <section class="panel">
      ${goals.length ? `<div class="list">${goals.map((g) => goalItem(g)).join('')}</div>`
        : `<div class="empty">No goals set for this week yet.</div>`}
      ${goals.length ? `<div class="hint">${allGoalsDone ? `🎉 All done: <b>+${WEEKLY_BONUS_XP} XP</b> consistency bonus awarded.` : `Complete every goal for a <b>+${WEEKLY_BONUS_XP} XP</b> bonus.`}</div>` : ''}
      <button class="btn btn--cream btn--block" style="margin-top:12px" data-action="add-goal" data-category="${attr(cat.id)}" data-week="${thisWeek}">＋ Add weekly goal</button>
    </section>

    <div class="section-title">Milestones</div>
    <section class="panel">
      ${milestones.length ? `<div class="list">${milestones.map(milestoneItem).join('')}</div>`
        : `<div class="empty">Set a level to aim for, like "Run a 10k" at level 5.</div>`}
      <button class="btn btn--cream btn--block" style="margin-top:12px" data-action="add-milestone" data-category="${attr(cat.id)}">＋ Add milestone</button>
    </section>`;
}

// ---- Category form ---------------------------------------------------------
export function renderCategoryForm(cat, { colours, icons }) {
  const isEdit = !!cat;
  const model = cat || { name: '', colour: colours[0], icon: icons[0] };
  return `
    <div class="topbar">
      <a class="btn btn--cream btn--icon" href="${isEdit ? `#/category/${attr(cat.id)}` : '#/'}" aria-label="Back">‹</a>
      <h1>${isEdit ? 'Edit category' : 'New category'}</h1>
    </div>
    <form class="panel" id="category-form" data-id="${attr(model.id || '')}">
      <div class="preview">
        <div class="icon-badge icon-badge--lg" id="cat-preview-icon" style="background:${attr(model.colour)}">${esc(model.icon)}</div>
        <div class="display" id="cat-preview-name" style="font-size:1.3rem">${esc(model.name) || 'Category name'}</div>
      </div>
      <div class="field">
        <label for="cat-name">Name</label>
        <input class="input" id="cat-name" name="name" required maxlength="32" placeholder="e.g. Fitness" value="${attr(model.name)}" autocomplete="off">
      </div>
      <div class="field">
        <label>Colour</label>
        <div class="swatches" id="cat-colours">
          ${colours.map((c) => `<button type="button" class="swatch" style="background:${attr(c)}" data-colour="${attr(c)}" aria-label="${attr(c)}" aria-pressed="${c === model.colour}"></button>`).join('')}
        </div>
        <input type="hidden" name="colour" value="${attr(model.colour)}">
      </div>
      <div class="field">
        <label>Icon</label>
        <div class="icon-grid" id="cat-icons">
          ${icons.map((i) => `<button type="button" data-icon="${attr(i)}" aria-pressed="${i === model.icon}">${esc(i)}</button>`).join('')}
        </div>
        <input class="input" name="icon" id="cat-icon" maxlength="4" placeholder="…or type any emoji" value="${attr(model.icon)}" style="margin-top:8px">
      </div>
      <div class="btn-row">
        <button class="btn" type="submit">${isEdit ? 'Save' : 'Create'}</button>
      </div>
      ${isEdit ? `<div class="danger-zone"><button type="button" class="btn btn--ghost btn--block" data-action="delete-category" data-id="${attr(cat.id)}">Delete category and its history</button></div>` : ''}
    </form>`;
}

// ---- Weekly review ---------------------------------------------------------
export function renderWeekly(state, store) {
  const today = toISODate();
  const thisWeek = mondayOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const { categories } = state;
  if (!categories.length) {
    return `
      <div class="topbar"><h1>Weekly review</h1></div>
      <section class="panel empty empty--big">
        <div class="big-emoji">🗓️</div>
        <h2>Nothing to review yet</h2>
        <p>Create a category first, then set weekly goals for it.</p>
        <a class="btn btn--block" href="#/category/new">＋ Create a category</a>
      </section>`;
  }

  const reviewed = state.meta.lastReviewedWeek === thisWeek;
  const lastGoals = state.weeklyGoals.filter((g) => g.weekOf === lastWeek);
  const lastEarned = weekXP(state, store, lastWeek);

  const reviewSection = `
    <div class="section-title">Last week · ${formatWeek(lastWeek)}</div>
    <section class="panel ${reviewed ? '' : 'panel--accent'}">
      ${lastGoals.length ? groupByCategory(lastGoals, categories, store, lastWeek)
        : `<div class="empty">No goals were set last week.</div>`}
      <div class="stat-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat"><b>${lastGoals.filter((g) => g.completed).length}/${lastGoals.length}</b><span>Goals done</span></div>
        <div class="stat"><b>+${lastEarned}</b><span>XP earned</span></div>
      </div>
      ${reviewed ? `<div class="hint">✓ Reviewed. You can still tick goals you forgot.</div>`
        : `<button class="btn btn--sun btn--block" style="margin-top:12px" data-action="finish-review" data-week="${thisWeek}">Done reviewing, on to this week ›</button>`}
    </section>`;

  const thisGoals = state.weeklyGoals.filter((g) => g.weekOf === thisWeek);
  const thisSection = `
    <div class="section-title">This week · ${formatWeek(thisWeek)}</div>
    <section class="panel">
      ${thisGoals.length ? groupByCategory(thisGoals, categories, store, thisWeek)
        : `<div class="empty">Set 1 to 3 goals per category. Bigger than a daily task, small enough to finish by Sunday.</div>`}
      <div class="hint">Finish every goal in a category for a <b>+${WEEKLY_BONUS_XP} XP</b> bonus.</div>
      <button class="btn btn--block" style="margin-top:12px" data-action="add-goal" data-week="${thisWeek}">＋ Add a goal for this week</button>
    </section>`;

  return `
    <div class="topbar"><h1>Weekly review</h1></div>
    ${reviewSection}
    ${thisSection}`;
}

function groupByCategory(goals, categories, store, weekOf) {
  return categories
    .map((cat) => {
      const mine = goals.filter((g) => g.categoryId === cat.id);
      if (!mine.length) return '';
      const all = mine.every((g) => g.completed);
      const bonus = store.bonusAwarded(cat.id, weekOf);
      return `
        <div class="week-group">
          <div class="week-group__head">
            <span>${esc(cat.icon)}</span><span>${esc(cat.name)}</span><span class="spacer"></span>
            <span class="bonus-pill ${bonus ? '' : 'bonus-pill--pending'}">${bonus ? `+${WEEKLY_BONUS_XP} bonus` : `${mine.filter((g) => g.completed).length}/${mine.length}`}</span>
          </div>
          <div class="list">${mine.map((g) => goalItem(g)).join('')}</div>
          ${all && !bonus ? '' : ''}
        </div>`;
    })
    .join('');
}

function weekXP(state, store, weekOf) {
  const goals = state.weeklyGoals.filter((g) => g.weekOf === weekOf && g.completed);
  const base = goals.reduce((s, g) => s + g.xpValue, 0);
  const bonuses = state.categories.filter((c) => store.bonusAwarded(c.id, weekOf)).length * WEEKLY_BONUS_XP;
  return base + bonuses;
}

// ---- Settings --------------------------------------------------------------
export function renderSettings(state, ctx) {
  const { categories } = state;
  const rows = categories.map((c, i) => `
    <div class="item manage-row">
      <div class="icon-badge" style="background:${attr(c.colour)};width:38px;height:38px;font-size:1.2rem">${esc(c.icon)}</div>
      <span class="name">${esc(c.name)}</span>
      <button class="btn btn--cream btn--icon" aria-label="Move up" data-action="move-category" data-id="${attr(c.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn btn--cream btn--icon" aria-label="Move down" data-action="move-category" data-id="${attr(c.id)}" data-dir="1" ${i === categories.length - 1 ? 'disabled' : ''}>↓</button>
      <a class="btn btn--cream btn--icon" href="#/category/${attr(c.id)}/edit" aria-label="Edit">✎</a>
    </div>`).join('');

  return `
    <div class="topbar"><h1>Settings</h1></div>

    <div class="section-title">Categories</div>
    <section class="panel">
      ${categories.length ? `<div class="list">${rows}</div>` : `<div class="empty">No categories yet.</div>`}
      <a class="btn btn--cream btn--block" style="margin-top:12px" href="#/category/new">＋ Add category</a>
    </section>

    <div class="section-title">Backup</div>
    <section class="panel">
      <p class="hint" style="margin-top:0">Your data lives only on this device. iOS can clear it if the app isn't opened for a week or so, so export a backup regularly.</p>
      <div class="btn-row">
        <button class="btn" data-action="export">⬇︎ Export JSON</button>
        <button class="btn btn--sun" data-action="import">⬆︎ Import JSON</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </section>

    <div class="section-title">About</div>
    <section class="panel">
      <div class="kv"><span>Installed as app</span><span>${ctx.standalone ? 'Yes' : 'No, running in browser'}</span></div>
      <div class="kv"><span>Storage</span><span>${state.storageKind === 'indexeddb' ? 'IndexedDB' : state.storageKind === 'localstorage' ? 'localStorage (fallback)' : 'Memory'}</span></div>
      <div class="kv"><span>Storage protected</span><span>${ctx.persisted ? 'Yes' : 'Best effort'}</span></div>
      <div class="kv"><span>Level curve</span><span>50 × n<sup>1.5</sup> (Lv 2 at ${xpForLevel(1)} XP)</span></div>
      <div class="kv"><span>Version</span><span>${esc(ctx.version)}</span></div>
    </section>

    <section class="panel">
      <button class="btn btn--ghost btn--block" data-action="reset">Reset app and delete all data</button>
    </section>`;
}

export function renderNotFound() {
  return `
    <div class="topbar"><a class="btn btn--cream btn--icon" href="#/" aria-label="Back">‹</a><h1>Not found</h1></div>
    <section class="panel empty">That screen doesn't exist any more.</section>`;
}
