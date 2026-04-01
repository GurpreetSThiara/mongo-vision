import React, { createContext, useContext, useState } from "react";

interface ExplorerState {
  connectionId: string | null;
  database: string | null;
  collection: string | null;
  setConnectionId: (id: string | null) => void;
  setDatabase: (db: string | null) => void;
  setCollection: (coll: string | null) => void;
  setAll: (id: string | null, db: string | null, coll: string | null) => void;
}

const ExplorerContext = createContext<ExplorerState | undefined>(undefined);

export function ExplorerProvider({ children }: { children: React.ReactNode }) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [database, setDatabase] = useState<string | null>(null);
  const [collection, setCollection] = useState<string | null>(null);

  const setAll = (id: string | null, db: string | null, coll: string | null) => {
    setConnectionId(id);
    setDatabase(db);
    setCollection(coll);
  };

  return (
    <ExplorerContext.Provider
      value={{
        connectionId,
        database,
        collection,
        setConnectionId: (id) => { setConnectionId(id); setDatabase(null); setCollection(null); },
        setDatabase: (db) => { setDatabase(db); setCollection(null); },
        setCollection,
        setAll,
      }}
    >
      {children}
    </ExplorerContext.Provider>
  );
}

export function useExplorerState() {
  const context = useContext(ExplorerContext);
  if (context === undefined) {
    throw new Error("useExplorerState must be used within an ExplorerProvider");
  }
  return context;
}
