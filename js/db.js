// Storage layer. IndexedDB by default, with a localStorage fallback for
// browsers where IndexedDB is unavailable (e.g. some private-browsing modes).
// Both adapters expose the same tiny CRUD surface over named stores.

export const STORES = ['categories', 'dailyTasks', 'weeklyGoals', 'milestones', 'meta'];
const DB_NAME = 'levelling-up';
const DB_VERSION = 1;

class IDBAdapter {
  constructor(db) {
    this.db = db;
    this.kind = 'indexeddb';
  }

  static open() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(new IDBAdapter(req.result));
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  _run(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  getAll(store) { return this._run(store, 'readonly', (s) => s.getAll()); }
  get(store, id) { return this._run(store, 'readonly', (s) => s.get(id)); }
  put(store, value) { return this._run(store, 'readwrite', (s) => s.put(value)); }
  delete(store, id) { return this._run(store, 'readwrite', (s) => s.delete(id)); }
  clear(store) { return this._run(store, 'readwrite', (s) => s.clear()); }

  putMany(store, values) {
    return this._run(store, 'readwrite', (s) => {
      for (const v of values) s.put(v);
      return null;
    });
  }
}

class LocalAdapter {
  constructor() {
    this.kind = 'localstorage';
  }

  _key(store) { return `${DB_NAME}:${store}`; }

  _read(store) {
    try {
      const raw = localStorage.getItem(this._key(store));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _write(store, obj) {
    localStorage.setItem(this._key(store), JSON.stringify(obj));
  }

  async getAll(store) { return Object.values(this._read(store)); }
  async get(store, id) { return this._read(store)[id]; }
  async put(store, value) { const o = this._read(store); o[value.id] = value; this._write(store, o); }
  async delete(store, id) { const o = this._read(store); delete o[id]; this._write(store, o); }
  async clear(store) { this._write(store, {}); }
  async putMany(store, values) { const o = this._read(store); for (const v of values) o[v.id] = v; this._write(store, o); }
}

export async function openStorage() {
  try {
    return await IDBAdapter.open();
  } catch (err) {
    console.warn('Falling back to localStorage:', err && err.message);
    return new LocalAdapter();
  }
}

/** Ask the browser to keep this origin's storage out of eviction where supported. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch { /* ignore */ }
  return false;
}
