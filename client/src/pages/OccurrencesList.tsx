import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Calendar, ChevronDown, ChevronUp, Clock, Download, Filter, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

const ORIGIN_NAMES: Record<string, string> = { I: "Interna", R: "Reclamação", F: "Fornecedor", AI: "Aud. Interna", AE: "Aud. Externa" };
const STORAGE_KEY = "ocorrencias_list_filters";
const SGSQA_SCOPES = ["M1-BPHF", "M2-HACCP", "M3-Food Defense", "M4-Gestão da Qualidade e Segurança Alimentar", "P1-Responsabilidades da Direcção", "P2-Documentação do Sistema", "P3-Gestão de Ocorrências Recall e Simulacros", "P4-Compras", "P5-Controlo do Produto e Processos", "P6-Rastreabilidade", "P7-Foco no Cliente", "P8-Ambiente e Infraestruturas", "P8-Ambiente e Infraestruturas(CONTROLO DE PRAGAS)", "P9-Manutenção", "P10-FORMAÇÃO", "P10-Gestão de RH", "P10-HST+MT", "P11-Auditorias Internas e Externas", "P12-Legislação", "P13-Cultura Segurança Alimentar", "P14-Ambiente Resíduos"];
type SortKey = "occurredOn" | "number" | "status" | "effectiveness" | "implementationDueOn";

function queryParams(location: string) {
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  return { search: params.get("search") ?? "", factoryCode: params.get("factoryCode") ?? "all", status: params.get("status") ?? "all", dueStatus: params.get("dueStatus") ?? "all", semEficacia: params.get("semEficacia") === "true" };
}

