import { Router } from "express";
import { getSession } from "../lib/mongodb.js";

const router = Router();

function documentsToCSV(docs: Record<string, unknown>[]): string {
  if (docs.length === 0) return "";

  const headers = Array.from(new Set(docs.flatMap((d) => Object.keys(d))));
  const rows = docs.map((doc) =>
    headers.map((h) => {
      const val = doc[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
  );

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function csvToDocuments(csv: string): Record<string, unknown>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const docs: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const doc: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      let val: unknown = values[idx]?.trim().replace(/^"|"$/g, "") || "";
      const numVal = Number(val);
      if (!isNaN(numVal) && val !== "") val = numVal;
      if (val === "true") val = true;
      if (val === "false") val = false;
      doc[h] = val;
    });
    docs.push(doc);
  }

  return docs;
}

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/export",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { format, filter, projection, limit } = req.body as {
      format: "json" | "csv";
      filter?: Record<string, unknown>;
      projection?: Record<string, unknown>;
      limit?: number;
    };

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      let cursor = col.find(filter || {});
      if (projection && Object.keys(projection).length > 0) cursor = cursor.project(projection);
      cursor = cursor.limit(Math.min(limit || 1000, 10000));

      const docs = await cursor.toArray();
      const serialized = docs.map((d) => ({ ...d, _id: d._id?.toString() })) as Record<
        string,
        unknown
      >[];

      let data: string;
      if (format === "csv") {
        data = documentsToCSV(serialized);
      } else {
        data = JSON.stringify(serialized, null, 2);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${collectionName}_${timestamp}.${format}`;

      res.json({ data, format, documentCount: serialized.length, filename });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

router.post(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/import",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const { format, data, options } = req.body as {
      format: "json" | "csv";
      data: string;
      options?: { upsert?: boolean; dropFirst?: boolean };
    };

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);

      if (options?.dropFirst) {
        await col.drop().catch(() => {});
        await session.client.db(dbName).createCollection(collectionName);
      }

      let docs: Record<string, unknown>[];
      const errors: string[] = [];

      if (format === "json") {
        try {
          const parsed = JSON.parse(data);
          docs = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          res.status(400).json({ error: "parse_error", message: "Invalid JSON" });
          return;
        }
      } else {
        docs = csvToDocuments(data);
      }

      if (docs.length === 0) {
        res.json({ insertedCount: 0, updatedCount: 0, errors: [], success: true });
        return;
      }

      let insertedCount = 0;
      let updatedCount = 0;

      if (options?.upsert) {
        for (const doc of docs) {
          try {
            const { _id, ...rest } = doc;
            if (_id) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const r = await col.replaceOne({ _id: _id } as any, rest, { upsert: true });
              if (r.upsertedCount) insertedCount++;
              else updatedCount++;
            } else {
              await col.insertOne(doc);
              insertedCount++;
            }
          } catch (e) {
            errors.push(e instanceof Error ? e.message : "Unknown error");
          }
        }
      } else {
        try {
          const r = await col.insertMany(docs, { ordered: false });
          insertedCount = r.insertedCount;
        } catch (e: unknown) {
          if (e && typeof e === 'object' && 'insertedCount' in e) {
            insertedCount = (e as { insertedCount: number }).insertedCount;
            errors.push(`${docs.length - insertedCount} documents failed to insert`);
          } else {
            errors.push(e instanceof Error ? e.message : "Insert failed");
          }
        }
      }

      res.json({ insertedCount, updatedCount, errors, success: errors.length === 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

export default router;
