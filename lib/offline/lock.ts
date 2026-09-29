// Logout/account switching locks the active offline profile without deleting its outbox.
export async function lockOfflineProfile(locked = true) {
  if (!("indexedDB" in window)) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("ycd-offline-v1", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("meta");
      request.result.createObjectStore("operations", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(null, "active");
      tx.objectStore("meta").put(locked, "locked");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("ycd-offline");
    channel.postMessage("changed"); channel.close();
  }
}
