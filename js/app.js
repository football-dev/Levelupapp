// App bootstrap: routing, event delegation, modals, celebrations, backups.
import { createStore, DEFAULT_COLOURS, DEFAULT_ICONS } from './store.js';
import { buildBackup, parseBackup, backupFilename } from './backup.js';
import { requestPersistence } from './db.js';
import { mondayOf, toISODate, formatShort } from './dates.js';
import { completionOn, isDoneOn } from './xp.js';
import {
  esc, renderDashboard, renderCategory, renderCategoryForm, renderWeekly, renderSettings, renderNotFound,
} from './ui.js';

const VERSION = '1.2.0';
const BUILD = '__BUILD__'; // stamped by CI with the deployed commit
const store = createStore();
const screenEl = document.getElementById('screen');
const modalRoot = document.getElementById('modal-root');
const celebrationRoot = document.getElementById('celebration-root');
const toastRoot = document.getElementById('toast-root');

const ctx = {
  version: VERSION,
  build: BUILD.startsWith('__') ? 'dev' : BUILD,
  updateReady: false,
  standalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
  isIOS: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  persisted: false,
  get showInstallPrompt() {
    return this.isIOS && !this.standalone && !store.state.meta.installPromptDismissed;
  },
};

// ---- Router ----------------------------------------------------------------
function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'weekly') return { name: 'weekly' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'category') {
    if (parts[1] === 'new') return { name: 'category-new' };
    if (parts[1] && parts[2] === 'edit') return { name: 'category-edit', id: parts[1] };
    if (parts[1]) return { name: 'category', id: parts[1] };
  }
  return { name: 'not-found' };
}

