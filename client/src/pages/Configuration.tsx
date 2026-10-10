import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { QUALITY_EXTERNAL_PANEL_KEYS, QUALITY_EXTERNAL_PANEL_OPTIONS, QUALITY_PANEL_KEYS, QUALITY_PANEL_OPTIONS, type QualityExternalPanelKey, type QualityPanelKey } from "@shared/quality-panel-access";
import { ArchiveX, GitMerge, KeyRound, LockKeyhole, Pencil, Plus, Settings2, ShieldCheck, Trash2, UserCog, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type ProfileRole = "technician" | "manager" | "viewer";
type PanelAccessKey = QualityPanelKey | QualityExternalPanelKey;
type TeamProfile = {
  id: number;
  code: string;
  name: string;
  title: string;
  isConfigured: boolean;
  role: ProfileRole;
  active: boolean;
  panelAccess: QualityPanelKey[];
  externalPanelAccess: QualityExternalPanelKey[];
};
type BphfEmployee = {
  id: number;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
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
    <IncidenceThemeSettings />
    <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-teal-700" />Configuração operacional organizada</CardTitle><CardDescription>A criação e manutenção de áreas, pontos, linhas, planos e itens de checklist é efetuada diretamente no módulo a que pertence, evitando alterações acidentais na configuração geral.</CardDescription></CardHeader></Card>
  </section></div>;
}

type IncidenceTheme = {
  id: number;
  name: string;
  description: string | null;
  active: "true" | "false";
  createdAt: Date;
  updatedAt: Date;
};

function IncidenceThemeSettings() {
  const utils = trpc.useUtils();
  const themes = trpc.quality.listIncidenceThemes.useQuery();
  const merges = trpc.quality.listIncidenceThemeMerges.useQuery();
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const activeThemes = (themes.data ?? []).filter(
    (theme: IncidenceTheme) => theme.active === "true"
  ) as IncidenceTheme[];
  const inactiveThemes = (themes.data ?? []).filter(
    (theme: IncidenceTheme) => theme.active !== "true"
  ) as IncidenceTheme[];
  const mergePreview = trpc.quality.previewIncidenceThemeMerge.useQuery(
    {
      sourceThemeId: Number(sourceId) || 1,
      targetThemeId: Number(targetId) || 1,
    },
    { enabled: Boolean(sourceId && targetId && sourceId !== targetId) }
  );
  const refresh = async () => {
    await utils.quality.listIncidenceThemes.invalidate();
    await utils.quality.listIncidenceThemeMerges.invalidate();
    await utils.quality.listIncidences.invalidate();
  };
  const createTheme = trpc.quality.createIncidenceTheme.useMutation({
    onSuccess: async result => {
      setNewName("");
      setNewDescription("");
      await refresh();
      toast.success(result.reactivated ? "Tema reativado." : "Tema criado.");
    },
    onError: error => toast.error(error.message),
  });
  const updateTheme = trpc.quality.updateIncidenceTheme.useMutation({
    onSuccess: async result => {
      setEditingId(null);
      setEditingName("");
      setEditingDescription("");
      await refresh();
      toast.success(
        `Tema atualizado. ${result.affectedEntries} registo(s) histórico(s) foram sincronizados.`
      );
    },
    onError: error => toast.error(error.message),
  });
  const deactivateTheme = trpc.quality.deactivateIncidenceTheme.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Tema desativado. O histórico foi preservado.");
    },
    onError: error => toast.error(error.message),
  });
  const mergeThemes = trpc.quality.mergeIncidenceThemes.useMutation({
    onSuccess: async result => {
      setSourceId("");
      setTargetId("");
      setMergeReason("");
      await refresh();
      toast.success(
        `Fusão concluída. ${result.affectedEntries} registo(s) foram associados ao tema correto.`
      );
    },
    onError: error => toast.error(error.message),
  });
  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (newName.trim().length >= 2)
      createTheme.mutate({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
  };
  const beginEdit = (theme: IncidenceTheme) => {
    setEditingId(theme.id);
    setEditingName(theme.name);
    setEditingDescription(theme.description ?? "");
  };
  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (editingId !== null && editingName.trim().length >= 2)
      updateTheme.mutate({
        id: editingId,
        name: editingName.trim(),
        description: editingDescription.trim() || undefined,
      });
  };
  const submitMerge = (event: FormEvent) => {
    event.preventDefault();
    if (!mergePreview.data)
      return toast.error("Aguarde a pré-visualização dos registos afetados.");
    if (mergeReason.trim().length < 3)
      return toast.error("Indique o motivo da fusão.");
    if (
      window.confirm(
        `Confirma fundir «${mergePreview.data.source.name}» em «${mergePreview.data.target.name}»? ${mergePreview.data.affectedEntries} registo(s) serão atualizados e o tema de origem ficará inativo.`
      )
    ) {
      mergeThemes.mutate({
        sourceThemeId: Number(sourceId),
        targetThemeId: Number(targetId),
        reason: mergeReason.trim(),
      });
    }
  };
  return (
    <Card className="border-0 panel-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-violet-700" />
          Catálogo de temas de incidências
        </CardTitle>
        <CardDescription>
          Catálogo exclusivo da Responsável de Qualidade para normalizar
          classificações. Editar e fundir atualiza os registos associados com
          auditoria; desativar impede novas utilizações sem apagar o histórico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={submitCreate}
        >
          <div className="space-y-1">
            <Label htmlFor="new-incidence-theme">Novo tema</Label>
            <Input
              id="new-incidence-theme"
              value={newName}
              onChange={event => setNewName(event.target.value)}
              placeholder="Ex.: Higiene pessoal"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-incidence-theme-description">
              Descrição (opcional)
            </Label>
            <Input
              id="new-incidence-theme-description"
              value={newDescription}
              onChange={event => setNewDescription(event.target.value)}
              placeholder="Quando utilizar este tema"
            />
          </div>
          <Button
            type="submit"
            className="self-end"
            disabled={newName.trim().length < 2 || createTheme.isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar tema
          </Button>
        </form>
        <div className="space-y-2" aria-live="polite">
          {activeThemes.length ? (
            activeThemes.map(theme => (
              <div
                key={theme.id}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3"
              >
                {editingId === theme.id ? (
                  <form
                    className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
                    onSubmit={submitEdit}
                  >
                    <div>
                      <Label
                        htmlFor={`edit-theme-name-${theme.id}`}
                        className="sr-only"
                      >
                        Nome do tema
                      </Label>
                      <Input
                        id={`edit-theme-name-${theme.id}`}
                        value={editingName}
                        onChange={event => setEditingName(event.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`edit-theme-description-${theme.id}`}
                        className="sr-only"
                      >
                        Descrição do tema
                      </Label>
                      <Input
                        id={`edit-theme-description-${theme.id}`}
                        value={editingDescription}
                        onChange={event =>
                          setEditingDescription(event.target.value)
                        }
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        editingName.trim().length < 2 || updateTheme.isPending
                      }
                    >
                      Guardar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {theme.name}
                        </p>
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Ativo
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {theme.description || "Sem descrição."}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => beginEdit(theme)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-red-700 hover:bg-red-50 hover:text-red-800"
                        disabled={deactivateTheme.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Desativar o tema «${theme.name}»? O histórico não será eliminado.`
                            )
                          )
                            deactivateTheme.mutate({ id: theme.id });
                        }}
                      >
                        <ArchiveX className="mr-1.5 h-3.5 w-3.5" />
                        Desativar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              Ainda não existem temas ativos. Os temas antigos serão migrados
              automaticamente quando existirem registos classificados.
            </p>
          )}
        </div>
        {inactiveThemes.length ? (
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Temas desativados ({inactiveThemes.length})
            </summary>
            <div className="mt-3 space-y-2">
              {inactiveThemes.map(theme => (
                <div
                  key={theme.id}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm"
                >
                  <span className="text-slate-600">{theme.name}</span>
                  <Badge variant="outline">Inativo</Badge>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        <div className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
          <div>
            <h3 className="font-semibold text-violet-950">Fundir temas</h3>
            <p className="mt-1 text-sm leading-6 text-violet-900">
              Use quando duas classificações representam o mesmo assunto. O tema
              de origem fica inativo, os registos passam para o tema correto e
              cada alteração fica guardada no histórico do registo.
            </p>
          </div>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submitMerge}>
            <div className="space-y-2">
              <Label>Tema de origem</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger aria-label="Tema de origem">
                  <SelectValue placeholder="Selecionar tema a fundir" />
                </SelectTrigger>
                <SelectContent>
                  {activeThemes.map(theme => (
                    <SelectItem key={theme.id} value={String(theme.id)}>
                      {theme.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tema correto</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger aria-label="Tema correto">
                  <SelectValue placeholder="Selecionar tema de destino" />
                </SelectTrigger>
                <SelectContent>
                  {activeThemes
                    .filter(theme => String(theme.id) !== sourceId)
                    .map(theme => (
                      <SelectItem key={theme.id} value={String(theme.id)}>
                        {theme.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="theme-merge-reason">Motivo da fusão</Label>
              <Textarea
                id="theme-merge-reason"
                value={mergeReason}
                onChange={event => setMergeReason(event.target.value)}
                placeholder="Ex.: duas classificações usadas para o mesmo tipo de desvio"
                maxLength={500}
              />
            </div>
            {mergePreview.isFetching ? (
              <p className="text-sm text-violet-800 md:col-span-2">
                A calcular os registos afetados…
              </p>
            ) : null}
            {mergePreview.data ? (
              <div className="rounded-xl border border-violet-200 bg-white p-3 text-sm md:col-span-2">
                <p className="font-semibold text-violet-950">
                  Pré-visualização
                </p>
                <p className="mt-1 text-violet-900">
                  «{mergePreview.data.source.name}» será fundido em «
                  {mergePreview.data.target.name}».
                </p>
                <p className="mt-1 text-violet-900">
                  <strong>{mergePreview.data.affectedEntries}</strong>{" "}
                  registo(s) serão atualizados.
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {mergePreview.data.byModule.length
                    ? mergePreview.data.byModule
                        .map(item => `${item.total} · ${item.module}`)
                        .join("  |  ")
                    : "Não foram encontrados registos associados."}
                </p>
                {mergePreview.data.sample.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-violet-900">
                      Ver amostra dos registos
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {mergePreview.data.sample.map(item => (
                        <li key={item.id}>
                          #{item.id} · {item.module} · {item.title}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}
            <Button
              type="submit"
              className="md:col-span-2"
              disabled={
                !mergePreview.data ||
                mergeReason.trim().length < 3 ||
                mergeThemes.isPending
              }
            >
              {mergeThemes.isPending ? "A fundir…" : "Confirmar fusão"}
            </Button>
          </form>
        </div>
        {merges.data?.length ? (
          <details className="rounded-xl border border-violet-100 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium text-violet-900">
              Histórico de fusões ({merges.data.length})
            </summary>
            <div className="mt-3 space-y-2">
              {merges.data.map(merge => (
                <div
                  key={merge.id}
                  className="rounded-lg bg-violet-50/60 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-violet-950">
                    {merge.sourceName} → {merge.targetName}
                  </p>
                  <p className="mt-1 text-xs text-violet-800">
                    {merge.affectedEntries} registo(s) ·{" "}
                    {new Date(merge.mergedAt).toLocaleString("pt-PT")} · Motivo:{" "}
                    {merge.reason}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BphfEmployeeSettings() {
  const utils = trpc.useUtils();
  const employees = trpc.quality.listBphfInspectionEmployeesAdmin.useQuery();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const refresh = async () => { await utils.quality.listBphfInspectionEmployeesAdmin.invalidate(); await utils.quality.listBphfEmployeeMerges.invalidate(); };
  const mergePreview = trpc.quality.previewBphfEmployeeMerge.useQuery(
    { sourceEmployeeId: Number(mergeSourceId) || 1, targetEmployeeId: Number(mergeTargetId) || 1 },
    { enabled: Boolean(mergeSourceId && mergeTargetId && mergeSourceId !== mergeTargetId) }
  );
  const mergeHistory = trpc.quality.listBphfEmployeeMerges.useQuery();
  const createEmployee = trpc.quality.createBphfInspectionEmployee.useMutation({
    onSuccess: result => { setNewName(""); refresh(); toast.success(result.reactivated ? "Colaborador reativado." : "Colaborador criado."); },
    onError: error => toast.error(error.message),
  });
  const updateEmployee = trpc.quality.updateBphfInspectionEmployee.useMutation({
    onSuccess: () => { setEditingId(null); setEditingName(""); refresh(); toast.success("Colaborador atualizado."); },
    onError: error => toast.error(error.message),
  });
  const deleteEmployee = trpc.quality.deleteBphfInspectionEmployee.useMutation({
    onSuccess: () => { refresh(); toast.success("Colaborador eliminado da lista ativa. O histórico foi preservado."); },
    onError: error => toast.error(error.message),
  });
  const mergeEmployees = trpc.quality.mergeBphfInspectionEmployees.useMutation({
    onSuccess: result => { refresh(); setMergeSourceId(""); setMergeTargetId(""); setMergeReason(""); toast.success(`Fusão concluída. ${result.affectedEntries} registo(s) transferido(s) para o colaborador correto.`); },
    onError: error => toast.error(error.message),
  });
  const activeEmployees = (employees.data ?? []).filter(employee => employee.active);
  const inactiveEmployees = (employees.data ?? []).filter(employee => !employee.active);
  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (name.length >= 2) createEmployee.mutate({ name });
  };
  const startEdit = (employee: BphfEmployee) => { setEditingId(employee.id); setEditingName(employee.name); };
  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (editingId !== null && editingName.trim().length >= 2) updateEmployee.mutate({ id: editingId, name: editingName.trim() });
  };
  const submitMerge = (event: FormEvent) => {
    event.preventDefault();
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return toast.error("Selecione o duplicado e um colaborador correto diferente.");
    if (mergeReason.trim().length < 3) return toast.error("Indique o motivo da fusão.");
    if (!mergePreview.data) return toast.error("Aguarde a pré-visualização dos registos afetados.");
    if (window.confirm(`Confirma fundir «${mergePreview.data.source.name}» em «${mergePreview.data.target.name}»? Esta ação transfere ${mergePreview.data.affectedEntries} registo(s), desativa o duplicado e fica registada para auditoria.`)) mergeEmployees.mutate({ sourceEmployeeId: Number(mergeSourceId), targetEmployeeId: Number(mergeTargetId), reason: mergeReason.trim() });
  };
  return <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-teal-700" />Colaboradores inspecionados</CardTitle><CardDescription>Catálogo de colaboradores utilizado nas inspeções BPHF e na associação de incidências. Editar ou eliminar mantém o histórico já registado.</CardDescription></CardHeader><CardContent className="space-y-5">
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitCreate}><Label htmlFor="new-bphf-employee" className="sr-only">Nome do novo colaborador</Label><Input id="new-bphf-employee" value={newName} onChange={event => setNewName(event.target.value)} placeholder="Nome completo do colaborador" autoComplete="off" /><Button type="submit" disabled={newName.trim().length < 2 || createEmployee.isPending}><Plus className="mr-2 h-4 w-4" />{createEmployee.isPending ? "A criar…" : "Criar colaborador"}</Button></form>
    <div className="space-y-2" aria-live="polite">{activeEmployees.length ? activeEmployees.map(employee => <div key={employee.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">{editingId === employee.id ? <form className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row" onSubmit={submitEdit}><Label htmlFor={`edit-bphf-employee-${employee.id}`} className="sr-only">Editar nome de {employee.name}</Label><Input id={`edit-bphf-employee-${employee.id}`} value={editingName} onChange={event => setEditingName(event.target.value)} autoFocus /><Button type="submit" size="sm" disabled={editingName.trim().length < 2 || updateEmployee.isPending}>Guardar</Button><Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button></form> : <><div className="min-w-0"><p className="font-medium text-slate-900">{employee.name}</p><p className="text-xs text-slate-500">Disponível para seleção nos controlos BPHF</p></div><div className="flex shrink-0 gap-2"><Button type="button" size="sm" variant="outline" onClick={() => startEdit(employee)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button><Button type="button" size="sm" variant="outline" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={deleteEmployee.isPending} onClick={() => { if (window.confirm(`Eliminar ${employee.name} da lista ativa? O histórico será preservado.`)) deleteEmployee.mutate({ id: employee.id }); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Eliminar</Button></div></>}</div>) : <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Ainda não existem colaboradores ativos no catálogo.</p>}</div>
    <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 space-y-4">
      <div><h3 className="font-semibold text-violet-950">Fundir colaboradores</h3><p className="mt-1 text-sm leading-6 text-violet-900">Use esta operação quando existirem dois perfis da mesma pessoa por erro de digitação. Os registos são transferidos pelo ID interno; o duplicado fica inativo e a operação é mantida para auditoria.</p></div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submitMerge}>
        <div className="space-y-2"><Label>Colaborador duplicado</Label><Select value={mergeSourceId} onValueChange={setMergeSourceId}><SelectTrigger aria-label="Colaborador duplicado"><SelectValue placeholder="Selecionar duplicado" /></SelectTrigger><SelectContent>{activeEmployees.map(employee => <SelectItem key={employee.id} value={String(employee.id)}>{employee.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Colaborador correto</Label><Select value={mergeTargetId} onValueChange={setMergeTargetId}><SelectTrigger aria-label="Colaborador correto"><SelectValue placeholder="Selecionar colaborador correto" /></SelectTrigger><SelectContent>{activeEmployees.filter(employee => String(employee.id) !== mergeSourceId).map(employee => <SelectItem key={employee.id} value={String(employee.id)}>{employee.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="employee-merge-reason">Motivo da fusão</Label><Input id="employee-merge-reason" value={mergeReason} onChange={event => setMergeReason(event.target.value)} placeholder="Ex.: duplicado criado por erro de digitação" maxLength={500} /></div>
        {mergePreview.isFetching ? <p className="text-sm text-violet-800 md:col-span-2">A calcular os registos afetados…</p> : null}
        {mergePreview.data ? <div className="rounded-xl border border-violet-200 bg-white p-3 text-sm md:col-span-2"><p className="font-semibold text-violet-950">Pré-visualização</p><p className="mt-1 text-violet-900">«{mergePreview.data.source.name}» será fundido em «{mergePreview.data.target.name}».</p><p className="mt-1 text-violet-900"><strong>{mergePreview.data.affectedEntries}</strong> registo(s) serão transferidos e o nome correto ficará disponível no histórico.</p>{mergePreview.data.byModule.length ? <p className="mt-1 text-xs text-slate-600">{mergePreview.data.byModule.map(item => `${item.total} · ${item.module}`).join("  |  ")}</p> : <p className="mt-1 text-xs text-slate-600">Não foram encontrados registos de controlos associados ao duplicado.</p>}</div> : null}
        <Button type="submit" className="md:col-span-2" disabled={!mergePreview.data || mergeReason.trim().length < 3 || mergeEmployees.isPending}>{mergeEmployees.isPending ? "A fundir…" : "Confirmar fusão"}</Button>
      </form>
    </div>
    {mergeHistory.data?.length ? <details className="rounded-xl border border-violet-100 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-violet-900">Histórico de fusões ({mergeHistory.data.length})</summary><div className="mt-3 space-y-2">{mergeHistory.data.map(merge => <div key={merge.id} className="rounded-lg bg-violet-50/60 px-3 py-2 text-sm"><p className="font-medium text-violet-950">{merge.sourceName} → {merge.targetName}</p><p className="mt-1 text-xs text-violet-800">{merge.affectedEntries} registo(s) · {new Date(merge.mergedAt).toLocaleString("pt-PT")} · Motivo: {merge.reason}</p></div>)}</div></details> : null}
    {inactiveEmployees.length ? <details className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Colaboradores eliminados ({inactiveEmployees.length})</summary><div className="mt-3 space-y-2">{inactiveEmployees.map(employee => <div key={employee.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm"><span className="text-slate-600">{employee.name}</span><span className="text-xs text-slate-500">Pode ser reativado ao criar com o mesmo nome</span></div>)}</div></details> : null}
  </CardContent></Card>;
}

function PanelSelector({ selected, onToggle, disabled = false, idPrefix, options, label }: { selected: PanelAccessKey[]; onToggle: (panel: PanelAccessKey) => void; disabled?: boolean; idPrefix: string; options: ReadonlyArray<{ key: PanelAccessKey; label: string; description: string }>; label: string }) {
  return <div className="grid gap-2 sm:grid-cols-2" aria-label={label}>{options.map(panel => {
    const id = `${idPrefix}-${panel.key}`;
    return <label key={panel.key} htmlFor={id} className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-left ${disabled ? "border-slate-100 bg-slate-50 text-slate-500" : "cursor-pointer border-slate-200 bg-white hover:border-teal-300"}`}><Checkbox id={id} checked={selected.includes(panel.key)} onCheckedChange={() => onToggle(panel.key)} disabled={disabled} /><span className="min-w-0"><span className="block text-xs font-semibold text-slate-800">{panel.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{panel.description}</span></span></label>;
  })}</div>;
}

function TeamAccessSettings({ profiles, activeProfileId }: { profiles: TeamProfile[]; activeProfileId: number | null }) {
  const utils = trpc.useUtils();
  const [pins, setPins] = useState<Record<string, string>>({});
  const [newUser, setNewUser] = useState<{ name: string; role: ProfileRole; pin: string; panelAccess: QualityPanelKey[]; externalPanelAccess: QualityExternalPanelKey[] }>({ name: "", role: "technician", pin: "", panelAccess: [...QUALITY_PANEL_KEYS], externalPanelAccess: [...QUALITY_EXTERNAL_PANEL_KEYS] });
  const [accessDrafts, setAccessDrafts] = useState<Record<number, { role: ProfileRole; active: boolean }>>({});
  const [panelDrafts, setPanelDrafts] = useState<Record<number, { internal: QualityPanelKey[]; external: QualityExternalPanelKey[] }>>({});
  const refreshProfiles = async () => { await utils.quality.accessStatus.invalidate(); await utils.quality.metadata.invalidate(); };
  const configurePins = trpc.quality.configureTeamPins.useMutation({ onSuccess: async () => { setPins({}); await refreshProfiles(); toast.success("PINs atualizados."); }, onError: (error) => toast.error(error.message) });
  const createProfile = trpc.quality.createPinProfile.useMutation({ onSuccess: async () => { setNewUser({ name: "", role: "technician", pin: "", panelAccess: [...QUALITY_PANEL_KEYS], externalPanelAccess: [...QUALITY_EXTERNAL_PANEL_KEYS] }); await refreshProfiles(); toast.success("Utilizador criado e PIN configurado."); }, onError: (error) => toast.error(error.message) });
  const updateAccess = trpc.quality.updatePinProfileAccess.useMutation({ onSuccess: async () => { setAccessDrafts({}); await refreshProfiles(); toast.success("Autorizações atualizadas."); }, onError: (error) => toast.error(error.message) });
  const updatePanels = trpc.quality.updatePinProfilePanels.useMutation({ onSuccess: async () => { setPanelDrafts({}); await refreshProfiles(); toast.success("Painéis autorizados atualizados."); }, onError: (error) => toast.error(error.message) });
  const chosen = profiles.filter((profile) => pins[profile.code]);
  const validPins = chosen.length > 0 && chosen.every((profile) => /^\d{4,8}$/.test(pins[profile.code] ?? ""));
  const validNewUser = newUser.name.trim().length >= 2 && /^\d{4,8}$/.test(newUser.pin);
  const draftFor = (profile: TeamProfile) => accessDrafts[profile.id] ?? { role: profile.role, active: profile.active };
  const panelsFor = (profile: TeamProfile) => panelDrafts[profile.id] ?? { internal: profile.panelAccess, external: profile.externalPanelAccess };
  const updateDraft = (profile: TeamProfile, change: Partial<{ role: ProfileRole; active: boolean }>) => setAccessDrafts(current => ({ ...current, [profile.id]: { ...draftFor(profile), ...change } }));
  const togglePanels = <T extends PanelAccessKey>(panels: T[], panel: T, onChange: (next: T[]) => void) => onChange(panels.includes(panel) ? panels.filter(item => item !== panel) : [...panels, panel]);

  function submitNewUser(event: FormEvent) {
    event.preventDefault();
    if (!validNewUser) return;
    createProfile.mutate({ name: newUser.name.trim(), role: newUser.role, pin: newUser.pin, allowedPanels: newUser.panelAccess, allowedExternalPanels: newUser.externalPanelAccess });
  }

  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-teal-700" />Utilizadores e autorizações</CardTitle><CardDescription>Defina o nível de acesso e os painéis internos disponíveis. A Responsável de Qualidade mantém acesso integral.</CardDescription></CardHeader><CardContent className="space-y-3">{profiles.map((profile) => {
        const draft = draftFor(profile);
        const selectedPanels = profile.role === "manager" ? QUALITY_PANEL_KEYS : panelsFor(profile).internal;
        const selectedExternalPanels = profile.role === "manager" ? QUALITY_EXTERNAL_PANEL_KEYS : panelsFor(profile).external;
        const accessChanged = draft.role !== profile.role || draft.active !== profile.active;
        const panelsChanged = selectedPanels.length !== profile.panelAccess.length || selectedPanels.some(panel => !profile.panelAccess.includes(panel)) || selectedExternalPanels.length !== profile.externalPanelAccess.length || selectedExternalPanels.some(panel => !profile.externalPanelAccess.includes(panel));
        const currentSession = profile.id === activeProfileId;
        const roleIsManager = draft.role === "manager";
        return <div key={profile.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{profile.name}</p>{currentSession && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">Sessão atual</span>}{!profile.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Inativo</span>}</div><p className="mt-1 text-sm text-slate-600">{profile.isConfigured ? "PIN configurado" : "PIN por definir"}</p></div><div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_auto_auto] sm:items-center"><Select value={draft.role} onValueChange={(value) => updateDraft(profile, { role: value as ProfileRole })} disabled={currentSession}><SelectTrigger aria-label={`Autorização de ${profile.name}`}><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><Button type="button" variant={draft.active ? "outline" : "secondary"} size="sm" onClick={() => updateDraft(profile, { active: !draft.active })} disabled={currentSession}>{draft.active ? "Ativo" : "Inativo"}</Button><Button type="button" size="sm" disabled={!accessChanged || currentSession || updateAccess.isPending} onClick={() => updateAccess.mutate({ profileId: profile.id, ...draft })}>Guardar</Button></div></div><p className="mt-3 text-xs leading-5 text-slate-500">{ROLE_OPTIONS.find(option => option.value === draft.role)?.description}</p>{currentSession && <p className="mt-2 text-xs font-medium text-amber-800">Para proteger o acesso, as autorizações da sessão atual não podem ser alteradas aqui.</p>}<div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 xl:grid-cols-2"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Painéis internos autorizados</p><PanelSelector selected={selectedPanels} idPrefix={`profile-${profile.id}`} options={QUALITY_PANEL_OPTIONS} label="Painéis internos autorizados" disabled={currentSession || roleIsManager} onToggle={(panel) => togglePanels(selectedPanels, panel as QualityPanelKey, next => setPanelDrafts(current => ({ ...current, [profile.id]: { ...panelsFor(profile), internal: next } })))} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Painéis externos autorizados</p><PanelSelector selected={selectedExternalPanels} idPrefix={`profile-external-${profile.id}`} options={QUALITY_EXTERNAL_PANEL_OPTIONS} label="Painéis externos autorizados" disabled={currentSession || roleIsManager} onToggle={(panel) => togglePanels(selectedExternalPanels, panel as QualityExternalPanelKey, next => setPanelDrafts(current => ({ ...current, [profile.id]: { ...panelsFor(profile), external: next } })))} /></div>{roleIsManager ? <p className="text-xs text-teal-800 xl:col-span-2">A Responsável de Qualidade tem acesso integral a todos os painéis internos e externos.</p> : <div className="flex justify-end xl:col-span-2"><Button type="button" size="sm" variant="outline" disabled={!panelsChanged || currentSession || updatePanels.isPending} onClick={() => updatePanels.mutate({ profileId: profile.id, allowedPanels: selectedPanels, allowedExternalPanels: selectedExternalPanels })}>Guardar painéis</Button></div>}</div></div>;
      })}</CardContent></Card>
      <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-teal-700" />Novo utilizador</CardTitle><CardDescription>Defina o tipo de autorização, os painéis internos e externos e o PIN inicial no momento da criação.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={submitNewUser}><div className="space-y-2"><Label htmlFor="new-user-name">Nome</Label><Input id="new-user-name" value={newUser.name} onChange={event => setNewUser(current => ({ ...current, name: event.target.value }))} placeholder="Nome completo" autoComplete="off" required /></div><div className="space-y-2"><Label htmlFor="new-user-role">Tipo de autorização</Label><Select value={newUser.role} onValueChange={(value) => setNewUser(current => ({ ...current, role: value as ProfileRole }))}><SelectTrigger id="new-user-role"><SelectValue /></SelectTrigger><SelectContent>{ROLE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-5 text-slate-500">{ROLE_OPTIONS.find(option => option.value === newUser.role)?.description}</p></div><div className="space-y-2"><Label>Painéis internos autorizados</Label><PanelSelector selected={newUser.role === "manager" ? QUALITY_PANEL_KEYS : newUser.panelAccess} idPrefix="new-user-panel" options={QUALITY_PANEL_OPTIONS} label="Painéis internos autorizados" disabled={newUser.role === "manager"} onToggle={(panel) => togglePanels(newUser.panelAccess, panel as QualityPanelKey, next => setNewUser(current => ({ ...current, panelAccess: next })))} /></div><div className="space-y-2"><Label>Painéis externos autorizados</Label><PanelSelector selected={newUser.role === "manager" ? QUALITY_EXTERNAL_PANEL_KEYS : newUser.externalPanelAccess} idPrefix="new-user-external-panel" options={QUALITY_EXTERNAL_PANEL_OPTIONS} label="Painéis externos autorizados" disabled={newUser.role === "manager"} onToggle={(panel) => togglePanels(newUser.externalPanelAccess, panel as QualityExternalPanelKey, next => setNewUser(current => ({ ...current, externalPanelAccess: next })))} />{newUser.role === "manager" && <p className="text-xs text-teal-800">A Responsável de Qualidade recebe acesso integral automaticamente.</p>}</div><div className="space-y-2"><Label htmlFor="new-user-pin">PIN inicial</Label><Input id="new-user-pin" type="password" inputMode="numeric" maxLength={8} value={newUser.pin} onChange={event => setNewUser(current => ({ ...current, pin: event.target.value.replace(/\D/g, "") }))} placeholder="4 a 8 algarismos" autoComplete="new-password" required /><p className="text-xs text-slate-500">O PIN não poderá ser consultado depois de guardado.</p></div><Button type="submit" className="w-full" disabled={!validNewUser || createProfile.isPending}>{createProfile.isPending ? "A criar…" : <><Plus className="mr-2 h-4 w-4" />Criar utilizador</>}</Button></form></CardContent></Card>
    </div>
    <BphfEmployeeSettings />
    <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-teal-700" />Alterar PINs</CardTitle><CardDescription>Atualize um ou vários PINs individualmente. Os PINs são guardados de forma protegida e nunca são apresentados.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">{profiles.map((profile) => <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4" key={profile.id}><p className="font-medium">{profile.name}</p><p className="text-sm text-muted-foreground">{roleLabel(profile.role)} · {profile.isConfigured ? "PIN configurado" : "PIN por definir"}</p><Label htmlFor={`change-pin-${profile.id}`} className="sr-only">Novo PIN de {profile.name}</Label><Input id={`change-pin-${profile.id}`} type="password" inputMode="numeric" maxLength={8} placeholder="Novo PIN" value={pins[profile.code] ?? ""} onChange={(event) => setPins((current) => ({ ...current, [profile.code]: event.target.value.replace(/\D/g, "") }))} /></div>)}<div className="flex flex-wrap items-center gap-3 md:col-span-3"><Button disabled={!validPins || configurePins.isPending} onClick={() => configurePins.mutate({ pins: chosen.map((profile) => ({ code: profile.code, pin: pins[profile.code] })) })}>{configurePins.isPending ? "A guardar…" : "Atualizar PINs"}</Button><span className="flex items-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-teal-700" />PINs entre 4 e 8 algarismos</span></div></CardContent></Card>
  </div>;
}
