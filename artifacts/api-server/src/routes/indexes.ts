import { Router } from "express";
import { getSession } from "../lib/mongodb.js";

const router = Router();

router.get(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/indexes",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      const rawIndexes = await col.indexes();

      const db = session.client.db(dbName);
      let indexStats: { name: string; accesses: unknown }[] = [];
      try {
        const stats = await col
          .aggregate([{ $indexStats: {} }])
          .toArray();
        indexStats = stats as { name: string; accesses: unknown }[];
      } catch {
        // indexStats not supported on all MongoDB versions
      }

      const indexes = rawIndexes.map((idx) => {
        const stat = indexStats.find((s) => s.name === idx.name);
        return {
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false,
          background: idx.background || false,
          size: 0,
          accesses: stat?.accesses,
        };
      });

      res.json({ indexes });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list indexes";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/indexes",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { keys, options } = req.body as {
      keys: Record<string, unknown>;
      options?: Record<string, unknown>;
    };

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      await col.createIndex(keys as Record<string, 1 | -1>, options || {});
      res.json({ success: true, message: "Index created successfully" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create index";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.delete(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/indexes/:indexName",
  async (req, res) => {
    const { connectionId, dbName, collectionName, indexName } = req.params;
    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      await col.dropIndex(indexName);
      res.json({ success: true, message: `Index '${indexName}' dropped` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to drop index";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

export default router;
