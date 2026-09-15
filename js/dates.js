// Date helpers. All "dates" in the app are local-calendar ISO strings (YYYY-MM-DD).
// Using local time rather than UTC matters: a task ticked at 11pm in Sydney
// belongs to that day, not the UTC date.

export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a, b) {
  const ms = parseISODate(b) - parseISODate(a);
  return Math.round(ms / 86400000);
}

/** ISO date of the Monday of the week containing iso. */
export function mondayOf(iso) {
  const d = parseISODate(iso);
  const day = d.getDay(); // 0 = Sunday
  const back = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - back);
  return toISODate(d);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShort(iso) {
  const d = parseISODate(iso);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/** "15 – 21 Sep" style label for the week starting on monday. */
export function formatWeek(monday) {
  const a = parseISODate(monday);
  const b = parseISODate(addDays(monday, 6));
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${MONTH_NAMES[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTH_NAMES[a.getMonth()]} – ${b.getDate()} ${MONTH_NAMES[b.getMonth()]}`;
}
