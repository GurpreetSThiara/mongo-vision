import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, ArrowUpDown, ArrowUp, ArrowDown, Eye, EyeOff, Play, Loader2, AlertCircle } from "lucide-react";

// ─── Public types ───────────────────────────────────────────────────────────

export interface SchemaField {
  path: string;
  type?: string;
}

interface VisualQueryBuilderProps {
  filterValue: string;
  sortValue: string;
  onFilterChange: (json: string) => void;
  onSortChange: (json: string) => void;
  fields: SchemaField[];
  liveQuery?: boolean;
  onExecute?: (payload?: { filter: string; sort: string }) => void;
  isExecuting?: boolean;
  compact?: boolean;
}

// ─── Internal model: OR of AND-blocks (matches MongoDB $or / implicit $and) ──

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
  value2?: string;
}

interface FilterGroup {
  id: string;
  rules: FilterRule[];
}

/** Flat condition with connector — only used for Mongo round-trip with existing parser. */
interface FlatCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  value2?: string;
  connector: "and" | "or";
}

// ─── Operators ───────────────────────────────────────────────────────────────

interface OperatorDef {
  value: string;
  label: string;
  valueCount: 0 | 1 | 2;
  isList?: boolean;
}

const OPERATORS_BY_TYPE: Record<string, OperatorDef[]> = {
  string: [
    { value: "eq", label: "is", valueCount: 1 },
    { value: "ne", label: "is not", valueCount: 1 },
    { value: "contains", label: "contains text", valueCount: 1 },
    { value: "startsWith", label: "starts with", valueCount: 1 },
    { value: "endsWith", label: "ends with", valueCount: 1 },
    { value: "regex", label: "regex", valueCount: 1 },
    { value: "in", label: "is one of (list)", valueCount: 1, isList: true },
    { value: "nin", label: "is not in (list)", valueCount: 1, isList: true },
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
  ],
  number: [
    { value: "eq", label: "=", valueCount: 1 },
    { value: "ne", label: "≠", valueCount: 1 },
    { value: "gt", label: ">", valueCount: 1 },
    { value: "gte", label: "≥", valueCount: 1 },
    { value: "lt", label: "<", valueCount: 1 },
    { value: "lte", label: "≤", valueCount: 1 },
    { value: "between", label: "between", valueCount: 2 },
    { value: "in", label: "is one of (list)", valueCount: 1, isList: true },
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
  ],
  boolean: [
    { value: "eq_true", label: "is true", valueCount: 0 },
    { value: "eq_false", label: "is false", valueCount: 0 },
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
  ],
  date: [
    { value: "eq", label: "equals", valueCount: 1 },
    { value: "gt", label: "after", valueCount: 1 },
    { value: "lt", label: "before", valueCount: 1 },
    { value: "gte", label: "on or after", valueCount: 1 },
    { value: "lte", label: "on or before", valueCount: 1 },
    { value: "between", label: "between", valueCount: 2 },
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
  ],
  array: [
    { value: "contains", label: "contains value", valueCount: 1 },
    { value: "in", label: "contains any of (list)", valueCount: 1, isList: true },
    { value: "all", label: "contains all of (list)", valueCount: 1, isList: true },
    { value: "size", label: "array length", valueCount: 1 },
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
  ],
  objectId: [
    { value: "eq", label: "equals", valueCount: 1 },
    { value: "in", label: "is one of (list)", valueCount: 1, isList: true },
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
  ],
  object: [
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
  ],
  unknown: [
    { value: "eq", label: "equals", valueCount: 1 },
    { value: "ne", label: "not equals", valueCount: 1 },
    { value: "gt", label: ">", valueCount: 1 },
    { value: "gte", label: "≥", valueCount: 1 },
    { value: "lt", label: "<", valueCount: 1 },
    { value: "lte", label: "≤", valueCount: 1 },
    { value: "in", label: "is one of (list)", valueCount: 1, isList: true },
    { value: "regex", label: "regex", valueCount: 1 },
    { value: "exists", label: "field exists", valueCount: 0 },
    { value: "notExists", label: "field missing", valueCount: 0 },
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

function fieldTypeLabel(type?: string): string {
  if (!type) return "?";
  const n = type.toLowerCase();
  if (n === "string") return "str";
  if (n === "int" || n === "double" || n === "long" || n === "decimal" || n === "number") return "num";
  if (n === "bool" || n === "boolean") return "bool";
  if (n === "date") return "date";
  if (n === "array") return "arr";
  if (n === "object") return "obj";
  if (n === "objectid") return "id";
  return n.slice(0, 4);
}

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

function stableJsonString(s: string): string {
  const t = s.trim();
  if (t === "" || t === "{}") return "{}";
  try {
    return JSON.stringify(JSON.parse(t));
  } catch {
    return t;
  }
}

// ─── Value parsing & Mongo leaf ─────────────────────────────────────────────

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
  return raw
    .split(",")
    .map((s) => smartParse(s.trim()))
    .filter((v) => v !== "");
}

function ruleToMongo(r: FilterRule): Record<string, unknown> | null {
  if (!r.field.trim()) return null;
  const v = r.value?.trim() || "";
  const v2 = r.value2?.trim() || "";

  switch (r.operator) {
    case "eq":
      return { [r.field]: smartParse(v) };
    case "ne":
      return { [r.field]: { $ne: smartParse(v) } };
    case "gt":
      return { [r.field]: { $gt: smartParse(v) } };
    case "gte":
      return { [r.field]: { $gte: smartParse(v) } };
    case "lt":
      return { [r.field]: { $lt: smartParse(v) } };
    case "lte":
      return { [r.field]: { $lte: smartParse(v) } };
    case "between":
      return { [r.field]: { $gte: smartParse(v), $lte: smartParse(v2) } };
    case "in":
      return { [r.field]: { $in: parseList(v) } };
    case "nin":
      return { [r.field]: { $nin: parseList(v) } };
    case "all":
      return { [r.field]: { $all: parseList(v) } };
    case "contains":
      return { [r.field]: { $regex: v, $options: "i" } };
    case "startsWith":
      return { [r.field]: { $regex: `^${v}`, $options: "i" } };
    case "endsWith":
      return { [r.field]: { $regex: `${v}$`, $options: "i" } };
    case "regex":
      return { [r.field]: { $regex: v } };
    case "exists":
      return { [r.field]: { $exists: true } };
    case "notExists":
      return { [r.field]: { $exists: false } };
    case "eq_true":
      return { [r.field]: true };
    case "eq_false":
      return { [r.field]: false };
    case "size":
      return { [r.field]: { $size: Number(v) || 0 } };
    default:
      return { [r.field]: smartParse(v) };
  }
}

function groupsToMongo(groups: FilterGroup[]): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [];
  for (const g of groups) {
    const parts = g.rules.map(ruleToMongo).filter(Boolean) as Record<string, unknown>[];
    if (parts.length === 0) continue;
    if (parts.length === 1) blocks.push(parts[0]);
    else blocks.push({ $and: parts });
  }
  if (blocks.length === 0) return {};
  if (blocks.length === 1) return blocks[0];
  return { $or: blocks };
}

