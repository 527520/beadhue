/** Legacy names exist only at this compatibility boundary. Never delete the source on failure. */
const LEGACY_PREFIX = "doupu";
const CURRENT_PREFIX = "beadhue";

export function migrateBrowserPreferences(): void {
  if (typeof localStorage === "undefined") return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(LEGACY_PREFIX)) continue;
      const next = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length);
      const value = localStorage.getItem(key);
      if (value !== null && localStorage.getItem(next) === null) {
        localStorage.setItem(next, value);
        if (localStorage.getItem(next) !== value)
          throw new Error("Preference migration failed");
      }
    }
  } catch {
    /* Storage denied/full: retain every original key and retry next load. */
  }
}

function legacyDatabase(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let missing = false;
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction?.abort();
    };
    request.onerror = () => (missing ? resolve(null) : reject(request.error));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error("Legacy database is busy"));
  });
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
/** Copy each old object store in a single transaction. Existing new records always win. */
export async function migrateLegacyDatabase(
  target: IDBDatabase,
): Promise<void> {
  if (!target.name.startsWith(CURRENT_PREFIX)) return;
  const marker = `${CURRENT_PREFIX}:migration:${target.name}:v1`;
  if (
    target.objectStoreNames.contains("_brand_migrations") &&
    (await requestValue(
      target
        .transaction("_brand_migrations", "readonly")
        .objectStore("_brand_migrations")
        .get(marker),
    )) === "verified"
  )
    return;
  const source = await legacyDatabase(
    LEGACY_PREFIX + target.name.slice(CURRENT_PREFIX.length),
  );
  if (!source) return;
  try {
    for (const name of Array.from(source.objectStoreNames)) {
      if (!target.objectStoreNames.contains(name)) continue;
      const sourceStore = source
        .transaction(name, "readonly")
        .objectStore(name);
      const [keys, values] = await Promise.all([
        requestValue(sourceStore.getAllKeys()),
        requestValue(sourceStore.getAll()),
      ]);
      await new Promise<void>((resolve, reject) => {
        const tx = target.transaction(name, "readwrite");
        const store = tx.objectStore(name);
        keys.forEach((key, index) => {
          const read = store.getKey(key);
          read.onsuccess = () => {
            if (read.result === undefined) {
              if (store.keyPath === null) store.put(values[index], key);
              else store.put(values[index]);
            }
          };
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      const verifyStore = target
        .transaction(name, "readonly")
        .objectStore(name);
      const copied = await Promise.all(
        keys.map((key) => requestValue(verifyStore.getKey(key))),
      );
      if (copied.some((key) => key === undefined))
        throw new Error("Database migration verification failed");
    }
    await new Promise<void>((resolve, reject) => {
      const tx = target.transaction("_brand_migrations", "readwrite");
      tx.objectStore("_brand_migrations").put("verified", marker);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    source.close();
  }
}
