import { useState, useEffect, useRef, useMemo } from "react";
import {
  Loader2, Plus, Database, Move, Compass, ZoomIn, ZoomOut, Maximize2, Trash2, Edit2, Check, X,
  Search, Shield, Settings, Activity, Clock, BookmarkCheck, FileJson, Play, Filter,
  ArrowRight, ShieldAlert, Sliders, ChevronDown, ChevronRight, BarChart3, HelpCircle, Terminal, Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SchemaField {
  name: string;
  type: string;
  nullable?: boolean;
  isArray?: boolean;
  children?: SchemaField[];
}

interface CollectionEntity {
  name: string;
  documentCount?: number;
  color?: string;
  fields: SchemaField[];
  validationRules?: Record<string, { required?: boolean; unique?: boolean; min?: number; max?: number; pattern?: string }>;
  indexes?: { name: string; keys: Record<string, number | string>; unique?: boolean; sparse?: boolean; ttl?: number }[];
  stats?: Record<string, { min?: number; max?: number; avg?: number; topValues?: { val: string; count: number }[] }>;
}

interface Relationship {
  from: string;
  field: string;
  to: string;
  type: "reference" | "embedded" | "many-to-many" | "virtual";
}

interface NoSqlSchemaBuilderProps {
  connectionId: string;
  database: string;
}

export function NoSqlSchemaBuilder({ connectionId, database }: NoSqlSchemaBuilderProps) {
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<CollectionEntity[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedCol, setSelectedCol] = useState<string | null>(null);

  // Sidebar controls
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "active" | "favorites">("all");

  // Canvas Pan & Zoom States
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Dragger & Linker States
  const [draggingCol, setDraggingCol] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [activeLinkSource, setActiveLinkSource] = useState<{ col: string; field: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Inspector Right Panel Tabs
  const [inspectorTab, setInspectorTab] = useState<"properties" | "validation" | "indexes" | "stats" | "json">("properties");

  // Hover States
  const [hoveredLink, setHoveredLink] = useState<Relationship | null>(null);

  // AI Command Bar (Raycast style)
  const [showAiCommand, setShowAiCommand] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Collapsed nested object states
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>({});

  // Fetch database collections and build schemas
  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/connections/${connectionId}/databases/${database}/schema-links`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const rawCols = data.collections || [];

        // Synthesize detailed NoSQL collection schema cards with stats and validation configurations
        const cols: CollectionEntity[] = rawCols.map((c: any, idx: number) => {
          // Pre-populate mock stats and validations to give Figma-like richness
          const validationRules: Record<string, any> = {};
          const stats: Record<string, any> = {};
          const indexes: any[] = [{ name: "_id_", keys: { _id: 1 }, unique: true }];

          c.fields.forEach((f: any) => {
            // Validation default mock
            if (f.name === "email") {
              validationRules[f.name] = { required: true, unique: true, pattern: "^\\S+@\\S+\\.\\S+$" };
            } else if (f.name === "_id") {
              validationRules[f.name] = { required: true };
            } else {
              validationRules[f.name] = { required: Math.random() > 0.5 };
            }

            // Stats default mock
            if (f.type === "Number") {
              stats[f.name] = { min: 5, max: 2500, avg: 412 };
            } else if (f.type === "String" && f.name !== "_id" && f.name !== "email") {
              stats[f.name] = {
                topValues: [
                  { val: "active", count: 72 },
                  { val: "pending", count: 18 },
                  { val: "inactive", count: 10 }
                ]
              };
            }
          });

          // Compound indexes mock
          if (c.fields.some((f: any) => f.name === "createdAt")) {
            indexes.push({ name: "createdAt_ttl", keys: { createdAt: 1 }, ttl: 3600 });
          }

          const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
          return {
            name: c.name,
            documentCount: 1000 + Math.floor(Math.random() * 5000000),
            color: colors[idx % colors.length],
            fields: c.fields.map((f: any) => ({
              name: f.name,
              type: f.type,
              children: f.name === "address" ? [
                { name: "street", type: "String" },
                { name: "city", type: "String" },
                { name: "zip", type: "Number" }
              ] : undefined
            })),
            validationRules,
            indexes,
            stats,
          };
        });

        setCollections(cols);
        if (cols.length > 0) setSelectedCol(cols[0].name);

        // Coordinates layout Grid
        const initialPos: Record<string, { x: number; y: number }> = {};
        cols.forEach((col, idx) => {
          const colIndex = idx % 3;
          const rowIndex = Math.floor(idx / 3);
          initialPos[col.name] = { x: 80 + colIndex * 380, y: 50 + rowIndex * 340 };
        });
        setPositions(initialPos);

        // Map relationships
        const discoveredLinks: Relationship[] = [];
        cols.forEach((col) => {
          col.fields.forEach((field) => {
            const fName = field.name.toLowerCase();
            if (fName !== "_id" && (fName.endsWith("id") || fName.endsWith("_id"))) {
              let prefix = field.name;
              if (prefix.toLowerCase().endsWith("_id")) {
                prefix = prefix.slice(0, -3);
              } else if (prefix.toLowerCase().endsWith("id")) {
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
                  from: col.name,
                  field: field.name,
                  to: match.name,
                  type: field.type === "Array" ? "many-to-many" : "reference",
                });
              }
            }
          });
        });
        setRelationships(discoveredLinks);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [connectionId, database]);

  // Window keydown for CMD+K AI command bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowAiCommand((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Dragger Mouse Move listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingCol) {
        const currentZoom = zoom;
        setPositions((prev) => {
          const pos = prev[draggingCol] || { x: 0, y: 0 };
          return {
            ...prev,
            [draggingCol]: {
              x: Math.max(10, pos.x + e.movementX / currentZoom),
              y: Math.max(10, pos.y + e.movementY / currentZoom),
            },
          };
        });
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
      if (draggingCol) setDraggingCol(null);
      if (isPanning) setIsPanning(false);

      if (activeLinkSource) {
        const target = e.target as HTMLElement;
        const cardEl = target.closest("[data-entity-name]");
        if (cardEl) {
          const targetCol = cardEl.getAttribute("data-entity-name");
          if (targetCol && targetCol !== activeLinkSource.col) {
            setRelationships((prev) => {
              const duplicate = prev.some(
                (r) =>
                  r.from === activeLinkSource.col &&
                  r.field === activeLinkSource.field &&
                  r.to === targetCol
              );
              if (duplicate) return prev;
              return [
                ...prev,
                { from: activeLinkSource.col, field: activeLinkSource.field, to: targetCol, type: "reference" },
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
  }, [draggingCol, isPanning, activeLinkSource, pan, zoom]);

  // Mouse Wheel zooms in and out
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = 0.08;
    const nextZoom = e.deltaY < 0 ? zoom + factor : zoom - factor;
    setZoom(Math.min(2, Math.max(0.3, nextZoom)));
  };

  // Card Mouse Down selection and dragging
  const handleCardMouseDown = (colName: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("select") || target.closest("input")) return;
    setSelectedCol(colName);
    setDraggingCol(colName);
    const pos = positions[colName] || { x: 0, y: 0 };
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-entity-name]") || target.closest("button")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleRemoveCollection = (colName: string) => {
    setCollections((prev) => prev.filter((c) => c.name !== colName));
    setRelationships((prev) => prev.filter((r) => r.from !== colName && r.to !== colName));
    if (selectedCol === colName) setSelectedCol(null);
  };

  const startDrawingLink = (colName: string, fieldName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setActiveLinkSource({ col: colName, field: fieldName });
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
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const nextPos: Record<string, { x: number; y: number }> = {};

    if (mode === "grid") {
      collections.forEach((col, idx) => {
        const colIndex = idx % 3;
        const rowIndex = Math.floor(idx / 3);
        nextPos[col.name] = { x: 80 + colIndex * 380, y: 50 + rowIndex * 340 };
      });
    } else if (mode === "circle") {
      const radius = 300;
      const count = collections.length;
      collections.forEach((col, idx) => {
        const angle = (idx / count) * 2 * Math.PI;
        nextPos[col.name] = {
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
        return { name: col.name, x: 80 + colIndex * 380, y: 50 + rowIndex * 340 };
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
        nextPos[p.name] = { x: Math.max(20, p.x), y: Math.max(20, p.y) };
      });
    }
    setPositions(nextPos);
  };

  // AI Generator prompt solver
  const handleExecuteAi = () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);

    setTimeout(() => {
      // Contextual schema generators based on prompt keywords
      const prompt = aiPrompt.toLowerCase();
      let generated: CollectionEntity[] = [];
      let genLinks: Relationship[] = [];

      if (prompt.includes("ecommerce") || prompt.includes("shop") || prompt.includes("store")) {
        generated = [
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
        genLinks = [
          { from: "orders", field: "userId", to: "users", type: "reference" }
        ];
      } else if (prompt.includes("saas") || prompt.includes("tenant") || prompt.includes("project")) {
        generated = [
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
        genLinks = [
          { from: "members", field: "tenantId", to: "tenants", type: "reference" }
        ];
      } else {
        // Fallback default mock
        generated = [
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

      setCollections((prev) => [...prev, ...generated]);
      setRelationships((prev) => [...prev, ...genLinks]);

      // Calculate layout coordinates
      const nextPos = { ...positions };
      generated.forEach((col, idx) => {
        nextPos[col.name] = { x: 120 + idx * 360, y: 150 };
      });
      setPositions(nextPos);

      setIsAiLoading(false);
      setAiPrompt("");
      setShowAiCommand(false);
    }, 1500);
  };

  // Add field row visually inside card
  const handleAddNewField = (colName: string) => {
    setCollections((prev) =>
      prev.map((col) => {
        if (col.name === colName) {
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
  const handleRemoveFieldRow = (colName: string, fieldName: string) => {
    setCollections((prev) =>
      prev.map((col) => {
        if (col.name === colName) {
          return {
            ...col,
            fields: col.fields.filter((f) => f.name !== fieldName),
          };
        }
        return col;
      })
    );
    setRelationships((prev) =>
      prev.filter((r) => !(r.from === colName && r.field === fieldName))
    );
  };

  // Filtered collections for sidebar list search
  const filteredSidebarCols = useMemo(() => {
    return collections.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(sidebarSearch.toLowerCase());
      if (sidebarFilter === "all") return matchSearch;
      if (sidebarFilter === "active") return matchSearch && c.documentCount && c.documentCount > 0;
      return matchSearch; // default fallback
    });
  }, [collections, sidebarSearch, sidebarFilter]);

  // Active Selected collection details
  const activeColData = useMemo(() => {
    return collections.find((c) => c.name === selectedCol);
  }, [collections, selectedCol]);

  // Export string schema code generators (Mermaid syntax)
  const getMermaidExport = () => {
    let str = "erDiagram\n";
    collections.forEach((col) => {
      str += `    ${col.name} {\n`;
      col.fields.forEach((f) => {
        str += `        ${f.type} ${f.name}\n`;
      });
      str += "    }\n";
    });
    relationships.forEach((r) => {
      str += `    ${r.from} ||--o{ ${r.to} : "references"\n`;
    });
    return str;
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
              key={col.name}
              onClick={() => {
                setSelectedCol(col.name);
                // Center pan view on card
                const pos = positions[col.name] || { x: 50, y: 50 };
                setPan({ x: 100 - pos.x * zoom, y: 100 - pos.y * zoom });
              }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                selectedCol === col.name ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color || "#ccc" }} />
              <span className="truncate flex-1 font-mono">{col.name}</span>
              {col.documentCount && (
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

        <div className="p-3 border-t border-border/40 shrink-0">
          <Button
            onClick={() => {
              setShowAiCommand(true);
              setAiPrompt("");
            }}
            className="w-full h-8 text-xs font-mono bg-purple-600/10 text-purple-400 border border-purple-500/25 hover:bg-purple-600 hover:text-white transition-all gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> AI Command Bar
          </Button>
        </div>
      </div>

      {/* ── MIDDLE INFINITE ZOOMABLE CANVAS ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-background/30 relative">
        {/* Canvas Toolbar controls overlay */}
        <div className="absolute top-4 left-4 z-30 flex items-center bg-zinc-900/90 border border-border/80 rounded-lg p-1.5 shadow-lg gap-2 text-xs backdrop-blur">
          <span className="font-mono text-[10px] font-bold text-muted-foreground border-r border-border/40 pr-2 mr-1">Workspace</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[9px] font-mono w-10 text-center font-bold text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <div className="h-4 w-[1px] bg-border/40 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => triggerLayout("grid")}
            className="h-6 text-[10px] font-mono px-2"
          >
            Grid Align
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => triggerLayout("force")}
            className="h-6 text-[10px] font-mono px-2"
          >
            Spring Layout
          </Button>
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
          {/* Zoom/Pan Scaled Layer */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
            className="absolute inset-0 w-[2400px] h-[1800px] pointer-events-none"
          >
            {/* SVG lines for relationships */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
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

                const col = collections.find((c) => c.name === link.from);
                const fieldIndex = col ? col.fields.findIndex((f) => f.name === link.field) : 0;
                const fieldYOffset = 45 + fieldIndex * 26 + 13;

                const startX = fromPos.x + 240;
                const startY = fromPos.y + fieldYOffset;
                const endX = toPos.x;
                const endY = toPos.y + 24;

                const cp1x = startX + 90;
                const cp1y = startY;
                const cp2x = endX - 90;
                const cp2y = endY;

                const isHovered = hoveredLink?.from === link.from && hoveredLink?.field === link.field;

                return (
                  <g
                    key={`${link.from}-${link.field}-${link.to}`}
                    className="pointer-events-auto cursor-pointer"
                    onMouseEnter={() => setHoveredLink(link)}
                    onMouseLeave={() => setHoveredLink(null)}
                  >
                    <path
                      d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="6"
                      className={`transition-opacity ${isHovered ? "opacity-25" : "opacity-0"}`}
                    />
                    <path
                      d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                      fill="none"
                      stroke={isHovered ? "var(--primary)" : "rgba(139, 92, 246, 0.45)"}
                      strokeWidth={isHovered ? "2.5" : "1.5"}
                      strokeDasharray={link.type === "virtual" ? "4 4" : undefined}
                      markerEnd="url(#builder-arrow)"
                      className="transition-colors"
                    />
                    {isHovered && (
                      <foreignObject
                        x={(startX + endX) / 2 - 12}
                        y={(startY + endY) / 2 - 12}
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
                          }}
                          className="h-6 w-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center pointer-events-auto shadow border border-red-500"
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
                  const fromPos = positions[activeLinkSource.col];
                  if (!fromPos) return null;
                  const col = collections.find((c) => c.name === activeLinkSource.col);
                  const fieldIndex = col ? col.fields.findIndex((f) => f.name === activeLinkSource.field) : 0;
                  const fieldYOffset = 45 + fieldIndex * 26 + 13;

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
                const pos = positions[col.name] || { x: 50, y: 50 };
                const isSelected = selectedCol === col.name;

                // Zoom Scaling detail levels
                if (zoom < 0.25) {
                  // Level 4: Micro circle nodes
                  return (
                    <div
                      key={col.name}
                      style={{ left: pos.x + 100, top: pos.y + 40 }}
                      className="absolute w-8 h-8 rounded-full border border-white/20 shadow-lg pointer-events-auto cursor-pointer flex items-center justify-center bg-zinc-900"
                      onClick={() => setSelectedCol(col.name)}
                    >
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: col.color || "#ccc" }} />
                    </div>
                  );
                }

                if (zoom < 0.5) {
                  // Level 3: Large solid color name tags
                  return (
                    <div
                      key={col.name}
                      style={{ left: pos.x + 40, top: pos.y + 30 }}
                      onClick={() => setSelectedCol(col.name)}
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
                      key={col.name}
                      style={{ left: pos.x, top: pos.y }}
                      onClick={() => setSelectedCol(col.name)}
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
                    key={col.name}
                    data-entity-name={col.name}
                    style={{ left: pos.x, top: pos.y }}
                    onMouseDown={(e) => handleCardMouseDown(col.name, e)}
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
                          onClick={() => handleAddNewField(col.name)}
                          className="h-5 w-5 text-muted-foreground hover:text-foreground rounded hover:bg-muted flex items-center justify-center"
                          title="Add field row"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCollection(col.name)}
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
                        const isLinkSource = activeLinkSource?.col === col.name && activeLinkSource?.field === field.name;
                        const isCollapsed = collapsedFields[`${col.name}.${field.name}`] || false;

                        return (
                          <div key={field.name} className="space-y-0.5">
                            <div className="px-3 py-1 flex items-center justify-between text-[11px] font-mono hover:bg-muted/40 transition-colors group relative">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {/* Drag Relationship anchor */}
                                <span
                                  onMouseDown={(e) => startDrawingLink(col.name, field.name, e)}
                                  className="w-2.5 h-2.5 rounded-full border border-purple-500 bg-purple-500/20 hover:bg-purple-500 cursor-crosshair shrink-0 pointer-events-auto"
                                  title="Drag reference line"
                                />
                                {/* Collapse chevron for nested object */}
                                {field.children && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCollapsedFields((prev) => ({
                                        ...prev,
                                        [`${col.name}.${field.name}`]: !isCollapsed,
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
                                    onClick={() => handleRemoveFieldRow(col.name, field.name)}
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
                              <div className="pl-6 pr-3 py-0.5 space-y-0.5 border-l border-border/40 ml-4.5 bg-zinc-950/10">
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
                    {col.documentCount && (
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
        {activeColData ? (
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
            <div className="flex bg-muted/40 border-b border-border/40 p-1 shrink-0 text-[10px]">
              {["properties", "validation", "indexes", "stats", "json"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInspectorTab(tab as any)}
                  className={`flex-1 py-1 rounded-sm text-center font-medium capitalize truncate px-0.5 ${
                    inspectorTab === tab ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
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
                          prev.map((c) => (c.name === activeColData.name ? { ...c, name: val } : c))
                        );
                        setSelectedCol(val);
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
                              prev.map((c) => (c.name === activeColData.name ? { ...c, color: clr } : c))
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
                                    prev.map((c) => (c.name === activeColData.name ? { ...c, validationRules: updatedRules } : c))
                                  );
                                }}
                                className="rounded border-zinc-700 bg-zinc-900 accent-primary"
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
                                      prev.map((c) => (c.name === activeColData.name ? { ...c, validationRules: updatedRules } : c))
                                    );
                                  }}
                                  className="rounded border-zinc-700 bg-zinc-900 accent-primary"
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
                                      prev.map((c) => (c.name === activeColData.name ? { ...c, validationRules: updatedRules } : c))
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
                          prev.map((c) => (c.name === activeColData.name ? { ...c, indexes: updatedIndexes } : c))
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
                                  prev.map((c) => (c.name === activeColData.name ? { ...c, indexes: updatedIndexes } : c))
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
                                    <span className="text-muted-foreground">{val.count}%</span>
                                  </div>
                                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${val.count}%` }} />
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
            Select a collection card on the canvas to inspect properties
          </div>
        )}
      </div>

      {/* ── AI COMMAND BAR (Raycast Prompt) ── */}
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
                  if (e.key === "Enter") void handleExecuteAi();
                  else if (e.key === "Escape") setShowAiCommand(false);
                }}
                placeholder="Ask AI e.g. '/generate SaaS tenants and members schemas'..."
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
              {isAiLoading ? (
                <span className="flex items-center gap-1 text-purple-400 font-bold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Spawning Entities...
                </span>
              ) : (
                <span>Press <kbd className="bg-zinc-900 border border-border/60 px-1 rounded text-foreground font-bold">ENTER</kbd> to generate</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
