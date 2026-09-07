import React, { createContext, useContext } from "react";
import type { QualityPanelKey } from "@shared/quality-panel-access";

export type QualityOperatorProfile = {
  id: number;
  name: string;
  title: string;
  role: "technician" | "manager" | "viewer";
  panelAccess?: QualityPanelKey[];
};

type QualityAccessValue = {
  activeProfile: QualityOperatorProfile | null;
  canManage: boolean;
  canOperate: boolean;
};

const QualityAccessContext = createContext<QualityAccessValue>({ activeProfile: null, canManage: false, canOperate: false });

export function QualityAccessProvider({ value, children }: { value: QualityAccessValue; children: React.ReactNode }) {
  return <QualityAccessContext.Provider value={value}>{children}</QualityAccessContext.Provider>;
}

export function useQualityAccess() {
  return useContext(QualityAccessContext);
}
