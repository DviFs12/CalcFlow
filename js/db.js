/**
 * db.js — Camada de persistência via IndexedDB
 * Salva e carrega as abas e histórico do CalcFlow
 */

const DB_NAME    = 'calcflow_db';
const DB_VERSION = 1;
const STORE_TABS = 'tabs';
const STORE_HIST = 'history';

let _db = null;

/**
 * Abre/cria o banco IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_TABS)) {
        const store = db.createObjectStore(STORE_TABS, { keyPath: 'id' });
        store.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_HIST)) {
        const hstore = db.createObjectStore(STORE_HIST, { keyPath: 'id', autoIncrement: true });
        hstore.createIndex('tabId', 'tabId', { unique: false });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Operação genérica de transação.
 */
function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store       = transaction.objectStore(storeName);
    const req         = fn(store);
    if (req && req.onsuccess !== undefined) {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    } else {
      transaction.oncomplete = () => resolve();
      transaction.onerror    = (e) => reject(e.target.error);
    }
  }));
}

// ── Abas ────────────────────────────────────────────────────

/** Salva (upsert) uma aba */
const DB = {
  saveTab(tab) {
    return tx(STORE_TABS, 'readwrite', store => store.put(tab));
  },

  deleteTab(id) {
    return tx(STORE_TABS, 'readwrite', store => store.delete(id));
  },

  getAllTabs() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE_TABS, 'readonly');
      const s = t.objectStore(STORE_TABS);
      const r = s.getAll();
      r.onsuccess = () => resolve(r.result.sort((a, b) => a.order - b.order));
      r.onerror   = (e) => reject(e.target.error);
    }));
  },

  // ── Histórico ─────────────────────────────────────────────

  addHistoryEntry(entry) {
    return tx(STORE_HIST, 'readwrite', store => store.add(entry));
  },

  getHistory(tabId, limit = 30) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t   = db.transaction(STORE_HIST, 'readonly');
      const idx = t.objectStore(STORE_HIST).index('tabId');
      const r   = idx.getAll(tabId);
      r.onsuccess = () => {
        const sorted = r.result.sort((a, b) => b.ts - a.ts).slice(0, limit);
        resolve(sorted);
      };
      r.onerror = (e) => reject(e.target.error);
    }));
  },

  clearHistoryForTab(tabId) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t   = db.transaction(STORE_HIST, 'readwrite');
      const idx = t.objectStore(STORE_HIST).index('tabId');
      const r   = idx.openCursor(IDBKeyRange.only(tabId));
      r.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else resolve();
      };
      r.onerror = (e) => reject(e.target.error);
    }));
  },

  // ── Utilitários ───────────────────────────────────────────

  /** Exporta tudo como objeto JSON */
  async exportAll() {
    const tabs    = await DB.getAllTabs();
    const history = {};
    for (const tab of tabs) {
      history[tab.id] = await DB.getHistory(tab.id, 100);
    }
    return { tabs, history, exportedAt: Date.now() };
  },

  /** Importa objeto JSON (substitui tudo) */
  async importAll(data) {
    if (!data.tabs || !Array.isArray(data.tabs)) throw new Error('Formato inválido');
    // Limpa banco atual
    await new Promise((resolve, reject) => {
      openDB().then(db => {
        const t = db.transaction([STORE_TABS, STORE_HIST], 'readwrite');
        t.objectStore(STORE_TABS).clear();
        t.objectStore(STORE_HIST).clear();
        t.oncomplete = resolve;
        t.onerror = (e) => reject(e.target.error);
      });
    });
    for (const tab of data.tabs) await DB.saveTab(tab);
    if (data.history) {
      for (const tabId of Object.keys(data.history)) {
        for (const entry of data.history[tabId]) {
          const { id: _id, ...rest } = entry; // remove id para auto-increment
          await DB.addHistoryEntry(rest);
        }
      }
    }
  }
};

window.DB = DB;
