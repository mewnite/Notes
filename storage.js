/* Storage Adapter: IndexedDB with localStorage fallback
 * Exposes a simple synchronous-like API:
 * - Storage.init() -> Promise
 * - Storage.getItem(key) -> Promise<string|null>
 * - Storage.setItem(key, value) -> Promise<void>
 * - Storage.removeItem(key) -> Promise<void>
 *
 * Uses an object store `kv` in DB `notes_sync_db`.
 */
(function(window){
    'use strict';

    const DB_NAME = 'notes_sync_db';
    const DB_STORE = 'kv';
    const DB_VERSION = 1;

    let db = null;
    let fallback = typeof localStorage !== 'undefined' ? localStorage : null;

    function openDB(){
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return resolve(null);
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(evt){
                const _db = evt.target.result;
                if (!_db.objectStoreNames.contains(DB_STORE)) {
                    _db.createObjectStore(DB_STORE);
                }
            };
            req.onsuccess = function(){ db = req.result; resolve(db); };
            req.onerror = function(e){ console.warn('IndexedDB open error', e); resolve(null); };
        });
    }

    async function init(){
        if (db) return; // already
        db = await openDB();
    }

    function withStore(mode, fn){
        return new Promise(async (resolve, reject) => {
            if (!db) return resolve(null);
            try {
                const tx = db.transaction(DB_STORE, mode);
                const store = tx.objectStore(DB_STORE);
                const req = fn(store);
                tx.oncomplete = () => resolve(req?.result);
                tx.onabort = tx.onerror = () => resolve(null);
            } catch (e) {
                console.warn('IDB transaction failed', e);
                resolve(null);
            }
        });
    }

    async function getItem(key){
        if (!db) return Promise.resolve(fallback ? fallback.getItem(key) : null);
        return withStore('readonly', store => store.get(key));
    }

    async function setItem(key, value){
        if (!db) {
            if (fallback) try { fallback.setItem(key, value); } catch(e){ console.warn('localStorage set failed', e); }
            return Promise.resolve();
        }
        return withStore('readwrite', store => store.put(value, key));
    }

    async function removeItem(key){
        if (!db) {
            if (fallback) try { fallback.removeItem(key); } catch(e){ console.warn('localStorage remove failed', e); }
            return Promise.resolve();
        }
        return withStore('readwrite', store => store.delete(key));
    }

    // Expose
    window.StorageAdapter = {
        init,
        getItem,
        setItem,
        removeItem
    };

})(window);
