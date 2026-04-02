import Editor, { useMonaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useCallback } from "react";
import type { editor } from "monaco-editor";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldInfo {
  path: string;
  type?: string;
  /** nested sub-fields (for dot-path drilling) */
  children?: FieldInfo[];
}

interface QueryEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  fields?: (string | FieldInfo)[];
  height?: string;
  className?: string;
  placeholder?: string;
  /** Keyboard shortcut: Cmd/Ctrl+Enter */
  onExecute?: () => void;
  /** Keyboard shortcut: Cmd/Ctrl+Shift+E */
  onExplain?: () => void;
  /** Keyboard shortcut: Cmd/Ctrl+Shift+S */
  onSave?: () => void;
  /** 'filter' | 'sort' | 'aggregation' | 'general' */
  mode?: "filter" | "sort" | "aggregation" | "general";
}

// ─── Operator Database ───────────────────────────────────────────────────────

interface OperatorDef {
  label: string;
  kind: "stage" | "query" | "accumulator" | "expression" | "update";
  doc: string;
  snippet: string;
}

const OPERATORS: OperatorDef[] = [
  // ── Aggregation Stages ──
  { label: "$match", kind: "stage", doc: "Filters documents. Equivalent to `find()` filter.", snippet: '{ "\\$match": { ${1:field}: ${2:value} } }' },
  { label: "$group", kind: "stage", doc: "Groups documents by a key and applies accumulators.", snippet: '{ "\\$group": { "_id": "\\$${1:field}", "${2:count}": { "\\$sum": ${3:1} } } }' },
  { label: "$project", kind: "stage", doc: "Reshapes documents — include, exclude, or compute fields.", snippet: '{ "\\$project": { "${1:field}": 1, "_id": 0 } }' },
  { label: "$sort", kind: "stage", doc: "Sorts documents. Use 1 for ascending, -1 for descending.", snippet: '{ "\\$sort": { "${1:field}": ${2|-1,1|} } }' },
  { label: "$limit", kind: "stage", doc: "Limits the number of documents passed to the next stage.", snippet: '{ "\\$limit": ${1:10} }' },
  { label: "$skip", kind: "stage", doc: "Skips a number of documents.", snippet: '{ "\\$skip": ${1:0} }' },
  { label: "$unwind", kind: "stage", doc: "Deconstructs an array field, outputting one document per element.", snippet: '{ "\\$unwind": "\\$${1:arrayField}" }' },
  { label: "$lookup", kind: "stage", doc: "Performs a left outer join to another collection.", snippet: '{ "\\$lookup": { "from": "${1:collection}", "localField": "${2:localField}", "foreignField": "${3:foreignField}", "as": "${4:resultArray}" } }' },
  { label: "$addFields", kind: "stage", doc: "Adds new fields or overrides existing ones.", snippet: '{ "\\$addFields": { "${1:newField}": ${2:expression} } }' },
  { label: "$set", kind: "stage", doc: "Alias for $addFields. Adds/overrides fields.", snippet: '{ "\\$set": { "${1:field}": ${2:expression} } }' },
  { label: "$unset", kind: "stage", doc: "Removes fields from documents.", snippet: '{ "\\$unset": "${1:field}" }' },
  { label: "$replaceRoot", kind: "stage", doc: "Replaces the root document with a specified embedded document.", snippet: '{ "\\$replaceRoot": { "newRoot": "\\$${1:field}" } }' },
  { label: "$replaceWith", kind: "stage", doc: "Alias for $replaceRoot.", snippet: '{ "\\$replaceWith": "\\$${1:field}" }' },
  { label: "$facet", kind: "stage", doc: "Processes multiple aggregation pipelines in a single stage.", snippet: '{ "\\$facet": { "${1:output1}": [${2}], "${3:output2}": [${4}] } }' },
  { label: "$bucket", kind: "stage", doc: "Categorizes documents into groups based on boundaries.", snippet: '{ "\\$bucket": { "groupBy": "\\$${1:field}", "boundaries": [${2:0, 50, 100}], "default": "${3:Other}" } }' },
  { label: "$bucketAuto", kind: "stage", doc: "Automatically categorizes documents into a specified number of groups.", snippet: '{ "\\$bucketAuto": { "groupBy": "\\$${1:field}", "buckets": ${2:5} } }' },
  { label: "$count", kind: "stage", doc: "Returns a count of documents.", snippet: '{ "\\$count": "${1:totalCount}" }' },
  { label: "$sample", kind: "stage", doc: "Randomly selects N documents.", snippet: '{ "\\$sample": { "size": ${1:10} } }' },
  { label: "$out", kind: "stage", doc: "Writes results to a collection. Must be last stage.", snippet: '{ "\\$out": "${1:outputCollection}" }' },
  { label: "$merge", kind: "stage", doc: "Merges results into an existing collection.", snippet: '{ "\\$merge": { "into": "${1:collection}", "whenMatched": "${2|merge,replace,keepExisting|}" } }' },
  { label: "$graphLookup", kind: "stage", doc: "Performs recursive search on a collection.", snippet: '{ "\\$graphLookup": { "from": "${1:collection}", "startWith": "\\$${2:field}", "connectFromField": "${3:from}", "connectToField": "${4:to}", "as": "${5:result}" } }' },
  { label: "$geoNear", kind: "stage", doc: "Returns documents sorted by proximity to a geospatial point. Must be first stage.", snippet: '{ "\\$geoNear": { "near": { "type": "Point", "coordinates": [${1:lng}, ${2:lat}] }, "distanceField": "${3:distance}", "maxDistance": ${4:1000} } }' },
  { label: "$unionWith", kind: "stage", doc: "Combines pipeline results from two collections.", snippet: '{ "\\$unionWith": { "coll": "${1:collection}", "pipeline": [${2}] } }' },
  { label: "$densify", kind: "stage", doc: "Creates new documents to fill gaps in time series or numeric data.", snippet: '{ "\\$densify": { "field": "${1:field}", "range": { "step": ${2:1}, "unit": "${3|hour,day,week,month|}" } } }' },

  // ── Query / Comparison Operators ──
  { label: "$eq", kind: "query", doc: "Matches values equal to a specified value.", snippet: '"\\$eq": ${1:value}' },
  { label: "$ne", kind: "query", doc: "Matches values not equal to a specified value.", snippet: '"\\$ne": ${1:value}' },
  { label: "$gt", kind: "query", doc: "Matches values greater than a specified value.", snippet: '"\\$gt": ${1:value}' },
  { label: "$gte", kind: "query", doc: "Matches values greater than or equal to a specified value.", snippet: '"\\$gte": ${1:value}' },
  { label: "$lt", kind: "query", doc: "Matches values less than a specified value.", snippet: '"\\$lt": ${1:value}' },
  { label: "$lte", kind: "query", doc: "Matches values less than or equal to a specified value.", snippet: '"\\$lte": ${1:value}' },
  { label: "$in", kind: "query", doc: "Matches any value in an array.", snippet: '"\\$in": [${1:value1}, ${2:value2}]' },
  { label: "$nin", kind: "query", doc: "Matches none of the values in an array.", snippet: '"\\$nin": [${1:value1}, ${2:value2}]' },

  // ── Logical Operators ──
  { label: "$and", kind: "query", doc: "Joins query clauses with logical AND.", snippet: '"\\$and": [{ ${1} }, { ${2} }]' },
  { label: "$or", kind: "query", doc: "Joins query clauses with logical OR.", snippet: '"\\$or": [{ ${1} }, { ${2} }]' },
  { label: "$not", kind: "query", doc: "Inverts the effect of a query expression.", snippet: '"\\$not": { ${1} }' },
  { label: "$nor", kind: "query", doc: "Joins query clauses with logical NOR.", snippet: '"\\$nor": [{ ${1} }, { ${2} }]' },

  // ── Element Operators ──
  { label: "$exists", kind: "query", doc: "Matches documents that have (or don't have) a field.", snippet: '"\\$exists": ${1|true,false|}' },
  { label: "$type", kind: "query", doc: "Matches documents where the field is a specified BSON type.", snippet: '"\\$type": "${1|string,number,object,array,bool,date,null,objectId|}"' },

  // ── Evaluation Operators ──
  { label: "$regex", kind: "query", doc: "Matches using regular expressions. ⚠ May cause COLLSCAN without a text index.", snippet: '"\\$regex": "${1:pattern}", "\\$options": "${2:i}"' },
  { label: "$text", kind: "query", doc: "Performs text search. Requires a text index.", snippet: '"\\$text": { "\\$search": "${1:search terms}" }' },
  { label: "$mod", kind: "query", doc: "Performs modulo operation on a field.", snippet: '"\\$mod": [${1:divisor}, ${2:remainder}]' },
  { label: "$where", kind: "query", doc: "Matches with a JavaScript expression. ⚠ Slow — avoid in production.", snippet: '"\\$where": "this.${1:field} ${2:> 10}"' },

  // ── Array Operators ──
  { label: "$all", kind: "query", doc: "Matches arrays that contain all specified elements.", snippet: '"\\$all": [${1:value1}, ${2:value2}]' },
  { label: "$elemMatch", kind: "query", doc: "Matches documents where at least one array element satisfies all conditions.", snippet: '"\\$elemMatch": { ${1:field}: ${2:value} }' },
  { label: "$size", kind: "query", doc: "Matches arrays with the specified number of elements.", snippet: '"\\$size": ${1:number}' },

  // ── Group Accumulators ──
  { label: "$sum", kind: "accumulator", doc: "Returns the sum of numeric values. Use 1 to count documents.", snippet: '"\\$sum": ${1|1,"\\$field"|}' },
  { label: "$avg", kind: "accumulator", doc: "Returns the average of numeric values.", snippet: '"\\$avg": "\\$${1:field}"' },
  { label: "$first", kind: "accumulator", doc: "Returns the first value in a group.", snippet: '"\\$first": "\\$${1:field}"' },
  { label: "$last", kind: "accumulator", doc: "Returns the last value in a group.", snippet: '"\\$last": "\\$${1:field}"' },
  { label: "$max", kind: "accumulator", doc: "Returns the maximum value.", snippet: '"\\$max": "\\$${1:field}"' },
  { label: "$min", kind: "accumulator", doc: "Returns the minimum value.", snippet: '"\\$min": "\\$${1:field}"' },
  { label: "$push", kind: "accumulator", doc: "Appends values to an array for each group.", snippet: '"\\$push": "\\$${1:field}"' },
  { label: "$addToSet", kind: "accumulator", doc: "Appends unique values to an array for each group.", snippet: '"\\$addToSet": "\\$${1:field}"' },
  { label: "$stdDevPop", kind: "accumulator", doc: "Returns population standard deviation.", snippet: '"\\$stdDevPop": "\\$${1:field}"' },
  { label: "$stdDevSamp", kind: "accumulator", doc: "Returns sample standard deviation.", snippet: '"\\$stdDevSamp": "\\$${1:field}"' },

  // ── Expression Operators ──
  { label: "$cond", kind: "expression", doc: "Ternary operator: if/then/else.", snippet: '{ "\\$cond": { "if": ${1:boolExpr}, "then": ${2:trueVal}, "else": ${3:falseVal} } }' },
  { label: "$ifNull", kind: "expression", doc: "Returns expression or replacement if null.", snippet: '{ "\\$ifNull": ["\\$${1:field}", ${2:replacement}] }' },
  { label: "$switch", kind: "expression", doc: "Evaluates a series of case expressions.", snippet: '{ "\\$switch": { "branches": [{ "case": ${1:expr}, "then": ${2:result} }], "default": ${3:defaultVal} } }' },
  { label: "$concat", kind: "expression", doc: "Concatenates strings.", snippet: '{ "\\$concat": ["\\$${1:field1}", " ", "\\$${2:field2}"] }' },
  { label: "$substr", kind: "expression", doc: "Returns a substring.", snippet: '{ "\\$substr": ["\\$${1:field}", ${2:start}, ${3:length}] }' },
  { label: "$toLower", kind: "expression", doc: "Converts string to lowercase.", snippet: '{ "\\$toLower": "\\$${1:field}" }' },
  { label: "$toUpper", kind: "expression", doc: "Converts string to uppercase.", snippet: '{ "\\$toUpper": "\\$${1:field}" }' },
  { label: "$dateToString", kind: "expression", doc: "Converts a date to a formatted string.", snippet: '{ "\\$dateToString": { "format": "${1:%Y-%m-%d}", "date": "\\$${2:dateField}" } }' },
  { label: "$year", kind: "expression", doc: "Extracts year from a date.", snippet: '{ "\\$year": "\\$${1:dateField}" }' },
  { label: "$month", kind: "expression", doc: "Extracts month from a date.", snippet: '{ "\\$month": "\\$${1:dateField}" }' },
  { label: "$dayOfMonth", kind: "expression", doc: "Extracts day of the month from a date.", snippet: '{ "\\$dayOfMonth": "\\$${1:dateField}" }' },
  { label: "$arrayElemAt", kind: "expression", doc: "Returns element at array index.", snippet: '{ "\\$arrayElemAt": ["\\$${1:array}", ${2:index}] }' },
  { label: "$filter", kind: "expression", doc: "Selects a subset of an array.", snippet: '{ "\\$filter": { "input": "\\$${1:array}", "as": "${2:item}", "cond": { ${3} } } }' },
  { label: "$map", kind: "expression", doc: "Applies an expression to each array element.", snippet: '{ "\\$map": { "input": "\\$${1:array}", "as": "${2:item}", "in": ${3:expression} } }' },
  { label: "$reduce", kind: "expression", doc: "Reduces an array to a single value.", snippet: '{ "\\$reduce": { "input": "\\$${1:array}", "initialValue": ${2:0}, "in": { "\\$add": ["\\$\\$value", "\\$\\$this"] } } }' },
  { label: "$toString", kind: "expression", doc: "Converts a value to string.", snippet: '{ "\\$toString": "\\$${1:field}" }' },
  { label: "$toInt", kind: "expression", doc: "Converts a value to integer.", snippet: '{ "\\$toInt": "\\$${1:field}" }' },
  { label: "$toDouble", kind: "expression", doc: "Converts a value to double.", snippet: '{ "\\$toDouble": "\\$${1:field}" }' },
  { label: "$toObjectId", kind: "expression", doc: "Converts a string to ObjectId.", snippet: '{ "\\$toObjectId": "\\$${1:field}" }' },
  { label: "$multiply", kind: "expression", doc: "Multiplies numbers.", snippet: '{ "\\$multiply": ["\\$${1:field}", ${2:value}] }' },
  { label: "$divide", kind: "expression", doc: "Divides two numbers.", snippet: '{ "\\$divide": ["\\$${1:field}", ${2:value}] }' },
  { label: "$add", kind: "expression", doc: "Adds numbers or date + ms.", snippet: '{ "\\$add": ["\\$${1:field}", ${2:value}] }' },
  { label: "$subtract", kind: "expression", doc: "Subtracts two numbers or dates.", snippet: '{ "\\$subtract": ["\\$${1:field}", ${2:value}] }' },
  { label: "$abs", kind: "expression", doc: "Returns absolute value.", snippet: '{ "\\$abs": "\\$${1:field}" }' },
  { label: "$ceil", kind: "expression", doc: "Rounds up to nearest integer.", snippet: '{ "\\$ceil": "\\$${1:field}" }' },
  { label: "$floor", kind: "expression", doc: "Rounds down to nearest integer.", snippet: '{ "\\$floor": "\\$${1:field}" }' },
  { label: "$round", kind: "expression", doc: "Rounds to specified decimal places.", snippet: '{ "\\$round": ["\\$${1:field}", ${2:2}] }' },
];

