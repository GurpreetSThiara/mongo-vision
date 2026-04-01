import { Router } from "express";
import { getSession } from "../lib/mongodb.js";

const router = Router();

router.get("/connections/:connectionId/databases", async (req, res) => {
  const { connectionId } = req.params;
  const session = getSession(connectionId);
  if (!session) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }

  try {
    const adminDb = session.client.db("admin");
    const result = await adminDb.command({ listDatabases: 1 });

    const databases = await Promise.all(
      (result.databases as { name: string; sizeOnDisk: number; empty: boolean }[]).map(async (db) => {
        try {
          const collections = await session.client.db(db.name).listCollections().toArray();
          return {
            name: db.name,
            sizeOnDisk: db.sizeOnDisk || 0,
            empty: db.empty || false,
            collectionCount: collections.length,
          };
        } catch {
          return {
            name: db.name,
            sizeOnDisk: db.sizeOnDisk || 0,
            empty: db.empty || false,
            collectionCount: 0,
          };
        }
      })
    );

    res.json({ databases });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list databases";
    res.status(500).json({ error: "server_error", message });
  }
});

router.get("/connections/:connectionId/databases/:dbName/stats", async (req, res) => {
  const { connectionId, dbName } = req.params;
  const session = getSession(connectionId);
  if (!session) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }

  try {
    const db = session.client.db(dbName);
    const stats = await db.command({ dbStats: 1, scale: 1 });

    res.json({
      db: stats.db,
      collections: stats.collections || 0,
      views: stats.views || 0,
      objects: stats.objects || 0,
      avgObjSize: stats.avgObjSize || 0,
      dataSize: stats.dataSize || 0,
      storageSize: stats.storageSize || 0,
      indexes: stats.indexes || 0,
      indexSize: stats.indexSize || 0,
      totalSize: stats.totalSize || (stats.dataSize || 0) + (stats.indexSize || 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get database stats";
    res.status(500).json({ error: "server_error", message });
  }
});

export default router;
