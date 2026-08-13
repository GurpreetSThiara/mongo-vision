import { useState, useEffect, useRef, useMemo } from "react";
import {
  Loader2, Plus, Move, ZoomIn, ZoomOut, Maximize2, Trash2, Check, X,
  Search, ShieldAlert, ChevronDown, ChevronRight, Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface SchemaField {
  name: string;
  type: string;
  nullable?: boolean;
  isArray?: boolean;
  children?: SchemaField[];
}

interface CollectionEntity {
  /** Stable identity for state keys (positions, relationships, selection) — never changes when the user renames the collection. */
  id: string;
  name: string;
  documentCount?: number;
  color?: string;
  fields: SchemaField[];
  validationRules?: Record<string, { required?: boolean; unique?: boolean; min?: number; max?: number; pattern?: string }>;
  indexes?: { name: string; keys: Record<string, number | string>; unique?: boolean; sparse?: boolean; ttl?: number }[];
  stats?: Record<string, { min?: number; max?: number; avg?: number; topValues?: { val: string; percentage: number }[] }>;
}

interface Relationship {
  /** CollectionEntity.id of the source collection. */
  from: string;
  field: string;
  /** CollectionEntity.id of the target collection. */
  to: string;
  type: "reference" | "embedded" | "many-to-many" | "virtual";
}

// Matches the full-detail card's `w-60` Tailwind width; height is an estimate since it varies with field count.
const CARD_WIDTH = 240;
const CARD_HEIGHT_ESTIMATE = 160;

const CARD_HEADER_HEIGHT = 45;
const FIELD_ROW_HEIGHT = 26;
const NESTED_CHILD_ROW_HEIGHT = 18;

function isSameLink(a: Relationship | null, b: Relationship): boolean {
  return a !== null && a.from === b.from && a.field === b.field && a.to === b.to;
}

/** Vertical offset (from the card's top) of a field's link anchor, accounting for expanded nested-object rows above it. */
function getFieldYOffset(
  col: CollectionEntity,
  fieldName: string,
  collapsedFields: Record<string, boolean>
): number {
  let offset = CARD_HEADER_HEIGHT;
  for (const field of col.fields) {
    if (field.name === fieldName) {
      return offset + FIELD_ROW_HEIGHT / 2;
    }
    offset += FIELD_ROW_HEIGHT;
    const isCollapsed = collapsedFields[`${col.id}.${field.name}`] || false;
    if (field.children && !isCollapsed) {
      offset += field.children.length * NESTED_CHILD_ROW_HEIGHT;
    }
  }
  return offset;
}

/** Full rendered height of a card's field list, accounting for expanded nested-object rows. */
function getCardHeight(col: CollectionEntity, collapsedFields: Record<string, boolean>): number {
  let height = CARD_HEADER_HEIGHT;
  for (const field of col.fields) {
    height += FIELD_ROW_HEIGHT;
    const isCollapsed = collapsedFields[`${col.id}.${field.name}`] || false;
    if (field.children && !isCollapsed) {
      height += field.children.length * NESTED_CHILD_ROW_HEIGHT;
    }
  }
  return height;
}

interface NoSqlSchemaBuilderProps {
  connectionId: string;
  database: string;
}

export function NoSqlSchemaBuilder({ connectionId, database }: NoSqlSchemaBuilderProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionEntity[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedColId, setSelectedColId] = useState<string | null>(null);

  // Sidebar controls
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "active">("all");

  // Canvas Pan & Zoom States
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Dragger & Linker States
  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [activeLinkSource, setActiveLinkSource] = useState<{ colId: string; field: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Inspector Right Panel Tabs
  const [inspectorTab, setInspectorTab] = useState<"properties" | "validation" | "indexes" | "stats" | "normalization" | "json">("properties");
  const [selectedLink, setSelectedLink] = useState<Relationship | null>(null);

  // Hover States
  const [hoveredLink, setHoveredLink] = useState<Relationship | null>(null);

  // Quick Templates command bar (Raycast style)
  const [showAiCommand, setShowAiCommand] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  // Collapsed nested object states
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>({});

  // Fetch database collections and build schemas
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    fetch(`/api/connections/${connectionId}/databases/${database}/schema-links`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message || `Failed to load schema (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        const rawCols = data.collections || [];

        const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
        const cols: CollectionEntity[] = rawCols.map((c: any, idx: number) => ({
          id: crypto.randomUUID(),
          name: c.name,
          documentCount: c.documentCount ?? 0,
          color: colors[idx % colors.length],
          fields: c.fields ?? [],
          validationRules: c.validationRules ?? {},
          indexes: c.indexes ?? [{ name: "_id_", keys: { _id: 1 }, unique: true }],
          stats: c.stats ?? {},
        }));

        setCollections(cols);
        if (cols.length > 0) setSelectedColId(cols[0].id);

        // Coordinates layout Grid
        const initialPos: Record<string, { x: number; y: number }> = {};
        cols.forEach((col, idx) => {
          const colIndex = idx % 3;
          const rowIndex = Math.floor(idx / 3);
          initialPos[col.id] = { x: 80 + colIndex * 380, y: 50 + rowIndex * 340 };
        });
        setPositions(initialPos);

        // Map relationships
        const discoveredLinks: Relationship[] = [];
        cols.forEach((col) => {
          col.fields.forEach((field) => {
            const fName = field.name.toLowerCase();
            // Require the "_id" / camelCase "Id" reference convention (userId, user_id) rather than a
            // bare "ends with id" check, which false-positives on words like "paid", "void", "grid", "uuid".
            const isSnakeCaseRef = fName !== "_id" && fName.endsWith("_id");
            const isCamelCaseRef = /[a-z0-9]Id$/.test(field.name);
            if (isSnakeCaseRef || isCamelCaseRef) {
              let prefix = field.name;
              if (fName.endsWith("_id")) {
                prefix = prefix.slice(0, -3);
              } else {
                prefix = prefix.slice(0, -2);
              }

              const match = cols.find((c) => {
                const cName = c.name.toLowerCase();
                return (
                  cName === prefix.toLowerCase() ||
                  cName === `${prefix.toLowerCase()}s` ||
                  cName === `${prefix.toLowerCase()}es` ||
                  (prefix.toLowerCase().endsWith("y") && cName === `${prefix.slice(0, -1).toLowerCase()}ies`)
                );
              });

              if (match) {
                discoveredLinks.push({
                  from: col.id,
                  field: field.name,
                  to: match.id,
                  type: field.type === "Array" ? "many-to-many" : "reference",
                });
              }
            }
          });
        });
        setRelationships(discoveredLinks);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load schema");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [connectionId, database]);

  // Window keydown for CMD+K AI command bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "k") return;
      const target = e.target as HTMLElement;
      const isEditingText = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isEditingText) return;
      e.preventDefault();
      setShowAiCommand((prev) => !prev);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Dragger Mouse Move listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingColId && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const pointerWorldX = (e.clientX - rect.left - pan.x) / zoom;
        const pointerWorldY = (e.clientY - rect.top - pan.y) / zoom;
        setPositions((prev) => ({
          ...prev,
          [draggingColId]: {
            x: Math.max(10, pointerWorldX - dragOffset.current.x),
            y: Math.max(10, pointerWorldY - dragOffset.current.y),
          },
        }));
      } else if (isPanning) {
        setPan({
          x: e.clientX - panStart.current.x,
          y: e.clientY - panStart.current.y,
        });
      } else if (activeLinkSource && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setMousePos({
          x: (e.clientX - rect.left - pan.x) / zoom,
          y: (e.clientY - rect.top - pan.y) / zoom,
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (draggingColId) setDraggingColId(null);
      if (isPanning) setIsPanning(false);

      if (activeLinkSource) {
        const target = e.target as HTMLElement;
        const cardEl = target.closest("[data-entity-id]");
        if (cardEl) {
          const targetColId = cardEl.getAttribute("data-entity-id");
          if (targetColId && targetColId !== activeLinkSource.colId) {
            setRelationships((prev) => {
              const duplicate = prev.some(
                (r) =>
                  r.from === activeLinkSource.colId &&
                  r.field === activeLinkSource.field &&
                  r.to === targetColId
              );
              if (duplicate) return prev;
              return [
                ...prev,
                { from: activeLinkSource.colId, field: activeLinkSource.field, to: targetColId, type: "reference" },
              ];
            });
          }
        }
        setActiveLinkSource(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingColId, isPanning, activeLinkSource, pan, zoom]);

  // Zooms/pans so every card in `posMap` fits within the visible canvas viewport
  const fitViewToPositions = (
    posMap: Record<string, { x: number; y: number }>,
    cols: CollectionEntity[] = collections
  ) => {
    if (!canvasRef.current || cols.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cols.forEach((col) => {
      const pos = posMap[col.id];
      if (!pos) return;
      const height = getCardHeight(col, collapsedFields);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + CARD_WIDTH);
      maxY = Math.max(maxY, pos.y + height);
    });
    if (!Number.isFinite(minX)) return;

    const PADDING = 80;
    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY - minY, 1);
    const scaleX = (rect.width - PADDING * 2) / contentWidth;
    const scaleY = (rect.height - PADDING * 2) / contentHeight;
    const nextZoom = Math.min(2, Math.max(0.3, Math.min(scaleX, scaleY)));

    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - (minX + contentWidth / 2) * nextZoom,
      y: rect.height / 2 - (minY + contentHeight / 2) * nextZoom,
    });
  };

  // Fit the canvas view once, right after the initial schema load settles
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (!loading && !didInitialFit.current && collections.length > 0 && canvasRef.current) {
      didInitialFit.current = true;
      fitViewToPositions(positions, collections);
    }
  }, [loading, collections, positions]);

  // Mouse Wheel zooms in and out, anchored on the cursor position
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const factor = 0.08;
    const nextZoom = Math.min(2, Math.max(0.3, e.deltaY < 0 ? zoom + factor : zoom - factor));

    const worldX = (cursorX - pan.x) / zoom;
    const worldY = (cursorY - pan.y) / zoom;

    setZoom(nextZoom);
    setPan({
      x: cursorX - worldX * nextZoom,
      y: cursorY - worldY * nextZoom,
    });
  };

  // Card Mouse Down selection and dragging
  const handleCardMouseDown = (colId: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("select") || target.closest("input")) return;
    setSelectedColId(colId);
    setDraggingColId(colId);
    const pos = positions[colId] || { x: 0, y: 0 };
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const pointerWorldX = (e.clientX - rect.left - pan.x) / zoom;
      const pointerWorldY = (e.clientY - rect.top - pan.y) / zoom;
      dragOffset.current = { x: pointerWorldX - pos.x, y: pointerWorldY - pos.y };
    }
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-entity-id]") || target.closest("button")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleRemoveCollection = (colId: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== colId));
    setRelationships((prev) => prev.filter((r) => r.from !== colId && r.to !== colId));
    if (selectedColId === colId) setSelectedColId(null);
  };

  const generateUniqueCollectionName = (base: string) => {
    const existingNames = new Set(collections.map((c) => c.name));
    if (!existingNames.has(base)) return base;
    let suffix = 2;
    while (existingNames.has(`${base}_${suffix}`)) suffix++;
    return `${base}_${suffix}`;
  };

  const handleAddCollection = () => {
    const id = crypto.randomUUID();
    const name = generateUniqueCollectionName(`collection_${collections.length + 1}`);
    const newCol: CollectionEntity = {
      id,
      name,
      documentCount: 0,
      color: "#3b82f6",
      fields: [
        { name: "_id", type: "ObjectId" },
        { name: "name", type: "String" },
      ],
      validationRules: {},
      indexes: [{ name: "_id_", keys: { _id: 1 } }],
      stats: {},
    };
    setCollections((prev) => [...prev, newCol]);
    setPositions((prev) => ({
      ...prev,
      [id]: { x: (100 - pan.x) / zoom, y: (100 - pan.y) / zoom },
    }));
  };

  const handleApplyNormalization = (colId: string, fieldName: string) => {
    const sourceCol = collections.find((c) => c.id === colId);
    if (!sourceCol) return;

    const field = sourceCol.fields.find((f) => f.name === fieldName);
    if (!field) return;

    const targetId = crypto.randomUUID();
    const targetName = generateUniqueCollectionName(`${fieldName}s`);
    const newCol: CollectionEntity = {
      id: targetId,
      name: targetName,
      documentCount: Math.floor(sourceCol.documentCount ? sourceCol.documentCount / 2 : 1000),
      color: "#8b5cf6",
      fields: [
        { name: "_id", type: "ObjectId" },
        ...(field.children
          ? field.children.map((ch) => ({ name: ch.name, type: ch.type }))
          : [{ name: "name", type: "String" }])
      ],
      validationRules: {},
      indexes: [{ name: "_id_", keys: { _id: 1 } }],
      stats: {},
    };

    const refKey = `${fieldName}Id`;
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id === colId) {
          return {
            ...c,
            fields: [
              ...c.fields.filter((f) => f.name !== fieldName),
              { name: refKey, type: "ObjectId" }
            ]
          };
        }
        return c;
      })
    );

    setCollections((prev) => [...prev, newCol]);

    setRelationships((prev) => [
      ...prev,
      { from: colId, field: refKey, to: targetId, type: "reference" }
    ]);

    const sourcePos = positions[colId] || { x: 100, y: 100 };
    setPositions((prev) => ({
      ...prev,
      [targetId]: { x: sourcePos.x + 360, y: sourcePos.y + 40 }
    }));

    setSelectedColId(colId);
  };

  const handleApplyDenormalization = (rel: Relationship) => {
    const sourceCol = collections.find((c) => c.id === rel.from);
    const targetCol = collections.find((c) => c.id === rel.to);
    if (!sourceCol || !targetCol) return;

    const targetFields = targetCol.fields.filter((f) => f.name !== "_id");
    const embeddedFieldName = targetCol.name.endsWith("s") ? targetCol.name.slice(0, -1) : `${targetCol.name}Detail`;

    setCollections((prev) =>
      prev.map((c) => {
        if (c.id === rel.from) {
          return {
            ...c,
            fields: [
              ...c.fields.filter((f) => f.name !== rel.field),
              {
                name: embeddedFieldName,
                type: "Object",
                children: targetFields.map((tf) => ({ name: tf.name, type: tf.type }))
              }
            ]
          };
        }
        return c;
      })
    );

    setRelationships((prev) =>
      prev.filter((r) => !(r.from === rel.from && r.field === rel.field && r.to === rel.to))
    );

    setSelectedLink(null);
    setSelectedColId(rel.from);
  };

  const startDrawingLink = (colId: string, fieldName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setActiveLinkSource({ colId, field: fieldName });
    setMousePos({
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    });
  };

  const getBsonIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "objectid": return "oid";
      case "string": return "abc";
      case "number":
      case "int":
      case "double": return "#";
      case "boolean": return "t/f";
      case "date": return "date";
      case "array": return "[]";
      default: return "{}";
    }
  };

  // Auto Layout algorithms
  const triggerLayout = (mode: "grid" | "circle" | "force") => {
    const nextPos: Record<string, { x: number; y: number }> = {};

    if (mode === "grid") {
      collections.forEach((col, idx) => {
        const colIndex = idx % 3;
        const rowIndex = Math.floor(idx / 3);
        nextPos[col.id] = { x: 80 + colIndex * 380, y: 50 + rowIndex * 340 };
      });
    } else if (mode === "circle") {
      const radius = 300;
      const count = collections.length;
      collections.forEach((col, idx) => {
        const angle = (idx / count) * 2 * Math.PI;
        nextPos[col.id] = {
          x: 400 + radius * Math.cos(angle),
          y: 350 + radius * Math.sin(angle),
        };
      });
    } else if (mode === "force") {
      // Basic Force-Directed springs solver
      const count = collections.length;
      const positionsArray = collections.map((col, idx) => {
        const colIndex = idx % 3;
        const rowIndex = Math.floor(idx / 3);
        return { id: col.id, x: 80 + colIndex * 380, y: 50 + rowIndex * 340 };
      });

      // Spring Repulsion solver
      for (let step = 0; step < 50; step++) {
        for (let i = 0; i < count; i++) {
          for (let j = 0; j < count; j++) {
            if (i === j) continue;
            const dx = positionsArray[i].x - positionsArray[j].x;
            const dy = positionsArray[i].y - positionsArray[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 320) {
              const force = (320 - dist) / 5;
              positionsArray[i].x += (dx / dist) * force;
              positionsArray[i].y += (dy / dist) * force;
            }
          }
        }
      }
      positionsArray.forEach((p) => {
        nextPos[p.id] = { x: Math.max(20, p.x), y: Math.max(20, p.y) };
      });
    }
    setPositions(nextPos);
    fitViewToPositions(nextPos);
  };

  // Quick-template generator: matches keywords in the prompt to canned starter schemas
  const handleExecuteAi = () => {
    if (!aiPrompt.trim()) return;

    const prompt = aiPrompt.toLowerCase();
    let templates: Omit<CollectionEntity, "id">[] = [];
    let genLinkTemplates: { from: string; field: string; to: string; type: Relationship["type"] }[] = [];

    if (prompt.includes("ecommerce") || prompt.includes("shop") || prompt.includes("store")) {
      templates = [
        {
          name: "users",
          documentCount: 12000,
          color: "#3b82f6",
          fields: [
            { name: "_id", type: "ObjectId" },
            { name: "name", type: "String" },
            { name: "email", type: "String" },
            { name: "createdAt", type: "Date" }
          ],
          validationRules: { email: { required: true, unique: true } },
          indexes: [{ name: "_id_", keys: { _id: 1 } }]
        },
        {
          name: "orders",
          documentCount: 45000,
          color: "#10b981",
          fields: [
            { name: "_id", type: "ObjectId" },
            { name: "userId", type: "ObjectId" },
            { name: "totalAmount", type: "Number" },
            { name: "status", type: "String" }
          ],
          validationRules: { userId: { required: true } },
          indexes: [{ name: "_id_", keys: { _id: 1 } }]
        },
        {
          name: "products",
          documentCount: 450,
          color: "#f59e0b",
          fields: [
            { name: "_id", type: "ObjectId" },
            { name: "title", type: "String" },
            { name: "price", type: "Number" },
            { name: "inventory", type: "Number" }
          ],
          validationRules: { title: { required: true } },
          indexes: [{ name: "_id_", keys: { _id: 1 } }]
        }
      ];
      genLinkTemplates = [
        { from: "orders", field: "userId", to: "users", type: "reference" }
      ];
    } else if (prompt.includes("saas") || prompt.includes("tenant") || prompt.includes("project")) {
      templates = [
        {
          name: "tenants",
          documentCount: 120,
          color: "#8b5cf6",
          fields: [
            { name: "_id", type: "ObjectId" },
            { name: "companyName", type: "String" },
            { name: "plan", type: "String" }
          ],
          validationRules: { companyName: { required: true } },
          indexes: [{ name: "_id_", keys: { _id: 1 } }]
        },
        {
          name: "members",
          documentCount: 2300,
          color: "#ef4444",
          fields: [
            { name: "_id", type: "ObjectId" },
            { name: "tenantId", type: "ObjectId" },
            { name: "fullName", type: "String" },
            { name: "role", type: "String" }
          ],
          validationRules: { tenantId: { required: true } },
          indexes: [{ name: "_id_", keys: { _id: 1 } }]
        }
      ];
      genLinkTemplates = [
        { from: "members", field: "tenantId", to: "tenants", type: "reference" }
      ];
    } else {
      templates = [
        {
          name: "accounts",
          documentCount: 1400,
          color: "#06b6d4",
          fields: [
            { name: "_id", type: "ObjectId" },
            { name: "username", type: "String" },
            { name: "status", type: "String" }
          ],
          validationRules: { username: { required: true } },
          indexes: [{ name: "_id_", keys: { _id: 1 } }]
        }
      ];
    }

    const nameToId = new Map<string, string>();
    const generated: CollectionEntity[] = templates.map((template) => {
      const id = crypto.randomUUID();
      nameToId.set(template.name, id);
      return { ...template, id, name: generateUniqueCollectionName(template.name) };
    });

    const genLinks: Relationship[] = genLinkTemplates.flatMap((link) => {
      const fromId = nameToId.get(link.from);
      const toId = nameToId.get(link.to);
      if (!fromId || !toId) return [];
      return [{ from: fromId, field: link.field, to: toId, type: link.type }];
    });

    setCollections((prev) => [...prev, ...generated]);
    setRelationships((prev) => [...prev, ...genLinks]);

    // Calculate layout coordinates
    const nextPos = { ...positions };
    generated.forEach((col, idx) => {
      nextPos[col.id] = { x: 120 + idx * 360, y: 150 };
    });
    setPositions(nextPos);

    setAiPrompt("");
    setShowAiCommand(false);
  };

  // Add field row visually inside card
  const handleAddNewField = (colId: string) => {
    setCollections((prev) =>
      prev.map((col) => {
        if (col.id === colId) {
          return {
            ...col,
            fields: [...col.fields, { name: `new_field_${col.fields.length}`, type: "String" }],
          };
        }
        return col;
      })
    );
  };

  // Remove field row visually
  const handleRemoveFieldRow = (colId: string, fieldName: string) => {
    setCollections((prev) =>
      prev.map((col) => {
        if (col.id === colId) {
          return {
            ...col,
            fields: col.fields.filter((f) => f.name !== fieldName),
          };
        }
        return col;
      })
    );
    setRelationships((prev) =>
      prev.filter((r) => !(r.from === colId && r.field === fieldName))
    );
  };

  // Filtered collections for sidebar list search
  const filteredSidebarCols = useMemo(() => {
    return collections.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(sidebarSearch.toLowerCase());
      if (sidebarFilter === "active") return matchSearch && !!c.documentCount && c.documentCount > 0;
      return matchSearch;
    });
  }, [collections, sidebarSearch, sidebarFilter]);

  // Active Selected collection details
  const activeColData = useMemo(() => {
    return collections.find((c) => c.id === selectedColId);
  }, [collections, selectedColId]);

  // Export string schema code generators (Mermaid syntax)
  const getMermaidExport = () => {
    const nameById = new Map(collections.map((col) => [col.id, col.name]));
    let str = "erDiagram\n";
    collections.forEach((col) => {
      str += `    ${col.name} {\n`;
      col.fields.forEach((f) => {
        str += `        ${f.type} ${f.name}\n`;
      });
      str += "    }\n";
    });
    relationships.forEach((r) => {
      str += `    ${nameById.get(r.from) ?? r.from} ||--o{ ${nameById.get(r.to) ?? r.to} : "references"\n`;
    });
    return str;
  };

  const handleExportMermaid = async () => {
    const diagram = getMermaidExport();
    try {
      await navigator.clipboard.writeText(diagram);
      toast({ title: "Copied to clipboard", description: "Mermaid ER diagram syntax" });
    } catch {
      toast({ title: "Couldn't copy to clipboard", description: "Clipboard access was denied", variant: "destructive" });
    }
  };

  const getBsonColorClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "objectid": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "string": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "number":
      case "int":
      case "double": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "boolean": return "bg-violet-500/10 text-violet-400 border-violet-500/20";
      case "date": return "bg-pink-500/10 text-pink-400 border-pink-500/20";
      case "array": return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      default: return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-sans">Initializing NoSQL database designer workspace...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3 text-center">
        <ShieldAlert className="w-8 h-8 text-destructive" />
        <p className="text-sm text-foreground font-sans font-medium">Couldn't load the schema for "{database}"</p>
        <p className="text-xs text-muted-foreground font-mono max-w-md">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 bg-background text-foreground overflow-hidden font-sans">
      {/* ── LEFT SIDEBAR (Notion/Linear Explorer style) ── */}
      <div className="w-64 border-r border-border/60 bg-sidebar flex flex-col shrink-0">
        {/* Search */}
        <div className="p-3 border-b border-border/40 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search schemas..."
              className="h-8 text-xs pl-7 bg-muted/40 font-mono"
            />
          </div>
          <div className="flex gap-1 bg-muted/30 p-0.5 rounded border border-border/40 text-[10px]">
            <button
              onClick={() => setSidebarFilter("all")}
              className={`flex-1 py-1 rounded text-center font-medium ${
                sidebarFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSidebarFilter("active")}
              className={`flex-1 py-1 rounded text-center font-medium ${
                sidebarFilter === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Active
            </button>
          </div>
        </div>

        {/* Collections list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground px-2 block mb-1">
            Collections Entities
          </span>
          {filteredSidebarCols.map((col) => (
            <div
              key={col.id}
              onClick={() => {
                setSelectedColId(col.id);
                // Center the canvas viewport on this card
                const pos = positions[col.id] || { x: 50, y: 50 };
                const rect = canvasRef.current?.getBoundingClientRect();
                const viewportWidth = rect?.width ?? 800;
                const viewportHeight = rect?.height ?? 600;
                setPan({
                  x: viewportWidth / 2 - (pos.x + CARD_WIDTH / 2) * zoom,
                  y: viewportHeight / 2 - (pos.y + CARD_HEIGHT_ESTIMATE / 2) * zoom,
                });
              }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                selectedColId === col.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color || "#ccc" }} />
              <span className="truncate flex-1 font-mono">{col.name}</span>
              {col.documentCount !== undefined && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {col.documentCount > 1000000
                    ? `${(col.documentCount / 1000000).toFixed(1)}M`
                    : col.documentCount.toLocaleString()}
                </span>
              )}
            </div>
          ))}
          {filteredSidebarCols.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground font-mono">
              No results
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border/40 shrink-0 relative group">
          <Button
            onClick={() => {
              setShowAiCommand(true);
              setAiPrompt("");
            }}
            className="w-full h-8 text-xs font-mono bg-purple-600/10 text-purple-400 border border-purple-500/25 hover:bg-purple-600 hover:text-white transition-all gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Quick Templates
          </Button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-52 p-2 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
            Generate starter collections from a keyword like "ecommerce", "saas", or "tenant"
          </div>
        </div>
      </div>

      {/* ── MIDDLE INFINITE ZOOMABLE CANVAS ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-background/30 relative">
        {/* Canvas Toolbar controls overlay */}
        <div className="absolute top-4 left-4 z-30 flex items-center bg-zinc-900/90 border border-border/80 rounded-lg p-1.5 shadow-lg gap-2 text-xs backdrop-blur">
          <span className="font-mono text-[10px] font-bold text-muted-foreground border-r border-border/40 pr-2 mr-1">Workspace</span>
          
          <div className="relative group flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-32 p-1.5 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
              Zoom out canvas (min 30%)
            </div>
          </div>

          <span className="text-[9px] font-mono w-10 text-center font-bold text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>

          <div className="relative group flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-32 p-1.5 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
              Zoom in canvas (max 200%)
            </div>
          </div>

          <div className="relative group flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => fitViewToPositions(positions)}
              title="Fit to Screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-36 p-1.5 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
              Zoom/pan to fit all cards in view
            </div>
          </div>

          <div className="h-4 w-[1px] bg-border/40 mx-1" />

          <div className="relative group flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => triggerLayout("grid")}
              className="h-6 text-[10px] font-mono px-2"
            >
              Grid Align
            </Button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-44 p-1.5 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
              Aligns collections into a clean uniform layout grid
            </div>
          </div>

          <div className="relative group flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => triggerLayout("force")}
              className="h-6 text-[10px] font-mono px-2"
            >
              Spring Layout
            </Button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-48 p-1.5 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
              Runs a physics-based spring repulsion simulation to separate cards
            </div>
          </div>

          <div className="h-4 w-[1px] bg-border/40 mx-1" />

          <div className="relative group flex items-center">
            <Button
              onClick={handleAddCollection}
              className="h-6 text-[10px] font-mono px-2 bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Create Entity
            </Button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-48 p-1.5 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
              Creates a new collection card template on the active workspace
            </div>
          </div>

          <div className="relative group flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportMermaid}
              className="h-6 text-[10px] font-mono px-2"
            >
              Export
            </Button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-48 p-1.5 bg-zinc-950 border border-border/80 rounded text-[9px] font-mono text-muted-foreground shadow-xl pointer-events-none text-center leading-normal">
              Copies the schema as Mermaid ER diagram syntax
            </div>
          </div>
        </div>

        {/* Real Canvas workspace container */}
        <div
          ref={canvasRef}
          onMouseDown={handleBackgroundMouseDown}
          onWheel={handleWheel}
          className={`flex-1 relative overflow-hidden select-none ${
            isPanning ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          {collections.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center pointer-events-none z-20">
              <p className="text-sm text-muted-foreground font-sans">"{database}" has no collections yet</p>
              <p className="text-xs text-muted-foreground/60 font-mono">Create one to start designing the schema</p>
            </div>
          )}

          {/* Zoom/Pan Scaled Layer */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
            className="absolute inset-0 w-[2400px] h-[1800px] pointer-events-none"
          >
            {/* SVG lines for relationships — rendered above the cards layer (z-30 > z-20) so hover
                tooltips and the delete button stay clickable even where a curve passes under a card */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
              <defs>
                <marker
                  id="builder-arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(139, 92, 246, 0.75)" />
                </marker>
              </defs>

              {relationships.map((link) => {
                const fromPos = positions[link.from];
                const toPos = positions[link.to];
                if (!fromPos || !toPos) return null;

                const col = collections.find((c) => c.id === link.from);
                const targetCol = collections.find((c) => c.id === link.to);
                const fieldYOffset = col ? getFieldYOffset(col, link.field, collapsedFields) : CARD_HEADER_HEIGHT;

                const startX = fromPos.x + 240;
                const startY = fromPos.y + fieldYOffset;
                const endX = toPos.x;
                const endY = toPos.y + 24;

                const cp1x = startX + 90;
                const cp1y = startY;
                const cp2x = endX - 90;
                const cp2y = endY;

                const isHovered = isSameLink(hoveredLink, link);
                const isSelected = isSameLink(selectedLink, link);

                return (
                  <g
                    key={`${link.from}-${link.field}-${link.to}`}
                    className="pointer-events-auto cursor-pointer animate-fadeIn"
                    onMouseEnter={() => setHoveredLink(link)}
                    onMouseLeave={() => setHoveredLink(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedColId(null);
                      setSelectedLink(link);
                      setInspectorTab("properties");
                    }}
                  >
                    {/* Glowing highlight stroke */}
                    <path
                      d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth={isSelected ? "8" : "6"}
                      className={`transition-opacity ${isSelected ? "opacity-35" : isHovered ? "opacity-20" : "opacity-0"}`}
                    />
                    {/* Core connection stroke */}
                    <path
                      d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                      fill="none"
                      stroke={
                        isSelected
                          ? "rgba(168, 85, 247, 0.95)"
                          : link.type === "embedded"
                          ? "rgba(156, 163, 175, 0.6)"
                          : link.type === "many-to-many"
                          ? "rgba(236, 72, 153, 0.75)"
                          : link.type === "virtual"
                          ? "rgba(59, 130, 246, 0.75)"
                          : isHovered
                          ? "var(--primary)"
                          : "rgba(139, 92, 246, 0.45)"
                      }
                      strokeWidth={
                        isSelected
                          ? "3"
                          : link.type === "many-to-many"
                          ? "4"
                          : isHovered
                          ? "2.5"
                          : "1.5"
                      }
                      strokeDasharray={link.type === "virtual" ? "4 4" : undefined}
                      markerEnd="url(#builder-arrow)"
                      className="transition-colors"
                    />

                    {/* Floating Info card overlay */}
                    {(isHovered || isSelected) && (
                      <foreignObject
                        x={(startX + endX) / 2 - 80}
                        y={(startY + endY) / 2 - 40}
                        width="160"
                        height="80"
                        className="pointer-events-none z-30"
                      >
                        <div className="bg-zinc-950/95 border border-purple-500/35 p-2 rounded-lg font-mono text-[9px] shadow-xl text-left text-muted-foreground w-36 select-none pointer-events-auto backdrop-blur">
                          <div className="font-bold text-foreground truncate">{link.field}</div>
                          <div className="text-purple-400 font-semibold uppercase text-[8px] mt-0.5 tracking-wider">
                            {link.type === "many-to-many" ? "N:M Array Ref" : "1:N ObjectId Ref"}
                          </div>
                          <div className="text-muted-foreground/60 text-[8px] mt-1">
                            references <span className="text-foreground">{targetCol?.name ?? link.to}._id</span>
                          </div>
                        </div>
                      </foreignObject>
                    )}

                    {/* Hover delete link button */}
                    {isHovered && (
                      <foreignObject
                        x={(startX + endX) / 2 - 12}
                        y={(startY + endY) / 2 + 15}
                        width="24"
                        height="24"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRelationships((prev) =>
                              prev.filter(
                                (r) => !(r.from === link.from && r.field === link.field && r.to === link.to)
                              )
                            );
                            setHoveredLink(null);
                            if (isSelected) setSelectedLink(null);
                          }}
                          className="h-6 w-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center pointer-events-auto shadow border border-red-500"
                          title="Remove relationship"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </foreignObject>
                    )}
                  </g>
                );
              })}

              {/* Temporary drawing pointer connection */}
              {activeLinkSource && (
                (() => {
                  const fromPos = positions[activeLinkSource.colId];
                  if (!fromPos) return null;
                  const col = collections.find((c) => c.id === activeLinkSource.colId);
                  const fieldYOffset = col
                    ? getFieldYOffset(col, activeLinkSource.field, collapsedFields)
                    : CARD_HEADER_HEIGHT;

                  return (
                    <line
                      x1={fromPos.x + 240}
                      y1={fromPos.y + fieldYOffset}
                      x2={mousePos.x}
                      y2={mousePos.y}
                      stroke="var(--primary)"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      markerEnd="url(#builder-arrow)"
                    />
                  );
                })()
              )}
            </svg>

            {/* Draggable Cards Layout grid */}
            <div className="absolute inset-0 w-full h-full pointer-events-none">
              {collections.map((col) => {
                const pos = positions[col.id] || { x: 50, y: 50 };
                const isSelected = selectedColId === col.id;

                // Zoom Scaling detail levels
                if (zoom < 0.25) {
                  // Level 4: Micro circle nodes
                  return (
                    <div
                      key={col.id}
                      data-entity-id={col.id}
                      style={{ left: pos.x + 100, top: pos.y + 40 }}
                      className="absolute w-8 h-8 rounded-full border border-white/20 shadow-lg pointer-events-auto cursor-pointer flex items-center justify-center bg-zinc-900"
                      onClick={() => setSelectedColId(col.id)}
                    >
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: col.color || "#ccc" }} />
                    </div>
                  );
                }

                if (zoom < 0.5) {
                  // Level 3: Large solid color name tags
                  return (
                    <div
                      key={col.id}
                      data-entity-id={col.id}
                      style={{ left: pos.x + 40, top: pos.y + 30 }}
                      onClick={() => setSelectedColId(col.id)}
                      className={`absolute px-4 py-2 border rounded-full shadow-lg pointer-events-auto cursor-pointer font-bold text-sm font-mono text-center flex items-center gap-2 ${
                        isSelected ? "border-primary bg-zinc-900 text-foreground" : "border-border/60 bg-zinc-950/90 text-muted-foreground"
                      }`}
                    >
                      <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: col.color || "#ccc" }} />
                      {col.name}
                    </div>
                  );
                }

                if (zoom < 0.85) {
                  // Level 2: Medium cards (Headers, counts)
                  return (
                    <div
                      key={col.id}
                      data-entity-id={col.id}
                      style={{ left: pos.x, top: pos.y }}
                      onClick={() => setSelectedColId(col.id)}
                      className={`absolute w-60 border rounded-lg bg-card shadow-lg pointer-events-auto cursor-pointer ${
                        isSelected ? "border-primary ring-2 ring-primary/20" : "border-border/60"
                      }`}
                    >
                      <div className="px-3.5 py-2.5 border-b border-border/60 flex items-center gap-2 bg-zinc-950/20 rounded-t-lg">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: col.color || "#ccc" }} />
                        <span className="font-bold text-xs font-mono text-foreground truncate flex-1">{col.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 font-mono">
                          {col.documentCount ? `${(col.documentCount / 1000).toFixed(0)}k` : "0"} docs
                        </Badge>
                      </div>
                    </div>
                  );
                }

                // Level 1: Full-detail Figma Cards
                return (
                  <div
                    key={col.id}
                    data-entity-id={col.id}
                    style={{ left: pos.x, top: pos.y }}
                    onMouseDown={(e) => handleCardMouseDown(col.id, e)}
                    className={`absolute w-60 border rounded-lg bg-card shadow-lg select-none cursor-grab active:cursor-grabbing pointer-events-auto z-20 ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/25 shadow-primary/5"
                        : "border-border/60 hover:shadow-xl"
                    }`}
                  >
                    {/* Header */}
                    <div className="px-3.5 py-2.5 border-b border-border/60 flex items-center justify-between bg-zinc-950/20 rounded-t-lg">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: col.color || "#3b82f6" }} />
                        <span className="font-bold text-xs font-mono text-foreground truncate">{col.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <button
                          type="button"
                          onClick={() => handleAddNewField(col.id)}
                          className="h-5 w-5 text-muted-foreground hover:text-foreground rounded hover:bg-muted flex items-center justify-center"
                          title="Add field row"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCollection(col.id)}
                          className="h-5 w-5 text-muted-foreground hover:text-destructive rounded hover:bg-muted flex items-center justify-center"
                          title="Delete entity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Fields List */}
                    <div className="py-1">
                      {col.fields.map((field, fIdx) => {
                        const isLinkSource = activeLinkSource?.colId === col.id && activeLinkSource?.field === field.name;
                        const isCollapsed = collapsedFields[`${col.id}.${field.name}`] || false;

                        return (
                          <div key={field.name} className="space-y-0.5">
                            <div className="px-3 py-1 flex items-center justify-between text-[11px] font-mono hover:bg-muted/40 transition-colors group relative">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {/* Drag Relationship anchor */}
                                <span
                                  onMouseDown={(e) => startDrawingLink(col.id, field.name, e)}
                                  className={`w-2.5 h-2.5 rounded-full border border-purple-500 hover:bg-purple-500 cursor-crosshair shrink-0 pointer-events-auto ${
                                    isLinkSource ? "bg-purple-500" : "bg-purple-500/20"
                                  }`}
                                  title="Drag reference line"
                                />
                                {/* Collapse chevron for nested object */}
                                {field.children && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCollapsedFields((prev) => ({
                                        ...prev,
                                        [`${col.id}.${field.name}`]: !isCollapsed,
                                      }))
                                    }
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                  >
                                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                )}
                                <span className="truncate text-foreground text-[10px]" title={field.name}>{field.name}</span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                <Badge variant="outline" className={`text-[8px] uppercase tracking-wider font-mono px-1 py-0 ${getBsonColorClass(field.type)}`}>
                                  {getBsonIcon(field.type)}
                                </Badge>
                                {field.name !== "_id" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFieldRow(col.id, field.name)}
                                    className="h-4 w-4 text-muted-foreground hover:text-destructive rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    title="Delete field"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Render Nested Object children */}
                            {field.children && !isCollapsed && (
                              <div className="pl-6 pr-3 py-0.5 space-y-0.5 border-l border-border/40 ml-[1.125rem] bg-zinc-950/10">
                                {field.children.map((child) => (
                                  <div key={child.name} className="flex items-center justify-between text-[9px] font-mono py-0.5">
                                    <span className="text-muted-foreground">├ {child.name}</span>
                                    <span className="text-muted-foreground/60 scale-90">{child.type.toLowerCase()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer Stats badge details */}
                    {col.documentCount !== undefined && (
                      <div className="px-3.5 py-1.5 border-t border-border/40 bg-zinc-950/10 rounded-b-lg flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                        <span>{col.fields.length} attributes</span>
                        <span>{col.documentCount.toLocaleString()} docs</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT INSPECTOR PANEL (Notion/Linear style tabbed inspector) ── */}
      <div className="w-80 border-l border-border/60 bg-sidebar flex flex-col shrink-0 min-h-0">
        {selectedLink ? (() => {
          const selectedLinkFromName = collections.find((c) => c.id === selectedLink.from)?.name ?? selectedLink.from;
          const selectedLinkToName = collections.find((c) => c.id === selectedLink.to)?.name ?? selectedLink.to;
          return (
          <div className="flex-1 flex flex-col min-h-0 font-mono text-xs">
            {/* Panel Header */}
            <div className="p-4 border-b border-border/60 shrink-0 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm font-mono truncate">Relation Link</h3>
                <p className="text-[10px] text-muted-foreground font-mono mt-1">
                  Connection Inspector
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLink(null)}
                className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted rounded flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              <div className="border border-border/40 rounded-lg p-3 space-y-2.5 bg-muted/15 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source Key:</span>
                  <span className="font-bold text-foreground truncate max-w-[120px]">{selectedLinkFromName}.{selectedLink.field}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Key:</span>
                  <span className="font-bold text-foreground">{selectedLinkToName}._id</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono">Relationship Type</span>
                <select
                  value={selectedLink.type}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setRelationships((prev) =>
                      prev.map((r) =>
                        r.from === selectedLink.from && r.field === selectedLink.field && r.to === selectedLink.to
                          ? { ...r, type: val }
                          : r
                      )
                    );
                    setSelectedLink((prev) => (prev ? { ...prev, type: val } : null));
                  }}
                  className="w-full h-8 bg-muted/30 border border-border/40 rounded text-xs px-2 font-mono text-foreground"
                >
                  <option value="reference">Reference (ObjectId)</option>
                  <option value="embedded">Embedded Object</option>
                  <option value="many-to-many">Many-to-Many Array</option>
                  <option value="virtual">Virtual Link</option>
                </select>
              </div>

              {/* Normalization recommendation block */}
              <div className="border border-purple-500/20 bg-purple-950/10 rounded-lg p-3 space-y-2.5 text-[10px]">
                <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  Design Recommendation
                </div>
                <p className="text-muted-foreground leading-normal">
                  {selectedLink.type === "reference" ? (
                    `Consider denormalizing (embedding). If "${selectedLinkToName}" is small and queried with "${selectedLinkFromName}" in most cases, embed its details to eliminate a lookup join.`
                  ) : (
                    `Consider normalizing (referencing). If target "${selectedLinkToName}" data updates frequently or grows rapidly, embedding it forces a write lock — extract it to a separate collection instead.`
                  )}
                </p>
                {selectedLink.type === "reference" && (
                  <Button
                    size="sm"
                    onClick={() => handleApplyDenormalization(selectedLink)}
                    className="w-full h-7 text-[10px] bg-purple-600 hover:bg-purple-700 text-white font-mono mt-1"
                  >
                    Apply Denormalization
                  </Button>
                )}
              </div>
            </div>
          </div>
          );
        })() : activeColData ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Panel Header */}
            <div className="p-4 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeColData.color || "#ccc" }} />
                <h3 className="font-bold text-sm font-mono truncate">{activeColData.name}</h3>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono mt-1">
                Schema Inspector
              </p>
            </div>

            {/* Inspector Tabs list */}
            <div className="flex bg-muted/40 border-b border-border/40 p-1 shrink-0 text-[10px] overflow-x-auto scrollbar-none">
              {["properties", "validation", "indexes", "stats", "normalization", "json"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInspectorTab(tab as any)}
                  className={`flex-1 py-1 rounded-sm text-center font-medium capitalize truncate px-1 shrink-0 ${
                    inspectorTab === tab ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "normalization" ? "Suggestions" : tab}
                </button>
              ))}
            </div>

            {/* Inspector Panel Body Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {inspectorTab === "properties" && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono">Collection Name</span>
                    <Input
                      value={activeColData.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCollections((prev) =>
                          prev.map((c) => (c.id === activeColData.id ? { ...c, name: val } : c))
                        );
                      }}
                      className="h-8 text-xs font-mono bg-muted/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono">Theme Color</span>
                    <div className="flex gap-2">
                      {["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"].map((clr) => (
                        <button
                          key={clr}
                          onClick={() => {
                            setCollections((prev) =>
                              prev.map((c) => (c.id === activeColData.id ? { ...c, color: clr } : c))
                            );
                          }}
                          className={`w-5 h-5 rounded-full border border-border/60 ${
                            activeColData.color === clr ? "ring-2 ring-primary ring-offset-2 ring-offset-zinc-900" : ""
                          }`}
                          style={{ backgroundColor: clr }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="border border-border/40 rounded-lg p-3 space-y-2 bg-muted/10 font-mono text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Document Count:</span>
                      <span className="font-bold">{activeColData.documentCount?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fields Total:</span>
                      <span className="font-bold">{activeColData.fields.length} attributes</span>
                    </div>
                  </div>
                </div>
              )}

              {inspectorTab === "validation" && (
                <div className="space-y-4">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono block">Validation Rules Editor</span>

                  <div className="space-y-3.5">
                    {activeColData.fields.map((field) => {
                      const rules = activeColData.validationRules?.[field.name] || {};
                      return (
                        <div key={field.name} className="border border-border/40 rounded-lg p-3 space-y-2.5 bg-muted/10 font-mono text-[10px]">
                          <div className="flex justify-between items-center font-bold">
                            <span className="text-foreground">{field.name}</span>
                            <span className="text-[9px] uppercase opacity-75">{field.type}</span>
                          </div>

                          <div className="space-y-1.5 pl-1.5">
                            {/* Toggle Required rule */}
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={rules.required || false}
                                onChange={(e) => {
                                  const updatedRules = { ...activeColData.validationRules };
                                  updatedRules[field.name] = { ...rules, required: e.target.checked };
                                  setCollections((prev) =>
                                    prev.map((c) => (c.id === activeColData.id ? { ...c, validationRules: updatedRules } : c))
                                  );
                                }}
                                className="rounded border-zinc-700 bg-zinc-900 accent-primary cursor-pointer"
                                id={`required-${field.name}`}
                              />
                              <label htmlFor={`required-${field.name}`} className="text-muted-foreground select-none cursor-pointer">Required</label>
                            </div>

                            {/* Toggle Unique rule */}
                            {field.name !== "_id" && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={rules.unique || false}
                                  onChange={(e) => {
                                    const updatedRules = { ...activeColData.validationRules };
                                    updatedRules[field.name] = { ...rules, unique: e.target.checked };
                                    setCollections((prev) =>
                                      prev.map((c) => (c.id === activeColData.id ? { ...c, validationRules: updatedRules } : c))
                                    );
                                  }}
                                  className="rounded border-zinc-700 bg-zinc-900 accent-primary cursor-pointer"
                                  id={`unique-${field.name}`}
                                />
                                <label htmlFor={`unique-${field.name}`} className="text-muted-foreground select-none cursor-pointer">Unique Index</label>
                              </div>
                            )}

                            {/* Regex patterns rules for String types */}
                            {field.type === "String" && (
                              <div className="space-y-1 mt-1">
                                <span className="text-[9px] text-muted-foreground">Pattern Regex:</span>
                                <Input
                                  value={rules.pattern || ""}
                                  onChange={(e) => {
                                    const updatedRules = { ...activeColData.validationRules };
                                    updatedRules[field.name] = { ...rules, pattern: e.target.value };
                                    setCollections((prev) =>
                                      prev.map((c) => (c.id === activeColData.id ? { ...c, validationRules: updatedRules } : c))
                                    );
                                  }}
                                  placeholder="e.g. ^\S+@\S+$"
                                  className="h-6 text-[10px] font-mono bg-muted/20"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {inspectorTab === "indexes" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between shrink-0">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono">Collection Indexes</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const updatedIndexes = [...(activeColData.indexes || [])];
                        const idxName = `idx_${activeColData.fields[1]?.name || "field"}`;
                        updatedIndexes.push({ name: idxName, keys: { [activeColData.fields[1]?.name || "_id"]: 1 } });
                        setCollections((prev) =>
                          prev.map((c) => (c.id === activeColData.id ? { ...c, indexes: updatedIndexes } : c))
                        );
                      }}
                      className="h-6 text-[10px] font-mono text-primary gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Index
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {activeColData.indexes?.map((idx, indexIdx) => (
                      <div key={idx.name} className="border border-border/40 rounded-lg p-3 space-y-2 bg-muted/10 font-mono text-[10px] relative">
                        <div className="flex justify-between items-center font-bold text-foreground">
                          <span>{idx.name}</span>
                          {idx.name !== "_id_" && (
                            <button
                              type="button"
                              onClick={() => {
                                const updatedIndexes = (activeColData.indexes || []).filter((_, i) => i !== indexIdx);
                                setCollections((prev) =>
                                  prev.map((c) => (c.id === activeColData.id ? { ...c, indexes: updatedIndexes } : c))
                                );
                              }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="text-[9px] text-muted-foreground">
                          Keys: <span className="text-foreground font-bold">{JSON.stringify(idx.keys)}</span>
                        </div>
                        {idx.ttl && (
                          <div className="text-[9px] text-violet-400">
                            TTL Expire: <span className="font-bold">{idx.ttl}s</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inspectorTab === "stats" && (
                <div className="space-y-4">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono block">Field Value Statistics</span>

                  <div className="space-y-3">
                    {activeColData.fields.map((field) => {
                      const stat = activeColData.stats?.[field.name];
                      if (!stat) {
                        return (
                          <div key={field.name} className="border border-border/40 rounded-lg p-3 space-y-1 bg-muted/5 font-mono text-[10px]">
                            <span className="text-muted-foreground font-bold">{field.name}</span>
                            <p className="text-[9px] text-muted-foreground/60 mt-1">No sampled statistics available</p>
                          </div>
                        );
                      }

                      return (
                        <div key={field.name} className="border border-border/40 rounded-lg p-3 space-y-2 bg-muted/10 font-mono text-[10px]">
                          <span className="text-foreground font-bold">{field.name}</span>

                          {/* Render Numeric Stats grid */}
                          {stat.min !== undefined && (
                            <div className="grid grid-cols-3 gap-1 p-1.5 rounded bg-muted/30 text-center font-bold text-[9px] border border-border/20">
                              <div>
                                <p className="text-muted-foreground text-[8px] uppercase">Min</p>
                                <p className="text-foreground mt-0.5">{stat.min}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-[8px] uppercase">Avg</p>
                                <p className="text-primary mt-0.5">{stat.avg}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-[8px] uppercase">Max</p>
                                <p className="text-foreground mt-0.5">{stat.max}</p>
                              </div>
                            </div>
                          )}

                          {/* Render Top Values string frequencies histograms */}
                          {stat.topValues && (
                            <div className="space-y-1.5 mt-1.5">
                              <p className="text-[8px] text-muted-foreground uppercase font-bold">Top Sample Frequencies</p>
                              {stat.topValues.map((val) => (
                                <div key={val.val} className="space-y-0.5">
                                  <div className="flex justify-between text-[9px] leading-none">
                                    <span className="text-emerald-400 truncate max-w-[65%]">"{val.val}"</span>
                                    <span className="text-muted-foreground">{val.percentage}%</span>
                                  </div>
                                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${val.percentage}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {inspectorTab === "normalization" && (
                <div className="space-y-4">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono block">AI Normalization Audit</span>

                  {/* Suggest normalizations for embedded fields */}
                  {activeColData.fields.some((f) => f.children && f.children.length > 0) ? (
                    activeColData.fields
                      .filter((f) => f.children && f.children.length > 0)
                      .map((field) => (
                        <div key={field.name} className="border border-purple-500/20 bg-purple-950/10 rounded-lg p-3 space-y-2.5 font-mono text-[10px]">
                          <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                            <Sparkles className="w-3.5 h-3.5" />
                            Normalization Audit
                          </div>
                          <p className="text-muted-foreground leading-normal">
                            Embedded object <span className="text-foreground font-bold">"{field.name}"</span> detected inside <span className="text-foreground font-bold">"{activeColData.name}"</span>.
                            Extract it into a separate referenced collection to minimize payload and document size overhead.
                          </p>
                          <Button
                            size="sm"
                            onClick={() => handleApplyNormalization(activeColData.id, field.name)}
                            className="w-full h-7 text-[10px] bg-purple-600 hover:bg-purple-700 text-white font-mono"
                          >
                            Extract & Normalize
                          </Button>
                        </div>
                      ))
                  ) : (
                    <div className="text-[10px] text-muted-foreground/60 font-mono py-2 bg-muted/5 p-3 rounded-lg border border-border/20 text-center">
                      No embedded structures found to normalize in "{activeColData.name}".
                    </div>
                  )}

                  {/* General AI Schema Quality Audit details */}
                  <div className="border border-border/40 rounded-lg p-3 bg-muted/10 font-mono text-[10px] space-y-2.5">
                    <div className="font-bold text-foreground">Anti-Pattern Scan</div>
                    <div className="text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 shrink-0" /> Indexes are correctly aligned.
                    </div>
                    <div className="text-amber-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> Optional fields need validations.
                    </div>
                  </div>
                </div>
              )}

              {inspectorTab === "json" && (
                <div className="space-y-4">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground font-mono block">Sample Document JSON</span>
                  <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[9px] border border-border overflow-x-auto whitespace-pre-wrap select-all max-h-96">
                    {JSON.stringify(
                      {
                        _id: "60f7e1b5f6b21c43202e88a1",
                        ...(activeColData.fields.reduce((acc, f) => {
                          if (f.name === "_id") return acc;
                          if (f.type === "Number") acc[f.name] = 412;
                          else if (f.type === "Boolean") acc[f.name] = true;
                          else if (f.type === "Date") acc[f.name] = new Date().toISOString();
                          else if (f.type === "Array") acc[f.name] = [];
                          else if (f.name === "address") acc[f.name] = { street: "123 Main St", city: "Metropolis", zip: 10001 };
                          else acc[f.name] = "sample_value";
                          return acc;
                        }, {} as Record<string, any>))
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center p-6 text-center text-muted-foreground font-mono text-xs">
            Select a collection card or relationship line on the canvas to inspect properties
          </div>
        )}
      </div>

      {/* ── QUICK TEMPLATES COMMAND BAR (Raycast-style prompt) ── */}
      {showAiCommand && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-24 animate-fadeIn">
          <div className="bg-zinc-900 border border-border/80 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col min-h-[120px]">
            {/* Input prompt */}
            <div className="p-3 border-b border-border/60 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400 shrink-0" />
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleExecuteAi();
                  else if (e.key === "Escape") setShowAiCommand(false);
                }}
                placeholder="Try 'ecommerce', 'saas', or describe your domain..."
                className="bg-transparent border-0 font-mono text-sm outline-none text-foreground flex-grow placeholder:text-muted-foreground/60 h-8"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowAiCommand(false)}
                className="h-6 w-6 text-muted-foreground hover:bg-muted rounded flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prompt Actions */}
            <div className="bg-zinc-950/40 p-2 px-3.5 flex justify-between items-center text-[10px] text-muted-foreground font-mono border-t border-border/10">
              <span>Press <kbd className="bg-zinc-900 border border-border/60 px-1 rounded text-foreground font-bold">ESC</kbd> to close</span>
              <span>Press <kbd className="bg-zinc-900 border border-border/60 px-1 rounded text-foreground font-bold">ENTER</kbd> to generate</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