// Map of known operators for fast validation lookup
const KNOWN_OPERATORS = new Set(OPERATORS.map(o => o.label));

// ─── Utility Functions ───────────────────────────────────────────────────────

function normalizeFields(fields: (string | FieldInfo)[]): FieldInfo[] {
  return fields.map(f => typeof f === "string" ? { path: f } : f);
}

function getTypeIcon(type?: string): string {
  const icons: Record<string, string> = {
    string: "🔤", number: "🔢", boolean: "✅", object: "📦",
    array: "📋", date: "📅", objectId: "🆔", null: "⊘",
  };
  return icons[type || ""] || "•";
}

function getOperatorKindIcon(kind: OperatorDef["kind"]): string {
  return { stage: "🔷", query: "🔍", accumulator: "Σ", expression: "ƒ", update: "✏️" }[kind];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QueryEditor({
  value, onChange, fields = [], height = "100px", className,
  placeholder, onExecute, onExplain, onSave, mode = "general",
}: QueryEditorProps) {
  const monaco = useMonaco();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const completionProviderRef = useRef<any>(null);
  const diagnosticProviderRef = useRef<any>(null);

  const normalizedFields = normalizeFields(fields);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const handleEditorMount: OnMount = useCallback((ed, mon) => {
    editorRef.current = ed;

    // Cmd/Ctrl + Enter → Execute
    if (onExecute) {
      ed.addAction({
        id: "mongo-execute",
        label: "Execute Query",
        keybindings: [mon.KeyMod.CtrlCmd | mon.KeyCode.Enter],
        run: () => onExecute(),
      });
    }
    // Cmd/Ctrl + Shift + E → Explain
    if (onExplain) {
      ed.addAction({
        id: "mongo-explain",
        label: "Explain Query",
        keybindings: [mon.KeyMod.CtrlCmd | mon.KeyMod.Shift | mon.KeyCode.KeyE],
        run: () => onExplain(),
      });
    }
    // Cmd/Ctrl + Shift + S → Save
    if (onSave) {
      ed.addAction({
        id: "mongo-save",
        label: "Save Query",
        keybindings: [mon.KeyMod.CtrlCmd | mon.KeyMod.Shift | mon.KeyCode.KeyS],
        run: () => onSave(),
      });
    }
  }, [onExecute, onExplain, onSave]);

  // ── Completion Provider ─────────────────────────────────────────────────
  useEffect(() => {
    if (!monaco) return;

    if (completionProviderRef.current) completionProviderRef.current.dispose();

    completionProviderRef.current = monaco.languages.registerCompletionItemProvider("json", {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // Detect context from surrounding text
        const textBefore = model.getValueInRange({
          startLineNumber: 1, startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const insideGroup = /"\$group"\s*:\s*\{[^}]*$/s.test(textBefore);
        const insideMatch = /"\$match"\s*:\s*\{[^}]*$/s.test(textBefore);
        const insideProject = /"\$project"\s*:\s*\{[^}]*$/s.test(textBefore);
        const isAggregationMode = mode === "aggregation";

        const suggestions: any[] = [];

        // ── Operators ──
        OPERATORS.forEach((op, idx) => {
          // Context filtering
          let relevance = 50;
          if (insideGroup && op.kind === "accumulator") relevance = 100;
          else if (insideMatch && op.kind === "query") relevance = 100;
          else if (insideProject && op.kind === "expression") relevance = 95;
          else if (isAggregationMode && op.kind === "stage") relevance = 90;
          else if (mode === "filter" && op.kind === "query") relevance = 90;
          else if (mode === "sort" && op.label === "$meta") relevance = 90;

          suggestions.push({
            label: {
              label: op.label,
              description: `${getOperatorKindIcon(op.kind)} ${op.kind}`,
              detail: ` — ${op.doc.slice(0, 60)}${op.doc.length > 60 ? "…" : ""}`,
            },
            kind: op.kind === "stage"
              ? monaco.languages.CompletionItemKind.Module
              : op.kind === "accumulator"
                ? monaco.languages.CompletionItemKind.Function
                : op.kind === "expression"
                  ? monaco.languages.CompletionItemKind.Method
                  : monaco.languages.CompletionItemKind.Keyword,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            insertText: op.snippet,
            range,
            documentation: {
              value: `**${op.label}** — *${op.kind}*\n\n${op.doc}\n\n\`\`\`json\n${op.snippet.replace(/\$\{\d+[\|:]?[^}]*\}/g, "…")}\n\`\`\``,
              isTrusted: true,
              supportHtml: false,
            },
            sortText: String(1000 - relevance).padStart(4, "0") + String(idx).padStart(4, "0"),
          });
        });

        // ── Field completions with type info ──
        normalizedFields.forEach((field, idx) => {
          const typeLabel = field.type ? ` (${field.type})` : "";
          const icon = getTypeIcon(field.type);

          suggestions.push({
            label: {
              label: field.path,
              description: `${icon} field${typeLabel}`,
            },
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: field.path,
            range,
            documentation: {
              value: `**${field.path}**${typeLabel}\n\nCollection field${field.type ? ` of type \`${field.type}\`` : ""}.`,
              isTrusted: true,
            },
            sortText: "0000" + String(idx).padStart(4, "0"), // Fields always first
          });

          // Suggest field reference with $ prefix for aggregation
          if (isAggregationMode || insideGroup || insideProject) {
            suggestions.push({
              label: {
                label: `$${field.path}`,
                description: `${icon} field reference`,
              },
              kind: monaco.languages.CompletionItemKind.Reference,
              insertText: `\\$${field.path}`,
              range,
              documentation: {
                value: `**\\$${field.path}**\n\nField reference for use in expressions and accumulators.`,
                isTrusted: true,
              },
              sortText: "0100" + String(idx).padStart(4, "0"),
            });
          }
        });

        return { suggestions };
      },
      triggerCharacters: ["$", "\"", ".", ":"],
    });

    return () => { if (completionProviderRef.current) completionProviderRef.current.dispose(); };
  }, [monaco, normalizedFields, mode]);

  // ── Diagnostics Provider (Real-time Validation) ─────────────────────────
  useEffect(() => {
    if (!monaco) return;

    // create a unique owner for our diagnostics
    const diagnosticOwner = "mongo-query-validator";

    const validate = (model: editor.ITextModel) => {
      const text = model.getValue();
      const markers: any[] = [];

      if (!text.trim()) {
        monaco.editor.setModelMarkers(model, diagnosticOwner, []);
        return;
      }

      // 1. JSON syntax check
      try {
        JSON.parse(text);
      } catch (e: any) {
        // Find the position of the JSON error
        const match = e.message.match(/position (\d+)/);
        const pos = match ? parseInt(match[1], 10) : 0;
        const errorPos = model.getPositionAt(pos);
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: `Invalid JSON: ${e.message}`,
          startLineNumber: errorPos.lineNumber,
          startColumn: errorPos.column > 1 ? errorPos.column - 1 : 1,
          endLineNumber: errorPos.lineNumber,
          endColumn: errorPos.column + 1,
        });
        monaco.editor.setModelMarkers(model, diagnosticOwner, markers);
        return; // skip semantic checks if JSON is broken
      }

      // 2. Check for unknown MongoDB operators
      const dollarRegex = /"\$([a-zA-Z]+)"/g;
      let m;
      while ((m = dollarRegex.exec(text)) !== null) {
        const opName = `$${m[1]}`;
        if (!KNOWN_OPERATORS.has(opName)) {
          // Find closest match for "did you mean" suggestion
          let closest = "";
          let minDist = Infinity;
          for (const known of KNOWN_OPERATORS) {
            const dist = levenshtein(opName, known);
            if (dist < minDist && dist <= 3) {
              minDist = dist;
              closest = known;
            }
          }

          const errPos = model.getPositionAt(m.index);
          const endPos = model.getPositionAt(m.index + m[0].length);
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Unknown operator "${opName}".${closest ? ` Did you mean \`${closest}\`?` : ""}`,
            startLineNumber: errPos.lineNumber,
            startColumn: errPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          });
        }
      }

      // 3. Warn about potentially slow operations
      if (text.includes('"$regex"') || text.includes('"$where"')) {
        const warnOp = text.includes('"$regex"') ? "$regex" : "$where";
        const idx = text.indexOf(`"${warnOp}"`);
        const warnPos = model.getPositionAt(idx);
        const endPos = model.getPositionAt(idx + warnOp.length + 2);
        markers.push({
          severity: monaco.MarkerSeverity.Info,
          message: `⚠ ${warnOp} can be slow without an appropriate index. Consider using a text index for full-text search.`,
          startLineNumber: warnPos.lineNumber,
          startColumn: warnPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        });
      }

      monaco.editor.setModelMarkers(model, diagnosticOwner, markers);
    };

    // We need to set up a listener for model content changes
    // but we'll use the editorRef after mount
    if (diagnosticProviderRef.current) clearInterval(diagnosticProviderRef.current);

    // Periodic validation (simple approach — we also trigger on mount)
    diagnosticProviderRef.current = setInterval(() => {
      if (editorRef.current) {
        const model = editorRef.current.getModel();
        if (model) validate(model);
      }
    }, 800);

    return () => {
      if (diagnosticProviderRef.current) clearInterval(diagnosticProviderRef.current);
    };
  }, [monaco]);

  return (
    <div className={`relative border border-input rounded-md overflow-hidden ${className || ""}`}>
      {placeholder && !value && (
        <div className="absolute top-2 left-3 text-muted-foreground pointer-events-none z-10 text-xs font-mono opacity-50">
          {placeholder}
        </div>
      )}
      <Editor
        height={height}
        defaultLanguage="json"
        theme="vs-dark"
        value={value}
        onChange={onChange}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          lineNumbers: "off",
          glyphMargin: false,
          folding: true,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          padding: { top: 8, bottom: 8 },
          suggestOnTriggerCharacters: true,
          tabSize: 2,
          wordWrap: "on",
          snippetSuggestions: "top",
          suggest: {
            showIcons: true,
            showStatusBar: true,
            preview: true,
            filterGraceful: true,
          },
          quickSuggestions: {
            strings: true,
            other: true,
            comments: false,
          },
          scrollbar: {
            vertical: "hidden",
            horizontal: "hidden",
          },
          overviewRulerLanes: 0,
          renderLineHighlight: "none",
          matchBrackets: "always",
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
}

// ─── Levenshtein Distance ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}
