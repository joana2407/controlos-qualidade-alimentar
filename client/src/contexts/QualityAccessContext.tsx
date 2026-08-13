import React, { createContext, useContext } from "react";

export type QualityOperatorProfile = {
  id: number;
  name: string;
  title: string;
  role: "technician" | "manager";
};

type QualityAccessValue = {
  activeProfile: QualityOperatorProfile | null;
  canManage: boolean;
};

const QualityAccessContext = createContext<QualityAccessValue>({ activeProfile: null, canManage: false });

export function QualityAccessProvider({ value, children }: { value: QualityAccessValue; children: React.ReactNode }) {
  return <QualityAccessContext.Provider value={value}>{children}</QualityAccessContext.Provider>;
}

export function useQualityAccess() {
  return useContext(QualityAccessContext);
}
