import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  Eye, EyeOff, Copy, ArrowDown, ArrowUp, Code,
} from "lucide-react";
import { QueryEditor, type FieldInfo } from "./QueryEditor";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineStage {
  id: string;
  type: string;
  content: string;
  enabled: boolean;
  collapsed: boolean;
}

interface AggregationPipelineBuilderProps {
  value: string;
  onChange: (value: string) => void;
  fields: (string | FieldInfo)[];
  onExecute?: () => void;
}

// ─── Stage Types ─────────────────────────────────────────────────────────────

const STAGE_TYPES = [
  { value: "$match", label: "$match", icon: "🔍", description: "Filter documents" },
  { value: "$group", label: "$group", icon: "📊", description: "Group and aggregate" },
  { value: "$project", label: "$project", icon: "📐", description: "Reshape documents" },
  { value: "$sort", label: "$sort", icon: "↕️", description: "Sort documents" },
  { value: "$limit", label: "$limit", icon: "🔢", description: "Limit results" },
  { value: "$skip", label: "$skip", icon: "⏭", description: "Skip documents" },
  { value: "$unwind", label: "$unwind", icon: "🔀", description: "Deconstruct array" },
  { value: "$lookup", label: "$lookup", icon: "🔗", description: "Join collections" },
  { value: "$addFields", label: "$addFields", icon: "➕", description: "Add/compute fields" },
  { value: "$set", label: "$set", icon: "✏️", description: "Set field values" },
  { value: "$unset", label: "$unset", icon: "🗑", description: "Remove fields" },
  { value: "$replaceRoot", label: "$replaceRoot", icon: "🔄", description: "Replace root document" },
  { value: "$facet", label: "$facet", icon: "◈", description: "Multi-pipeline" },
  { value: "$bucket", label: "$bucket", icon: "🪣", description: "Bucket by boundaries" },
  { value: "$bucketAuto", label: "$bucketAuto", icon: "🪣", description: "Auto-bucket" },
  { value: "$count", label: "$count", icon: "#️⃣", description: "Count documents" },
  { value: "$sample", label: "$sample", icon: "🎲", description: "Random sample" },
  { value: "$out", label: "$out", icon: "📤", description: "Write to collection" },
  { value: "$merge", label: "$merge", icon: "🔀", description: "Merge into collection" },
  { value: "$graphLookup", label: "$graphLookup", icon: "🕸", description: "Recursive lookup" },
  { value: "$unionWith", label: "$unionWith", icon: "∪", description: "Union collections" },
];

const STAGE_DEFAULTS: Record<string, string> = {
  "$match": '{ }',
  "$group": '{ "_id": "$field", "count": { "$sum": 1 } }',
  "$project": '{ "field": 1, "_id": 0 }',
  "$sort": '{ "field": -1 }',
  "$limit": '10',
  "$skip": '0',
  "$unwind": '"$arrayField"',
  "$lookup": '{ "from": "collection", "localField": "field", "foreignField": "_id", "as": "result" }',
  "$addFields": '{ "newField": "expression" }',
  "$set": '{ "field": "value" }',
  "$unset": '"fieldToRemove"',
  "$replaceRoot": '{ "newRoot": "$embedded" }',
  "$facet": '{ "output1": [], "output2": [] }',
  "$bucket": '{ "groupBy": "$field", "boundaries": [0, 50, 100], "default": "Other" }',
  "$bucketAuto": '{ "groupBy": "$field", "buckets": 5 }',
  "$count": '"totalCount"',
  "$sample": '{ "size": 10 }',
  "$out": '"outputCollection"',
  "$merge": '{ "into": "collection" }',
  "$graphLookup": '{ "from": "collection", "startWith": "$field", "connectFromField": "from", "connectToField": "to", "as": "result" }',
  "$unionWith": '{ "coll": "collection", "pipeline": [] }',
};

let stageIdCounter = 0;
function genId() { return `stage-${Date.now()}-${stageIdCounter++}`; }

// ─── Parser ──────────────────────────────────────────────────────────────────

function parsePipelineToStages(pipelineStr: string): PipelineStage[] {
  try {
    const arr = JSON.parse(pipelineStr);
    if (!Array.isArray(arr)) return [];
    return arr.map(stage => {
      const keys = Object.keys(stage);
      const type = keys[0] || "$match";
      return {
        id: genId(),
        type,
        content: JSON.stringify(stage[type], null, 2),
        enabled: true,
        collapsed: false,
      };
    });
  } catch {
    return [];
  }
}

