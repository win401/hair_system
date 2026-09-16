const DATABASE_NAME = "hair-mvp-private-cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "images";
const SELFIE_KEY = "current-selfie";
let pendingWrite: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("selfie_cache_open_failed"));
  });
}

export async function loadCachedSelfie(): Promise<string | null> {
  await pendingWrite.catch(() => undefined);
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(SELFIE_KEY);
      request.onsuccess = () =>
        resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("selfie_cache_read_failed"));
    });
  } finally {
    database.close();
  }
}

export async function saveCachedSelfie(dataUrl: string): Promise<void> {
  pendingWrite = pendingWrite.catch(() => undefined).then(() => writeSelfie(dataUrl));
  return pendingWrite;
}

async function writeSelfie(dataUrl: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(dataUrl, SELFIE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("selfie_cache_write_failed"));
    });
  } finally {
    database.close();
  }
}

export async function deleteCachedSelfie(): Promise<void> {
  pendingWrite = pendingWrite.catch(() => undefined).then(deleteSelfie);
  return pendingWrite;
}

async function deleteSelfie(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(SELFIE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("selfie_cache_delete_failed"));
    });
  } finally {
    database.close();
  }
}
