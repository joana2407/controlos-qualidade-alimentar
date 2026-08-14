import { loadDispatchControlCatalog, type DispatchProfileId } from "./dispatch-control-source";

export { type DispatchProfileId } from "./dispatch-control-source";
export const DISPATCH_CONTROL_CATALOG = loadDispatchControlCatalog();

export function getDispatchProfile(profileId: DispatchProfileId) {
  const profile = DISPATCH_CONTROL_CATALOG.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error(`Perfil de expedição desconhecido: ${profileId}`);
  return profile;
}