function stagesToPipelineStr(stages: PipelineStage[]): string {
  const enabledStages = stages.filter(s => s.enabled);
  const arr = enabledStages.map(s => {
    try {
      const parsed = JSON.parse(s.content);
      return { [s.type]: parsed };
    } catch {
      // If content isn't valid JSON, try to make it work as a raw value
      const trimmed = s.content.trim();
      if (trimmed.startsWith('"') || !isNaN(Number(trimmed))) {
        try {
          return { [s.type]: JSON.parse(trimmed) };
        } catch {
          return { [s.type]: trimmed };
        }
      }
      return { [s.type]: {} };
    }
  });
  return JSON.stringify(arr, null, 2);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AggregationPipelineBuilder({ value, onChange, fields, onExecute }: AggregationPipelineBuilderProps) {
  const [stages, setStages] = useState<PipelineStage[]>(() => parsePipelineToStages(value));
  const [showCode, setShowCode] = useState(false);

  const syncToParent = useCallback((newStages: PipelineStage[]) => {
    setStages(newStages);
    onChange(stagesToPipelineStr(newStages));
  }, [onChange]);

  const addStage = (type: string = "$match", index?: number) => {
    const newStage: PipelineStage = {
      id: genId(),
      type,
      content: STAGE_DEFAULTS[type] || "{}",
      enabled: true,
      collapsed: false,
    };
    const next = [...stages];
    if (index !== undefined) {
      next.splice(index + 1, 0, newStage);
    } else {
      next.push(newStage);
    }
    syncToParent(next);
  };

  const removeStage = (id: string) => {
    syncToParent(stages.filter(s => s.id !== id));
  };

  const updateStage = (id: string, updates: Partial<PipelineStage>) => {
    syncToParent(stages.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const moveStage = (id: string, direction: "up" | "down") => {
    const idx = stages.findIndex(s => s.id === id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= stages.length) return;
    const next = [...stages];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    syncToParent(next);
  };

  const duplicateStage = (id: string) => {
    const idx = stages.findIndex(s => s.id === id);
    if (idx === -1) return;
    const original = stages[idx];
    const clone: PipelineStage = { ...original, id: genId() };
    const next = [...stages];
    next.splice(idx + 1, 0, clone);
    syncToParent(next);
  };

  const stageInfo = (type: string) => STAGE_TYPES.find(s => s.value === type);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Pipeline Stages
          </span>
          <Badge variant="outline" className="text-[10px] h-4">
            {stages.filter(s => s.enabled).length} active
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2"
            onClick={() => setShowCode(!showCode)}
          >
            <Code className="w-3 h-3" /> {showCode ? "Visual" : "Code"}
          </Button>
        </div>
      </div>

      {showCode ? (
        /* ── Full Code View ── */
        <QueryEditor
          value={value}
          onChange={v => {
            onChange(v || "[]");
            // Try to parse back into stages
            try {
              const parsed = parsePipelineToStages(v || "[]");
              if (parsed.length > 0) setStages(parsed);
            } catch { /* ignore parse errors in code view */ }
          }}
          fields={fields}
          height="300px"
          mode="aggregation"
          onExecute={onExecute}
        />
      ) : (
        /* ── Visual Builder ── */
        <div className="space-y-2">
          {stages.length === 0 && (
            <div className="text-center py-6 border border-dashed border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">No stages yet</p>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => addStage()}>
                <Plus className="w-3 h-3" /> Add Stage
              </Button>
            </div>
          )}

          {stages.map((stage, idx) => {
            const info = stageInfo(stage.type);
            return (
              <div
                key={stage.id}
                className={`border rounded-lg transition-colors ${
                  stage.enabled
                    ? "border-border bg-card"
                    : "border-border/50 bg-muted/20 opacity-60"
                }`}
              >
                {/* Stage Header */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50">
                  <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab shrink-0" />

                  <button
                    onClick={() => updateStage(stage.id, { collapsed: !stage.collapsed })}
                    className="shrink-0"
                  >
                    {stage.collapsed
                      ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      : <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    }
                  </button>

                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono shrink-0">
                    {idx + 1}
                  </Badge>

                  <Select
                    value={stage.type}
                    onValueChange={(val) => updateStage(stage.id, {
                      type: val,
                      content: STAGE_DEFAULTS[val] || "{}",
                    })}
                  >
                    <SelectTrigger className="h-6 text-xs w-36 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_TYPES.map(st => (
                        <SelectItem key={st.value} value={st.value} className="text-xs font-mono">
                          <span className="mr-1">{st.icon}</span> {st.label}
                          <span className="text-muted-foreground ml-2 text-[10px]">{st.description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="flex-1" />

                  {/* Stage actions */}
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5"
                      onClick={() => moveStage(stage.id, "up")} disabled={idx === 0}
                      title="Move up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5"
                      onClick={() => moveStage(stage.id, "down")} disabled={idx === stages.length - 1}
                      title="Move down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5"
                      onClick={() => duplicateStage(stage.id)}
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5"
                      onClick={() => updateStage(stage.id, { enabled: !stage.enabled })}
                      title={stage.enabled ? "Disable" : "Enable"}
                    >
                      {stage.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive"
                      onClick={() => removeStage(stage.id)}
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Stage Content */}
                {!stage.collapsed && (
                  <div className="p-2">
                    <QueryEditor
                      value={stage.content}
                      onChange={v => updateStage(stage.id, { content: v || "" })}
                      fields={fields}
                      height="80px"
                      mode="aggregation"
                    />
                  </div>
                )}

                {/* Add stage button between stages */}
                {idx < stages.length - 1 && (
                  <div className="relative h-4">
                    <div className="absolute inset-x-0 top-1/2 flex justify-center -translate-y-1/2 z-10">
                      <button
                        onClick={() => addStage("$match", idx)}
                        className="h-4 w-4 rounded-full bg-muted border border-border text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors flex items-center justify-center"
                        title="Add stage here"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add stage at end */}
          {stages.length > 0 && (
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => addStage()}>
                <Plus className="w-3 h-3" /> Add Stage
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
