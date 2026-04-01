import { Router } from "express";
import { getSession } from "../lib/mongodb.js";

const router = Router();

type SchemaField = {
  name: string;
  path: string;
  type: string;
  types: string[];
  prevalence: number;
  nullable: boolean;
  isArray: boolean;
  isNested: boolean;
  children?: SchemaField[];
  sampleValues?: unknown[];
};

function inferType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "object") {
    if (value instanceof Date) return "date";
    if ((value as { _bsontype?: string })._bsontype === "ObjectID" || (value as { _bsontype?: string })._bsontype === "ObjectId") return "objectId";
    return "object";
  }
  return t;
}

function analyzeDocuments(
  docs: Record<string, unknown>[],
  prefix = ""
): SchemaField[] {
  const fieldStats = new Map<
    string,
    { types: Set<string>; count: number; samples: unknown[]; children?: Record<string, unknown>[] }
  >();

  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (!fieldStats.has(fullKey)) {
        fieldStats.set(fullKey, { types: new Set(), count: 0, samples: [] });
      }
      const stat = fieldStats.get(fullKey)!;
      stat.count++;
      const t = inferType(value);
      stat.types.add(t === "null" ? "null" : t);
      if (stat.samples.length < 3 && value !== null && value !== undefined) {
        stat.samples.push(value);
      }
      if (t === "object" && value !== null && !Array.isArray(value)) {
        if (!stat.children) stat.children = [];
        stat.children.push(value as Record<string, unknown>);
      }
      if (t === "array") {
        const arr = value as unknown[];
        if (arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null) {
          if (!stat.children) stat.children = [];
          stat.children.push(...(arr as Record<string, unknown>[]));
        }
      }
    }
  }

  const totalDocs = docs.length;
  const fields: SchemaField[] = [];

  for (const [fullKey, stat] of fieldStats.entries()) {
    const name = fullKey.split(".").pop() || fullKey;
    const types = Array.from(stat.types);
    const primaryType = types.find((t) => t !== "null") || "null";
    const isArray = primaryType === "array";
    const isNested = primaryType === "object";
    const nullable = stat.types.has("null") || stat.count < totalDocs;

    const field: SchemaField = {
      name,
      path: fullKey,
      type: primaryType,
      types,
      prevalence: Math.round((stat.count / totalDocs) * 100) / 100,
      nullable,
      isArray,
      isNested,
      sampleValues: stat.samples.slice(0, 3),
    };

    if (isNested && stat.children && stat.children.length > 0) {
      field.children = analyzeDocuments(stat.children, fullKey);
    }

    fields.push(field);
  }

  return fields.sort((a, b) => b.prevalence - a.prevalence);
}

router.get(
  "/connections/:connectionId/databases/:dbName/collections/:collectionName/schema",
  async (req, res) => {
    const { connectionId, dbName, collectionName } = req.params;
    const sampleSize = Math.min(Number(req.query.sampleSize) || 100, 500);

    const session = getSession(connectionId);
    if (!session) {
      res.status(404).json({ error: "not_found", message: "Connection not found" });
      return;
    }

    try {
      const col = session.client.db(dbName).collection(collectionName);
      const documentCount = await col.estimatedDocumentCount();
      const docs = await col
        .aggregate([{ $sample: { size: sampleSize } }])
        .toArray();

      const sanitizedDocs = docs.map((d) => ({ ...d, _id: d._id?.toString() })) as Record<
        string,
        unknown
      >[];

      const fields = analyzeDocuments(sanitizedDocs);

      const inconsistencies: { field: string; issue: string; affectedDocuments: number }[] = [];

      for (const field of fields) {
        if (field.types.length > 1 && !(field.types.length === 2 && field.types.includes("null"))) {
          const nonNullTypes = field.types.filter((t) => t !== "null");
          inconsistencies.push({
            field: field.path,
            issue: `Mixed types: ${nonNullTypes.join(", ")}`,
            affectedDocuments: Math.round(field.prevalence * sampleSize),
          });
        }
        if (field.prevalence < 0.5 && !field.nullable) {
          inconsistencies.push({
            field: field.path,
            issue: `Field only present in ${Math.round(field.prevalence * 100)}% of sampled documents`,
            affectedDocuments: Math.round((1 - field.prevalence) * sampleSize),
          });
        }
      }

      res.json({
        collectionName,
        documentCount,
        sampleSize: docs.length,
        fields,
        inconsistencies,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Schema analysis failed";
      res.status(500).json({ error: "server_error", message });
    }
  }
);

export default router;
