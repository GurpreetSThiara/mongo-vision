import { useState, useEffect, useRef } from "react";
import { Loader2, Plus, Database, Move, Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  const [draggingCol, setDraggingCol] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

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

        // Calculate layout coordinates in grid format
        const initialPos: Record<string, { x: number; y: number }> = {};
        cols.forEach((col, idx) => {
          const colIndex = idx % 3;
          const rowIndex = Math.floor(idx / 3);
          initialPos[col.name] = { x: 50 + colIndex * 340, y: 50 + rowIndex * 300 };
        });
        setPositions(initialPos);

        // Discover connections
        const discoveredLinks: Relationship[] = [];
        cols.forEach((col) => {
          col.fields.forEach((field) => {
            const fName = field.name.toLowerCase();
            if (fName !== "_id" && (fName.endsWith("id") || fName.endsWith("_id"))) {
              // Extract prefix (e.g. userId -> user, author_id -> author)
              let prefix = field.name;
              if (prefix.toLowerCase().endsWith("_id")) {
                prefix = prefix.slice(0, -3);
              } else if (prefix.toLowerCase().endsWith("id")) {
                prefix = prefix.slice(0, -2);
              }

              // Match collections list
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

  // Dragging Mouse Handlers
  const handleMouseDown = (colName: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest(".select-none")) return;
    setDraggingCol(colName);
    const pos = positions[colName] || { x: 0, y: 0 };
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingCol) return;
      setPositions((prev) => ({
        ...prev,
        [draggingCol]: {
          x: Math.max(10, e.clientX - dragOffset.current.x),
          y: Math.max(10, e.clientY - dragOffset.current.y),
        },
      }));
    };

    const handleMouseUp = () => {
      setDraggingCol(null);
    };

    if (draggingCol) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingCol]);

  // Auto-arrange layout
  const resetLayout = () => {
    const initialPos: Record<string, { x: number; y: number }> = {};
    collections.forEach((col, idx) => {
      const colIndex = idx % 3;
      const rowIndex = Math.floor(idx / 3);
      initialPos[col.name] = { x: 50 + colIndex * 340, y: 50 + rowIndex * 300 };
    });
    setPositions(initialPos);
  };

  const getBsonIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "objectid":
        return <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 px-1 rounded uppercase">oid</span>;
      case "string":
        return <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-1 rounded uppercase">abc</span>;
      case "number":
      case "int":
      case "double":
        return <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1 rounded uppercase">#</span>;
      case "boolean":
        return <span className="text-[9px] bg-violet-500/10 text-violet-400 border border-violet-500/25 px-1 rounded uppercase">t/f</span>;
      case "date":
        return <span className="text-[9px] bg-pink-500/10 text-pink-400 border border-pink-500/25 px-1 rounded uppercase">date</span>;
      case "array":
        return <span className="text-[9px] bg-orange-500/10 text-orange-400 border border-orange-500/25 px-1 rounded uppercase">[]</span>;
      default:
        return <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/25 px-1 rounded uppercase">{"{}"}</span>;
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

  if (collections.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
        <Database className="w-12 h-12 text-muted-foreground opacity-30" />
        <p className="text-sm text-muted-foreground font-sans">No collections found in database "{database}".</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background/50 p-6 space-y-6">
      {/* ERD View Top Header */}
      <div className="flex items-center justify-between border-b border-border/65 pb-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold font-mono tracking-tight flex items-center gap-2">
            <Compass className="w-5 h-5 text-purple-400" />
            Entity Relationship Diagram
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Database: <span className="text-foreground font-semibold">{database}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/25 uppercase text-[10px] tracking-wide font-mono px-2">
            {collections.length} entities discovered
          </Badge>
          <Button variant="outline" size="sm" onClick={resetLayout} className="h-8 text-xs font-mono">
            Auto Layout
          </Button>
        </div>
      </div>

      {/* Main Draggable Workspace Board */}
      <div className="flex-1 border border-border/40 rounded-lg relative overflow-auto bg-zinc-950/20 scrollbar-thin">
        {/* SVG Bezier overlay links path list */}
        <svg className="absolute inset-0 w-[2400px] h-[1800px] pointer-events-none z-10">
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
              <path d="M 0 1 L 8 5 L 0 9 z" fill="rgba(168, 85, 247, 0.6)" />
            </marker>
          </defs>

          {relationships.map((link) => {
            const fromPos = positions[link.from];
            const toPos = positions[link.to];
            if (!fromPos || !toPos) return null;

            const col = collections.find((c) => c.name === link.from);
            const fieldIndex = col ? col.fields.findIndex((f) => f.name === link.field) : 0;
            const fieldYOffset = 45 + fieldIndex * 26 + 13;

            // Compute port coordinate anchor points
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
                {/* Glowing line overlay */}
                <path
                  d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="6"
                  className={`transition-opacity ${isHovered ? "opacity-25" : "opacity-0"}`}
                />
                {/* Main line */}
                <path
                  d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                  fill="none"
                  stroke={isHovered ? "var(--primary)" : "rgba(168, 85, 247, 0.45)"}
                  strokeWidth={isHovered ? "2.5" : "1.5"}
                  markerEnd="url(#erd-arrow)"
                  className="transition-colors"
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Entity Cards container */}
        <div className="absolute inset-0 w-[2400px] h-[1800px]">
          {collections.map((col) => {
            const pos = positions[col.name] || { x: 50, y: 50 };
            const isTargeted = hoveredLink?.to === col.name;
            const isSource = hoveredLink?.from === col.name;

            return (
              <div
                key={col.name}
                id={`erd-card-${col.name}`}
                style={{ left: pos.x, top: pos.y }}
                onMouseDown={(e) => handleMouseDown(col.name, e)}
                className={`absolute w-60 border rounded-lg bg-card shadow-lg select-none cursor-grab active:cursor-grabbing transition-shadow z-20 ${
                  isTargeted
                    ? "border-primary ring-2 ring-primary/20 shadow-primary/5"
                    : isSource
                    ? "border-purple-500 shadow-purple-500/5"
                    : "border-border/60 hover:shadow-xl"
                }`}
              >
                {/* Entity Card Header */}
                <div className="px-3.5 py-2.5 border-b border-border/60 flex items-center gap-1.5 bg-zinc-950/20 rounded-t-lg">
                  <Database className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-bold text-xs font-mono text-foreground truncate flex-1">{col.name}</span>
                  <Move className="w-3 h-3 text-muted-foreground opacity-30 cursor-move" />
                </div>

                {/* Entity Attributes / Fields Rows */}
                <div className="py-1">
                  {col.fields.map((field) => {
                    const isLinkingField = hoveredLink?.from === col.name && hoveredLink?.field === field.name;

                    return (
                      <div
                        key={field.name}
                        className={`px-3 py-1 flex items-center justify-between text-[11px] font-mono hover:bg-muted/40 transition-colors ${
                          isLinkingField ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground"
                        }`}
                      >
                        <span className="truncate max-w-[150px]" title={field.name}>{field.name}</span>
                        {getBsonIcon(field.type)}
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
  );
}
