/**
 * useQueryActions
 *
 * Encapsulates find, aggregate, explain, save-query, and chart logic.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useExecuteQuery,
  useExecuteAggregate,
  useExplainQuery,
  useSuggestIndexes,
  useSaveQuery,
  useDeleteSavedQuery,
  getListSavedQueriesQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { TOAST } from "@/constants/messages";
import { addToHistory } from "@/components/QueryHistory";

interface ParseFilterFn {
  (str: string): Record<string, unknown>;
}

interface UseQueryActionsParams {
  connectionId: string;
  database: string;
  collection: string;
  parseFilter: ParseFilterFn;
  queryFilter: string;
  querySort: string;
  queryLimit: string;
  aggregatePipeline: string;
  saveQueryName: string;
  setQueryResults: (r: Record<string, unknown>[] | null) => void;
  setQueryTime: (t: number | null) => void;
  setExplainResult: (r: Record<string, unknown> | null) => void;
  setShowSaveQueryModal: (v: boolean) => void;
  setSaveQueryName: (v: string) => void;
  setChartData: (d: Record<string, unknown>[] | null) => void;
  setShowHistory: (v: boolean) => void;
}

export function useQueryActions({
  connectionId,
  database,
  collection,
  parseFilter,
  queryFilter,
  querySort,
  queryLimit,
  aggregatePipeline,
  saveQueryName,
  setQueryResults,
  setQueryTime,
  setExplainResult,
  setShowSaveQueryModal,
  setSaveQueryName,
  setChartData,
  setShowHistory,
}: UseQueryActionsParams) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const executeQuery = useExecuteQuery();
  const executeAggregate = useExecuteAggregate();
  const explainQuery = useExplainQuery();
  const suggestIndexes = useSuggestIndexes();
  const saveQuery = useSaveQuery();
  const deleteSavedQuery = useDeleteSavedQuery();

  const handleRunQuery = async () => {
    try {
      const startTime = performance.now();
      const result = await executeQuery.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: {
          filter: parseFilter(queryFilter),
          sort: parseFilter(querySort),
          limit: Number(queryLimit) || 20,
        },
      });
      const execTime = result.executionTimeMs ?? Math.round(performance.now() - startTime);
      setQueryResults(result.documents as Record<string, unknown>[]);
      setQueryTime(execTime);
      addToHistory({
        query: queryFilter,
        type: "find",
        collection,
        database,
        executionTimeMs: execTime,
        resultCount: (result.documents as unknown[])?.length || 0,
      });
    } catch (err: any) {
      toast({ title: TOAST.QUERY_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleRunAggregate = async () => {
    try {
      const startTime = performance.now();
      const pipeline = JSON.parse(aggregatePipeline);
      const result = await executeAggregate.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { pipeline },
      });
      const execTime = result.executionTimeMs ?? Math.round(performance.now() - startTime);
      setQueryResults(result.documents as Record<string, unknown>[]);
      setQueryTime(execTime);
      addToHistory({
        query: aggregatePipeline,
        type: "aggregate",
        collection,
        database,
        executionTimeMs: execTime,
        resultCount: (result.documents as unknown[])?.length || 0,
      });
    } catch (err: any) {
      toast({ title: TOAST.AGGREGATE_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handlePreviewStage = useCallback(
    async (pipelineStr: string) => {
      const pipeline = JSON.parse(pipelineStr);
      const result = await executeAggregate.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { pipeline },
      });
      return (result.documents as Record<string, unknown>[]) || [];
    },
    [connectionId, database, collection, executeAggregate]
  );

  const handleExplain = async () => {
    try {
      const result = await explainQuery.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { filter: parseFilter(queryFilter) },
      });
      setExplainResult(result as unknown as Record<string, unknown>);
    } catch (err: any) {
      toast({ title: TOAST.EXPLAIN_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleSuggestIndexes = async () => {
    try {
      const result = await suggestIndexes.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { filter: parseFilter(queryFilter) },
      });
      toast({ title: TOAST.INDEX_SUGGESTIONS(result.suggestions?.length || 0) });
    } catch (err: any) {
      toast({ title: TOAST.INDEX_SUGGESTION_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleSaveQuery = async () => {
    try {
      await saveQuery.mutateAsync({
        data: {
          name: saveQueryName,
          connectionId,
          database,
          collection,
          query: {
            filter: parseFilter(queryFilter),
            sort: parseFilter(querySort),
            limit: Number(queryLimit),
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: getListSavedQueriesQueryKey() });
      setShowSaveQueryModal(false);
      setSaveQueryName("");
      toast({ title: TOAST.QUERY_SAVED });
    } catch (err: any) {
      toast({ title: TOAST.QUERY_SAVE_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleRunChart = async () => {
    try {
      const result = await executeQuery.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { filter: {}, limit: 100 },
      });
      setChartData(result.documents as Record<string, unknown>[]);
    } catch (err: any) {
      toast({ title: TOAST.QUERY_FAILED, description: err.message, variant: "destructive" });
    }
  };

  return {
    executeQuery,
    executeAggregate,
    explainQuery,
    suggestIndexes,
    saveQuery,
    deleteSavedQuery,
    handleRunQuery,
    handleRunAggregate,
    handlePreviewStage,
    handleExplain,
    handleSuggestIndexes,
    handleSaveQuery,
    handleRunChart,
  };
}
