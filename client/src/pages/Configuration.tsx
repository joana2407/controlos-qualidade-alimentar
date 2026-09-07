import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { QUALITY_PANEL_KEYS, QUALITY_PANEL_OPTIONS, type QualityPanelKey } from "@shared/quality-panel-access";
import { KeyRound, LockKeyhole, Plus, Settings2, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type ProfileRole = "technician" | "manager" | "viewer";
type TeamProfile = {
  id: number;
  code: string;
  name: string;
  title: string;
  isConfigured: boolean;
  role: ProfileRole;
  active: boolean;
  panelAccess: QualityPanelKey[];
};

const ROLE_OPTIONS: Array<{ value: ProfileRole; label: string; description: string }> = [
  { value: "technician", label: "Técnica/Técnico de Qualidade", description: "Regista e consulta os painéis autorizados." },
  { value: "manager", label: "Responsável de Qualidade", description: "Gere equipa, configurações e todos os painéis." },
  { value: "viewer", label: "Consulta", description: "Consulta os painéis autorizados, sem efetuar alterações." },
];

const roleLabel = (role: ProfileRole) => ROLE_OPTIONS.find(option => option.value === role)?.label ?? role;

export default function Configuration() {
  const { canManage } = useQualityAccess();
  const access = trpc.quality.accessStatus.useQuery();

  if (!canManage) return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-6xl"><header><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-teal-700">Governação operacional</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Configuração</h1></header><Card className="mt-6 border-0 panel-shadow"><CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="rounded-2xl bg-slate-100 p-4"><LockKeyhole className="h-7 w-7 text-slate-600" /></div><p className="mt-4 font-semibold">Área reservada à Responsável de Qualidade</p><p className="mt-2 max-w-md text-sm text-muted-foreground">A gestão de utilizadores, PINs e autorizações requer o perfil operacional de Responsável de Qualidade.</p></CardContent></Card></section></div>;

  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-6xl space-y-6"><header><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-teal-700">Governação operacional</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Configuração</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Gira os perfis operacionais, os PINs de acesso e os painéis disponíveis para cada elemento da equipa.</p></header>
    <TeamAccessSettings profiles={access.data?.profiles ?? []} activeProfileId={access.data?.activeProfile?.id ?? null} />
    <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-teal-700" />Configuração operacional organizada</CardTitle><CardDescription>A criação e manutenção de áreas, pontos, linhas, planos e itens de checklist é efetuada diretamente no módulo a que pertence, evitando alterações acidentais na configuração geral.</CardDescription></CardHeader></Card>
  </section></div>;
}

function PanelSelector({ selected, onToggle, disabled = false, idPrefix }: { selected: QualityPanelKey[]; onToggle: (panel: QualityPanelKey) => void; disabled?: boolean; idPrefix: string }) {
  return <div className="grid gap-2 sm:grid-cols-2" aria-label="Painéis autorizados">{QUALITY_PANEL_OPTIONS.map(panel => {
    const id = `${idPrefix}-${panel.key}`;
    return <label key={panel.key} htmlFor={id} className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-left ${disabled ? "border-slate-100 bg-slate-50 text-slate-500" : "cursor-pointer border-slate-200 bg-white hover:border-teal-300"}`}><Checkbox id={id} checked={selected.includes(panel.key)} onCheckedChange={() => onToggle(panel.key)} disabled={disabled} /><span className="min-w-0"><span className="block text-xs font-semibold text-slate-800">{panel.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{panel.description}</span></span></label>;
  })}</div>;
}

function TeamAccessSettings({ profiles, activeProfileId }: { profiles: TeamProfile[]; activeProfileId: number | null }) {
  const utils = trpc.useUtils();
  const [pins, setPins] = useState<Record<string, string>>({});
  const [newUser, setNewUser] = useState<{ name: string; role: ProfileRole; pin: string; panelAccess: QualityPanelKey[] }>({ name: "", role: "technician", pin: "", panelAccess: [...QUALITY_PANEL_KEYS] });
  const [accessDrafts, setAccessDrafts] = useState<Record<number, { role: ProfileRole; active: boolean }>>({});
  const [panelDrafts, setPanelDrafts] = useState<Record<number, QualityPanelKey[]>>({});
  const refreshProfiles = async () => { await utils.quality.accessStatus.invalidate(); await utils.quality.metadata.invalidate(); };
  const configurePins = trpc.quality.configureTeamPins.useMutation({ onSuccess: async () => { setPins({}); await refreshProfiles(); toast.success("PINs atualizados."); }, onError: (error) => toast.error(error.message) });
  const createProfile = trpc.quality.createPinProfile.useMutation({ onSuccess: async () => { setNewUser({ name: "", role: "technician", pin: "", panelAccess: [...QUALITY_PANEL_KEYS] }); await refreshProfiles(); toast.success("Utilizador criado e PIN configurado."); }, onError: (error) => toast.error(error.message) });
  const updateAccess = trpc.quality.updatePinProfileAccess.useMutation({ onSuccess: async () => { setAccessDrafts({}); await refreshProfiles(); toast.success("Autorizações atualizadas."); }, onError: (error) => toast.error(error.message) });
  const updatePanels = trpc.quality.updatePinProfilePanels.useMutation({ onSuccess: async () => { setPanelDrafts({}); await refreshProfiles(); toast.success("Painéis autorizados atualizados."); }, onError: (error) => toast.error(error.message) });
  const chosen = profiles.filter((profile) => pins[profile.code]);
  const validPins = chosen.length > 0 && chosen.every((profile) => /^\d{4,8}$/.test(pins[profile.code] ?? ""));
  const validNewUser = newUser.name.trim().length >= 2 && /^\d{4,8}$/.test(newUser.pin);
  const draftFor = (profile: TeamProfile) => accessDrafts[profile.id] ?? { role: profile.role, active: profile.active };
  const panelsFor = (profile: TeamProfile) => panelDrafts[profile.id] ?? profile.panelAccess;
  const updateDraft = (profile: TeamProfile, change: Partial<{ role: ProfileRole; active: boolean }>) => setAccessDrafts(current => ({ ...current, [profile.id]: { ...draftFor(profile), ...change } }));
  const togglePanels = (panels: QualityPanelKey[], panel: QualityPanelKey, onChange: (next: QualityPanelKey[]) => void) => onChange(panels.includes(panel) ? panels.filter(item => item !== panel) : [...panels, panel]);

  function submitNewUser(event: FormEvent) {
    event.preventDefault();
    if (!validNewUser) return;
    createProfile.mutate({ name: newUser.name.trim(), role: newUser.role, pin: newUser.pin, allowedPanels: newUser.panelAccess });
  }

  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-teal-700" />Utilizadores e autorizações</CardTitle><CardDescription>Defina o nível de acesso e os painéis internos disponíveis. A Responsável de Qualidade mantém acesso integral.</CardDescription></CardHeader><CardContent className="space-y-3">{profiles.map((profile) => {
        const draft = draftFor(profile);
        const selectedPanels = profile.role === "manager" ? QUALITY_PANEL_KEYS : panelsFor(profile);
        const accessChanged = draft.role !== profile.role || draft.active !== profile.active;
        const panelsChanged = selectedPanels.length !== profile.panelAccess.length || selectedPanels.some(panel => !profile.panelAccess.includes(panel));
        const currentSession = profile.id === activeProfileId;
        const roleIsManager = draft.role === "manager";
        return <div key={profile.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{profile.name}</p>{currentSession && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">Sessão atual</span>}{!profile.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Inativo</span>}</div><p className="mt-1 text-sm text-slate-600">{profile.isConfigured ? "PIN configurado" : "PIN por definir"}</p></div><div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_auto_auto] sm:items-center"><Select value={draft.role} onValueChange={(value) => updateDraft(profile, { role: value as ProfileRole })} disabled={currentSession}><SelectTrigger aria-label={`Autorização de ${profile.name}`}><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><Button type="button" variant={draft.active ? "outline" : "secondary"} size="sm" onClick={() => updateDraft(profile, { active: !draft.active })} disabled={currentSession}>{draft.active ? "Ativo" : "Inativo"}</Button><Button type="button" size="sm" disabled={!accessChanged || currentSession || updateAccess.isPending} onClick={() => updateAccess.mutate({ profileId: profile.id, ...draft })}>Guardar</Button></div></div><p className="mt-3 text-xs leading-5 text-slate-500">{ROLE_OPTIONS.find(option => option.value === draft.role)?.description}</p>{currentSession && <p className="mt-2 text-xs font-medium text-amber-800">Para proteger o acesso, as autorizações da sessão atual não podem ser alteradas aqui.</p>}<div className="mt-4 border-t border-slate-200 pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Painéis autorizados</p><PanelSelector selected={selectedPanels} idPrefix={`profile-${profile.id}`} disabled={currentSession || roleIsManager} onToggle={(panel) => togglePanels(selectedPanels, panel, next => setPanelDrafts(current => ({ ...current, [profile.id]: next })))} />{roleIsManager ? <p className="mt-2 text-xs text-teal-800">A Responsável de Qualidade tem acesso integral a todos os painéis internos.</p> : <div className="mt-3 flex justify-end"><Button type="button" size="sm" variant="outline" disabled={!panelsChanged || currentSession || updatePanels.isPending} onClick={() => updatePanels.mutate({ profileId: profile.id, allowedPanels: selectedPanels })}>Guardar painéis</Button></div>}</div></div>;
      })}</CardContent></Card>
      <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-teal-700" />Novo utilizador</CardTitle><CardDescription>Defina o tipo de autorização, os painéis internos e o PIN inicial no momento da criação.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={submitNewUser}><div className="space-y-2"><Label htmlFor="new-user-name">Nome</Label><Input id="new-user-name" value={newUser.name} onChange={event => setNewUser(current => ({ ...current, name: event.target.value }))} placeholder="Nome completo" autoComplete="off" required /></div><div className="space-y-2"><Label htmlFor="new-user-role">Tipo de autorização</Label><Select value={newUser.role} onValueChange={(value) => setNewUser(current => ({ ...current, role: value as ProfileRole }))}><SelectTrigger id="new-user-role"><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-5 text-slate-500">{ROLE_OPTIONS.find(option => option.value === newUser.role)?.description}</p></div><div className="space-y-2"><Label>Painéis autorizados</Label><PanelSelector selected={newUser.role === "manager" ? QUALITY_PANEL_KEYS : newUser.panelAccess} idPrefix="new-user-panel" disabled={newUser.role === "manager"} onToggle={(panel) => togglePanels(newUser.panelAccess, panel, next => setNewUser(current => ({ ...current, panelAccess: next })))} />{newUser.role === "manager" && <p className="text-xs text-teal-800">A Responsável de Qualidade recebe acesso integral automaticamente.</p>}</div><div className="space-y-2"><Label htmlFor="new-user-pin">PIN inicial</Label><Input id="new-user-pin" type="password" inputMode="numeric" maxLength={8} value={newUser.pin} onChange={event => setNewUser(current => ({ ...current, pin: event.target.value.replace(/\D/g, "") }))} placeholder="4 a 8 algarismos" autoComplete="new-password" required /><p className="text-xs text-slate-500">O PIN não poderá ser consultado depois de guardado.</p></div><Button type="submit" className="w-full" disabled={!validNewUser || createProfile.isPending}>{createProfile.isPending ? "A criar…" : <><Plus className="mr-2 h-4 w-4" />Criar utilizador</>}</Button></form></CardContent></Card>
    </div>
    <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-teal-700" />Alterar PINs</CardTitle><CardDescription>Atualize um ou vários PINs individualmente. Os PINs são guardados de forma protegida e nunca são apresentados.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">{profiles.map((profile) => <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4" key={profile.id}><p className="font-medium">{profile.name}</p><p className="text-sm text-muted-foreground">{roleLabel(profile.role)} · {profile.isConfigured ? "PIN configurado" : "PIN por definir"}</p><Label htmlFor={`change-pin-${profile.id}`} className="sr-only">Novo PIN de {profile.name}</Label><Input id={`change-pin-${profile.id}`} type="password" inputMode="numeric" maxLength={8} placeholder="Novo PIN" value={pins[profile.code] ?? ""} onChange={(event) => setPins((current) => ({ ...current, [profile.code]: event.target.value.replace(/\D/g, "") }))} /></div>)}<div className="flex flex-wrap items-center gap-3 md:col-span-3"><Button disabled={!validPins || configurePins.isPending} onClick={() => configurePins.mutate({ pins: chosen.map((profile) => ({ code: profile.code, pin: pins[profile.code] })) })}>{configurePins.isPending ? "A guardar…" : "Atualizar PINs"}</Button><span className="flex items-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-teal-700" />PINs entre 4 e 8 algarismos</span></div></CardContent></Card>
  </div>;
}
