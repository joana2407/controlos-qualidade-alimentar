import { trpc } from "@/lib/trpc";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type FactoryScope = {
  factoryId: string;
  setFactoryId: (factoryId: string) => void;
  factories: Array<{ id: number; name: string }>;
  selectedFactoryName: string | null;
};

const STORAGE_KEY = "quality-control-factory-id";
const ControlScopeContext = createContext<FactoryScope | null>(null);

export function ControlScopeProvider({ children }: { children: React.ReactNode }) {
  const metadata = trpc.quality.metadata.useQuery();
  const [factoryId, setFactoryId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const factories = metadata.data?.factories ?? [];

  useEffect(() => {
    if (factoryId) localStorage.setItem(STORAGE_KEY, factoryId);
    else localStorage.removeItem(STORAGE_KEY);
  }, [factoryId]);

  useEffect(() => {
    if (factoryId && factories.length && !factories.some((factory) => String(factory.id) === factoryId)) {
      setFactoryId("");
    }
  }, [factoryId, factories]);

  const value = useMemo(() => ({
    factoryId,
    setFactoryId,
    factories,
    selectedFactoryName: factories.find((factory) => String(factory.id) === factoryId)?.name ?? null,
  }), [factoryId, factories]);

  return <ControlScopeContext.Provider value={value}>{children}</ControlScopeContext.Provider>;
}

export function useControlScope() {
  const context = useContext(ControlScopeContext);
  if (!context) throw new Error("useControlScope deve ser utilizado dentro de ControlScopeProvider");
  return context;
}
