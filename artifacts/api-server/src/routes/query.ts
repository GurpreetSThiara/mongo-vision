import { Router } from "express";
import { getSession } from "../lib/mongodb.js";

const router = Router();

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/query",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { filter, sort, projection, limit, skip } = req.body as {
      filter?: Record<string, unknown>;
      sort?: Record<string, unknown>;
      projection?: Record<string, unknown>;
      limit?: number;
      skip?: number;
    };

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      const start = Date.now();

      let cursor = col.find(filter || {});
      if (projection && Object.keys(projection).length > 0) {
        cursor = cursor.project(projection);
      }
      if (sort && Object.keys(sort).length > 0) {
        cursor = cursor.sort(sort as Record<string, 1 | -1>);
      }
      if (skip) cursor = cursor.skip(skip);
      cursor = cursor.limit(Math.min(limit || 20, 1000));

      const documents = await cursor.toArray();
      const executionTimeMs = Date.now() - start;

      const serialized = documents.map((doc) => ({
        ...doc,
        _id: doc._id?.toString(),
      }));

      res.json({
        documents: serialized,
        count: serialized.length,
        executionTimeMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/aggregate",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { pipeline } = req.body as { pipeline: Record<string, unknown>[] };

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      const start = Date.now();

      const documents = await col.aggregate(pipeline || []).toArray();
      const executionTimeMs = Date.now() - start;

      const serialized = documents.map((doc) => ({
        ...doc,
        _id: doc._id?.toString(),
      }));

      res.json({
        documents: serialized,
        count: serialized.length,
        executionTimeMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Aggregation failed";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/explain",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { filter, sort, limit } = req.body as {
      filter?: Record<string, unknown>;
      sort?: Record<string, unknown>;
      limit?: number;
    };

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const db = session.client.db(dbName);
      const start = Date.now();

      const explainResult = await db.command({
        explain: {
          find: collectionName,
          filter: filter || {},
          sort: sort || {},
          limit: limit || 20,
        },
        verbosity: "executionStats",
      });

      const executionTimeMs = Date.now() - start;

      const executionStats = explainResult.executionStats || {};
      const queryPlanner = explainResult.queryPlanner || {};

      const indexesUsed: string[] = [];
      const winningPlan = queryPlanner.winningPlan || {};
      if (winningPlan.inputStage?.indexName) {
        indexesUsed.push(winningPlan.inputStage.indexName);
      }

      res.json({
        queryPlanner,
        executionStats,
        executionTimeMs,
        indexesUsed,
        collectionScans: winningPlan.stage === "COLLSCAN" ? 1 : 0,
        totalDocsExamined: executionStats.totalDocsExamined || 0,
        totalKeysExamined: executionStats.totalKeysExamined || 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Explain failed";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/index-suggestions",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { filter } = req.body as { filter?: Record<string, unknown> };

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const queryFilter = filter || {};
      const filterFields = Object.keys(queryFilter);

      const suggestions = filterFields.map((field) => ({
        fields: [field],
        reason: `Field '${field}' is used in the filter condition and may benefit from an index`,
        estimatedImpact: "High — this would convert a collection scan to an index scan",
        createCommand: `db.${collectionName}.createIndex({ ${field}: 1 })`,
      }));

      if (filterFields.length > 1) {
        suggestions.push({
          fields: filterFields,
          reason: `Compound index on ${filterFields.join(", ")} would optimize this multi-field query`,
          estimatedImpact: "Very High — compound index covers all filter fields",
          createCommand: `db.${collectionName}.createIndex({ ${filterFields.map((f) => `${f}: 1`).join(", ")} })`,
        });
      }

      res.json({ suggestions });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate suggestions";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

export default router;
