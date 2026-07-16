/**
 * CollectionTabBar
 *
 * The horizontal tab list for a selected collection.
 * On mobile: horizontally scrollable, icons hidden below xs.
 * On desktop: standard fixed tab bar.
 *
 * App-UI component.
 */
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Table, Layers, Search, Zap, LayoutGrid,
} from "lucide-react";
import { LABEL } from "@/constants/messages";
import { useIsMobile } from "@/hooks/use-mobile";

export const COLLECTION_TABS = [
  { value: "dashboard", icon: BarChart3, label: LABEL.TAB_DASHBOARD },
  { value: "documents", icon: Table, label: LABEL.TAB_DOCUMENTS },
  { value: "schema", icon: Layers, label: LABEL.TAB_SCHEMA },
  { value: "query", icon: Layers, label: LABEL.TAB_AGGREGATIONS },
  { value: "indexes", icon: Search, label: LABEL.TAB_INDEXES },
  { value: "performance", icon: Zap, label: LABEL.TAB_PERFORMANCE },
  { value: "charts", icon: BarChart3, label: LABEL.TAB_CHARTS },
] as const;

export type CollectionTab = typeof COLLECTION_TABS[number]["value"];

interface CollectionTabBarProps {
  /** Whether to hide the spreadsheet-specific tab on mobile. Defaults to true. */
  hideSpreadsheetOnMobile?: boolean;
}

export function CollectionTabBar({ hideSpreadsheetOnMobile = true }: CollectionTabBarProps) {
  const isMobile = useIsMobile();

  return (
    <TabsList
      className={`${
        isMobile
          ? "flex overflow-x-auto scrollbar-invisible h-10 w-full justify-start rounded-none border-b border-border bg-card px-2 gap-0.5 shrink-0"
          : "h-10 w-full justify-start rounded-none border-b border-border bg-card px-4 gap-1 shrink-0"
      }`}
    >
      {COLLECTION_TABS.map(({ value, icon: Icon, label }) => (
        <TabsTrigger
          key={value}
          value={value}
          className={`gap-1 text-xs h-8 shrink-0 ${isMobile ? "px-2.5" : "gap-1.5"}`}
          data-testid={`tab-${value}`}
        >
          {!isMobile && <Icon className="w-3.5 h-3.5" />}
          <span className={isMobile ? "text-[10px]" : ""}>{label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