// ─── Flat list + $or groups (import) ─────────────────────────────────────────

function computeOrGroupsFromFlat(conditions: FlatCondition[]): { groupId: string; rules: FilterRule[] }[] {
  if (conditions.length === 0) return [];
  const out: { groupId: string; rules: FilterRule[] }[] = [];
  let current: FilterRule[] = [];

  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i];
    current.push({
      id: c.id,
      field: c.field,
      operator: c.operator,
      value: c.value,
      value2: c.value2,
    });
    if (c.connector === "or" && i < conditions.length - 1) {
      out.push({ groupId: genId("grp"), rules: current });
      current = [];
    }
  }
  if (current.length > 0) out.push({ groupId: genId("grp"), rules: current });
  return out;
}

function tryParseMongoToFlat(json: string): FlatCondition[] {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
    if (Object.keys(obj).length === 0) return [];

    if (obj.$or && Array.isArray(obj.$or)) {
      const results: FlatCondition[] = [];
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
      const results: FlatCondition[] = [];
      for (const item of obj.$and) {
        const conds = parseGroupObj(item as Record<string, unknown>);
        for (const c of conds) c.connector = "and";
        results.push(...conds);
      }
      return results;
    }

    return parseGroupObj(obj);
  } catch {
    return [];
  }
}

function parseGroupObj(obj: Record<string, unknown>): FlatCondition[] {
  if (obj.$and && Array.isArray(obj.$and)) {
    const results: FlatCondition[] = [];
    for (const item of obj.$and) results.push(...parseGroupObj(item as Record<string, unknown>));
    return results;
  }
  const results: FlatCondition[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    const c = parseFieldCondition(key, val);
    if (c) results.push(c);
  }
  return results;
}