let lastRouteName = null;
function render() {
  if (!store.state.ready) return;
  const r = route();
  const { state } = store;
  let html;
  let tab = null;
  switch (r.name) {
    case 'home': html = renderDashboard(state, ctx); tab = 'home'; break;
    case 'weekly': html = renderWeekly(state, store); tab = 'weekly'; break;
    case 'settings': html = renderSettings(state, ctx); tab = 'settings'; break;
    case 'category-new': html = renderCategoryForm(null, { colours: DEFAULT_COLOURS, icons: DEFAULT_ICONS }); tab = 'home'; break;
    case 'category':
    case 'category-edit': {
      const cat = state.categories.find((c) => c.id === r.id);
      if (!cat) { html = renderNotFound(); break; }
      tab = 'home';
      html = r.name === 'category' ? renderCategory(state, cat) : renderCategoryForm(cat, { colours: DEFAULT_COLOURS, icons: DEFAULT_ICONS });
      break;
    }
    default: html = renderNotFound();
  }
  screenEl.innerHTML = html;
  document.querySelectorAll('.tab').forEach((el) => {
    if (el.dataset.tab === tab) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  if (r.name !== lastRouteName) window.scrollTo(0, 0);
  lastRouteName = r.name;
  celebratePending();
}

window.addEventListener('hashchange', render);
store.subscribe(render);

// ---- Modals ----------------------------------------------------------------
function openModal({ title, body, submitLabel = 'Save', danger, onSubmit }) {
  closeModal();
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close>
      <form class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        ${body}
        <div class="btn-row">
          <button type="button" class="btn btn--cream" data-close>Cancel</button>
          ${onSubmit ? `<button type="submit" class="btn">${esc(submitLabel)}</button>` : ''}
        </div>
        ${danger ? `<div class="danger-zone"><button type="button" class="btn btn--ghost btn--block" data-danger>${esc(danger.label)}</button></div>` : ''}
      </form>
    </div>`;
  const form = modalRoot.querySelector('form');
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await onSubmit(data, form);
      closeModal();
    } catch (err) {
      toast(err.message || 'Something went wrong');
    }
  });
  if (danger) {
    form.querySelector('[data-danger]').addEventListener('click', async () => {
      if (!confirm(danger.confirm)) return;
      await danger.onClick();
      closeModal();
    });
  }
  const first = form.querySelector('input:not([type=hidden]), textarea');
  if (first) setTimeout(() => first.focus(), 50);
}
function closeModal() { modalRoot.innerHTML = ''; }

const textField = (name, label, value = '', { placeholder = '', required = true, maxlength = 60 } = {}) => `
  <div class="field"><label for="f-${name}">${esc(label)}</label>
  <input class="input" id="f-${name}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} maxlength="${maxlength}" autocomplete="off"></div>`;
const xpField = (value = 10) => `
  <div class="field"><label for="f-xp">XP value</label>
  <input class="input" id="f-xp" name="xpValue" type="number" inputmode="numeric" min="1" max="500" value="${value}" required></div>`;
const categoryField = (selected) => `
  <div class="field"><label for="f-cat">Category</label>
  <select class="input" id="f-cat" name="categoryId" required>
    ${store.state.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
  </select></div>`;

// ---- Actions ---------------------------------------------------------------
const actions = {
  'toggle-task': ({ id }) => store.toggleTaskToday(id).then(() => flashXP(id, 'task')),
  'toggle-goal': ({ id }) => store.toggleGoal(id).then(() => flashXP(id, 'goal')),
  'dismiss-install': () => store.dismissInstallPrompt(),
  'finish-review': ({ week }) => store.markWeekReviewed(week).then(() => toast('Week reviewed. Go get it. 💪')),
  'move-category': ({ id, dir }) => store.moveCategory(id, Number(dir)),

  'add-task': ({ category }) => openModal({
    title: 'New daily task',
    body: textField('title', 'Task', '', { placeholder: 'e.g. 20 min walk' }) + xpField(10),
    submitLabel: 'Add',
    onSubmit: (d) => store.addTask({ categoryId: category, title: d.title, xpValue: d.xpValue }),
  }),
  'task-note': ({ id }) => {
    const t = store.state.dailyTasks.find((x) => x.id === id);
    if (!t) return;
    const day = toISODate();
    const entry = completionOn(t, day);
    openModal({
      title: t.title,
      body: `
        <p class="hint" style="margin-top:0">${formatShort(day)} · ${isDoneOn(t, day) ? 'done ✓' : 'not ticked yet'}. A note is just a log, it doesn't change XP.</p>
        <div class="field"><label for="f-note">Note for today</label>
        <textarea class="input input--note" id="f-note" name="note" maxlength="500" placeholder="How it went, or why you skipped it">${esc(entry && entry.note ? entry.note : '')}</textarea></div>`,
      submitLabel: 'Save note',
      onSubmit: (d) => store.setTaskNote(id, day, d.note),
    });
  },
  'task-menu': ({ id }) => {
    const t = store.state.dailyTasks.find((x) => x.id === id);
    if (!t) return;
    openModal({
      title: 'Edit task',
      body: textField('title', 'Task', t.title) + xpField(t.xpValue),
      onSubmit: (d) => store.updateTask(id, { title: d.title, xpValue: d.xpValue }),
      danger: { label: 'Delete task', confirm: `Delete "${t.title}"? XP already earned stays.`, onClick: () => store.deleteTask(id) },
    });
  },

  'add-goal': ({ category, week }) => {
    if (!store.state.categories.length) return toast('Create a category first');
    openModal({
      title: 'New weekly goal',
      body: (category ? '' : categoryField()) + textField('title', 'Goal', '', { placeholder: 'e.g. 3 gym sessions' }) + xpField(30),
      submitLabel: 'Add',
      onSubmit: (d) => store.addGoal({ categoryId: category || d.categoryId, title: d.title, xpValue: d.xpValue, weekOf: week }),
    });
  },
  'goal-menu': ({ id }) => {
    const g = store.state.weeklyGoals.find((x) => x.id === id);
    if (!g) return;
    openModal({
      title: 'Edit goal',
      body: textField('title', 'Goal', g.title) + xpField(g.xpValue),
      onSubmit: (d) => store.updateGoal(id, { title: d.title, xpValue: d.xpValue }),
      danger: { label: 'Delete goal', confirm: `Delete "${g.title}"?`, onClick: () => store.deleteGoal(id) },
    });
  },

  'add-milestone': ({ category }) => openModal({
    title: 'New milestone',
    body: textField('title', 'Milestone', '', { placeholder: 'e.g. Run a 10k' }) + `
      <div class="field"><label for="f-level">Reached at level</label>
      <input class="input" id="f-level" name="targetLevel" type="number" inputmode="numeric" min="2" max="99" value="5" required></div>`,
    submitLabel: 'Add',
    onSubmit: (d) => store.addMilestone({ categoryId: category, title: d.title, targetLevel: d.targetLevel }),
  }),
  'milestone-menu': ({ id }) => {
    const m = store.state.milestones.find((x) => x.id === id);
    if (!m) return;
    openModal({
      title: m.title,
      body: `<p class="hint" style="margin-top:0">${m.achieved ? `Achieved ${m.achievedAt ? new Date(m.achievedAt).toLocaleDateString('en-AU') : ''}` : `Unlocks at level ${m.targetLevel}.`}</p>`,
      danger: { label: 'Delete milestone', confirm: `Delete "${m.title}"?`, onClick: () => store.deleteMilestone(id) },
    });
  },

  'delete-category': async ({ id }) => {
    const cat = store.state.categories.find((c) => c.id === id);
    if (!cat) return;
    if (!confirm(`Delete "${cat.name}" and all of its tasks, goals and milestones? This can't be undone.`)) return;
    await store.deleteCategory(id);
    location.hash = '#/';
    toast('Category deleted');
  },

  'check-updates': checkForUpdates,
  'apply-update': applyUpdate,
  export: exportBackup,
  import: () => openModal({
    title: 'Import backup',
    body: `
      <p class="hint" style="margin-top:0">Importing <b>replaces</b> everything currently in the app. Export first if unsure.</p>
      <div class="btn-row" style="margin-top:12px"><button type="button" class="btn btn--cream" id="pick-file">Choose file…</button></div>
      <div class="field"><label for="f-json">Or paste the backup JSON</label>
      <textarea class="input" id="f-json" name="json" placeholder="{ &quot;app&quot;: &quot;levelling-up&quot;, … }"></textarea></div>`,
    submitLabel: 'Import',
    onSubmit: async (d) => {
      if (!d.json.trim()) throw new Error('Paste a backup or choose a file.');
      await importBackup(d.json);
    },
  }),
  reset: async () => {
    if (!confirm('Delete every category, task, goal and milestone? This can’t be undone.')) return;
    if (!confirm('Really reset? Consider exporting a backup first.')) return;
    await store.resetAll();
    location.hash = '#/';
    toast('App reset');
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(el.dataset, el);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Something went wrong');
  }
});

// Import via file picker lives inside the modal, so bind it on open.
modalRoot.addEventListener('click', (e) => {
  if (e.target.id !== 'pick-file') return;
  const input = document.getElementById('import-file') || Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json', hidden: true, id: 'import-file' });
  if (!input.isConnected) document.body.appendChild(input);
  input.value = '';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      await importBackup(await file.text());
      closeModal();
    } catch (err) {
      toast(err.message);
    }
  };
  input.click();
});

