import { MongoClient, ServerApiVersion } from "mongodb";
import crypto from "crypto";

export interface ConnectionSession {
  id: string;
  name: string;
  uri: string;
  host: string;
  port: number;
  client: MongoClient;
  status: "connected" | "disconnected" | "error";
  createdAt: string;
  lastUsed: string;
  mongoVersion?: string;
}

const sessions = new Map<string, ConnectionSession>();

const savedConnections: Array<{
  id: string;
  name: string;
  uri: string;
  host: string;
  port: number;
  status: "connected" | "disconnected" | "error";
  createdAt: string;
  lastUsed: string;
  mongoVersion?: string;
}> = [];

export function parseMongoUri(uri: string): { host: string; port: number } {
  try {
    const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, (m, srv) => `http://` + (srv ? "srv-" : "") + uri.slice(m.length)));
    return { host: u.hostname || "localhost", port: Number(u.port) || 27017 };
  } catch {
    return { host: "localhost", port: 27017 };
  }
}

export async function createMongoConnection(
  id: string,
  name: string,
  uri: string
): Promise<ConnectionSession> {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  await client.connect();

  const adminDb = client.db("admin");
  let mongoVersion: string | undefined;
  try {
    const info = await adminDb.command({ buildInfo: 1 });
    mongoVersion = info.version;
  } catch {
    mongoVersion = "unknown";
  }

  const { host, port } = parseMongoUri(uri);
  const now = new Date().toISOString();

  const session: ConnectionSession = {
    id,
    name,
    uri,
    host,
    port,
    client,
    status: "connected",
    createdAt: now,
    lastUsed: now,
    mongoVersion,
  };

  sessions.set(id, session);

  const existingIdx = savedConnections.findIndex((c) => c.id === id);
  const saved = {
    id,
    name,
    uri,
    host,
    port,
    status: "connected" as const,
    createdAt: now,
    lastUsed: now,
    mongoVersion,
  };

  if (existingIdx >= 0) {
    savedConnections[existingIdx] = saved;
  } else {
    savedConnections.push(saved);
  }

  return session;
}

export function getSession(id: string): ConnectionSession | undefined {
  const session = sessions.get(id);
  if (session) {
    session.lastUsed = new Date().toISOString();
    const saved = savedConnections.find((c) => c.id === id);
    if (saved) saved.lastUsed = session.lastUsed;
  }
  return session;
}

export function getAllSavedConnections() {
  return savedConnections.map((c) => {
    const session = sessions.get(c.id);
    return {
      ...c,
      status: session ? session.status : ("disconnected" as const),
    };
  });
}

export function removeConnection(id: string) {
  const session = sessions.get(id);
  if (session) {
    session.client.close().catch(() => {});
    sessions.delete(id);
  }
  const idx = savedConnections.findIndex((c) => c.id === id);
  if (idx >= 0) savedConnections.splice(idx, 1);
}

export function generateId(): string {
  return crypto.randomUUID();
}

const savedQueriesStore: Array<{
  id: string;
  name: string;
  description?: string;
  connectionId: string;
  database: string;
  collection: string;
  query: Record<string, unknown>;
  createdAt: string;
  pinned?: boolean;
}> = [];

export function getSavedQueries() {
  return savedQueriesStore;
}

export function addSavedQuery(query: (typeof savedQueriesStore)[0]) {
  savedQueriesStore.push(query);
  return query;
}

export function removeSavedQuery(id: string): boolean {
  const idx = savedQueriesStore.findIndex((q) => q.id === id);
  if (idx >= 0) {
    savedQueriesStore.splice(idx, 1);
    return true;
  }
  return false;
}