function parseFieldCondition(field: string, val: unknown): FlatCondition | null {
  const base: FlatCondition = { id: genId("rule"), field, operator: "eq", value: "", connector: "and" };
  if (val === null || typeof val === "string" || typeof val === "number")
    return { ...base, value: String(val ?? "") };
  if (typeof val === "boolean") return { ...base, operator: val ? "eq_true" : "eq_false" };
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const ops = val as Record<string, unknown>;
    if ("$ne" in ops) return { ...base, operator: "ne", value: String(ops.$ne) };
    if ("$gte" in ops && "$lte" in ops)
      return { ...base, operator: "between", value: String(ops.$gte), value2: String(ops.$lte) };
    if ("$gt" in ops) return { ...base, operator: "gt", value: String(ops.$gt) };
    if ("$gte" in ops) return { ...base, operator: "gte", value: String(ops.$gte) };
    if ("$lt" in ops) return { ...base, operator: "lt", value: String(ops.$lt) };
    if ("$lte" in ops) return { ...base, operator: "lte", value: String(ops.$lte) };
    if ("$in" in ops && Array.isArray(ops.$in))
      return { ...base, operator: "in", value: (ops.$in as unknown[]).join(", ") };
    if ("$nin" in ops && Array.isArray(ops.$nin))
      return { ...base, operator: "nin", value: (ops.$nin as unknown[]).join(", ") };
    if ("$all" in ops && Array.isArray(ops.$all))
      return { ...base, operator: "all", value: (ops.$all as unknown[]).join(", ") };
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

function parseFilterToGroups(json: string): FilterGroup[] {
  const flat = tryParseMongoToFlat(json);
  if (flat.length === 0) return [];
  const chunks = computeOrGroupsFromFlat(flat);
  return chunks.map((c) => ({ id: c.groupId, rules: c.rules }));
}

function emptyRule(): FilterRule {
  return { id: genId("rule"), field: "", operator: "eq", value: "" };
}

function emptyGroup(): FilterGroup {
  return { id: genId("grp"), rules: [emptyRule()] };
}

// ─── Sort ────────────────────────────────────────────────────────────────────

interface SortRule {
  id: string;
  field: string;
  direction: 1 | -1;
}

function sortsToMongo(sorts: SortRule[]): Record<string, unknown> {
  const result: Record<string, number> = {};
  for (const s of sorts) {
    if (s.field) result[s.field] = s.direction;
  }
  return result;
}

function tryParseMongoToSorts(json: string): SortRule[] {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return [];
    return Object.entries(obj).map(([field, dir]) => ({
      id: genId("sort"),
      field,
      direction: (dir === -1 ? -1 : 1) as 1 | -1,
    }));
  } catch {
    return [];
  }
}

// ─── Human summary (fixed: use field type for operator label) ──────────────

function ruleSummary(r: FilterRule, fields: SchemaField[]): string {
  if (!r.field.trim()) return "…";
  const t = fields.find((f) => f.path === r.field)?.type;
  const ops = getOperatorsForType(t);
  const op = ops.find((o) => o.value === r.operator) || ops[0];
  const label = op?.label || r.operator;
  if (op?.valueCount === 0) return `${r.field} ${label}`;
  if (op?.valueCount === 2) return `${r.field} ${label} ${r.value || "?"} … ${r.value2 || "?"}`;
  return `${r.field} ${label} ${r.value || "?"}`;
}

function buildSummary(groups: FilterGroup[], fields: SchemaField[]): string {
  const nonEmpty = groups.filter((g) => g.rules.some((r) => r.field.trim()));
  if (nonEmpty.length === 0) return "No filters";
  return nonEmpty
    .map((g) => {
      const parts = g.rules.filter((r) => r.field.trim()).map((r) => ruleSummary(r, fields));
      return parts.length > 1 ? `(${parts.join(" AND ")})` : parts[0] || "";
    })
    .join(" OR ");
}

