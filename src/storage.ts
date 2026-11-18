import type { ProjectData } from "./core";

export type StoredProject = {
  filename: string;
  bytes: Uint8Array;
  data: ProjectData;
  page: number;
};

type StoredDocument = StoredProject & { snapshotId?: string };
type StoredState = Pick<StoredProject, "data" | "page"> & { snapshotId: string };

let storedDocument: { bytes: Uint8Array; filename: string; snapshotId: string } | undefined;
let pendingSave = Promise.resolve();

const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("planmeasure-local", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("projects");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function loadAutosave(): Promise<StoredProject | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects");
    const projects = transaction.objectStore("projects");
    const document = projects.get("current");
    const state = projects.get("current-state");
    transaction.oncomplete = () => {
      const base = document.result as StoredDocument | undefined;
      const latest = state.result as StoredState | undefined;
      if (base?.snapshotId && latest?.snapshotId === base.snapshotId) {
        const { bytes, filename, snapshotId } = base;
        storedDocument = { bytes, filename, snapshotId };
        resolve({ bytes, filename, data: latest.data, page: latest.page });
      } else {
        resolve(base);
      }
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("本地存储中断"));
  });
}

export function saveAutosave(project: StoredProject): Promise<void> {
  // Run in invocation order so a queued page save always matches its PDF.
  const result = pendingSave.then(() => writeAutosave(project));
  pendingSave = result.catch(() => {});
  return result;
}

async function writeAutosave(project: StoredProject): Promise<void> {
  const db = await database;
  const { bytes, filename, data, page } = project;
  const current = storedDocument;
  const existing = current?.bytes === bytes && current.filename === filename
    ? current
    : undefined;
  const snapshotId = existing?.snapshotId ?? crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");
    const projects = transaction.objectStore("projects");
    transaction.oncomplete = () => {
      storedDocument = { bytes, filename, snapshotId };
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("本地存储中断"));
    try {
      // Keep a full snapshot readable by previous builds. Only write the
      // current view and annotation state again when the drawing is unchanged.
      if (!existing) projects.put({ ...project, snapshotId }, "current");
      projects.put({ snapshotId, data, page } satisfies StoredState, "current-state");
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}
