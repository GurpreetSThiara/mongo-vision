/**
 * useIndexManager
 *
 * Handles index creation and deletion for the Explorer page.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateIndex,
  useDropIndex,
  getListIndexesQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { TOAST } from "@/constants/messages";
import type { ExplorerState } from "@/hooks/use-explorer-state";

interface UseIndexManagerParams {
  connectionId: string;
  database: string;
  collection: string;
  state: Pick<
    ExplorerState,
    | "indexBuildMode"
    | "indexKeysBuilder"
    | "setIndexKeysBuilder"
    | "newIndexKeys"
    | "newIndexName"
    | "setNewIndexName"
    | "newIndexUnique"
    | "setNewIndexUnique"
    | "newIndexSparse"
    | "setNewIndexSparse"
    | "newIndexTTL"
    | "setNewIndexTTL"
    | "newIndexTTLExpires"
    | "setNewIndexTTLExpires"
    | "newIndexAdvancedJSON"
    | "setNewIndexAdvancedJSON"
    | "showAdvancedIndex"
    | "setShowAdvancedIndex"
    | "setShowIndexModal"
    | "setNewIndexKeys"
  >;
}

export function useIndexManager({ connectionId, database, collection, state }: UseIndexManagerParams) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createIndex = useCreateIndex();
  const dropIndex = useDropIndex();

  const invalidateIndexes = () => {
    queryClient.invalidateQueries({
      queryKey: getListIndexesQueryKey(connectionId, database, collection),
    });
  };

  const handleCreateIndex = async () => {
    try {
      let keys: Record<string, any> = {};
      if (state.indexBuildMode === "visual") {
        state.indexKeysBuilder.forEach((item) => {
          if (item.field) {
            keys[item.field] =
              item.type === "1" || item.type === "-1" ? Number(item.type) : item.type;
          }
        });
        if (Object.keys(keys).length === 0) {
          throw new Error("You must select at least one field for the index.");
        }
      } else {
        keys = JSON.parse(state.newIndexKeys);
      }

      const options: Record<string, any> = {};
      if (state.newIndexName.trim()) options.name = state.newIndexName.trim();
      if (state.newIndexUnique) options.unique = true;
      if (state.newIndexSparse) options.sparse = true;
      if (state.newIndexTTL && state.newIndexTTLExpires) {
        options.expireAfterSeconds = Number(state.newIndexTTLExpires);
      }
      if (state.showAdvancedIndex && state.newIndexAdvancedJSON.trim()) {
        try {
          Object.assign(options, JSON.parse(state.newIndexAdvancedJSON));
        } catch {
          throw new Error("Invalid Advanced JSON options.");
        }
      }

      await createIndex.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        data: { keys, options },
      });
      invalidateIndexes();

      // Reset modal
      state.setIndexKeysBuilder([{ field: "", type: "1" }]);
      state.setNewIndexKeys("");
      state.setNewIndexName("");
      state.setNewIndexUnique(false);
      state.setNewIndexSparse(false);
      state.setNewIndexTTL(false);
      state.setNewIndexTTLExpires("3600");
      state.setNewIndexAdvancedJSON("");
      state.setShowAdvancedIndex(false);
      state.setShowIndexModal(false);

      toast({ title: TOAST.INDEX_CREATED });
    } catch (err: any) {
      toast({ title: TOAST.INDEX_CREATE_FAILED, description: err.message, variant: "destructive" });
    }
  };

  const handleDropIndex = async (indexName: string) => {
    try {
      await dropIndex.mutateAsync({
        connectionId,
        dbName: database,
        collectionName: collection,
        indexName,
      });
      invalidateIndexes();
      toast({ title: TOAST.INDEX_DROPPED });
    } catch (err: any) {
      toast({ title: TOAST.INDEX_DROP_FAILED, description: err.message, variant: "destructive" });
    }
  };

  return { createIndex, dropIndex, handleCreateIndex, handleDropIndex };
}
