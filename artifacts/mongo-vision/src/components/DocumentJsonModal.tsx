import { useMemo, useEffect, useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Braces,
  AlignLeft,
  Search,
  Shrink,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const WRAP_LS = "mongo-vision-json-modal-wrap";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface DocumentJsonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
  draft: string;
  onDraftChange: (next: string) => void;
  initialJson: string;
  onSave: () => void | Promise<void>;
  isSaving: boolean;
}

export function DocumentJsonModal({
  open,
  onOpenChange,
  docId,
  draft,
  onDraftChange,
  initialJson,
  onSave,
  isSaving,
}: DocumentJsonModalProps) {
  const { toast } = useToast();
  const [wordWrap, setWordWrap] = useState(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(WRAP_LS) !== "0" : true,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [findQuery, setFindQuery] = useState("");

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(WRAP_LS, wordWrap ? "1" : "0");
    }
  }, [wordWrap]);

  useEffect(() => {
    if (!open) {
      setFindQuery("");
      setFullscreen(false);
    }
  }, [open]);

  const parseError = useMemo(() => {
    try {
      JSON.parse(draft);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [draft]);

  const findCount = useMemo(() => {
    const q = findQuery.trim();
    if (!q) return 0;
    try {
      return (draft.match(new RegExp(escapeRegExp(q), "gi")) || []).length;
    } catch {
      return 0;
    }
  }, [draft, findQuery]);

  const lineCount = useMemo(() => draft.split(/\n/).length, [draft]);

  const copyId = useCallback(() => {
    void navigator.clipboard.writeText(docId);
    toast({ title: "_id copied", description: docId.length > 48 ? `${docId.slice(0, 24)}…` : docId });
  }, [docId, toast]);

  const prettify = useCallback(() => {
    try {
      const o = JSON.parse(draft);
      onDraftChange(JSON.stringify(o, null, 2));
      toast({ title: "Formatted", description: "Pretty-printed JSON" });
    } catch {
      toast({ title: "Cannot format", description: "Fix JSON syntax first", variant: "destructive" });
    }
  }, [draft, onDraftChange, toast]);

  const minify = useCallback(() => {
    try {
      const o = JSON.parse(draft);
      onDraftChange(JSON.stringify(o));
      toast({ title: "Minified", description: "Single-line JSON" });
    } catch {
      toast({ title: "Cannot minify", description: "Fix JSON syntax first", variant: "destructive" });
    }
  }, [draft, onDraftChange, toast]);

  const revert = useCallback(() => {
    onDraftChange(initialJson);
    toast({ title: "Reverted", description: "Restored text from when you opened this dialog" });
  }, [initialJson, onDraftChange, toast]);

  const copyAll = useCallback(() => {
    if (!draft) return;
    void navigator.clipboard.writeText(draft);
    toast({ title: "Copied to clipboard" });
  }, [draft, toast]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!parseError && !isSaving) void onSave();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, parseError, isSaving, onSave]);

  const saveDisabled = !!parseError || isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "!flex !flex-col gap-0 p-0 overflow-hidden border-border/80",
          fullscreen
            ? "left-2 top-2 translate-x-0 translate-y-0 w-[calc(100%-1rem)] h-[calc(100%-1rem)] max-w-none max-h-none sm:rounded-xl"
            : "max-w-[min(88rem,96vw)] w-[95vw] h-[min(92vh,920px)] max-h-[92vh] sm:rounded-xl",
        )}
      >
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b border-border/40 space-y-2 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle>Document JSON</DialogTitle>
              <button
                type="button"
                onClick={copyId}
                className="mt-1 text-left text-xs text-muted-foreground font-mono hover:text-primary hover:underline underline-offset-2 truncate max-w-[min(100%,48rem)] block"
                title="Click to copy _id"
              >
                _id: {docId}
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {parseError ? (
                <Badge variant="destructive" className="text-[10px] font-normal gap-1">
                  <AlertTriangle className="w-3 h-3" /> Invalid JSON
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] font-normal gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Valid
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={prettify}>
                  <Braces className="w-3.5 h-3.5" /> Format
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Pretty-print with indentation (valid JSON only)
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={minify}>
                  <Shrink className="w-3.5 h-3.5" /> Minify
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Collapse to a single line (valid JSON only)
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={wordWrap ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 text-[10px] gap-1"
                  onClick={() => setWordWrap((w) => !w)}
                >
                  <AlignLeft className="w-3.5 h-3.5" /> Wrap
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Toggle line wrapping in the editor (saved for next time)
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] gap-1" onClick={revert}>
                  <RotateCcw className="w-3.5 h-3.5" /> Revert
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Undo edits and restore JSON from when you opened this dialog
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[10px] gap-1"
                  onClick={() => setFullscreen((f) => !f)}
                >
                  {fullscreen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                  {fullscreen ? "Exit" : "Fill screen"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Use almost the whole browser window for editing
              </TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-1.5 ml-auto min-w-[8rem] flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Input
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="Find in text…"
                className="h-8 text-[10px] font-mono"
              />
              {findQuery.trim() ? (
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                  {findCount}
                </span>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-2 px-5 py-3 overflow-hidden">
          {parseError && (
            <p className="text-[11px] text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1.5 shrink-0">
              {parseError}
            </p>
          )}
          <Textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            spellCheck={false}
            data-testid="textarea-full-document-json"
            className={cn(
              "font-mono text-sm leading-relaxed flex-1 min-h-[min(50vh,420px)] resize-none border-border/60 focus-visible:ring-2",
              !wordWrap && "whitespace-pre overflow-x-auto",
            )}
            placeholder="{}"
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground shrink-0">
            <span>
              <span className="text-foreground/80 font-medium">{draft.length.toLocaleString()}</span> chars
            </span>
            <span>
              <span className="text-foreground/80 font-medium">{lineCount.toLocaleString()}</span> lines
            </span>
            {findQuery.trim() ? (
              <span>
                <span className="text-foreground/80 font-medium">{findCount}</span> matches for “{findQuery.slice(0, 24)}
                {findQuery.length > 24 ? "…" : ""}”
              </span>
            ) : null}
            <span className="text-muted-foreground/80">Save: ⌘S / Ctrl+S</span>
          </div>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border/40 shrink-0 flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" className="gap-1" onClick={copyAll}>
                <Copy className="w-3.5 h-3.5" /> Copy all
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy entire editor contents</TooltipContent>
          </Tooltip>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button type="button" onClick={() => void onSave()} disabled={saveDisabled} className="gap-1.5">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {parseError ? "Fix JSON errors before saving" : "Replace document in MongoDB (⌘S / Ctrl+S)"}
            </TooltipContent>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
