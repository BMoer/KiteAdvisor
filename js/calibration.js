/**
 * Calibration Feedback — IndexedDB persistence
 * Stores user feedback on recommended kite sizes to calibrate the optimizer.
 */

const CalibrationDB = (function () {
    const DB_NAME = 'KiteAdvisorCalibration';
    const DB_VERSION = 1;
    const STORE_NAME = 'feedback';
    let db = null;

    function open() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (e) {
                const store = e.target.result.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                store.createIndex('skill', 'skill', { unique: false });
                store.createIndex('kiteSize', 'kiteSize', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            };
            req.onsuccess = function (e) { db = e.target.result; resolve(db); };
            req.onerror = function (e) { reject(e.target.error); };
        });
    }

    /** Save a single calibration feedback entry */
    function saveFeedback(entry) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).add(entry);
                tx.oncomplete = resolve;
                tx.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    /** Read all feedback entries */
    function getAll() {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).getAll();
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    /** Count total entries */
    function count() {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const req = tx.objectStore(STORE_NAME).count();
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    return { open: open, saveFeedback: saveFeedback, getAll: getAll, count: count };
})();
