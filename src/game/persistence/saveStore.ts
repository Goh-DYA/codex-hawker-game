import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_NAME = "hawker-simulator";
const DATABASE_VERSION = 1;
const ACTIVE_SLOT = "active";
const BACKUP_SLOT = "backup";

interface SaveEnvelope {
  appVersion: string;
  saveVersion: 1 | 2;
  writtenAt: string;
  checksum: string;
  payload: unknown;
}

interface HawkerDatabase extends DBSchema {
  saves: {
    key: string;
    value: SaveEnvelope;
  };
  preferences: {
    key: string;
    value: unknown;
  };
}

let databasePromise: Promise<IDBPDatabase<HawkerDatabase>> | undefined;

function database() {
  databasePromise ??= openDB<HawkerDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("saves")) db.createObjectStore("saves");
      if (!db.objectStoreNames.contains("preferences")) {
        db.createObjectStore("preferences");
      }
    },
  });
  return databasePromise;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function checksum(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function envelope(payload: unknown): SaveEnvelope {
  return {
    appVersion: "1.0.0",
    saveVersion: 2,
    writtenAt: new Date().toISOString(),
    checksum: checksum(payload),
    payload,
  };
}

function isValidEnvelope(value: SaveEnvelope | undefined): value is SaveEnvelope {
  return Boolean(
    value &&
      (value.saveVersion === 1 || value.saveVersion === 2) &&
      typeof value.appVersion === "string" &&
      value.checksum === checksum(value.payload),
  );
}

export async function saveGame(payload: unknown): Promise<void> {
  const db = await database();
  const transaction = db.transaction("saves", "readwrite");
  const current = await transaction.store.get(ACTIVE_SLOT);
  if (isValidEnvelope(current)) await transaction.store.put(current, BACKUP_SLOT);
  await transaction.store.put(envelope(payload), ACTIVE_SLOT);
  await transaction.done;
}

export async function loadGame(): Promise<unknown | undefined> {
  return (await loadGameCandidates())[0];
}

export async function loadGameCandidates(): Promise<readonly unknown[]> {
  const db = await database();
  const active = await db.get("saves", ACTIVE_SLOT);
  const backup = await db.get("saves", BACKUP_SLOT);
  return [active, backup]
    .filter((candidate): candidate is SaveEnvelope => isValidEnvelope(candidate))
    .map((candidate) => candidate.payload);
}

export async function clearGame(): Promise<void> {
  const db = await database();
  const transaction = db.transaction("saves", "readwrite");
  await Promise.all([
    transaction.store.delete(ACTIVE_SLOT),
    transaction.store.delete(BACKUP_SLOT),
  ]);
  await transaction.done;
}

export async function savePreference(key: string, value: unknown): Promise<void> {
  const db = await database();
  await db.put("preferences", value, key);
}

export async function loadPreference<T>(
  key: string,
  fallback: T,
): Promise<T> {
  const db = await database();
  const value = await db.get("preferences", key);
  return (value as T | undefined) ?? fallback;
}

export function exportSave(payload: unknown): string {
  return JSON.stringify(envelope(payload), null, 2);
}

export function importSave(source: string): unknown {
  const value = JSON.parse(source) as SaveEnvelope;
  if (!isValidEnvelope(value)) throw new Error("The save file is damaged or unsupported.");
  return value.payload;
}
