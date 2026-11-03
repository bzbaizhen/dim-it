import type { ProjectData } from "./core";

export type StoredProject = {
  filename: string;
  bytes: Uint8Array;
  data: ProjectData;
  page: number;
};

const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("planmeasure-local", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("projects");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function loadAutosave(): Promise<StoredProject | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("projects")
      .objectStore("projects")
      .get("current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAutosave(project: StoredProject): Promise<void> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put(project, "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("本地存储中断"));
  });
}
