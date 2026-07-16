/**
 * useImportExport
 *
 * Handles file import and collection export for the Explorer page.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  useExportCollection,
  useImportCollection,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { TOAST, TOAST_DESC } from "@/constants/messages";
import { IMPORT_MAX_FILE_BYTES, IMPORT_PREVIEW_MAX_BYTES } from "@/constants";

interface UseImportExportParams {
  connectionId: string;
  database: string;
  collection: string;
  // state slices needed
  selectedDocs: Set<string>;
  appliedFilterStr: string;
  filterStr: string;
  docQueryLive: boolean;
  importData: string;
  importFormat: "json" | "csv";
  importFileTooLarge: boolean;
  exportFormat: "json" | "csv";
  exportRange: "query" | "selected";
  exportLimit: number;
  sortedVisibleDocs: Record<string, unknown>[];
  page: number;
  setImportData: (v: string) => void;
  setImportFormat: (v: "json" | "csv") => void;
  setImportFileName: (v: string) => void;
  setImportFileSize: (v: number) => void;
  setImportFileTooLarge: (v: boolean) => void;
  setImportCliCommand: (v: string) => void;
  setShowImportModal: (v: boolean) => void;
  setShowExportModal: (v: boolean) => void;
}

export function useImportExport({
  connectionId,
  database,
  collection,
  selectedDocs,
  appliedFilterStr,
  filterStr,
  docQueryLive,
  importData,
  importFormat,
  importFileTooLarge,
  exportFormat,
  exportRange,
  exportLimit,
  sortedVisibleDocs,
  page,
  setImportData,
  setImportFormat,
  setImportFileName,
  setImportFileSize,
  setImportFileTooLarge,
  setImportCliCommand,
  setShowImportModal,
  setShowExportModal,
}: UseImportExportParams) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const exportCol = useExportCollection();
  const importCol = useImportCollection();

  const handleImportFile = (file: File) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "json" || ext === "csv") setImportFormat(ext as "json" | "csv");

    if (file.size > IMPORT_MAX_FILE_BYTES) {
      setImportFileTooLarge(true);
      setImportFileName(file.name);
      setImportFileSize(file.size);
      setImportData("");
      setImportCliCommand(
        `mongoimport --uri="mongodb://localhost:27017" --db="${database}" --collection="${collection}" --file="${file.name}" --type=${ext === "csv" ? "csv" : "json"} --headerline`
      );
      return;
    }

    setImportFileTooLarge(false);
    setImportCliCommand("");
    const reader = new FileReader();
    reader.onload = (e) => {
      setImportData((e.target?.result as string) || "");
      setImportFileName(file.name);
      setImportFileSize(file.size);
    };
    reader.readAsText(file);
  };

  const handleExport = async () => {
    try {
      let filterObj: any = {};
      if (exportRange === "selected") {
        if (selectedDocs.size === 0) {
          toast({ title: TOAST.NO_SELECTED, description: TOAST_DESC.NO_SELECTED, variant: "destructive" });
          return;
        }
        filterObj = { _id: { $in: Array.from(selectedDocs).map((id) => ({ $oid: id })) } };
      } else {
        const effFilterStr = docQueryLive ? filterStr : appliedFilterStr;
        if (effFilterStr && effFilterStr.trim() !== "{}") {
          try {
            filterObj = JSON.parse(effFilterStr);
          } catch {
            toast({ title: "Invalid filter JSON", description: "Please correct the query filter formatting first.", variant: "destructive" });
            return;
          }
        }
      }

      const res = await exportCol.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { format: exportFormat, filter: filterObj, limit: exportLimit || 1000 },
      });

      const blob = new Blob([res.data || ""], {
        type: exportFormat === "csv" ? "text/csv;charset=utf-8;" : "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", res.filename || `${collection}_export.${exportFormat}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: TOAST.EXPORT_SUCCESS, description: TOAST_DESC.EXPORT_SUCCESS(res.documentCount) });
      setShowExportModal(false);
    } catch (err: any) {
      toast({ title: TOAST.EXPORT_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleImportSubmit = async () => {
    try {
      const result = await importCol.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { format: importFormat, data: importData },
      });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(connectionId, database, collection) });
      setShowImportModal(false);
      toast({ title: TOAST.IMPORT_SUCCESS(result.insertedCount) });
    } catch (err: any) {
      toast({ title: TOAST.IMPORT_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const exportVisibleDocumentsJson = () => {
    if (sortedVisibleDocs.length === 0) {
      toast({ title: TOAST.EXPORT_NOTHING, variant: "destructive" });
      return;
    }
    const blob = new Blob([JSON.stringify(sortedVisibleDocs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${database}-${collection}-page${page}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: TOAST.EXPORTED_JSON, description: TOAST_DESC.EXPORT_PAGE_JSON(sortedVisibleDocs.length) });
  };

  const copyVisibleDocumentIds = () => {
    if (sortedVisibleDocs.length === 0) {
      toast({ title: TOAST.NO_DOCUMENTS, variant: "destructive" });
      return;
    }
    const t = sortedVisibleDocs.map((d) => String(d._id)).join("\n");
    navigator.clipboard.writeText(t);
    toast({ title: TOAST.IDS_COPIED, description: TOAST_DESC.IDS_COPIED(sortedVisibleDocs.length) });
  };

  return {
    exportCol,
    importCol,
    handleImportFile,
    handleExport,
    handleImportSubmit,
    exportVisibleDocumentsJson,
    copyVisibleDocumentIds,
  };
}
