import { Router } from "express";
import { generateId, getSavedQueries, addSavedQuery, removeSavedQuery } from "../lib/mongodb.js";

const router = Router();

router.get("/saved-queries", (_req, res) => {
  const queries = getSavedQueries();
  res.json({ queries });
});

router.post("/saved-queries", (req, res) => {
  const {
    name,
    description,
    connectionId,
    database,
    collection,
    query,
    pinned,
  } = req.body as {
    name: string;
    description?: string;
    connectionId: string;
    database: string;
    collection: string;
    query: Record<string, unknown>;
    pinned?: boolean;
  };

  const saved = addSavedQuery({
    id: generateId(),
    name,
    description,
    connectionId,
    database,
    collection,
    query,
    createdAt: new Date().toISOString(),
    pinned: pinned || false,
  });

  res.json(saved);
});

router.delete("/saved-queries/:queryId", (req, res) => {
  const { queryId } = req.params;
  const removed = removeSavedQuery(queryId);
  res.json({ success: removed, message: removed ? "Query deleted" : "Query not found" });
});

export default router;