// ─── Rule row ───────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  fields,
  onChange,
  onRemove,
  canRemove,
}: {
  rule: FilterRule;
  fields: SchemaField[];
  onChange: (u: Partial<FilterRule>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const selected = fields.find((f) => f.path === rule.field);
  const operators = getOperatorsForType(selected?.type);
  const currentOp = operators.find((o) => o.value === rule.operator) || operators[0];

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/40 bg-background/50 px-2 py-1.5">
      <Select
        value={rule.field || "__none__"}
        onValueChange={(val) => {
          if (val === "__none__") {
            onChange({ field: "", operator: "eq", value: "", value2: "" });
            return;
          }
          const nf = fields.find((f) => f.path === val);
          const nops = getOperatorsForType(nf?.type);
          onChange({ field: val, operator: nops[0]?.value || "eq", value: "", value2: "" });
        }}
      >
        <SelectTrigger className="h-8 min-w-[7rem] max-w-[10rem] text-xs font-mono bg-muted/30">
          <SelectValue placeholder="Field" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <SelectItem value="__none__" className="text-xs text-muted-foreground">
            Choose field…
          </SelectItem>
          {fields.map((f) => (
            <SelectItem key={f.path} value={f.path} className="text-xs font-mono">
              <span className="mr-2 text-[9px] uppercase text-muted-foreground tabular-nums w-7 inline-block">
                {fieldTypeLabel(f.type)}
              </span>
              {f.path}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={rule.operator}
        onValueChange={(val) => onChange({ operator: val, value: "", value2: "" })}
      >
        <SelectTrigger className="h-8 w-[9.5rem] text-xs bg-muted/30">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value} className="text-xs">
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currentOp && currentOp.valueCount >= 1 && (
        <div className="flex flex-1 min-w-[8rem] items-center gap-1.5">
          <Input
            value={rule.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={currentOp.isList ? "a, b, c" : "Value"}
            className="h-8 text-xs font-mono flex-1 min-w-0 bg-muted/30"
          />
          {currentOp.valueCount === 2 && (
            <>
              <span className="text-[10px] text-muted-foreground shrink-0">and</span>
              <Input
                value={rule.value2 || ""}
                onChange={(e) => onChange({ value2: e.target.value })}
                placeholder="Second"
                className="h-8 text-xs font-mono flex-1 min-w-0 bg-muted/30"
              />
            </>
          )}
        </div>
      )}
      {currentOp && currentOp.valueCount === 0 && <div className="flex-1 min-w-[4rem]" />}

      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove rule"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      ) : (
        <div className="w-8 shrink-0" />
      )}
    </div>
  );
}

// ─── Sort builder ────────────────────────────────────────────────────────────

