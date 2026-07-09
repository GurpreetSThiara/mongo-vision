import { useState, useEffect, useRef } from "react";
import { Loader2, Plus, Database, Move, Compass, ZoomIn, ZoomOut, Maximize2, Trash2, Edit2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SchemaField {
  name: string;
  type: string;
}

interface CollectionEntity {
  name: string;
  fields: SchemaField[];
}

interface DatabaseERDProps {
  connectionId: string;
  database: string;
}

interface Relationship {
  from: string;
  field: string;
  to: string;
}

export function DatabaseERD({ connectionId, database }: DatabaseERDProps) {
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<CollectionEntity[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [hoveredLink, setHoveredLink] = useState<Relationship | null>(null);

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

  // Modal / Inline Edit States
  const [editingEntity, setEditingEntity] = useState<string | null>(null);
  const [editEntityName, setEditEntityName] = useState("");
  const [editingField, setEditingField] = useState<{ col: string; idx: number } | null>(null);
  const [editFieldName, setEditFieldName] = useState("");

  // Fetch schema links
  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/connections/${connectionId}/databases/${database}/schema-links`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const cols: CollectionEntity[] = data.collections || [];
        setCollections(cols);

        // Layout coordinates in grid
        const initialPos: Record<string, { x: number; y: number }> = {};
        cols.forEach((col, idx) => {
          const colIndex = idx % 3;
          const rowIndex = Math.floor(idx / 3);
          initialPos[col.name] = { x: 50 + colIndex * 360, y: 50 + rowIndex * 320 };
        });
        setPositions(initialPos);

        // Discover references
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

  // Document Mouse Move for Drags
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingCol) {
        // Dragging Card (scale adjustment prevents mouse drift)
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
        // Panning Canvas background
        setPan({
          x: e.clientX - panStart.current.x,
          y: e.clientY - panStart.current.y,
        });
      } else if (activeLinkSource && canvasRef.current) {
        // Dragging relationship line pointer
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
        // Check if released over another card
        const target = e.target as HTMLElement;
        const cardEl = target.closest("[data-entity-name]");
        if (cardEl) {
          const targetCol = cardEl.getAttribute("data-entity-name");
          if (targetCol && targetCol !== activeLinkSource.col) {
            // Add relationship
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
                { from: activeLinkSource.col, field: activeLinkSource.field, to: targetCol },
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

  // Background Drag Start
  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-entity-name]") || target.closest("button")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseDown = (colName: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("select") || target.closest("input")) return;
    setDraggingCol(colName);
    const pos = positions[colName] || { x: 0, y: 0 };
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  // Zooming Handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = 0.08;
    const nextZoom = e.deltaY < 0 ? zoom + factor : zoom - factor;
    setZoom(Math.min(2, Math.max(0.4, nextZoom)));
  };

  // Visual Entity operations
  const handleAddCollection = () => {
    const name = `collection_${collections.length + 1}`;
    const newCol: CollectionEntity = {
      name,
      fields: [
        { name: "_id", type: "ObjectId" },
        { name: "name", type: "String" },
      ],
    };
    setCollections((prev) => [...prev, newCol]);
    setPositions((prev) => ({
      ...prev,
      [name]: { x: (100 - pan.x) / zoom, y: (100 - pan.y) / zoom },
    }));
  };

  const handleRemoveCollection = (colName: string) => {
    setCollections((prev) => prev.filter((c) => c.name !== colName));
    setRelationships((prev) => prev.filter((r) => r.from !== colName && r.to !== colName));
  };

  const handleRenameCollection = (oldName: string) => {
    if (!editEntityName.trim() || editEntityName === oldName) {
      setEditingEntity(null);
      return;
    }
    const nextName = editEntityName.trim();
    setCollections((prev) =>
      prev.map((c) => (c.name === oldName ? { ...c, name: nextName } : c))
    );
    setPositions((prev) => {
      const next = { ...prev };
      next[nextName] = next[oldName];
      delete next[oldName];
      return next;
    });
    setRelationships((prev) =>
      prev.map((r) => {
        if (r.from === oldName) return { ...r, from: nextName };
        if (r.to === oldName) return { ...r, to: nextName };
        return r;
      })
    );
    setEditingEntity(null);
  };

  const handleAddField = (colName: string) => {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.name === colName) {
          return {
            ...c,
            fields: [...c.fields, { name: `field_${c.fields.length}`, type: "String" }],
          };
        }
        return c;
      })
    );
  };

  const handleRemoveField = (colName: string, fieldName: string) => {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.name === colName) {
          return { ...c, fields: c.fields.filter((f) => f.name !== fieldName) };
        }
        return c;
      })
    );
    setRelationships((prev) =>
      prev.filter((r) => !(r.from === colName && r.field === fieldName))
    );
  };

  const handleUpdateField = (colName: string, idx: number, updates: Partial<SchemaField>) => {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.name === colName) {
          const nextFields = [...c.fields];
          const oldFieldName = nextFields[idx].name;
          nextFields[idx] = { ...nextFields[idx], ...updates };

          // Update relationships if field name changed
          if (updates.name && oldFieldName !== updates.name) {
            setRelationships((prevRel) =>
              prevRel.map((r) =>
                r.from === colName && r.field === oldFieldName
                  ? { ...r, field: updates.name as string }
                  : r
              )
            );
          }
          return { ...c, fields: nextFields };
        }
        return c;
      })
    );
  };

  // Start drawing connection line link
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

  // Auto layout align
  const resetLayout = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const initialPos: Record<string, { x: number; y: number }> = {};
    collections.forEach((col, idx) => {
      const colIndex = idx % 3;
      const rowIndex = Math.floor(idx / 3);
      initialPos[col.name] = { x: 50 + colIndex * 360, y: 50 + rowIndex * 320 };
    });
    setPositions(initialPos);
  };

  const getBsonIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "objectid":
        return "oid";
      case "string":
        return "abc";
      case "number":
      case "int":
      case "double":
        return "#";
      case "boolean":
        return "t/f";
      case "date":
        return "date";
      case "array":
        return "[]";
      default:
        return "{}";
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-sans">Analyzing entity schemas and generating diagrams...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background/50 p-6 space-y-6">
      {/* Canvas Top Controls Toolbar */}
      <div className="flex items-center justify-between border-b border-border/65 pb-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold font-mono tracking-tight flex items-center gap-2">
            <Compass className="w-5 h-5 text-purple-400" />
            Database Canvas Editor
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Database: <span className="text-foreground font-semibold">{database}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-muted/30 border border-border/40 rounded px-1.5 h-8 gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[10px] font-mono w-10 text-center font-bold">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground ml-1"
              onClick={resetLayout}
              title="Reset Layout"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Button size="sm" onClick={handleAddCollection} className="gap-1.5 h-8 text-xs font-mono bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="w-3.5 h-3.5" /> Create Entity
          </Button>
        </div>
      </div>

      {/* Main Canvas Workspace Area */}
      <div
        ref={canvasRef}
        onMouseDown={handleBackgroundMouseDown}
        onWheel={handleWheel}
        className={`flex-1 border border-border/40 rounded-lg relative overflow-hidden bg-zinc-950/20 select-none ${
          isPanning ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Absolute Scalable Content Layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          className="absolute inset-0 w-[2400px] h-[1800px] pointer-events-none"
        >
          {/* SVG Connector lines Overlay */}
          <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none">
            <defs>
              <marker
                id="erd-arrow"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill="rgba(168, 85, 247, 0.7)" />
              </marker>
            </defs>

            {/* Render established relationships links */}
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

              const cp1x = startX + 80;
              const cp1y = startY;
              const cp2x = endX - 80;
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
                    className={`transition-opacity ${isHovered ? "opacity-20" : "opacity-0"}`}
                  />
                  <path
                    d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                    fill="none"
                    stroke={isHovered ? "var(--primary)" : "rgba(168, 85, 247, 0.45)"}
                    strokeWidth={isHovered ? "2.5" : "1.5"}
                    markerEnd="url(#erd-arrow)"
                    className="transition-colors"
                  />
                  {/* Delete Link Overlay Button on Hover */}
                  {isHovered && (
                    <foreignObject
                      x={(startX + endX) / 2 - 10}
                      y={(startY + endY) / 2 - 10}
                      width="20"
                      height="20"
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
                        className="h-5 w-5 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center pointer-events-auto shadow border border-red-500"
                        title="Delete connection"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </foreignObject>
                  )}
                </g>
              );
            })}

            {/* Render temporary drawing connection pointer line */}
            {activeLinkSource && (
              (() => {
                const fromPos = positions[activeLinkSource.col];
                if (!fromPos) return null;
                const col = collections.find((c) => c.name === activeLinkSource.col);
                const fieldIndex = col ? col.fields.findIndex((f) => f.name === activeLinkSource.field) : 0;
                const fieldYOffset = 45 + fieldIndex * 26 + 13;

                const startX = fromPos.x + 240;
                const startY = fromPos.y + fieldYOffset;

                return (
                  <line
                    x1={startX}
                    y1={startY}
                    x2={mousePos.x}
                    y2={mousePos.y}
                    stroke="var(--primary)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    markerEnd="url(#erd-arrow)"
                  />
                );
              })()
            )}
          </svg>

          {/* Render Entity Cards Tables */}
          <div className="absolute inset-0 w-full h-full pointer-events-none">
            {collections.map((col) => {
              const pos = positions[col.name] || { x: 50, y: 50 };
              const isTargeted = hoveredLink?.to === col.name;
              const isSource = hoveredLink?.from === col.name;

              return (
                <div
                  key={col.name}
                  data-entity-name={col.name}
                  style={{ left: pos.x, top: pos.y }}
                  onMouseDown={(e) => handleMouseDown(col.name, e)}
                  className={`absolute w-60 border rounded-lg bg-card shadow-lg select-none cursor-grab active:cursor-grabbing pointer-events-auto z-20 ${
                    isTargeted
                      ? "border-primary ring-2 ring-primary/20 shadow-primary/5"
                      : isSource
                      ? "border-purple-500 shadow-purple-500/5"
                      : "border-border/60 hover:shadow-xl"
                  }`}
                >
                  {/* Entity Header */}
                  <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between bg-zinc-950/20 rounded-t-lg">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                      <Database className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      {editingEntity === col.name ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <Input
                            value={editEntityName}
                            onChange={(e) => setEditEntityName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameCollection(col.name);
                              else if (e.key === "Escape") setEditingEntity(null);
                            }}
                            className="h-6 text-[11px] font-mono w-28 px-1 py-0"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameCollection(col.name)}
                            className="h-5 w-5 bg-emerald-600 rounded text-white flex items-center justify-center shrink-0"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span
                          onDoubleClick={() => {
                            setEditingEntity(col.name);
                            setEditEntityName(col.name);
                          }}
                          className="font-bold text-xs font-mono text-foreground truncate cursor-edit"
                          title="Double-click to rename"
                        >
                          {col.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAddField(col.name)}
                        className="h-5 w-5 text-muted-foreground hover:text-foreground rounded hover:bg-muted flex items-center justify-center"
                        title="Add attribute"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCollection(col.name)}
                        className="h-5 w-5 text-muted-foreground hover:text-destructive rounded hover:bg-muted flex items-center justify-center"
                        title="Delete entity table"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Attributes Fields Rows */}
                  <div className="py-1">
                    {col.fields.map((field, fIdx) => {
                      const isLinkingField = hoveredLink?.from === col.name && hoveredLink?.field === field.name;
                      const isEditing = editingField?.col === col.name && editingField?.idx === fIdx;

                      return (
                        <div
                          key={field.name}
                          className={`px-3 py-1 flex items-center justify-between text-[11px] font-mono hover:bg-muted/40 transition-colors group relative ${
                            isLinkingField ? "bg-primary/10 text-primary font-bold animate-pulse" : "text-muted-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {/* Drag relationship link handle */}
                            <span
                              onMouseDown={(e) => startDrawingLink(col.name, field.name, e)}
                              className="w-2 h-2 rounded-full border border-purple-500 bg-purple-500/20 hover:bg-purple-500 cursor-crosshair shrink-0 pointer-events-auto"
                              title="Link reference to target entity"
                            />
                            {isEditing ? (
                              <div className="flex items-center gap-1 min-w-0">
                                <Input
                                  value={editFieldName}
                                  onChange={(e) => setEditFieldName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleUpdateField(col.name, fIdx, { name: editFieldName.trim() });
                                      setEditingField(null);
                                    } else if (e.key === "Escape") {
                                      setEditingField(null);
                                    }
                                  }}
                                  className="h-5 text-[10px] font-mono w-24 px-1 py-0"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateField(col.name, fIdx, { name: editFieldName.trim() });
                                    setEditingField(null);
                                  }}
                                  className="h-4 w-4 bg-emerald-600 rounded text-white flex items-center justify-center shrink-0"
                                >
                                  <Check className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <span
                                onDoubleClick={() => {
                                  setEditingField({ col: col.name, idx: fIdx });
                                  setEditFieldName(field.name);
                                }}
                                className="truncate cursor-edit text-[10px]"
                                title="Double click to edit attribute name"
                              >
                                {field.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {/* Type selector dropdown */}
                            <select
                              value={field.type}
                              onChange={(e) => handleUpdateField(col.name, fIdx, { type: e.target.value })}
                              className="bg-transparent border-0 font-mono text-[9px] text-muted-foreground outline-none cursor-pointer hover:text-foreground text-right"
                            >
                              <option value="ObjectId">ObjectId</option>
                              <option value="String">String</option>
                              <option value="Number">Number</option>
                              <option value="Boolean">Boolean</option>
                              <option value="Date">Date</option>
                              <option value="Array">Array</option>
                              <option value="Object">Object</option>
                            </select>

                            <span className="text-[9px] uppercase tracking-wider font-bold opacity-80 select-none">
                              {getBsonIcon(field.type)}
                            </span>

                            {field.name !== "_id" && (
                              <button
                                type="button"
                                onClick={() => handleRemoveField(col.name, field.name)}
                                className="h-4 w-4 text-muted-foreground hover:text-destructive rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                title="Delete attribute field"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
