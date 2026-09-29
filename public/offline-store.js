// Durable storage. Never delete pending operations on refresh, update, logout or failure.
export const DB_NAME = 'ycd-offline-v1';
export async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('meta');
      request.result.createObjectStore('operations', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('STORAGE_BLOCKED'));
  });
}
export async function transact(store, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let request;
    try { request = action(tx.objectStore(store)); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('STORAGE_FAILED')); };
  });
}
export const profile = () => transact('meta', 'readonly', store => store.get('active'));
export async function setProfile(value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const locked = store.get('locked');
    locked.onsuccess = () => {
      if (value && locked.result) { tx.abort(); return; }
      store.put(value, 'active');
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('PROFILE_LOCKED')); };
  });
}
export const scope = value => `${value.userId}:${value.branchId}`;
export async function operations(owner) {
  const all = await transact('operations', 'readonly', store => store.getAll());
  return all.filter(row => row.scope === scope(owner)).sort((a, b) => a.command.recordedAt.localeCompare(b.command.recordedAt));
}
export async function save(command) {
  // add(), not put(): an existing request UUID must never be overwritten with new content.
  await transact('operations', 'readwrite', store => store.add({
    id: command.id, scope: scope(command), command, state: 'pending', error: null,
  }));
}
export async function update(id, values) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('operations', 'readwrite');
    const store = tx.objectStore('operations');
    const request = store.get(id);
    request.onsuccess = () => {
      const row = request.result;
      if (!row) { tx.abort(); return; }
      // A late failed response must not downgrade an already acknowledged operation.
      if (row.state === 'synced' && values.state !== 'synced') return;
      store.put({ ...row, ...values, id: row.id, scope: row.scope, command: row.command });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('STORAGE_FAILED')); };
  });
}
