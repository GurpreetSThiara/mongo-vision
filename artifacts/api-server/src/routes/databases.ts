import { Router } from "express";
import { getSession } from "../lib/mongodb.js";
import { analyzeDocuments, type SchemaField } from "./schema.js";

const router = Router();

const SCHEMA_LINKS_SAMPLE_SIZE = 50;
const TOP_VALUES_LIMIT = 3;

function capitalize(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function toClientField(field: SchemaField): {
  name: string;
  type: string;
  nullable?: boolean;
  isArray?: boolean;
  children?: ReturnType<typeof toClientField>[];
} {
  return {
    name: field.name,
    type: capitalize(field.type),
    nullable: field.nullable,
    isArray: field.isArray,
    children: field.children?.map(toClientField),
  };
}

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

router.delete("/connections/:connectionId/databases/:dbName", async (req, res) => {
  const { connectionId, dbName } = req.params;
  const session = getSession(connectionId);
  if (!session) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }

  try {
    await session.client.db(dbName).dropDatabase();
    res.json({ success: true, message: `Database '${dbName}' dropped` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to drop database";
    res.status(500).json({ error: "server_error", message });
  }
});

router.get("/connections/:connectionId/databases/:dbName/schema-links", async (req, res) => {
  const { connectionId, dbName } = req.params;
  const session = getSession(connectionId);
  if (!session) {
    res.status(404).json({ error: "not_found", message: "Connection not found" });
    return;
  }

  try {
    const db = session.client.db(dbName);
    const collections = await db.listCollections().toArray();

    const result = await Promise.all(
      collections.map(async (colInfo) => {
        const col = db.collection(colInfo.name);
        try {
          const [documentCount, sampleDocs, indexes] = await Promise.all([
            col.estimatedDocumentCount(),
            col.aggregate([{ $sample: { size: SCHEMA_LINKS_SAMPLE_SIZE } }]).toArray(),
            col.indexes(),
          ]);

          const sanitizedDocs = sampleDocs.map((d) => ({ ...d, _id: d._id?.toString() })) as Record<
            string,
            unknown
          >[];

          const analyzed =
            sanitizedDocs.length > 0
              ? analyzeDocuments(sanitizedDocs)
              : [
                  {
                    name: "_id",
                    path: "_id",
                    type: "objectId",
                    types: ["objectId"],
                    prevalence: 1,
                    nullable: false,
                    isArray: false,
                    isNested: false,
                  } satisfies SchemaField,
                ];

          const validatorSchema = (colInfo.options as { validator?: { $jsonSchema?: { required?: unknown } } })
            ?.validator?.$jsonSchema;
          const requiredFields = new Set<string>(
            Array.isArray(validatorSchema?.required) ? (validatorSchema.required as string[]) : []
          );

          const uniqueSingleFieldNames = new Set(
            indexes
              .filter((idx) => idx.unique && Object.keys(idx.key).length === 1)
              .map((idx) => Object.keys(idx.key)[0])
          );

          const validationRules: Record<string, { required?: boolean; unique?: boolean }> = {};
          const stats: Record<
            string,
            { min?: number; max?: number; avg?: number; topValues?: { val: string; percentage: number }[] }
          > = {};

          for (const field of analyzed) {
            const rules: { required?: boolean; unique?: boolean } = {};
            if (field.name === "_id" || requiredFields.has(field.name)) rules.required = true;
            if (uniqueSingleFieldNames.has(field.name)) rules.unique = true;
            if (Object.keys(rules).length > 0) validationRules[field.name] = rules;

            if (field.type === "number") {
              const numericValues = sanitizedDocs
                .map((d) => d[field.name])
                .filter((v): v is number => typeof v === "number");
              if (numericValues.length > 0) {
                stats[field.name] = {
                  min: Math.min(...numericValues),
                  max: Math.max(...numericValues),
                  avg:
                    Math.round(
                      (numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length) * 100
                    ) / 100,
                };
              }
            } else if (field.type === "string" && field.name !== "_id") {
              const valueCounts = new Map<string, number>();
              let totalSeen = 0;
              for (const doc of sanitizedDocs) {
                const val = doc[field.name];
                if (typeof val === "string") {
                  valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
                  totalSeen++;
                }
              }
              if (totalSeen > 0) {
                const topValues = Array.from(valueCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, TOP_VALUES_LIMIT)
                  .map(([val, count]) => ({ val, percentage: Math.round((count / totalSeen) * 100) }));
                if (topValues.length > 0) stats[field.name] = { topValues };
              }
            }
          }

          return {
            name: colInfo.name,
            documentCount,
            fields: analyzed.map(toClientField),
            validationRules,
            indexes: indexes.map((idx) => ({
              name: idx.name ?? Object.keys(idx.key).join("_"),
              keys: idx.key as Record<string, number | string>,
              unique: idx.unique,
              sparse: idx.sparse,
              ttl: idx.expireAfterSeconds,
            })),
            stats,
          };
        } catch {
          return {
            name: colInfo.name,
            documentCount: 0,
            fields: [{ name: "_id", type: "ObjectId" }],
            validationRules: {},
            indexes: [{ name: "_id_", keys: { _id: 1 }, unique: true }],
            stats: {},
          };
        }
      })
    );

    res.json({ collections: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get schema links";
    res.status(500).json({ error: "server_error", message });
  }
});

export default router;