function SortSection({
  sorts,
  fields,
  onChange,
  compact,
}: {
  sorts: SortRule[];
  fields: SchemaField[];
  onChange: (s: SortRule[]) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
      {!compact && (
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <ArrowUpDown className="w-3 h-3" />
          Sort
        </div>
      )}
      {sorts.map((sort, idx) => (
        <div key={sort.id} className="flex items-center gap-1">
          <Select
            value={sort.field && fields.some((f) => f.path === sort.field) ? sort.field : "__none__"}
            onValueChange={(val) => {
              const next = [...sorts];
              next[idx] = { ...next[idx], field: val === "__none__" ? "" : val };
              onChange(next);
            }}
          >
            <SelectTrigger className="h-8 min-w-[6rem] text-xs font-mono bg-muted/30">
              <SelectValue placeholder="Field" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="__none__" className="text-xs text-muted-foreground">
                Choose field…
              </SelectItem>
              {fields.map((f) => (
                <SelectItem key={f.path} value={f.path} className="text-xs font-mono">
                  {f.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-8 gap-0.5 px-2 text-[10px] font-mono ${sort.direction === 1 ? "text-emerald-500" : "text-amber-500"}`}
            onClick={() => {
              const next = [...sorts];
              next[idx] = { ...next[idx], direction: sort.direction === 1 ? -1 : 1 };
              onChange(next);
            }}
          >
            {sort.direction === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {sort.direction === 1 ? "Asc" : "Desc"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(sorts.filter((_, i) => i !== idx))}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-[10px]"
        onClick={() =>
          onChange([
            ...sorts,
            { id: genId("sort"), field: fields[0]?.path || "", direction: -1 },
          ])
        }
      >
        <Plus className="w-3 h-3" />
        {compact ? "Sort field" : "Add sort"}
      </Button>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function VisualQueryBuilder({
  filterValue,
  sortValue,
  onFilterChange,
  onSortChange,
  fields,
  liveQuery = true,
  onExecute,
  isExecuting,
  compact,
}: VisualQueryBuilderProps) {
  const [groups, setGroups] = useState<FilterGroup[]>(() => {
    const inn = stableJsonString(filterValue);
    const blocked = inn !== "{}" && tryParseMongoToFlat(filterValue).length === 0;
    if (blocked) return [];
    const g = parseFilterToGroups(filterValue);
    return g.length > 0 ? g : [];
  });
  const [sorts, setSorts] = useState<SortRule[]>(() => tryParseMongoToSorts(sortValue));
  const [showJson, setShowJson] = useState(false);

  const lastEmittedFilter = useRef<string>(filterValue);
  const lastEmittedSort = useRef<string>(sortValue);

  const generatedFilter = useMemo(
    () => JSON.stringify(groupsToMongo(groups), null, 2),
    [groups],
  );
  const generatedSort = useMemo(() => JSON.stringify(sortsToMongo(sorts), null, 2), [sorts]);

  const filterUnrepresentable = useMemo(() => {
    const inn = stableJsonString(filterValue);
    if (inn === "{}") return false;
    const flat = tryParseMongoToFlat(filterValue);
    return flat.length === 0;
  }, [filterValue]);

  /** Pull filter/sort from parent when they change outside this builder (code mode, reset, collection). */
  useEffect(() => {
    if (stableJsonString(filterValue) === stableJsonString(lastEmittedFilter.current)) return;
    lastEmittedFilter.current = filterValue;

    if (filterUnrepresentable) return;

    const parsed = parseFilterToGroups(filterValue);
    setGroups(parsed.length > 0 ? parsed : []);
  }, [filterValue, filterUnrepresentable]);

  useEffect(() => {
    if (stableJsonString(sortValue) === stableJsonString(lastEmittedSort.current)) return;
    lastEmittedSort.current = sortValue;
    setSorts(tryParseMongoToSorts(sortValue));
  }, [sortValue]);

  useEffect(() => {
    if (filterUnrepresentable) return;
    lastEmittedFilter.current = generatedFilter;
    onFilterChange(generatedFilter);
  }, [generatedFilter, onFilterChange, filterUnrepresentable]);

  useEffect(() => {
    lastEmittedSort.current = generatedSort;
    onSortChange(generatedSort);
  }, [generatedSort, onSortChange]);

  const summary = useMemo(() => buildSummary(groups, fields), [groups, fields]);

  const runApply = useCallback(() => {
    if (!liveQuery) {
      onExecute?.({ filter: generatedFilter, sort: generatedSort });
    } else {
      onExecute?.();
    }
  }, [liveQuery, generatedFilter, generatedSort, onExecute]);

  const updateRule = useCallback((gi: number, ri: number, u: Partial<FilterRule>) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i !== gi
          ? g
          : {
              ...g,
              rules: g.rules.map((r, j) => (j === ri ? { ...r, ...u } : r)),
            },
      ),
    );
  }, []);

  const removeRule = useCallback((gi: number, ri: number) => {
    setGroups((prev) => {
      const g = prev[gi];
      if (!g) return prev;
      const nextRules = g.rules.filter((_, j) => j !== ri);
      if (nextRules.length === 0) {
        return prev.filter((_, i) => i !== gi);
      }
      return prev.map((gr, i) => (i === gi ? { ...gr, rules: nextRules } : gr));
    });
  }, []);

  const addRule = useCallback((gi: number) => {
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, rules: [...g.rules, emptyRule()] } : g)),
    );
  }, []);

  /** New AND-group, or another rule inside the last group (AND within that OR-branch). */
  const addAndBlock = useCallback(() => {
    setGroups((prev) => {
      if (prev.length === 0) return [{ id: genId("grp"), rules: [emptyRule()] }];
      const last = prev[prev.length - 1];
      const grown = { ...last, rules: [...last.rules, emptyRule()] };
      return [...prev.slice(0, -1), grown];
    });
  }, []);

  /** New OR-branch: always a new group. If none yet, same as first AND-block (one group). */
  const addOrBlock = useCallback(() => {
    setGroups((prev) => [...prev, { id: genId("grp"), rules: [emptyRule()] }]);
  }, []);

  const removeBlock = useCallback((gi: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== gi));
  }, []);

  const clearFiltersForVisual = useCallback(() => {
    lastEmittedFilter.current = "{}";
    onFilterChange("{}");
    setGroups([]);
  }, [onFilterChange]);

  const filterBody = (
    <>
      {filterUnrepresentable && (
        <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground">This filter can’t be shown in Visual mode</p>
            <p className="text-muted-foreground">
              It may use operators or nesting the visual builder doesn’t support yet. Edit it in Code view, or reset and
              build a new filter here.
            </p>
            <Button type="button" size="sm" variant="secondary" className="h-7 text-[10px] mt-1" onClick={clearFiltersForVisual}>
              Reset filter to Visual builder
            </Button>
          </div>
        </div>
      )}

      {!filterUnrepresentable && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground leading-snug">
            <span className="font-medium text-foreground">Filters:</span> An <span className="font-mono text-[10px]">AND</span>{" "}
            block is one group—every rule in it must match. An <span className="font-mono text-[10px]">OR</span> block is a
            separate group—match any group. You can start with no filters; add blocks when you need them.
          </p>

          {groups.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-center space-y-3">
              <p className="text-[11px] text-muted-foreground leading-snug">
                No filter conditions. <strong className="text-foreground font-medium">Add AND block</strong> starts your
                first group (or adds another rule to the last group). <strong className="text-foreground font-medium">Add OR block</strong>{" "}
                adds a separate branch (OR with the others).
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  onClick={addAndBlock}
                >
                  <Plus className="w-3 h-3" />
                  Add AND block
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[10px] gap-1 border-violet-500/40 text-violet-700 dark:text-violet-400"
                  onClick={addOrBlock}
                >
                  <Plus className="w-3 h-3" />
                  Add OR block
                </Button>
              </div>
            </div>
          )}

          {groups.map((g, gi) => (
            <div key={g.id}>
              {gi > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-400">
                    Or
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <div
                className={`rounded-lg border border-border/60 bg-muted/20 p-2 space-y-2 ${
                  compact ? "" : "p-3"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {groups.length === 1 ? "Match all of" : `Block ${gi + 1} — match all of`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={() => removeBlock(gi)}
                  >
                    Remove block
                  </Button>
                </div>
                <div className="space-y-2">
                  {g.rules.map((r, ri) => (
                    <RuleRow
                      key={r.id}
                      rule={r}
                      fields={fields}
                      onChange={(u) => updateRule(gi, ri, u)}
                      onRemove={() => removeRule(gi, ri)}
                      canRemove
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-[10px] text-muted-foreground border border-dashed border-border/60"
                  onClick={() => addRule(gi)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add rule (AND)
                </Button>
              </div>
            </div>
          ))}

          {groups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                onClick={addAndBlock}
                title="Start a new group, or add another rule to the last group (AND)"
              >
                <Plus className="w-3 h-3" />
                Add AND block
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] gap-1 border-violet-500/40 text-violet-700 dark:text-violet-400"
                onClick={addOrBlock}
                title="Add a new OR branch (new group)"
              >
                <Plus className="w-3 h-3" />
                Add OR block
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );

  const sortSection = (
    <SortSection sorts={sorts} fields={fields} onChange={setSorts} compact={compact} />
  );

  const toolbar = onExecute && (
    <Button
      type="button"
      size="sm"
      className={compact ? "h-7 text-[10px] gap-1" : "h-8 text-xs gap-1.5"}
      onClick={runApply}
      disabled={isExecuting}
    >
      {isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      {liveQuery ? "Refresh" : "Apply"}
    </Button>
  );

  if (compact) {
    return (
      <div className="space-y-2">
        {!filterUnrepresentable && (
          <p className="text-[10px] text-muted-foreground truncate" title={summary}>
            {summary}
          </p>
        )}
        {filterBody}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
          {sortSection}
          <div className="flex-1 min-w-[1rem]" />
          {toolbar}
        </div>
        {!filterUnrepresentable && (
          <button
            type="button"
            className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setShowJson(!showJson)}
          >
            {showJson ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showJson ? "Hide" : "Show"} filter JSON
          </button>
        )}
        {showJson && !filterUnrepresentable && (
          <pre className="max-h-28 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
            {generatedFilter}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!filterUnrepresentable && (
        <p className="text-xs text-muted-foreground font-mono truncate" title={summary}>
          {summary}
        </p>
      )}
      {filterBody}
      <div className="border-t border-border/40 pt-3 space-y-2">
        {sortSection}
      </div>
      <div className="flex items-center gap-2">
        {toolbar}
      </div>
      {!filterUnrepresentable && (
        <div className="border-t border-border/40 pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowJson(!showJson)}
          >
            {showJson ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showJson ? "Hide" : "Show"} generated filter JSON
          </button>
          {showJson && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
              {generatedFilter}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
