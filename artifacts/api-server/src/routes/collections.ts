import { Router } from "express";
import { getSession } from "../lib/mongodb.js";

const router = Router();

router.get("/connections/:connectionId/databases/:dbName/collections", async (req, res) => {
  const { connectionId, dbName } = req.params;
  const session = getSession(connectionId);
  if (!session) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }

  try {
    const db = session.client.db(dbName);
    const collectionInfos = await db.listCollections().toArray();

    const collections = await Promise.all(
      collectionInfos.map(async (info) => {
        try {
          const col = db.collection(info.name);
          const stats = await db.command({ collStats: info.name });
          const documentCount = await col.estimatedDocumentCount();
          return {
            name: info.name,
            type: info.type || "collection",
            documentCount,
            storageSize: stats.storageSize || 0,
            totalIndexSize: stats.totalIndexSize || 0,
            avgDocumentSize: stats.avgObjSize || 0,
          };
        } catch {
          return {
            name: info.name,
            type: info.type || "collection",
            documentCount: 0,
            storageSize: 0,
            totalIndexSize: 0,
            avgDocumentSize: 0,
          };
        }
      })
    );

    res.json({ collections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list collections";
    res.status(500).json({ error: "server_error", message });
  }
});

router.post("/connections/:connectionId/databases/:dbName/collections", async (req, res) => {
  const { connectionId, dbName } = req.params;
  const { name } = req.body as { name: string };
  const session = getSession(connectionId);
  if (!session) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }

  try {
    await session.client.db(dbName).createCollection(name);
    res.json({ success: true, message: `Collection '${name}' created` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create collection";
    res.status(500).json({ error: "server_error", message });
  }
});

router.delete(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      await session.client.db(dbName).collection(collectionName).drop();
      res.json({ success: true, message: `Collection '${collectionName}' dropped` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to drop collection";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

export default router;