// ---- Category form (a full screen, not a modal) ------------------------------
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id !== 'category-form') return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form).entries());
  const icon = (d.icon || '').trim() || DEFAULT_ICONS[0];
  if (!d.name.trim()) return toast('Give it a name');
  const mode = d.mode === 'goals' ? 'goals' : 'daily';
  if (form.dataset.id) {
    await store.updateCategory(form.dataset.id, { name: d.name, colour: d.colour, icon, mode });
    location.hash = `#/category/${form.dataset.id}`;
  } else {
    const cat = await store.addCategory({ name: d.name, colour: d.colour, icon, mode });
    location.hash = `#/category/${cat.id}`;
    toast(mode === 'goals' ? 'Category created. Set a goal for this week to start earning XP.' : 'Category created. Add a daily task to start earning XP.');
  }
});
document.addEventListener('click', (e) => {
  const sw = e.target.closest('#cat-colours .swatch');
  const ic = e.target.closest('#cat-icons button');
  if (!sw && !ic) return;
  const form = e.target.closest('form');
  if (sw) {
    form.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', b === sw));
    form.querySelector('[name=colour]').value = sw.dataset.colour;
    form.querySelector('#cat-preview-icon').style.background = sw.dataset.colour;
  } else {
    form.querySelectorAll('#cat-icons button').forEach((b) => b.setAttribute('aria-pressed', b === ic));
    form.querySelector('#cat-icon').value = ic.dataset.icon;
    form.querySelector('#cat-preview-icon').textContent = ic.dataset.icon;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'cat-name') {
    document.getElementById('cat-preview-name').textContent = e.target.value.trim() || 'Category name';
  } else if (e.target.id === 'cat-icon') {
    const v = e.target.value.trim();
    if (v) document.getElementById('cat-preview-icon').textContent = v;
    document.querySelectorAll('#cat-icons button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.icon === v));
  }
});

// ---- Backups ---------------------------------------------------------------
async function exportBackup() {
  const json = JSON.stringify(buildBackup(store.state), null, 2);
  const name = backupFilename();
  const blob = new Blob([json], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Levelling Up backup' });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup exported');
}

async function importBackup(text) {
  const snapshot = parseBackup(text);
  if (!confirm(`Import ${snapshot.categories.length} categories and replace current data?`)) return;
  await store.replaceAll(snapshot);
  location.hash = '#/';
  toast('Backup imported');
}

// ---- Updates ------------------------------------------------------------------
let swReg = null;
let reloading = false;

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.warn('SW registration failed', err);
    return;
  }
  const watch = (worker) => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) announceUpdate();
    });
  };
  if (swReg.waiting && navigator.serviceWorker.controller) announceUpdate();
  watch(swReg.installing);
  swReg.addEventListener('updatefound', () => watch(swReg.installing));
  // On the very first visit the new worker claims the page (clients.claim);
  // that's not an update, so only reload when a worker was already in charge.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    try { sessionStorage.setItem('lu-updated', '1'); } catch { /* ignore */ }
    location.reload();
  });
}

