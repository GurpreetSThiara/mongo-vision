import { Router } from "express";
import {
  createMongoConnection,
  generateId,
  getAllSavedConnections,
  getSession,
  removeConnection,
  parseMongoUri,
} from "../lib/mongodb.js";
import { MongoClient, ServerApiVersion } from "mongodb";

const router = Router();

router.get("/connections", (_req, res) => {
  const connections = getAllSavedConnections();
  res.json({ connections });
});

router.post("/connections", async (req, res) => {
  const { name, uri } = req.body as { name: string; uri: string };

  if (!name || !uri) {
    res.status(400).json({ error: "bad_request", message: "name and uri are required" });
    return;
  }

  const id = generateId();
  try {
    const session = await createMongoConnection(id, name, uri);
    res.json({
      id: session.id,
      name: session.name,
      host: session.host,
      port: session.port,
      status: session.status,
      createdAt: session.createdAt,
      lastUsed: session.lastUsed,
      mongoVersion: session.mongoVersion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    res.status(400).json({ error: "connection_failed", message });
  }
});

router.get("/connections/:connectionId", (req, res) => {
  const { connectionId } = req.params;
  const all = getAllSavedConnections();
  const conn = all.find((c) => c.id === connectionId);
  if (!conn) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }
  res.json(conn);
});

router.delete("/connections/:connectionId", (req, res) => {
  const { connectionId } = req.params;
  removeConnection(connectionId);
  res.json({ success: true, message: "Connection removed" });
});

router.post("/connections/:connectionId/test", async (req, res) => {
  const { connectionId } = req.params;
  const session = getSession(connectionId);

  if (!session) {
    const all = getAllSavedConnections();
    const saved = all.find((c) => c.id === connectionId);
    if (!saved) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const start = Date.now();
      const client = new MongoClient(saved.uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await client.connect();
      const latencyMs = Date.now() - start;
      let mongoVersion: string | undefined;
      try {
        const info = await client.db("admin").command({ buildInfo: 1 });
        mongoVersion = info.version;
      } catch {
        mongoVersion = "unknown";
      }
      await client.close();
      res.json({ success: true, latencyMs, mongoVersion, message: "Connected successfully" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      res.json({ success: false, message });
    }
    return;
  }

  try {
    const start = Date.now();
    await session.client.db("admin").command({ ping: 1 });
    const latencyMs = Date.now() - start;
    res.json({
      success: true,
      latencyMs,
      mongoVersion: session.mongoVersion,
      message: "Connected successfully",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ping failed";
    session.status = "error";
    res.json({ success: false, message });
  }
});

router.get("/connections/:connectionId/stats", async (req, res) => {
  const { connectionId } = req.params;
  const session = getSession(connectionId);
  if (!session) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }

  try {
    const admin = session.client.db("admin");
    const serverStatus = await admin.command({ serverStatus: 1 });
    const listDbs = await admin.command({ listDatabases: 1 });

    res.json({
      host: serverStatus.host || session.host,
      version: serverStatus.version || session.mongoVersion,
      uptime: serverStatus.uptime,
      connections: serverStatus.connections,
      memory: serverStatus.mem,
      opcounters: serverStatus.opcounters,
      databases: (listDbs.databases as { name: string }[]).map((d) => d.name),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get server stats";
    res.status(500).json({ error: "server_error", message });
  }
});

export default router;
