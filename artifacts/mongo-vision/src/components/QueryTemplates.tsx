import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileJson, Search, Layers, BarChart3, Clock, MapPin } from "lucide-react";

interface QueryTemplate {
  name: string;
  description: string;
  category: "find" | "aggregation" | "update";
  template: string;
  /** Whether this inserts into the aggregation pipeline editor */
  isAggregate?: boolean;
}

const TEMPLATES: QueryTemplate[] = [
  // ── Find Templates ──
  {
    name: "Find by Field",
    description: "Simple equality match",
    category: "find",
    template: '{ "fieldName": "value" }',
  },
  {
    name: "Range Query",
    description: "Find values between min and max",
    category: "find",
    template: '{ "fieldName": { "$gte": 0, "$lte": 100 } }',
  },
  {
    name: "Regex Search",
    description: "Pattern matching (case-insensitive)",
    category: "find",
    template: '{ "fieldName": { "$regex": "pattern", "$options": "i" } }',
  },
  {
    name: "Array Contains",
    description: "Find docs where array contains a value",
    category: "find",
    template: '{ "arrayField": { "$in": ["value1", "value2"] } }',
  },
  {
    name: "Exists Check",
    description: "Find docs where a field exists (or not)",
    category: "find",
    template: '{ "fieldName": { "$exists": true } }',
  },
  {
    name: "Multiple Conditions (AND)",
    description: "Match on multiple fields",
    category: "find",
    template: '{ "$and": [{ "field1": "value1" }, { "field2": { "$gt": 10 } }] }',
  },
  {
    name: "OR Condition",
    description: "Match any of multiple conditions",
    category: "find",
    template: '{ "$or": [{ "field1": "value1" }, { "field2": "value2" }] }',
  },
  {
    name: "Nested Field",
    description: "Query on nested/embedded documents",
    category: "find",
    template: '{ "parent.child.field": "value" }',
  },
  {
    name: "Array Element Match",
    description: "Match array elements with multiple conditions",
    category: "find",
    template: '{ "arrayField": { "$elemMatch": { "subField1": "value", "subField2": { "$gt": 5 } } } }',
  },
  {
    name: "Text Search",
    description: "Full-text search (requires text index)",
    category: "find",
    template: '{ "$text": { "$search": "search terms" } }',
  },
  {
    name: "Not Equal",
    description: "Find docs where field is not a value",
    category: "find",
    template: '{ "fieldName": { "$ne": "excludedValue" } }',
  },
  {
    name: "Date Range",
    description: "Find docs within a date range",
    category: "find",
    template: '{ "dateField": { "$gte": { "$date": "2024-01-01T00:00:00Z" }, "$lte": { "$date": "2024-12-31T23:59:59Z" } } }',
  },

  // ── Aggregation Templates ──
  {
    name: "Group & Count",
    description: "Count documents grouped by a field",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$group": { "_id": "$fieldName", "count": { "$sum": 1 } } },
  { "$sort": { "count": -1 } }
]`,
  },
  {
    name: "Group & Average",
    description: "Average a numeric field by group",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$group": { "_id": "$groupField", "average": { "$avg": "$numericField" } } },
  { "$sort": { "average": -1 } }
]`,
  },
  {
    name: "Lookup (Join)",
    description: "Join with another collection",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$lookup": {
      "from": "otherCollection",
      "localField": "localField",
      "foreignField": "foreignField",
      "as": "joinedData"
  }},
  { "$unwind": { "path": "$joinedData", "preserveNullAndEmptyArrays": true } }
]`,
  },
  {
    name: "Unwind & Count",
    description: "Flatten an array and count occurrences",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$unwind": "$arrayField" },
  { "$group": { "_id": "$arrayField", "count": { "$sum": 1 } } },
  { "$sort": { "count": -1 } },
  { "$limit": 20 }
]`,
  },
  {
    name: "Date Bucketing",
    description: "Group by time intervals",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$group": {
      "_id": {
        "year": { "$year": "$dateField" },
        "month": { "$month": "$dateField" }
      },
      "count": { "$sum": 1 },
      "avgValue": { "$avg": "$numericField" }
  }},
  { "$sort": { "_id.year": 1, "_id.month": 1 } }
]`,
  },
  {
    name: "Faceted Search",
    description: "Multiple groupings in a single pass",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$facet": {
      "byCategory": [
        { "$group": { "_id": "$category", "count": { "$sum": 1 } } }
      ],
      "byYear": [
        { "$group": { "_id": { "$year": "$dateField" }, "count": { "$sum": 1 } } }
      ],
      "totalCount": [
        { "$count": "total" }
      ]
  }}
]`,
  },
  {
    name: "Top N per Group",
    description: "Get top N items in each group",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$sort": { "scoreField": -1 } },
  { "$group": {
      "_id": "$groupField",
      "topItems": { "$push": { "name": "$nameField", "score": "$scoreField" } }
  }},
  { "$project": {
      "topItems": { "$slice": ["$topItems", 5] }
  }}
]`,
  },
  {
    name: "Computed Fields",
    description: "Add calculated fields to documents",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$addFields": {
      "fullName": { "$concat": ["$firstName", " ", "$lastName"] },
      "ageInMonths": { "$multiply": ["$age", 12] },
      "isAdult": { "$gte": ["$age", 18] }
  }}
]`,
  },
  {
    name: "Statistical Summary",
    description: "Min, max, avg, sum, count for a field",
    category: "aggregation",
    isAggregate: true,
    template: `[
  { "$group": {
      "_id": null,
      "count": { "$sum": 1 },
      "sum": { "$sum": "$numericField" },
      "avg": { "$avg": "$numericField" },
      "min": { "$min": "$numericField" },
      "max": { "$max": "$numericField" },
      "stdDev": { "$stdDevPop": "$numericField" }
  }}
]`,
  },
];

const CATEGORY_ICONS = {
  find: Search,
  aggregation: Layers,
  update: FileJson,
};

const CATEGORY_LABELS = {
  find: "Find Queries",
  aggregation: "Aggregation Pipelines",
  update: "Updates",
};

interface QueryTemplatesProps {
  onSelectFilter: (template: string) => void;
  onSelectAggregate: (template: string) => void;
}

export function QueryTemplates({ onSelectFilter, onSelectAggregate }: QueryTemplatesProps) {
  const categories = ["find", "aggregation"] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <FileJson className="w-3.5 h-3.5" />
          Templates
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto">
        {categories.map((cat, catIdx) => {
          const Icon = CATEGORY_ICONS[cat];
          const templates = TEMPLATES.filter(t => t.category === cat);
          return (
            <div key={cat}>
              {catIdx > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {CATEGORY_LABELS[cat]}
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                {templates.map(t => (
                  <DropdownMenuItem
                    key={t.name}
                    onClick={() => t.isAggregate ? onSelectAggregate(t.template) : onSelectFilter(t.template)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground">{t.description}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
