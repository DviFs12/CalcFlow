/**
 * db.js — Persistência IndexedDB do CalcFlow  v2
 * Stores: tabs, history, custom_conv
 */

const DB_NAME    = 'calcflow_db';
const DB_VERSION = 2;           // bump: adicionado store custom_conv
const STORE_TABS = 'tabs';
const STORE_HIST = 'history';
const STORE_CONV = 'custom_conv';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db      = e.target.result;
      const oldVer  = e.oldVersion;

      if (oldVer < 1) {
        const tabStore = db.createObjectStore(STORE_TABS, { keyPath: 'id' });
        tabStore.createIndex('order', 'order', { unique: false });

        const histStore = db.createObjectStore(STORE_HIST, { keyPath: 'id', autoIncrement: true });
        histStore.createIndex('tabId', 'tabId', { unique: false });
      }

      if (oldVer < 2) {
        // Conversões personalizadas: { id, name, units:[{id,label,factor}] }
        db.createObjectStore(STORE_CONV, { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

/** Transação genérica com resolução pelo resultado da operação. */
function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store       = transaction.objectStore(storeName);
    const req         = fn(store);
    if (req && typeof req.onsuccess !== 'undefined') {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    } else {
      transaction.oncomplete = () => resolve();
      transaction.onerror    = (e) => reject(e.target.error);
    }
  }));
}

const DB = {

  // ── Abas ────────────────────────────────────────────────

  saveTab(tab)  { return tx(STORE_TABS, 'readwrite', s => s.put(tab)); },
  deleteTab(id) { return tx(STORE_TABS, 'readwrite', s => s.delete(id)); },

  getAllTabs() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const r = db.transaction(STORE_TABS, 'readonly').objectStore(STORE_TABS).getAll();
      r.onsuccess = () => resolve(r.result.sort((a, b) => a.order - b.order));
      r.onerror   = (e) => reject(e.target.error);
    }));
  },

  // ── Histórico ───────────────────────────────────────────

  addHistoryEntry(entry) { return tx(STORE_HIST, 'readwrite', s => s.add(entry)); },

  getHistory(tabId, limit = 30) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const idx = db.transaction(STORE_HIST, 'readonly')
                    .objectStore(STORE_HIST).index('tabId');
      const r   = idx.getAll(tabId);
      r.onsuccess = () =>
        resolve(r.result.sort((a, b) => b.ts - a.ts).slice(0, limit));
      r.onerror = (e) => reject(e.target.error);
    }));
  },

  clearHistoryForTab(tabId) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const idx = db.transaction(STORE_HIST, 'readwrite')
                    .objectStore(STORE_HIST).index('tabId');
      const r   = idx.openCursor(IDBKeyRange.only(tabId));
      r.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { c.delete(); c.continue(); } else resolve();
      };
      r.onerror = (e) => reject(e.target.error);
    }));
  },

  // ── Conversões personalizadas ─────────────────────────

  saveCustomConv(cat)  { return tx(STORE_CONV, 'readwrite', s => s.put(cat)); },
  deleteCustomConv(id) { return tx(STORE_CONV, 'readwrite', s => s.delete(id)); },

  getAllCustomConv() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const r = db.transaction(STORE_CONV, 'readonly').objectStore(STORE_CONV).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror   = (e) => reject(e.target.error);
    }));
  },

  // ── Export / Import ──────────────────────────────────

  async exportAll() {
    const tabs   = await DB.getAllTabs();
    const custom = await DB.getAllCustomConv();
    const history = {};
    for (const tab of tabs) {
      history[tab.id] = await DB.getHistory(tab.id, 100);
    }
    return { tabs, history, customConv: custom, exportedAt: Date.now() };
  },

  async importAll(data) {
    if (!data.tabs || !Array.isArray(data.tabs)) throw new Error('Formato inválido');
    await openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction([STORE_TABS, STORE_HIST, STORE_CONV], 'readwrite');
      t.objectStore(STORE_TABS).clear();
      t.objectStore(STORE_HIST).clear();
      t.objectStore(STORE_CONV).clear();
      t.oncomplete = resolve;
      t.onerror    = (e) => reject(e.target.error);
    }));
    for (const tab of data.tabs) await DB.saveTab(tab);
    if (data.history) {
      for (const tabId of Object.keys(data.history)) {
        for (const entry of data.history[tabId]) {
          const { id: _id, ...rest } = entry;
          await DB.addHistoryEntry(rest);
        }
      }
    }
    if (data.customConv) {
      for (const cat of data.customConv) await DB.saveCustomConv(cat);
    }
  },
};

window.DB = DB;
