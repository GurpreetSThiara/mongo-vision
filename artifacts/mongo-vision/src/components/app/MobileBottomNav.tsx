/**
 * MobileBottomNav
 *
 * iOS/Android-style bottom tab bar for mobile viewport.
 * Shows 4 tabs: Browse, Query, Schema, Actions.
 * Hidden on md+ (desktop).
 *
 * App-UI component.
 */
import { Database, Search, Layers, Zap } from "lucide-react";
import { LABEL } from "@/constants/messages";

export type MobileNavTab = "browse" | "query" | "schema" | "performance";

interface MobileBottomNavProps {
  activeTab: MobileNavTab;
  onTabChange: (tab: MobileNavTab) => void;
}

const NAV_ITEMS: { id: MobileNavTab; icon: React.ElementType; label: string }[] = [
  { id: "browse", icon: Database, label: LABEL.BROWSE },
  { id: "query", icon: Search, label: LABEL.QUERY },
  { id: "schema", icon: Layers, label: LABEL.SCHEMA },
  { id: "performance", icon: Zap, label: LABEL.SETTINGS },
];

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border mobile-bottom-nav">
      <div className="flex h-[var(--mobile-nav-height)] items-center justify-around px-2">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px] ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={`w-5 h-5 transition-transform ${isActive ? "scale-110" : "scale-100"}`} />
              <span className={`text-[9px] font-medium tracking-wide uppercase transition-opacity ${isActive ? "opacity-100" : "opacity-60"}`}>
                {label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
      {/* Safe area for iOS home indicator */}
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </nav>
  );
}