function announceUpdate() {
  if (ctx.updateReady) return;
  ctx.updateReady = true;
  toast('Update ready. Tap to refresh', { ms: 8000, action: applyUpdate });
  if (route().name === 'settings') render();
}

/** Switch to the waiting service worker; the controllerchange handler reloads. */
async function applyUpdate() {
  if (swReg && swReg.waiting) {
    swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  location.reload();
}

function askWorker(message) {
  return new Promise((resolve) => {
    const worker = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!worker) return resolve(null);
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 15000);
    channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    worker.postMessage(message, [channel.port2]);
  });
}

/**
 * Settings → Check for updates. Looks for a new service worker (a new deploy),
 * and if there is one switches to it. Otherwise re-fetches the shell files
 * from the network into the cache and reloads, so a same-build change still
 * lands. Either way the user sees the latest code within a few seconds.
 */
async function checkForUpdates(_, el) {
  if (el) { el.disabled = true; el.textContent = 'Checking…'; }
  try {
    if (!swReg) { location.reload(); return; }
    await swReg.update();
    // Give a freshly-found worker a moment to install.
    for (let i = 0; i < 20 && swReg.installing; i++) await new Promise((r) => setTimeout(r, 250));
    if (swReg.waiting) { await applyUpdate(); return; }
    const res = await askWorker({ type: 'REFRESH_SHELL' });
    if (res && res.ok === false) throw new Error('Couldn’t reach the server. Check your connection and try again.');
    try { sessionStorage.setItem('lu-updated', '1'); } catch { /* ignore */ }
    reloading = true;
    location.reload();
  } catch (err) {
    toast(err.message || 'Update check failed');
    if (el) { el.disabled = false; el.textContent = '⟳ Check for updates'; }
  }
}