export default function OccurrencesList() {
  const [location, setLocation] = useLocation();
  const initial = queryParams(location);
  const { canManage } = useQualityAccess();
  const utils = trpc.useUtils();
  const { data: factories = [] } = trpc.quality.listFactories.useQuery();
  const [search, setSearch] = useState(initial.search);
  const [factoryCode, setFactoryCode] = useState(initial.factoryCode);
  const [type, setType] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [status, setStatus] = useState(initial.status);
  const [scope, setScope] = useState("all");
  const [responsible, setResponsible] = useState("");
  const [brcRequirement, setBrcRequirement] = useState("");
  const [dueStatus, setDueStatus] = useState(initial.dueStatus);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [semEficacia, setSemEficacia] = useState(initial.semEficacia);
  const [sortBy, setSortBy] = useState<SortKey>("occurredOn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const stored = JSON.parse(saved);
      setSearch(stored.search ?? initial.search); setFactoryCode(stored.factoryCode ?? initial.factoryCode); setType(stored.type ?? "all"); setOrigin(stored.origin ?? "all"); setStatus(stored.status ?? initial.status); setScope(stored.scope ?? "all"); setResponsible(stored.responsible ?? ""); setBrcRequirement(stored.brcRequirement ?? ""); setDueStatus(stored.dueStatus ?? initial.dueStatus); setFromDate(stored.fromDate ?? ""); setToDate(stored.toDate ?? ""); setSemEficacia(stored.semEficacia ?? initial.semEficacia);
    } catch { localStorage.removeItem(STORAGE_KEY); }
  }, []);

  useEffect(() => {
    const params = queryParams(location);
    setSearch(params.search); setFactoryCode(params.factoryCode); setStatus(params.status); setDueStatus(params.dueStatus); setSemEficacia(params.semEficacia); setPage(1);
  }, [location]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ search, factoryCode, type, origin, status, scope, responsible, brcRequirement, dueStatus, fromDate, toDate, semEficacia }));
    setPage(1);
  }, [search, factoryCode, type, origin, status, scope, responsible, brcRequirement, dueStatus, fromDate, toDate, semEficacia]);

  const filters = useMemo(() => ({ search: search || undefined, factoryCode: factoryCode === "all" ? undefined : factoryCode, type: type === "all" ? undefined : type, origin: origin === "all" ? undefined : origin, status: semEficacia ? "FECHADO" : status === "all" ? undefined : status, sgsqaScope: scope === "all" ? undefined : scope, responsible: responsible || undefined, brcRequirement: brcRequirement || undefined, dueStatus: dueStatus === "all" ? undefined : dueStatus, dataInicio: fromDate || undefined, dataFim: toDate || undefined, semEficacia: semEficacia || undefined, page, pageSize: 30, sortBy, sortDir }), [search, factoryCode, type, origin, status, scope, responsible, brcRequirement, dueStatus, fromDate, toDate, semEficacia, page, sortBy, sortDir]);
  const list = trpc.occurrences.list.useQuery(filters);
  const exportQuery = trpc.occurrences.list.useQuery({ ...filters, page: 1, pageSize: 10_000 }, { enabled: false });
  const remove = trpc.occurrences.delete.useMutation({ onSuccess: () => utils.occurrences.list.invalidate() });
  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 30));
  const hasFilters = Boolean(search || factoryCode !== "all" || type !== "all" || origin !== "all" || status !== "all" || scope !== "all" || responsible || brcRequirement || dueStatus !== "all" || fromDate || toDate || semEficacia);

  const clearFilters = () => { setSearch(""); setFactoryCode("all"); setType("all"); setOrigin("all"); setStatus("all"); setScope("all"); setResponsible(""); setBrcRequirement(""); setDueStatus("all"); setFromDate(""); setToDate(""); setSemEficacia(false); localStorage.removeItem(STORAGE_KEY); };
  const toggleSort = (key: SortKey) => { if (key === sortBy) setSortDir((value) => value === "asc" ? "desc" : "asc"); else { setSortBy(key); setSortDir("desc"); } };
  const sortIcon = (key: SortKey) => sortBy !== key ? <ChevronDown className="h-3 w-3 opacity-30" /> : sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-blue-600" /> : <ChevronDown className="h-3 w-3 text-blue-600" />;
  const exportRows = async () => {
    const data = (await exportQuery.refetch()).data?.data ?? [];
    if (!data.length) return;
    const header = ["Nº", "Data", "Fábrica", "Tipo", "Origem", "Âmbito SGSQA", "Requisito BRC", "Produto", "Lote", "Descrição", "Causa-raiz", "Correção", "Ação corretiva", "Responsável", "Prazo", "Estado", "Eficácia", "Observações"];
    const csvRows = data.map((row) => [row.number, String(row.occurredOn ?? "").slice(0, 10), row.factoryCode ?? "", row.type, ORIGIN_NAMES[row.origin] ?? row.origin, row.sgsqaScope ?? "", row.brcRequirement ?? "", row.affectedProduct ?? "", row.lot ?? "", row.description, row.rootCauseAnalysis ?? "", row.correction ?? "", row.correctiveAction ?? "", row.responsible ?? "", row.implementationDueOn ? String(row.implementationDueOn).slice(0, 10) : "", row.status, row.effectiveness ?? "", row.observations ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"));
    const csv = [header.join(";"), ...csvRows].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `ocorrencias_brc_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-6 pb-8">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Ocorrências A&S</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Ocorrências</h1><p className="mt-1 text-sm text-slate-600">{total} registo{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p></div><div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 w-44 pl-8 text-xs" placeholder="Pesquisar..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select value={factoryCode} onValueChange={setFactoryCode}><SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as fábricas</SelectItem>{factories.map((factory) => <SelectItem key={factory.code} value={factory.code}>{factory.name}</SelectItem>)}</SelectContent></Select><Button variant={showFilters || hasFilters ? "default" : "outline"} size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowFilters((value) => !value)}><Filter className="h-3.5 w-3.5" />Filtros{hasFilters ? " ●" : ""}</Button>{hasFilters && <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={clearFilters}><X className="h-3.5 w-3.5" />Limpar</Button>}<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportRows} disabled={exportQuery.isFetching}><Download className="h-3.5 w-3.5" />{exportQuery.isFetching ? "A exportar..." : "Exportar Excel"}</Button><Link href="/ocorrencias/nova"><Button size="sm" className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Nova ocorrência</Button></Link></div></header>
    {showFilters && <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"><FilterField label="Tipo" value={type} onChange={setType} options={[["all", "Todos"], ["NC", "NC"], ["Nnc", "Nnc"]]} /><FilterField label="Origem" value={origin} onChange={setOrigin} options={[["all", "Todas"], ["I", "Interna"], ["R", "Reclamação"], ["F", "Fornecedor"], ["AI", "Aud. Interna"], ["AE", "Aud. Externa"]]} /><FilterField label="Estado" value={status} onChange={setStatus} options={[["all", "Todos"], ["ABERTO", "Aberto"], ["FECHADO", "Fechado"]]} /><FilterField label="Âmbito SGSQA" value={scope} onChange={setScope} options={[["all", "Todos"], ...SGSQA_SCOPES.map((item) => [item, item])]} /><FilterField label="Prazo" value={dueStatus} onChange={setDueStatus} options={[["all", "Todos"], ["vencido", "Vencido"], ["proximo", "Próximo (7 dias)"]]} /><TextField label="Responsável" placeholder="Nome..." value={responsible} onChange={setResponsible} /><TextField label="Requisito BRC" placeholder="ex: 3.6.1" value={brcRequirement} onChange={setBrcRequirement} /><DateField label="De" value={fromDate} onChange={setFromDate} /><DateField label="Até" value={toDate} onChange={setToDate} /><div className="flex items-end"><Button variant={semEficacia ? "default" : "outline"} size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={() => setSemEficacia((value) => !value)}><AlertTriangle className="h-3.5 w-3.5" />Sem eficácia</Button></div>{hasFilters && <div className="flex items-end"><Button variant="ghost" size="sm" className="h-8 w-full gap-1 text-xs" onClick={clearFilters}><X className="h-3.5 w-3.5" />Limpar tudo</Button></div>}</div></div>}
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left"><thead className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground"><tr><SortHeader label="Data" icon={sortIcon("occurredOn")} onClick={() => toggleSort("occurredOn")} /><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Descrição / Produto</th><th className="px-4 py-3">Âmbito SGSQA</th><SortHeader label="Estado" icon={sortIcon("status")} onClick={() => toggleSort("status")} /><SortHeader label="Eficácia" icon={sortIcon("effectiveness")} onClick={() => toggleSort("effectiveness")} /><th className="px-4 py-3">Responsável</th><SortHeader label="Prazo" icon={sortIcon("implementationDueOn")} onClick={() => toggleSort("implementationDueOn")} /><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody>{list.isLoading ? <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">A carregar ocorrências…</td></tr> : rows.length ? rows.map((row) => <OccurrenceRow key={row.id} row={row} factories={factories} canManage={canManage} onOpen={() => setLocation(`/ocorrencias/${row.id}`)} onEdit={() => setLocation(`/ocorrencias/${row.id}/editar`)} onDelete={() => { if (window.confirm(`Eliminar a ocorrência #${row.number}? Esta ação não pode ser revertida.`)) remove.mutate({ id: row.id }); }} />) : <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">Não existem ocorrências para os filtros selecionados.</td></tr>}</tbody></table></div><footer className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground"><span>Página {page} de {pages} · {total} registos</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Seguinte</Button></div></footer></div>
  </div>;
}

function OccurrenceRow({ row, factories, canManage, onOpen, onEdit, onDelete }: { row: any; factories: any[]; canManage: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const deadline = row.implementationDueOn ? new Date(row.implementationDueOn) : null; const overdue = deadline && deadline < new Date() && row.status === "ABERTO"; const near = deadline && !overdue && deadline.getTime() - Date.now() <= 7 * 86_400_000;
  return <tr className={`cursor-pointer border-b border-border/70 last:border-0 hover:bg-slate-50 ${overdue ? "bg-red-50/60" : near ? "bg-amber-50/60" : ""}`} onClick={onOpen}><td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.occurredOn).toLocaleDateString("pt-PT")}</td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${row.type === "NC" ? "border-rose-300 bg-rose-200 text-rose-800" : "border-amber-400 bg-amber-300 text-amber-900"}`}>{row.type}</span></td><td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{ORIGIN_NAMES[row.origin] ?? row.origin}</span></td><td className="max-w-xs px-4 py-3"><p className="truncate text-sm font-medium">#{row.number} · {row.description}</p><div className="mt-0.5 flex gap-1.5">{row.affectedProduct && <p className="truncate text-xs text-muted-foreground">{row.affectedProduct}</p>}{row.factoryCode && <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 text-xs font-medium text-indigo-600">{factories.find((factory) => factory.code === row.factoryCode)?.name ?? row.factoryCode}</span>}</div></td><td className="max-w-[170px] px-4 py-3">{row.sgsqaScope ? <span className="block truncate rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">{row.sgsqaScope}</span> : <span className="text-xs text-muted-foreground">—</span>}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "FECHADO" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>{row.status === "FECHADO" ? "Fechado" : "Aberto"}</span></td><td className="px-4 py-3">{row.effectiveness ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.effectiveness === "Satisfatória" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{row.effectiveness}</span> : row.type === "NC" && row.status === "FECHADO" ? <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Pendente</span> : <span className="text-xs text-muted-foreground">—</span>}</td><td className="px-4 py-3 text-xs text-muted-foreground">{row.responsible ?? "—"}</td><td className={`px-4 py-3 text-xs ${overdue ? "font-semibold text-red-600" : near ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>{deadline ? <span className="flex items-center gap-1">{overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : near ? <Clock className="h-3.5 w-3.5" /> : null}{deadline.toLocaleDateString("pt-PT")}</span> : "—"}</td><td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Editar ocorrência" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>{canManage && <Button variant="ghost" size="icon" aria-label="Eliminar ocorrência" className="text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>}</div></td></tr>;
}
function FilterField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key} className="text-xs">{text}</SelectItem>)}</SelectContent></Select></div>; }
function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label><Input className="h-8 text-xs" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div><label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Calendar className="h-3 w-3" />{label}</label><Input className="h-8 text-xs" type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function SortHeader({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) { return <th className="px-4 py-3"><button onClick={onClick} className="flex items-center gap-1 hover:text-foreground">{label}{icon}</button></th>; }
