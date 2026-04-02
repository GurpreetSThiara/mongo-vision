import { Router } from "express";
import { ObjectId } from "mongodb";
import { getSession } from "../lib/mongodb.js";

const router = Router();

function parseJson(str: string | undefined): Record<string, unknown> {
  if (!str || str.trim() === "") return {};
  try {
    return JSON.parse(str);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

router.get(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/documents",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    let filter, sort, projection;
    try {
      filter = parseJson(req.query.filter as string);
      sort = parseJson(req.query.sort as string);
      projection = parseJson(req.query.projection as string);
    } catch (err) {
      res.status(400).json({
        error: "bad_request",
        message: err instanceof Error ? err.message : "Invalid JSON in query parameters",
      });
      return;
    }

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      const start = Date.now();
      const [documents, total] = await Promise.all([
        col
          .find(filter)
          .project(projection)
          .sort(sort as Record<string, 1 | -1>)
          .skip(skip)
          .limit(limit)
          .toArray(),
        col.countDocuments(filter),
      ]);
      const executionTimeMs = Date.now() - start;

      const serialized = documents.map((doc) => ({
        ...doc,
        _id: doc._id?.toString(),
      }));

      res.json({
        documents: serialized,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        executionTimeMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list documents";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/documents",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { document } = req.body as { document: Record<string, unknown> };
    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      const result = await col.insertOne(document);
      res.json({
        insertedId: result.insertedId.toString(),
        acknowledged: result.acknowledged,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to insert document";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.put(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/documents/:documentId",
  async (req, res) => {
    const { connectionId, dbName, collectionName, documentId } = req.params;
    const { update, replace } = req.body as {
      update: Record<string, unknown>;
      replace?: boolean;
    };
    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      let objectId: ObjectId | string;
      try {
        objectId = new ObjectId(documentId);
      } catch {
        objectId = documentId;
      }

      let result;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idFilter: any = { _id: objectId };
      if (replace) {
        const { _id, ...docWithoutId } = update as { _id?: unknown; [key: string]: unknown };
        result = await col.replaceOne(idFilter, docWithoutId);
      } else {
        const updateDoc = update.$set || update.$unset || update.$push ? update : { $set: update };
        result = await col.updateOne(idFilter, updateDoc);
      }

      res.json({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        acknowledged: result.acknowledged,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update document";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.delete(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/documents/:documentId",
  async (req, res) => {
    const { connectionId, dbName, collectionName, documentId } = req.params;
    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      let objectId: ObjectId | string;
      try {
        objectId = new ObjectId(documentId);
      } catch {
        objectId = documentId;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await col.deleteOne({ _id: objectId } as any);
      res.json({ success: true, message: "Document deleted" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete document";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/bulk",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const {
      operation,
      filter,
      update,
      documents,
    } = req.body as {
      operation: "deleteMany" | "updateMany" | "insertMany";
      filter?: Record<string, unknown>;
      update?: Record<string, unknown>;
      documents?: Record<string, unknown>[];
    };
    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      let result: Record<string, unknown> = { acknowledged: true };

      if (operation === "deleteMany") {
        const r = await col.deleteMany(filter || {});
        result = { deletedCount: r.deletedCount, acknowledged: r.acknowledged };
      } else if (operation === "updateMany") {
        const updateDoc =
          update && (update.$set || update.$unset || update.$push) ? update : { $set: update };
        const r = await col.updateMany(filter || {}, updateDoc);
        result = {
          matchedCount: r.matchedCount,
          modifiedCount: r.modifiedCount,
          acknowledged: r.acknowledged,
        };
      } else if (operation === "insertMany") {
        const r = await col.insertMany(documents || []);
        result = {
          insertedCount: r.insertedCount,
          acknowledged: r.acknowledged,
        };
      }

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk operation failed";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

export default router;