// ---- Feedback ----------------------------------------------------------------
function toast(message, { xp = false, ms = 2200, action = null } = {}) {
  const el = document.createElement(action ? 'button' : 'div');
  el.className = `toast ${xp ? 'toast--xp' : ''} ${action ? 'toast--action' : ''}`;
  el.textContent = message;
  if (action) el.addEventListener('click', () => { el.remove(); action(); });
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function flashXP(id, kind) {
  const list = kind === 'task' ? store.state.dailyTasks : store.state.weeklyGoals;
  const item = list.find((x) => x.id === id);
  if (!item) return;
  const done = kind === 'task' ? isDoneOn(item, toISODate()) : item.completed;
  if (done) toast(`+${item.xpValue} XP`, { xp: true, ms: 1200 });
}

const celebrationQueue = [];
let celebrating = false;
function celebratePending() {
  celebrationQueue.push(...store.takeEvents());
  if (!celebrating) nextCelebration();
}
function nextCelebration() {
  const ev = celebrationQueue.shift();
  if (!ev) { celebrating = false; celebrationRoot.innerHTML = ''; return; }
  celebrating = true;
  if (ev.type === 'bonus') {
    toast(`Weekly bonus! +20 XP for ${ev.category ? ev.category.name : 'your goals'}`, { xp: true, ms: 2600 });
    return nextCelebration();
  }
  const burst = Array.from({ length: 26 }, (_, i) => {
    const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 110 + Math.random() * 160;
    const c = ['var(--sun)', 'var(--grass)', 'var(--coral)', '#fff'][i % 4];
    return `<i class="${i % 3 ? '' : 'star'}" style="--x:${Math.cos(angle) * dist}px;--y:${Math.sin(angle) * dist}px;--r:${Math.round(Math.random() * 360)}deg;--c:${c};--d:${(Math.random() * 0.25).toFixed(2)}s"></i>`;
  }).join('');
  let inner;
  if (ev.type === 'player') {
    inner = `
      <div class="celebrate__kicker">Player</div>
      <div class="celebrate__title">LEVEL UP!</div>
      <div class="celebrate__icon">🌟</div>
      <div class="celebrate__level"><span>Lv ${ev.from}</span><span>→</span><span class="to">Lv ${ev.to}</span></div>
      <div class="celebrate__body">Every stat counts. Keep stacking.</div>`;
  } else if (ev.type === 'milestone') {
    inner = `
      <div class="celebrate__kicker">Milestone</div>
      <div class="celebrate__title">ACHIEVED!</div>
      <div class="celebrate__icon">🏆</div>
      <div class="celebrate__body"><b>${esc(ev.milestone.title)}</b><br>${esc(ev.category.icon)} ${esc(ev.category.name)} reached level ${ev.milestone.targetLevel}.</div>`;
  } else {
    inner = `
      <div class="celebrate__kicker">${esc(ev.category.name)}</div>
      <div class="celebrate__title">LEVEL UP!</div>
      <div class="celebrate__icon">${esc(ev.category.icon)}</div>
      <div class="celebrate__level"><span>Lv ${ev.from}</span><span>→</span><span class="to">Lv ${ev.to}</span></div>
      <div class="celebrate__body">Nice one. That's real progress.</div>`;
  }
  celebrationRoot.innerHTML = `
    <div class="celebrate" role="dialog" aria-label="Level up">
      <div class="burst">${burst}</div>
      <div class="celebrate__card">${inner}<div class="celebrate__tap">Tap to continue</div></div>
    </div>`;
  celebrationRoot.querySelector('.celebrate').addEventListener('click', nextCelebration, { once: true });
}

// ---- Boot ------------------------------------------------------------------
(async function boot() {
  try {
    await store.init();
  } catch (err) {
    screenEl.innerHTML = `<section class="panel empty"><b>Couldn't open storage.</b><br>${esc(err.message)}</section>`;
    return;
  }
  ctx.persisted = await requestPersistence();
  render();

  // Streaks and "today" depend on the date; re-derive when the app comes back.
  let lastDay = toISODate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = toISODate();
    if (now !== lastDay) { lastDay = now; store.refresh(); } else render();
  });

  registerServiceWorker();
  try {
    if (sessionStorage.getItem('lu-updated')) {
      sessionStorage.removeItem('lu-updated');
      toast(`You're on the latest version (${VERSION} · ${ctx.build})`, { ms: 3200 });
    }
  } catch { /* ignore */ }
})();

// Expose for debugging in Safari's Web Inspector.
window.__levellingUp = { store, mondayOf };
