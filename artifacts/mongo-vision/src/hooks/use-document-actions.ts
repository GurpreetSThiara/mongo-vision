/**
 * useDocumentActions
 *
 * Encapsulates all document CRUD mutations for the Explorer page.
 * Depends on API mutation hooks from @workspace/api-client-react.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useInsertDocument,
  useUpdateDocument,
  useDeleteDocument,
  useBulkOperation,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { TOAST } from "@/constants/messages";
import type { ExplorerState } from "@/hooks/use-explorer-state";

interface UseDocumentActionsParams {
  connectionId: string;
  database: string;
  collection: string;
  state: Pick<
    ExplorerState,
    | "insertJson"
    | "setShowInsertModal"
    | "setInsertJson"
    | "editDocId"
    | "editJson"
    | "setShowEditModal"
    | "bulkUpdateJson"
    | "setBulkUpdateJson"
    | "setShowBulkUpdateModal"
    | "selectedDocs"
    | "setSelectedDocs"
    | "docToDelete"
    | "setDocToDelete"
    | "setShowSingleDeleteConfirm"
    | "docToDuplicate"
    | "setDocToDuplicate"
    | "setShowDuplicateConfirm"
    | "setInlineEditCell"
    | "filterStr"
    | "docQueryLive"
    | "setAppliedFilterStr"
    | "setPage"
  >;
}

export function useDocumentActions({
  connectionId,
  database,
  collection,
  state,
}: UseDocumentActionsParams) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const insertDoc = useInsertDocument();
  const updateDoc = useUpdateDocument();
  const deleteDoc = useDeleteDocument();
  const bulkOp = useBulkOperation();

  const invalidateDocs = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getListDocumentsQueryKey(connectionId, database, collection),
    });
  }, [queryClient, connectionId, database, collection]);

  const handleInsert = async () => {
    try {
      const doc = JSON.parse(state.insertJson);
      await insertDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { document: doc },
      });
      invalidateDocs();
      state.setShowInsertModal(false);
      state.setInsertJson("{\n  \n}");
      toast({ title: TOAST.DOCUMENT_INSERTED });
    } catch (err: any) {
      toast({ title: TOAST.DOCUMENT_INSERT_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleEditSave = async () => {
    try {
      const update = JSON.parse(state.editJson);
      await updateDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        documentId: state.editDocId,
        data: { update, replace: true },
      });
      invalidateDocs();
      state.setShowEditModal(false);
      toast({ title: TOAST.DOCUMENT_UPDATED });
    } catch (err: any) {
      toast({ title: TOAST.DOCUMENT_UPDATE_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        documentId: docId,
      });
      invalidateDocs();
      toast({ title: TOAST.DOCUMENT_DELETED });
    } catch (err: any) {
      toast({ title: TOAST.DOCUMENT_DELETE_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(state.selectedDocs);
    if (ids.length === 0) return;
    try {
      const filter = { _id: { $in: ids.map((id) => ({ $oid: id })) } };
      await bulkOp.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { operation: "deleteMany", filter },
      });
      invalidateDocs();
      state.setSelectedDocs(new Set());
      toast({ title: TOAST.BULK_DELETED(ids.length) });
    } catch (err: any) {
      toast({ title: TOAST.BULK_DELETE_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleBulkUpdate = async () => {
    const ids = Array.from(state.selectedDocs);
    if (ids.length === 0) return;
    try {
      const updateObj = JSON.parse(state.bulkUpdateJson);
      const filter = { _id: { $in: ids.map((id) => ({ $oid: id })) } };
      await bulkOp.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { operation: "updateMany", filter, update: updateObj },
      });
      invalidateDocs();
      state.setSelectedDocs(new Set());
      state.setShowBulkUpdateModal(false);
      state.setBulkUpdateJson(`{\n  "$set": {\n    \n  }\n}`);
      toast({ title: TOAST.BULK_UPDATED(ids.length) });
    } catch (err: any) {
      toast({ title: TOAST.BULK_UPDATE_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleDuplicateDoc = (doc: Record<string, unknown>) => {
    state.setDocToDuplicate(doc);
    state.setShowDuplicateConfirm(true);
  };

  const executeDuplicateDoc = async () => {
    if (!state.docToDuplicate) return;
    try {
      const { _id, ...rest } = state.docToDuplicate;
      await insertDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { document: rest },
      });
      invalidateDocs();
      toast({ title: TOAST.DOCUMENT_DUPLICATED });
    } catch (err: any) {
      toast({ title: TOAST.DOCUMENT_DUPLICATE_FAILED, description: err.message, variant: "destructive" });
    } finally {
      state.setDocToDuplicate(null);
      state.setShowDuplicateConfirm(false);
    }
  };

  const handleCopyDoc = (doc: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    toast({ title: TOAST.DOCUMENT_COPIED });
  };

  const handleFullDocumentJsonModalSave = async (
    modal: { docId: string; draft: string; initialJson: string },
    setModal: (v: null) => void
  ) => {
    const norm = (txt: string) => {
      const t = txt.trim();
      if (!t) return "";
      try { return JSON.stringify(JSON.parse(t)); } catch { return t; }
    };
    if (norm(modal.initialJson) === norm(modal.draft)) {
      setModal(null);
      return;
    }
    try {
      const update = JSON.parse(modal.draft);
      if (typeof update !== "object" || update === null || Array.isArray(update)) {
        toast({ title: TOAST.DOCUMENT_INVALID, description: "Root must be a JSON object.", variant: "destructive" });
        return;
      }
      await updateDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        documentId: modal.docId,
        data: { update: update as Record<string, unknown>, replace: true },
      });
      invalidateDocs();
      setModal(null);
      toast({ title: TOAST.DOCUMENT_UPDATED });
    } catch (err: unknown) {
      toast({
        title: TOAST.DOCUMENT_UPDATE_FAILED,
        description: err instanceof Error ? err.message : "Invalid JSON",
        variant: "destructive",
      });
    }
  };

  const handleInlineEdit = async (
    docId: string,
    field: string,
    newValue: string,
    previousValue?: string
  ): Promise<boolean> => {
    if (previousValue !== undefined) {
      const norm = (s: string) => {
        const t = s.trim();
        if (!t) return "";
        try { return JSON.stringify(JSON.parse(t)); } catch { return t; }
      };
      if (norm(previousValue) === norm(newValue)) {
        state.setInlineEditCell(null);
        return true;
      }
    }
    try {
      let parsed: unknown = newValue;
      try { parsed = JSON.parse(newValue); } catch { parsed = newValue; }
      await updateDoc.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        documentId: docId,
        data: { update: { $set: { [field]: parsed } } },
      });
      invalidateDocs();
      state.setInlineEditCell(null);
      toast({ title: TOAST.FIELD_UPDATED });
      return true;
    } catch (err: any) {
      toast({ title: TOAST.FIELD_UPDATE_FAILED, description: err.message, variant: "destructive" });
      return false;
    }
  };

  const handleQuickFilter = useCallback(
    (field: string, value: unknown) => {
      let filter: any = {};
      try { filter = JSON.parse(state.filterStr || "{}"); } catch { filter = {}; }
      const nextFilter = { ...filter, [field]: value };
      const nextFilterStr = JSON.stringify(nextFilter, null, 2);
      // setFilterStr is not in the Pick — caller must handle via state directly
      if (state.docQueryLive) {
        state.setPage(1);
      } else {
        state.setAppliedFilterStr(nextFilterStr);
        state.setPage(1);
        queryClient.invalidateQueries({
          queryKey: getListDocumentsQueryKey(connectionId, database, collection),
        });
      }
      toast({ title: TOAST.QUERY_FILTER_APPLIED });
    },
    [state, connectionId, database, collection, queryClient, toast]
  );

  return {
    insertDoc,
    updateDoc,
    deleteDoc,
    bulkOp,
    handleInsert,
    handleEditSave,
    handleDeleteDoc,
    handleBulkDelete,
    handleBulkUpdate,
    handleDuplicateDoc,
    executeDuplicateDoc,
    handleCopyDoc,
    handleFullDocumentJsonModalSave,
    handleInlineEdit,
    handleQuickFilter,
  };
}
