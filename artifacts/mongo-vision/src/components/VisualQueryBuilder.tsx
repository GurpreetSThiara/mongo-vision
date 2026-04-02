import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, X, ArrowUpDown, ArrowUp, ArrowDown, Eye, EyeOff, Play, Loader2,
  GripVertical, ChevronUp, ChevronDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SchemaField {
  path: string;
  type?: string;
}

interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  value2?: string;
  /** The connector AFTER this condition: "and" | "or" */
  connector: "and" | "or";
}

interface SortRule {
  id: string;
  field: string;
  direction: 1 | -1;
}

interface VisualQueryBuilderProps {
  filterValue: string;
  sortValue: string;
  onFilterChange: (json: string) => void;
  onSortChange: (json: string) => void;
  fields: SchemaField[];
  onExecute?: () => void;
  isExecuting?: boolean;
  compact?: boolean;
}

// ─── Operator Definitions ────────────────────────────────────────────────────

interface OperatorDef {
  value: string;
  label: string;
  valueCount: 0 | 1 | 2;
  isList?: boolean;
}

const OPERATORS_BY_TYPE: Record<string, OperatorDef[]> = {
  string: [
    { value: "eq", label: "equals", valueCount: 1 },
    { value: "ne", label: "not equals", valueCount: 1 },
    { value: "contains", label: "contains", valueCount: 1 },
    { value: "startsWith", label: "starts with", valueCount: 1 },
    { value: "endsWith", label: "ends with", valueCount: 1 },
    { value: "regex", label: "matches regex", valueCount: 1 },
    { value: "in", label: "is any of", valueCount: 1, isList: true },
    { value: "nin", label: "is none of", valueCount: 1, isList: true },
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
  number: [
    { value: "eq", label: "=", valueCount: 1 },
    { value: "ne", label: "≠", valueCount: 1 },
    { value: "gt", label: ">", valueCount: 1 },
    { value: "gte", label: "≥", valueCount: 1 },
    { value: "lt", label: "<", valueCount: 1 },
    { value: "lte", label: "≤", valueCount: 1 },
    { value: "between", label: "between", valueCount: 2 },
    { value: "in", label: "is any of", valueCount: 1, isList: true },
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
  boolean: [
    { value: "eq_true", label: "is true", valueCount: 0 },
    { value: "eq_false", label: "is false", valueCount: 0 },
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
  date: [
    { value: "eq", label: "equals", valueCount: 1 },
    { value: "gt", label: "after", valueCount: 1 },
    { value: "lt", label: "before", valueCount: 1 },
    { value: "gte", label: "on or after", valueCount: 1 },
    { value: "lte", label: "on or before", valueCount: 1 },
    { value: "between", label: "between", valueCount: 2 },
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
  array: [
    { value: "contains", label: "contains", valueCount: 1 },
    { value: "in", label: "contains any of", valueCount: 1, isList: true },
    { value: "all", label: "contains all of", valueCount: 1, isList: true },
    { value: "size", label: "has size", valueCount: 1 },
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
  objectId: [
    { value: "eq", label: "equals", valueCount: 1 },
    { value: "in", label: "is any of", valueCount: 1, isList: true },
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
  object: [
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
  unknown: [
    { value: "eq", label: "equals", valueCount: 1 },
    { value: "ne", label: "not equals", valueCount: 1 },
    { value: "gt", label: ">", valueCount: 1 },
    { value: "gte", label: "≥", valueCount: 1 },
    { value: "lt", label: "<", valueCount: 1 },
    { value: "lte", label: "≤", valueCount: 1 },
    { value: "in", label: "is any of", valueCount: 1, isList: true },
    { value: "regex", label: "matches regex", valueCount: 1 },
    { value: "exists", label: "exists", valueCount: 0 },
    { value: "notExists", label: "does not exist", valueCount: 0 },
  ],
};

function getOperatorsForType(type?: string): OperatorDef[] {
  if (!type) return OPERATORS_BY_TYPE.unknown;
  const n = type.toLowerCase();
  if (n === "int" || n === "double" || n === "long" || n === "decimal") return OPERATORS_BY_TYPE.number;
  if (n === "bool") return OPERATORS_BY_TYPE.boolean;
  if (n === "objectid") return OPERATORS_BY_TYPE.objectId;
  return OPERATORS_BY_TYPE[n] || OPERATORS_BY_TYPE.unknown;
}

const TYPE_ICONS: Record<string, string> = {
  string: "🔤", number: "🔢", int: "🔢", double: "🔢", long: "🔢", decimal: "🔢",
  boolean: "✅", bool: "✅", object: "📦", array: "📋", date: "📅",
  objectId: "🆔", objectid: "🆔", null: "⊘",
};

let idCounter = 0;
function genId(): string { return `vqb-${Date.now()}-${idCounter++}`; }

// ─── Condition → MongoDB ─────────────────────────────────────────────────────

function smartParse(raw: string): unknown {
  if (raw === "") return "";
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const num = Number(raw);
  if (!isNaN(num) && raw !== "") return num;
  return raw;
}

function parseList(raw: string): unknown[] {
  return raw.split(",").map(s => smartParse(s.trim())).filter(s => s !== "");
}

function conditionToMongo(c: FilterCondition): Record<string, unknown> | null {
  if (!c.field) return null;
  const v = c.value?.trim() || "";
  const v2 = c.value2?.trim() || "";

  switch (c.operator) {
    case "eq": return { [c.field]: smartParse(v) };
    case "ne": return { [c.field]: { $ne: smartParse(v) } };
    case "gt": return { [c.field]: { $gt: smartParse(v) } };
    case "gte": return { [c.field]: { $gte: smartParse(v) } };
    case "lt": return { [c.field]: { $lt: smartParse(v) } };
    case "lte": return { [c.field]: { $lte: smartParse(v) } };
    case "between": return { [c.field]: { $gte: smartParse(v), $lte: smartParse(v2) } };
    case "in": return { [c.field]: { $in: parseList(v) } };
    case "nin": return { [c.field]: { $nin: parseList(v) } };
    case "all": return { [c.field]: { $all: parseList(v) } };
    case "contains": return { [c.field]: { $regex: v, $options: "i" } };
    case "startsWith": return { [c.field]: { $regex: `^${v}`, $options: "i" } };
    case "endsWith": return { [c.field]: { $regex: `${v}$`, $options: "i" } };
    case "regex": return { [c.field]: { $regex: v } };
    case "exists": return { [c.field]: { $exists: true } };
    case "notExists": return { [c.field]: { $exists: false } };
    case "eq_true": return { [c.field]: true };
    case "eq_false": return { [c.field]: false };
    case "size": return { [c.field]: { $size: Number(v) || 0 } };
    default: return { [c.field]: smartParse(v) };
  }
}

// ─── Group computation ───────────────────────────────────────────────────────

interface ConditionGroup {
  groupId: string;
  conditions: FilterCondition[];
  /** indices in the original flat array */
  indices: number[];
}

function computeOrGroups(conditions: FilterCondition[]): ConditionGroup[] {
  if (conditions.length === 0) return [];
  const groups: ConditionGroup[] = [];
  let current: ConditionGroup = { groupId: genId(), conditions: [], indices: [] };

  for (let i = 0; i < conditions.length; i++) {
    current.conditions.push(conditions[i]);
    current.indices.push(i);
    if (conditions[i].connector === "or" && i < conditions.length - 1) {
      groups.push(current);
      current = { groupId: genId(), conditions: [], indices: [] };
    }
  }
  if (current.conditions.length > 0) groups.push(current);
  return groups;
}

function conditionsToMongo(conditions: FilterCondition[]): Record<string, unknown> {
  if (conditions.length === 0) return {};
  const groups = computeOrGroups(conditions);
  const nonEmpty = groups.filter(g => g.conditions.some(c => c.field));
  if (nonEmpty.length === 0) return {};

  const groupResults = nonEmpty.map(group => {
    const mongoParts = group.conditions
      .map(c => conditionToMongo(c))
      .filter(Boolean) as Record<string, unknown>[];
    if (mongoParts.length === 0) return null;
    if (mongoParts.length === 1) return mongoParts[0];
    return { $and: mongoParts };
  }).filter(Boolean) as Record<string, unknown>[];

  if (groupResults.length === 0) return {};
  if (groupResults.length === 1) return groupResults[0];
  return { $or: groupResults };
}

// ─── Human-readable summary ─────────────────────────────────────────────────

function conditionSummary(c: FilterCondition): string {
  if (!c.field) return "...";
  const ops = getOperatorsForType();
  const op = ops.find(o => o.value === c.operator);
  const label = op?.label || c.operator;
  if (op?.valueCount === 0) return `${c.field} ${label}`;
  if (op?.valueCount === 2) return `${c.field} ${label} ${c.value || "?"} to ${c.value2 || "?"}`;
  return `${c.field} ${label} ${c.value || "?"}`;
}

function buildQuerySummary(conditions: FilterCondition[]): string {
  if (conditions.length === 0) return "No filters applied";
  const groups = computeOrGroups(conditions);
  const parts = groups.map(group => {
    const inner = group.conditions.map(c => conditionSummary(c)).join(" AND ");
    return group.conditions.length > 1 ? `(${inner})` : inner;
  });
  return parts.join(" OR ");
}

// ─── MongoDB → Conditions (best-effort parse) ───────────────────────────────

function tryParseMongoToConditions(json: string): FilterCondition[] {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
    if (Object.keys(obj).length === 0) return [];

    if (obj.$or && Array.isArray(obj.$or)) {
      const results: FilterCondition[] = [];
      for (let gi = 0; gi < obj.$or.length; gi++) {
        const group = obj.$or[gi] as Record<string, unknown>;
        const groupConditions = parseGroupObj(group);
        for (let ci = 0; ci < groupConditions.length; ci++) {
          groupConditions[ci].connector = "and";
        }
        if (groupConditions.length > 0 && gi < obj.$or.length - 1) {
          groupConditions[groupConditions.length - 1].connector = "or";
        }
        results.push(...groupConditions);
      }
      return results;
    }

    if (obj.$and && Array.isArray(obj.$and)) {
      const results: FilterCondition[] = [];
      for (const item of obj.$and) {
        const conds = parseGroupObj(item as Record<string, unknown>);
        for (const c of conds) c.connector = "and";
        results.push(...conds);
      }
      return results;
    }

    return parseGroupObj(obj);
  } catch { return []; }
}

function parseGroupObj(obj: Record<string, unknown>): FilterCondition[] {
  if (obj.$and && Array.isArray(obj.$and)) {
    const results: FilterCondition[] = [];
    for (const item of obj.$and) results.push(...parseGroupObj(item as Record<string, unknown>));
    return results;
  }
  const results: FilterCondition[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    const c = parseFieldCondition(key, val);
    if (c) results.push(c);
  }
  return results;
}

function parseFieldCondition(field: string, val: unknown): FilterCondition | null {
  const base: FilterCondition = { id: genId(), field, operator: "eq", value: "", connector: "and" };
  if (val === null || typeof val === "string" || typeof val === "number") return { ...base, value: String(val ?? "") };
  if (typeof val === "boolean") return { ...base, operator: val ? "eq_true" : "eq_false" };
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const ops = val as Record<string, unknown>;
    if ("$ne" in ops) return { ...base, operator: "ne", value: String(ops.$ne) };
    if ("$gte" in ops && "$lte" in ops) return { ...base, operator: "between", value: String(ops.$gte), value2: String(ops.$lte) };
    if ("$gt" in ops) return { ...base, operator: "gt", value: String(ops.$gt) };
    if ("$gte" in ops) return { ...base, operator: "gte", value: String(ops.$gte) };
    if ("$lt" in ops) return { ...base, operator: "lt", value: String(ops.$lt) };
    if ("$lte" in ops) return { ...base, operator: "lte", value: String(ops.$lte) };
    if ("$in" in ops && Array.isArray(ops.$in)) return { ...base, operator: "in", value: (ops.$in as unknown[]).join(", ") };
    if ("$nin" in ops && Array.isArray(ops.$nin)) return { ...base, operator: "nin", value: (ops.$nin as unknown[]).join(", ") };
    if ("$all" in ops && Array.isArray(ops.$all)) return { ...base, operator: "all", value: (ops.$all as unknown[]).join(", ") };
    if ("$regex" in ops) {
      const pat = String(ops.$regex);
      if (pat.startsWith("^")) return { ...base, operator: "startsWith", value: pat.slice(1) };
      if (pat.endsWith("$")) return { ...base, operator: "endsWith", value: pat.slice(0, -1) };
      return { ...base, operator: "contains", value: pat };
    }
    if ("$exists" in ops) return { ...base, operator: ops.$exists ? "exists" : "notExists" };
    if ("$size" in ops) return { ...base, operator: "size", value: String(ops.$size) };
  }
  return base;
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

function sortsToMongo(sorts: SortRule[]): Record<string, unknown> {
  const result: Record<string, number> = {};
  for (const s of sorts) { if (s.field) result[s.field] = s.direction; }
  return result;
}

function tryParseMongoToSorts(json: string): SortRule[] {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return [];
    return Object.entries(obj).map(([field, dir]) => ({
      id: genId(), field, direction: (dir === -1 ? -1 : 1) as 1 | -1,
    }));
  } catch { return []; }
}

// ─── Condition Row (inline) ──────────────────────────────────────────────────

function ConditionRow({
  condition, fields, onUpdate, onRemove
}: {
  condition: FilterCondition;
  fields: SchemaField[];
  onUpdate: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
}) {
  const selectedField = fields.find(f => f.path === condition.field);
  const operators = getOperatorsForType(selectedField?.type);
  const currentOp = operators.find(o => o.value === condition.operator) || operators[0];

  return (
    <div className="flex items-center gap-1.5 group animate-in fade-in slide-in-from-top-1 duration-200">
      <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0" />
      <Select
        value={condition.field || "__placeholder__"}
        onValueChange={val => {
          if (val === "__placeholder__") return;
          const nf = fields.find(f => f.path === val);
          const nops = getOperatorsForType(nf?.type);
          onUpdate({ field: val, operator: nops[0]?.value || "eq", value: "", value2: "" });
        }}
      >
        <SelectTrigger className="h-7 text-xs w-32 font-mono bg-muted/30 border-border/50">
          <SelectValue placeholder="field..." />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {fields.map(f => (
            <SelectItem key={f.path} value={f.path} className="text-xs font-mono">
              <span className="mr-1">{TYPE_ICONS[f.type?.toLowerCase() || ""] || "•"}</span>
              {f.path}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={condition.operator} onValueChange={val => onUpdate({ operator: val, value: "", value2: "" })}>
        <SelectTrigger className="h-7 text-xs w-24 bg-muted/30 border-border/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map(op => (
            <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currentOp && currentOp.valueCount >= 1 && (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            value={condition.value}
            onChange={e => onUpdate({ value: e.target.value })}
            placeholder={currentOp.isList ? "val1, val2, ..." : "value"}
            className="h-7 text-xs font-mono flex-1 min-w-0 bg-muted/30 border-border/50"
          />
          {currentOp.valueCount === 2 && (
            <>
              <span className="text-[10px] text-muted-foreground shrink-0">to</span>
              <Input
                value={condition.value2 || ""}
                onChange={e => onUpdate({ value2: e.target.value })}
                placeholder="max"
                className="h-7 text-xs font-mono flex-1 min-w-0 bg-muted/30 border-border/50"
              />
            </>
          )}
        </div>
      )}
      {currentOp && currentOp.valueCount === 0 && <div className="flex-1" />}

      <Button
        variant="ghost" size="icon"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
        onClick={onRemove}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

// ─── Sort Builder ────────────────────────────────────────────────────────────

function SortBuilder({ sorts, fields, onChange, compact }: {
  sorts: SortRule[];
  fields: SchemaField[];
  onChange: (sorts: SortRule[]) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex items-center gap-1.5 flex-wrap" : "space-y-1.5"}>
      {!compact && sorts.length > 0 && (
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sort</span>
        </div>
      )}
      {sorts.map((sort, idx) => (
        <div key={sort.id} className="flex items-center gap-1 group">
          <Select
            value={sort.field || "__placeholder__"}
            onValueChange={val => {
              if (val === "__placeholder__") return;
              const next = [...sorts]; next[idx] = { ...next[idx], field: val }; onChange(next);
            }}
          >
            <SelectTrigger className="h-7 text-xs w-28 font-mono bg-muted/30 border-border/50">
              <SelectValue placeholder="field..." />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {fields.map(f => (
                <SelectItem key={f.path} value={f.path} className="text-xs font-mono">{f.path}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm"
            className={`h-7 text-[10px] gap-0.5 w-14 font-mono border-border/50 ${sort.direction === 1 ? "text-emerald-400" : "text-amber-400"}`}
            onClick={() => {
              const next = [...sorts]; next[idx] = { ...next[idx], direction: sort.direction === 1 ? -1 : 1 }; onChange(next);
            }}
          >
            {sort.direction === 1 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
            {sort.direction === 1 ? "ASC" : "DESC"}
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
            onClick={() => onChange(sorts.filter((_, i) => i !== idx))}
          >
            <X className="w-2.5 h-2.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost" size="sm"
        className="h-6 text-[10px] gap-1 text-muted-foreground"
        onClick={() => onChange([...sorts, { id: genId(), field: fields[0]?.path || "", direction: -1 }])}
      >
        <Plus className="w-2.5 h-2.5" /> {compact ? "Sort" : "Add Sort"}
      </Button>
    </div>
  );
}

// ─── Group Card ──────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  "border-l-emerald-500", "border-l-blue-500", "border-l-amber-500",
  "border-l-violet-500", "border-l-rose-500", "border-l-cyan-500",
];
const GROUP_BG = [
  "bg-emerald-500/[0.03]", "bg-blue-500/[0.03]", "bg-amber-500/[0.03]",
  "bg-violet-500/[0.03]", "bg-rose-500/[0.03]", "bg-cyan-500/[0.03]",
];

function GroupCard({
  group, groupIndex, totalGroups, fields,
  onUpdateCondition, onRemoveCondition, onAddCondition,
  onMoveGroup, onRemoveGroup, compact,
}: {
  group: ConditionGroup;
  groupIndex: number;
  totalGroups: number;
  fields: SchemaField[];
  onUpdateCondition: (condIdx: number, updates: Partial<FilterCondition>) => void;
  onRemoveCondition: (condIdx: number) => void;
  onAddCondition: (afterIdx: number) => void;
  onMoveGroup: (dir: "up" | "down") => void;
  onRemoveGroup: () => void;
  compact?: boolean;
}) {
  const colorIdx = groupIndex % GROUP_COLORS.length;

  return (
    <div className={`rounded-md border border-border/50 border-l-2 ${GROUP_COLORS[colorIdx]} ${GROUP_BG[colorIdx]} ${compact ? "p-1.5" : "p-2"}`}>
      {/* Group header */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          groupIndex === 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-violet-500/15 text-violet-400"
        }`}>
          Group {groupIndex + 1}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {group.conditions.length} condition{group.conditions.length !== 1 ? "s" : ""} — joined by AND
        </span>
        <div className="flex-1" />
        {totalGroups > 1 && (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-4 w-4 p-0" disabled={groupIndex === 0} onClick={() => onMoveGroup("up")}>
              <ChevronUp className="w-2.5 h-2.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-4 w-4 p-0" disabled={groupIndex === totalGroups - 1} onClick={() => onMoveGroup("down")}>
              <ChevronDown className="w-2.5 h-2.5" />
            </Button>
          </div>
        )}
        {totalGroups > 1 && (
          <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:text-destructive" onClick={onRemoveGroup}>
            <X className="w-2.5 h-2.5" />
          </Button>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-1">
        {group.conditions.map((cond, ci) => (
          <div key={cond.id}>
            <ConditionRow
              condition={cond}
              fields={fields}
              onUpdate={updates => onUpdateCondition(group.indices[ci], updates)}
              onRemove={() => onRemoveCondition(group.indices[ci])}
            />
            {ci < group.conditions.length - 1 && (
              <div className="flex items-center gap-1 py-0.5 pl-5">
                <div className="flex-1 border-t border-emerald-500/15" />
                <span className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-widest">and</span>
                <div className="flex-1 border-t border-emerald-500/15" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add condition to this group */}
      <Button
        variant="ghost" size="sm"
        className="h-5 text-[9px] gap-1 text-muted-foreground mt-1"
        onClick={() => onAddCondition(group.indices[group.indices.length - 1])}
      >
        <Plus className="w-2 h-2" /> Add to group
      </Button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function VisualQueryBuilder({
  filterValue, sortValue, onFilterChange, onSortChange, fields, onExecute, isExecuting, compact,
}: VisualQueryBuilderProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>(() => {
    const parsed = tryParseMongoToConditions(filterValue);
    return parsed.length > 0 ? parsed : [];
  });

  const [sorts, setSorts] = useState<SortRule[]>(() => tryParseMongoToSorts(sortValue));
  const [showPreview, setShowPreview] = useState(false);

  const orGroups = useMemo(() => computeOrGroups(conditions), [conditions]);

  const generatedFilter = useMemo(() => JSON.stringify(conditionsToMongo(conditions), null, 2), [conditions]);
  const generatedSort = useMemo(() => JSON.stringify(sortsToMongo(sorts), null, 2), [sorts]);
  const summary = useMemo(() => buildQuerySummary(conditions), [conditions]);

  useEffect(() => { onFilterChange(generatedFilter); }, [generatedFilter]);
  useEffect(() => { onSortChange(generatedSort); }, [generatedSort]);

  const addCondition = useCallback((afterIndex?: number) => {
    const defaultField = fields.length > 0 ? fields[0].path : "";
    const defaultOps = getOperatorsForType(fields[0]?.type);
    const newCondition: FilterCondition = {
      id: genId(), field: defaultField, operator: defaultOps[0]?.value || "eq", value: "", connector: "and",
    };
    if (afterIndex !== undefined) {
      setConditions(prev => {
        const next = [...prev];
        next.splice(afterIndex + 1, 0, newCondition);
        return next;
      });
    } else {
      setConditions(prev => [...prev, newCondition]);
    }
  }, [fields]);

  const addNewGroup = useCallback(() => {
    // Mark last condition as "or" to start a new group, then add a new condition
    setConditions(prev => {
      if (prev.length === 0) {
        return [{ id: genId(), field: fields[0]?.path || "", operator: getOperatorsForType(fields[0]?.type)[0]?.value || "eq", value: "", connector: "and" }];
      }
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], connector: "or" };
      next.push({ id: genId(), field: fields[0]?.path || "", operator: getOperatorsForType(fields[0]?.type)[0]?.value || "eq", value: "", connector: "and" });
      return next;
    });
  }, [fields]);

  const updateCondition = useCallback((idx: number, updates: Partial<FilterCondition>) => {
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, ...updates } : c));
  }, []);

  const removeCondition = useCallback((idx: number) => {
    setConditions(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // Fix connectors: if we removed the last item of a group, the previous item might need connector fix
      if (next.length > 0 && idx > 0 && idx <= next.length) {
        // If the removed condition was at a group boundary, adjust
      }
      return next;
    });
  }, []);

  const moveGroup = useCallback((groupIdx: number, dir: "up" | "down") => {
    setConditions(prev => {
      const groups = computeOrGroups(prev);
      if (dir === "up" && groupIdx > 0) {
        const temp = groups[groupIdx];
        groups[groupIdx] = groups[groupIdx - 1];
        groups[groupIdx - 1] = temp;
      } else if (dir === "down" && groupIdx < groups.length - 1) {
        const temp = groups[groupIdx];
        groups[groupIdx] = groups[groupIdx + 1];
        groups[groupIdx + 1] = temp;
      }
      // Rebuild flat list from groups
      const result: FilterCondition[] = [];
      groups.forEach((group, gi) => {
        group.conditions.forEach((c, ci) => {
          const isLastInGroup = ci === group.conditions.length - 1;
          const isLastGroup = gi === groups.length - 1;
          result.push({
            ...c,
            connector: isLastInGroup && !isLastGroup ? "or" : "and",
          });
        });
      });
      return result;
    });
  }, []);

  const removeGroup = useCallback((groupIdx: number) => {
    setConditions(prev => {
      const groups = computeOrGroups(prev);
      groups.splice(groupIdx, 1);
      const result: FilterCondition[] = [];
      groups.forEach((group, gi) => {
        group.conditions.forEach((c, ci) => {
          const isLastInGroup = ci === group.conditions.length - 1;
          const isLastGroup = gi === groups.length - 1;
          result.push({ ...c, connector: isLastInGroup && !isLastGroup ? "or" : "and" });
        });
      });
      return result;
    });
  }, []);

  // ── Compact mode (Documents tab header) ──
  if (compact) {
    return (
      <div className="space-y-1.5">
        {/* Summary line */}
        {conditions.length > 0 && (
          <p className="text-[10px] text-muted-foreground font-mono truncate" title={summary}>
            🔍 {summary}
          </p>
        )}

        {/* Groups */}
        {orGroups.length > 0 && (
          <div className="space-y-1">
            {orGroups.map((group, gi) => (
              <div key={group.groupId}>
                <GroupCard
                  group={group} groupIndex={gi} totalGroups={orGroups.length}
                  fields={fields}
                  onUpdateCondition={updateCondition}
                  onRemoveCondition={removeCondition}
                  onAddCondition={addCondition}
                  onMoveGroup={dir => moveGroup(gi, dir)}
                  onRemoveGroup={() => removeGroup(gi)}
                  compact
                />
                {gi < orGroups.length - 1 && (
                  <div className="flex items-center gap-1.5 py-0.5">
                    <div className="flex-1 border-t border-violet-500/20" />
                    <span className="text-[9px] font-bold text-violet-400 uppercase tracking-widest bg-violet-500/10 px-2 py-0.5 rounded-full">OR</span>
                    <div className="flex-1 border-t border-violet-500/20" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => addCondition()}>
            <Plus className="w-2.5 h-2.5" /> Filter
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-violet-500/30 text-violet-400 hover:bg-violet-500/10" onClick={addNewGroup}>
            <Plus className="w-2.5 h-2.5" /> OR Group
          </Button>
          <div className="w-px h-4 bg-border/30" />
          <SortBuilder sorts={sorts} fields={fields} onChange={setSorts} compact />
          <div className="flex-1" />
          {onExecute && (
            <Button size="sm" className="h-6 text-[10px] gap-1" onClick={onExecute} disabled={isExecuting}>
              {isExecuting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
              Apply
            </Button>
          )}
        </div>

        {/* Preview */}
        {conditions.length > 0 && (
          <button
            className="text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
            {showPreview ? "Hide" : "Show"} Query
          </button>
        )}
        {showPreview && conditions.length > 0 && (
          <pre className="bg-muted/30 rounded p-2 font-mono text-[10px] text-emerald-400 overflow-auto max-h-24">{generatedFilter}</pre>
        )}
      </div>
    );
  }

  // ── Full mode ──
  return (
    <div className="space-y-3">
      {conditions.length > 0 && (
        <p className="text-xs text-muted-foreground font-mono truncate" title={summary}>
          🔍 {summary}
        </p>
      )}

      <div className="space-y-2">
        {orGroups.map((group, gi) => (
          <div key={group.groupId}>
            <GroupCard
              group={group} groupIndex={gi} totalGroups={orGroups.length}
              fields={fields}
              onUpdateCondition={updateCondition}
              onRemoveCondition={removeCondition}
              onAddCondition={addCondition}
              onMoveGroup={dir => moveGroup(gi, dir)}
              onRemoveGroup={() => removeGroup(gi)}
            />
            {gi < orGroups.length - 1 && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 border-t border-violet-500/20" />
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest bg-violet-500/10 px-3 py-0.5 rounded-full">OR</span>
                <div className="flex-1 border-t border-violet-500/20" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => addCondition()}>
          <Plus className="w-3 h-3" /> Add Condition
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-violet-500/30 text-violet-400 hover:bg-violet-500/10" onClick={addNewGroup}>
          <Plus className="w-3 h-3" /> Add OR Group
        </Button>
      </div>

      <SortBuilder sorts={sorts} fields={fields} onChange={setSorts} />

      {conditions.length > 0 && (
        <div className="border-t border-border/30 pt-2">
          <button
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showPreview ? "Hide" : "Show"} Generated Query
          </button>
          {showPreview && (
            <pre className="mt-2 bg-muted/30 rounded-md p-3 font-mono text-[11px] text-emerald-400 overflow-auto max-h-40">{generatedFilter}</pre>
          )}
        </div>
      )}
    </div>
  );
}
