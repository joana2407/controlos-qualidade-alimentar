export const CONTROL_FACTORY_SCOPE_STORAGE_KEY = "quality-control-factory-scope";

export function readControlFactoryScope() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(CONTROL_FACTORY_SCOPE_STORAGE_KEY) ?? "";
}

export function writeControlFactoryScope(factoryId: string) {
  if (typeof window === "undefined") return;
  if (factoryId) window.localStorage.setItem(CONTROL_FACTORY_SCOPE_STORAGE_KEY, factoryId);
  else window.localStorage.removeItem(CONTROL_FACTORY_SCOPE_STORAGE_KEY);
}
