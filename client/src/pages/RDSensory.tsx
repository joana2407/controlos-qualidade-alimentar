import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Beaker, CalendarDays, CheckCircle2, ClipboardPlus, Clock3, Download, Edit3, FileCheck2, ImagePlus, Loader2, Plus, Star, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type ProjectFilter = "active" | "closed" | "all";

type Scores = {
  appearanceScore: number;
  aftertasteScore: number;
  colourScore: number;
  smellScore: number;
  textureScore: number;
  flavourScore: number;
};

type EvaluationPhoto = { key: string; url: string; fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp" };

const criteria: Array<{ key: keyof Scores; label: string; weight: string }> = [
  { key: "appearanceScore", label: "Aspeto geral", weight: "10%" },
  { key: "aftertasteScore", label: "Fim de boca", weight: "15%" },
  { key: "colourScore", label: "Cor", weight: "15%" },
  { key: "smellScore", label: "Cheiro", weight: "10%" },
  { key: "textureScore", label: "Textura", weight: "10%" },
  { key: "flavourScore", label: "Sabor", weight: "40%" },
];

const defaultScores: Scores = {
  appearanceScore: 3,
  aftertasteScore: 3,
  colourScore: 3,
  smellScore: 3,
  textureScore: 3,
  flavourScore: 3,
};

const localDateInput = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("pt-PT") : "—";

const formatScore = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeProjectSearch = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT").trim();

function calculateLifeDay(productionDate: Date | string | null | undefined, evaluatedAt: string) {
  if (!productionDate || !evaluatedAt) return 0;
  const start = new Date(productionDate);
  const [year, month, day] = evaluatedAt.split("-").map(Number);
  const current = new Date(year, (month ?? 1) - 1, day ?? 1);
  return Math.max(0, Math.round((current.getTime() - new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) / 86_400_000));
}

function RatingSelect({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
  return <select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
    {[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score} — {score === 1 ? "Muito fraco" : score === 2 ? "Fraco" : score === 3 ? "Aceitável" : score === 4 ? "Bom" : "Muito bom"}</option>)}
  </select>;
}

export default function RDSensory() {
  const { activeProfile, canManage, canOperate } = useQualityAccess();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingEvaluationId, setEditingEvaluationId] = useState<number | null>(null);
  const [projectForm, setProjectForm] = useState({ title: "", product: "", productionLot: "", productionDate: localDateInput(), intendedShelfLifeDays: "", intendedExpiryDate: "" });
  const [evaluationDate, setEvaluationDate] = useState(localDateInput());
  const [tasterName, setTasterName] = useState(activeProfile?.name ?? "");
  const [scores, setScores] = useState<Scores>(defaultScores);
  const [observations, setObservations] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [evaluationPhotos, setEvaluationPhotos] = useState<EvaluationPhoto[]>([]);
  const [finalAssessment, setFinalAssessment] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const projectListInput = useMemo(() => ({ status: filter }), [filter]);
  const allProjectsInput = useMemo(() => ({ status: "all" as const }), []);
  const projects = trpc.rdSensory.listProjects.useQuery(projectListInput);
  const allProjects = trpc.rdSensory.listProjects.useQuery(allProjectsInput);
  const project = trpc.rdSensory.getProject.useQuery({ projectId: selectedProjectId! }, { enabled: selectedProjectId !== null });

  const createProject = trpc.rdSensory.createProject.useMutation({
    onSuccess: (created) => {
      toast.success("Projeto de I&D criado.");
      setShowProjectForm(false);
      setProjectForm({ title: "", product: "", productionLot: "", productionDate: localDateInput(), intendedShelfLifeDays: "", intendedExpiryDate: "" });
      setSelectedProjectId(created.id);
      void utils.rdSensory.listProjects.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const addEvaluation = trpc.rdSensory.addEvaluation.useMutation({
    onSuccess: () => {
      toast.success("Avaliação sensorial registada.");
      setShowEvaluationForm(false);
      setScores(defaultScores);
      setObservations("");
      setSuggestions("");
      setEvaluationPhotos([]);
      setEditingEvaluationId(null);
      void utils.rdSensory.getProject.invalidate();
      void utils.rdSensory.listProjects.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const closeProject = trpc.rdSensory.closeProject.useMutation({
    onSuccess: () => {
      toast.success("Projeto de I&D fechado e histórico preservado.");
      setShowCloseForm(false);
      void utils.rdSensory.getProject.invalidate();
      void utils.rdSensory.listProjects.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateProject = trpc.rdSensory.updateProject.useMutation({ onSuccess: () => { toast.success("Projeto de I&D atualizado."); setShowProjectForm(false); setEditingProjectId(null); void utils.rdSensory.getProject.invalidate(); void utils.rdSensory.listProjects.invalidate(); }, onError: error => toast.error(error.message) });
  const updateEvaluation = trpc.rdSensory.updateEvaluation.useMutation({ onSuccess: () => { toast.success("Avaliação de I&D atualizada."); setShowEvaluationForm(false); setEditingEvaluationId(null); setEvaluationPhotos([]); void utils.rdSensory.getProject.invalidate(); void utils.rdSensory.listProjects.invalidate(); }, onError: error => toast.error(error.message) });
  const deleteProject = trpc.rdSensory.deleteProject.useMutation({ onSuccess: () => { toast.success("Projeto removido da lista, mantendo a rastreabilidade interna."); setSelectedProjectId(null); void utils.rdSensory.getProject.invalidate(); void utils.rdSensory.listProjects.invalidate(); }, onError: error => toast.error(error.message) });
  const deleteEvaluation = trpc.rdSensory.deleteEvaluation.useMutation({ onSuccess: () => { toast.success("Avaliação removida da vista ativa, mantendo a rastreabilidade interna."); void utils.rdSensory.getProject.invalidate(); void utils.rdSensory.listProjects.invalidate(); }, onError: error => toast.error(error.message) });
  const uploadPhoto = trpc.rdSensory.uploadEvaluationPhoto.useMutation({ onSuccess: photo => setEvaluationPhotos(current => [...current, photo]), onError: error => toast.error(error.message) });

  useEffect(() => {
    if (projects.data?.length && !selectedProjectId) setSelectedProjectId(projects.data[0]!.id);
    if (selectedProjectId && projects.data && !projects.data.some(item => item.id === selectedProjectId)) setSelectedProjectId(projects.data[0]?.id ?? null);
  }, [projects.data, selectedProjectId]);

  useEffect(() => {
    if (activeProfile?.name && !tasterName) setTasterName(activeProfile.name);
  }, [activeProfile?.name, tasterName]);

  const selected = project.data;
  const visibleProjects = useMemo(() => {
    const term = normalizeProjectSearch(projectSearch);
    if (!term) return projects.data ?? [];
    return (projects.data ?? []).filter(item => normalizeProjectSearch(`${item.title} ${item.product} ${item.code}`).includes(term));
  }, [projectSearch, projects.data]);
  const matchingExistingProject = useMemo(() => {
    const normalizedTitle = normalizeProjectSearch(projectForm.title);
    if (normalizedTitle.length < 2) return null;
    return allProjects.data?.find(item => normalizeProjectSearch(item.title) === normalizedTitle) ?? null;
  }, [allProjects.data, projectForm.title]);
  const useExistingProject = () => {
    if (!matchingExistingProject) return;
    setSelectedProjectId(matchingExistingProject.id);
    setShowProjectForm(false);
    setShowEvaluationForm(matchingExistingProject.status === "active" && canOperate);
    toast.info(matchingExistingProject.status === "active" ? "Projeto existente selecionado para nova avaliação." : "Projeto fechado selecionado para consulta do histórico.");
  };
  const latestLifeDay = selected?.evaluations.length
    ? Math.max(...selected.evaluations.map(evaluation => evaluation.lifeDay))
    : null;
  const lifeDay = calculateLifeDay(selected?.productionDate, evaluationDate);
  const scorePreview = useMemo(() => (scores.appearanceScore * 0.1 + scores.aftertasteScore * 0.15 + scores.colourScore * 0.15 + scores.smellScore * 0.1 + scores.textureScore * 0.1 + scores.flavourScore * 0.4), [scores]);

  const resetEvaluationForm = () => { setEditingEvaluationId(null); setEvaluationDate(localDateInput()); setTasterName(activeProfile?.name ?? ""); setScores(defaultScores); setObservations(""); setSuggestions(""); setEvaluationPhotos([]); };
  const startProjectEdit = () => { if (!selected) return; setProjectForm({ title: selected.title, product: selected.product, productionLot: selected.productionLot ?? "", productionDate: selected.productionDate ? localDateInput(new Date(selected.productionDate)) : "", intendedShelfLifeDays: selected.intendedShelfLifeDays ? String(selected.intendedShelfLifeDays) : "", intendedExpiryDate: selected.intendedExpiryDate ? localDateInput(new Date(selected.intendedExpiryDate)) : "" }); setEditingProjectId(selected.id); setShowProjectForm(true); };
  const startEvaluationEdit = (evaluation: NonNullable<typeof selected>["evaluations"][number]) => { setEditingEvaluationId(evaluation.id); setEvaluationDate(localDateInput(new Date(evaluation.evaluatedAt))); setTasterName(evaluation.tasterName); setScores({ appearanceScore: evaluation.appearanceScore, aftertasteScore: evaluation.aftertasteScore, colourScore: evaluation.colourScore, smellScore: evaluation.smellScore, textureScore: evaluation.textureScore, flavourScore: evaluation.flavourScore }); setObservations(evaluation.observations ?? ""); setSuggestions(evaluation.suggestions ?? ""); setEvaluationPhotos(evaluation.photos ?? []); setShowEvaluationForm(true); };
  const addEvaluationPhoto = async (file?: File) => { if (!file || !selected) return; if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return toast.error("Use uma fotografia JPG, PNG ou WEBP."); if (file.size > 4_500_000) return toast.error("Cada fotografia pode ter no máximo 4,5 MB."); if (evaluationPhotos.length >= 5) return toast.error("Pode anexar até cinco fotografias por avaliação."); try { const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não foi possível ler a fotografia.")); reader.readAsDataURL(file); }); uploadPhoto.mutate({ projectId: selected.id, fileName: file.name, mimeType: file.type as EvaluationPhoto["mimeType"], dataUrl }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível ler a fotografia."); } };
  const exportProject = () => { if (!selected) return; const projectRows = [["Campo", "Valor"], ["Código", selected.code], ["Projeto", selected.title], ["Produto / amostra", selected.product], ["Lote", selected.productionLot ?? ""], ["Data de produção", formatDate(selected.productionDate)], ["Vida útil pretendida", selected.intendedShelfLifeDays ? `${selected.intendedShelfLifeDays} dias` : ""], ["Estado", selected.status === "active" ? "Em curso" : "Fechado"], ["Nota final", formatScore(selected.finalScore ? selected.finalScore / 100 : selected.computedFinalScore)], ["Conclusões finais", selected.finalAssessment ?? ""], ["Observações de fecho", selected.closingNotes ?? ""]]; const evaluationRows = [["Data", "Dia de vida", "Provador", "Aspeto", "Fim de boca", "Cor", "Cheiro", "Textura", "Sabor", "Nota ponderada", "Observações", "Sugestões", "Fotografias"], ...selected.evaluations.map(evaluation => [formatDate(evaluation.evaluatedAt), evaluation.lifeDay, evaluation.tasterName, evaluation.appearanceScore, evaluation.aftertasteScore, evaluation.colourScore, evaluation.smellScore, evaluation.textureScore, evaluation.flavourScore, formatScore(evaluation.weightedScore / 100), evaluation.observations ?? "", evaluation.suggestions ?? "", (evaluation.photos ?? []).map(photo => photo.url).join(" | ")])]; const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(projectRows), "Projeto"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(evaluationRows), "Avaliações"); XLSX.writeFile(workbook, `${selected.code}-${selected.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.xlsx`); };

  return <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-950 via-teal-900 to-emerald-800 px-6 py-7 text-white shadow-sm md:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200"><Beaker className="h-4 w-4" />Investigação e desenvolvimento</div><h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Avaliação sensorial de I&D</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/90">Acompanhe as amostras em diferentes momentos de vida, reúna avaliações de vários provadores e feche cada projeto com uma nota final rastreável.</p></div>
        {canOperate && <Button onClick={() => { setEditingProjectId(null); setShowProjectForm(open => !open); }} className="bg-white text-teal-950 hover:bg-cyan-50"><Plus className="mr-2 h-4 w-4" />Novo projeto</Button>}
      </div>
    </header>

    {showProjectForm && (canOperate || (editingProjectId !== null && canManage)) && <Card className="border-cyan-200 bg-cyan-50/50"><CardHeader><CardTitle className="text-lg">{editingProjectId ? "Editar projeto de I&D" : "Novo projeto de I&D"}</CardTitle><CardDescription>{editingProjectId ? "Atualize a identificação do projeto sem alterar as avaliações que já foram registadas." : "Crie o projeto e identifique a amostra de referência. Para uma nova tentativa ou formulação do mesmo projeto, selecione o projeto existente e acrescente uma avaliação, preservando o histórico conjunto."}</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={event => { event.preventDefault(); const payload = { title: projectForm.title, product: projectForm.product, productionLot: projectForm.productionLot || undefined, productionDate: projectForm.productionDate ? new Date(`${projectForm.productionDate}T12:00:00`) : undefined, intendedShelfLifeDays: projectForm.intendedShelfLifeDays ? Number(projectForm.intendedShelfLifeDays) : undefined, intendedExpiryDate: projectForm.intendedExpiryDate ? new Date(`${projectForm.intendedExpiryDate}T12:00:00`) : undefined }; if (editingProjectId) updateProject.mutate({ projectId: editingProjectId, ...payload }); else createProject.mutate(payload); }}>
      <Field label="Nome do projeto" required><div className="space-y-2"><Input value={projectForm.title} onChange={event => setProjectForm(current => ({ ...current, title: event.target.value }))} placeholder="Ex.: Nova formulação pão rústico" list="rd-existing-projects" required aria-describedby="existing-project-help" /><datalist id="rd-existing-projects">{allProjects.data?.map(item => <option key={item.id} value={item.title}>{item.code} · {item.product} · {item.status === "active" ? "Em curso" : "Fechado"}</option>)}</datalist><p id="existing-project-help" className="text-xs font-normal leading-5 text-slate-600">Ao escrever, surgem os nomes dos projetos já criados.</p>{!editingProjectId && matchingExistingProject && <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-normal text-teal-950"><p>Já existe <b>{matchingExistingProject.code}</b> — {matchingExistingProject.title}.</p><Button type="button" variant="link" className="h-auto px-0 py-1 text-xs text-teal-800" onClick={useExistingProject}>Usar projeto existente</Button></div>}</div></Field>
      <Field label="Produto / amostra" required><Input value={projectForm.product} onChange={event => setProjectForm(current => ({ ...current, product: event.target.value }))} placeholder="Nome da amostra" required /></Field>
      <Field label="Data de produção"><Input type="date" value={projectForm.productionDate} onChange={event => setProjectForm(current => ({ ...current, productionDate: event.target.value }))} /></Field>
      <Field label="Lote"><Input value={projectForm.productionLot} onChange={event => setProjectForm(current => ({ ...current, productionLot: event.target.value }))} placeholder="Lote de produção" /></Field>
      <Field label="Vida útil pretendida (dias)"><Input type="number" min="1" max="999" value={projectForm.intendedShelfLifeDays} onChange={event => setProjectForm(current => ({ ...current, intendedShelfLifeDays: event.target.value }))} /></Field>
      <Field label="Validade pretendida"><Input type="date" value={projectForm.intendedExpiryDate} onChange={event => setProjectForm(current => ({ ...current, intendedExpiryDate: event.target.value }))} /></Field>
      <div className="flex items-end gap-3 md:col-span-2 xl:col-span-3"><Button type="submit" disabled={createProject.isPending || updateProject.isPending || (!editingProjectId && Boolean(matchingExistingProject))}>{(createProject.isPending || updateProject.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingProjectId ? "Guardar alterações" : matchingExistingProject ? "Selecione o projeto existente" : "Criar projeto"}</Button><Button type="button" variant="outline" onClick={() => { setShowProjectForm(false); setEditingProjectId(null); }}>Cancelar</Button></div>
    </form></CardContent></Card>}

    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" aria-label="Filtro de projetos">
      <div className="flex flex-wrap gap-2">{(["active", "closed", "all"] as ProjectFilter[]).map(option => <Button key={option} type="button" size="sm" variant={filter === option ? "default" : "outline"} onClick={() => setFilter(option)}>{option === "active" ? "Em curso" : option === "closed" ? "Fechados" : "Todos"}</Button>)}</div>
      <div className="w-full sm:max-w-sm"><Label htmlFor="project-search" className="text-xs font-semibold text-slate-700">Selecionar projeto</Label><Input id="project-search" type="search" value={projectSearch} onChange={event => setProjectSearch(event.target.value)} placeholder="Pesquisar por nome, produto ou código" className="mt-1" /></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-3"><div className="flex items-center justify-between px-1"><h2 className="font-semibold text-slate-900">Projetos</h2><span className="text-sm text-slate-500">{visibleProjects.length}{projectSearch ? ` de ${projects.data?.length ?? 0}` : ""}</span></div>{projects.isLoading ? <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />A carregar projetos…</CardContent></Card> : visibleProjects.length ? visibleProjects.map(item => <button key={item.id} type="button" onClick={() => setSelectedProjectId(item.id)} className={cn("w-full rounded-2xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600", selectedProjectId === item.id ? "border-teal-500 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{item.title}</p><p className="mt-1 truncate text-xs text-slate-600">{item.product}</p></div><Badge className={item.status === "active" ? "bg-teal-100 text-teal-800 hover:bg-teal-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>{item.status === "active" ? "Em curso" : "Fechado"}</Badge></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="rounded-lg bg-white/80 px-2 py-1.5 text-slate-600"><b className="block text-slate-900">{item.evaluationCount}</b>avaliações</span><span className="rounded-lg bg-white/80 px-2 py-1.5 text-slate-600"><b className="block text-slate-900">{formatScore(item.computedFinalScore)}</b>nota atual</span></div></button>) : <Card><CardContent className="p-6 text-center"><Beaker className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-800">Sem projetos neste filtro</p><p className="mt-1 text-xs leading-5 text-slate-500">Ajuste o filtro ou crie um novo projeto de I&D.</p></CardContent></Card>}</aside>

      <section className="min-w-0">{project.isLoading ? <Card><CardContent className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />A carregar acompanhamento…</CardContent></Card> : selected ? <div className="space-y-6">
        <Card className="overflow-hidden border-slate-200"><CardHeader className="border-b border-slate-100 bg-slate-50/80"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-teal-200 bg-white text-teal-800">{selected.code}</Badge><Badge className={selected.status === "active" ? "bg-teal-100 text-teal-800 hover:bg-teal-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>{selected.status === "active" ? "Projeto em curso" : "Projeto fechado"}</Badge></div><CardTitle className="mt-3 text-2xl">{selected.title}</CardTitle><CardDescription className="mt-1">{selected.product}{selected.productionLot ? ` · Lote ${selected.productionLot}` : ""}</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportProject}><Download className="mr-2 h-4 w-4" />Excel</Button>{selected.status === "active" && canOperate && <Button onClick={() => { resetEvaluationForm(); setShowEvaluationForm(true); }}><ClipboardPlus className="mr-2 h-4 w-4" />Registar avaliação</Button>}{selected.status === "active" && canManage && <Button variant="outline" onClick={() => setShowCloseForm(open => !open)}><FileCheck2 className="mr-2 h-4 w-4" />Fechar projeto</Button>}{canManage && <Button variant="outline" onClick={startProjectEdit}><Edit3 className="mr-2 h-4 w-4" />Editar</Button>}{canManage && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar este projeto de I&amp;D?</AlertDialogTitle><AlertDialogDescription>O projeto e as avaliações deixam de aparecer na lista ativa. O registo de eliminação fica preservado para rastreabilidade.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-700 hover:bg-red-800" onClick={() => deleteProject.mutate({ projectId: selected.id })}>Eliminar projeto</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div></div></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={CalendarDays} label="Produção" value={formatDate(selected.productionDate)} detail={selected.intendedExpiryDate ? `Validade: ${formatDate(selected.intendedExpiryDate)}` : undefined} /><Metric icon={Clock3} label="Vida útil alvo" value={selected.intendedShelfLifeDays ? `${selected.intendedShelfLifeDays} dias` : "Não definida"} detail={latestLifeDay !== null ? `Avaliado até ao dia ${latestLifeDay}` : undefined} /><Metric icon={UserRound} label="Provadores / avaliações" value={`${selected.evaluations.length}`} detail="Registos individuais" /><Metric icon={Star} label="Nota final" value={formatScore(selected.finalScore ? selected.finalScore / 100 : selected.computedFinalScore)} detail={selected.status === "closed" ? "Fixada no fecho" : "Média ponderada atual"} /></CardContent></Card>

        {showEvaluationForm && ((selected.status === "active" && canOperate) || (editingEvaluationId !== null && canManage)) && <Card className="border-teal-200"><CardHeader><CardTitle className="text-lg">{editingEvaluationId ? "Editar avaliação sensorial" : "Nova avaliação sensorial"}</CardTitle><CardDescription>{editingEvaluationId ? "Atualize os dados da avaliação. As alterações ficam a cargo da Responsável de Qualidade." : "Registe a avaliação de um provador. A nota é calculada com os pesos do modelo R-P5.10(01)."}</CardDescription></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); const payload = { evaluatedAt: new Date(`${evaluationDate}T12:00:00`), lifeDay, tasterName, ...scores, observations: observations || undefined, suggestions: suggestions || undefined, photos: evaluationPhotos }; if (editingEvaluationId) updateEvaluation.mutate({ evaluationId: editingEvaluationId, ...payload }); else addEvaluation.mutate({ projectId: selected.id, ...payload }); }} className="space-y-5"><div className="grid gap-4 md:grid-cols-3"><Field label="Data da análise" required><Input type="date" value={evaluationDate} onChange={event => setEvaluationDate(event.target.value)} required /></Field><Field label="Tempo de vida"><Input value={`Dia ${lifeDay}`} readOnly className="bg-slate-50" /></Field><Field label="Provador" required><Input value={tasterName} onChange={event => setTasterName(event.target.value)} placeholder="Nome do provador" required /></Field></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{criteria.map(criterion => <div key={criterion.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><Label htmlFor={criterion.key} className="flex items-center justify-between text-sm"><span>{criterion.label}</span><span className="text-xs font-normal text-slate-500">Peso {criterion.weight}</span></Label><div className="mt-2"><RatingSelect id={criterion.key} value={scores[criterion.key]} onChange={value => setScores(current => ({ ...current, [criterion.key]: value }))} /></div></div>)}</div><div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-950"><span className="font-medium">Nota ponderada prevista: </span>{formatScore(scorePreview)} / 5,00</div><div className="grid gap-4 md:grid-cols-2"><Field label="Observações da avaliação"><Textarea value={observations} onChange={event => setObservations(event.target.value)} placeholder="Estado da amostra, alterações observadas ou contexto do provador." /></Field><Field label="Sugestões de I&D"><Textarea value={suggestions} onChange={event => setSuggestions(event.target.value)} placeholder="Ajustes, decisões ou próximos passos sugeridos." /></Field></div><div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/60 p-4"><div><Label className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-teal-700" />Fotografias da avaliação</Label><p className="mt-1 text-xs leading-5 text-teal-900">Anexe até 5 fotografias JPG, PNG ou WEBP, com máximo de 4,5 MB cada.</p></div><Input className="mt-3 bg-white" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void addEvaluationPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={uploadPhoto.isPending || evaluationPhotos.length >= 5 || selected.status === "closed"} />{selected.status === "closed" && <p className="mt-2 text-xs text-amber-800">Num projeto fechado pode manter ou remover fotografias já associadas, mas não anexar novas.</p>}{evaluationPhotos.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{evaluationPhotos.map((photo, index) => <div key={`${photo.key}-${index}`} className="group relative"><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={`Fotografia ${index + 1} da avaliação`} className="h-24 w-full rounded-lg border border-teal-100 object-cover" /></a><Button type="button" size="icon" variant="secondary" className="absolute right-1 top-1 h-7 w-7 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Remover fotografia ${photo.fileName}`} onClick={() => setEvaluationPhotos(current => current.filter((_, photoIndex) => photoIndex !== index))}><X className="h-3.5 w-3.5" /></Button></div>)}</div>}</div><div className="flex flex-wrap gap-3"><Button type="submit" disabled={addEvaluation.isPending || updateEvaluation.isPending || uploadPhoto.isPending}>{(addEvaluation.isPending || updateEvaluation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingEvaluationId ? "Guardar alterações" : "Guardar avaliação"}</Button><Button type="button" variant="outline" onClick={() => { setShowEvaluationForm(false); resetEvaluationForm(); }}>Cancelar</Button></div></form></CardContent></Card>}

        {showCloseForm && selected.status === "active" && canManage && <Card className="border-amber-200 bg-amber-50/40"><CardHeader><CardTitle className="text-lg">Fechar projeto de I&D</CardTitle><CardDescription>Apenas a Responsável de Qualidade pode fechar o projeto. O fecho bloqueia novas avaliações, fixa a nota final calculada e preserva todo o histórico.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={event => { event.preventDefault(); closeProject.mutate({ projectId: selected.id, finalAssessment, closingNotes: closingNotes || undefined }); }}><Field label="Conclusões finais do projeto" required><Textarea value={finalAssessment} onChange={event => setFinalAssessment(event.target.value)} placeholder="Registe a conclusão da avaliação sensorial e a decisão final do projeto." minLength={2} required aria-describedby="final-assessment-required" /></Field><p id="final-assessment-required" className="-mt-2 text-xs leading-5 text-amber-900">Campo obrigatório. Descreva a conclusão final antes de confirmar o fecho.</p><Field label="Observações de fecho"><Textarea value={closingNotes} onChange={event => setClosingNotes(event.target.value)} placeholder="Notas adicionais, destino da amostra ou próximos passos." /></Field><div className="flex flex-wrap gap-3"><Button type="submit" disabled={closeProject.isPending || !selected.evaluations.length || finalAssessment.trim().length < 2} className="bg-amber-700 hover:bg-amber-800">{closeProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar fecho</Button><Button type="button" variant="outline" onClick={() => setShowCloseForm(false)}>Cancelar</Button>{!selected.evaluations.length ? <p className="self-center text-sm text-amber-800">É necessária pelo menos uma avaliação.</p> : finalAssessment.trim().length < 2 ? <p className="self-center text-sm text-amber-800">Preencha as conclusões finais para fechar o projeto.</p> : null}</div></form></CardContent></Card>}

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]"><Card><CardHeader><CardTitle className="text-lg">Avaliações registadas</CardTitle><CardDescription>Histórico individual por provador, fotografias e data de análise.</CardDescription></CardHeader><CardContent>{selected.evaluations.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-medium">Data</th><th className="pb-3 font-medium">Vida</th><th className="pb-3 font-medium">Provador</th><th className="pb-3 font-medium">Nota</th><th className="pb-3 font-medium">Fotografias</th><th className="pb-3 font-medium">Observações</th>{canManage && <th className="pb-3 text-right font-medium">Ações</th>}</tr></thead><tbody>{selected.evaluations.map(evaluation => <tr key={evaluation.id} className="border-b border-slate-100 last:border-0"><td className="py-3">{formatDate(evaluation.evaluatedAt)}</td><td className="py-3">Dia {evaluation.lifeDay}</td><td className="py-3 font-medium text-slate-900">{evaluation.tasterName}</td><td className="py-3"><Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">{formatScore(evaluation.weightedScore / 100)}</Badge></td><td className="py-3">{evaluation.photos?.length ? <div className="flex -space-x-2">{evaluation.photos.map((photo, index) => <a key={photo.key} href={photo.url} target="_blank" rel="noreferrer" className="block"><img src={photo.url} alt={`Fotografia ${index + 1} de ${evaluation.tasterName}`} className="h-8 w-8 rounded-md border-2 border-white object-cover" /></a>)}</div> : <span className="text-xs text-slate-400">Sem fotos</span>}</td><td className="max-w-xs py-3 text-slate-600">{evaluation.observations || evaluation.suggestions || "—"}</td>{canManage && <td className="py-3 text-right"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar avaliação de ${evaluation.tasterName}`} onClick={() => startEvaluationEdit(evaluation)}><Edit3 className="h-4 w-4" /></Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 text-red-700 hover:bg-red-50 hover:text-red-800" aria-label={`Eliminar avaliação de ${evaluation.tasterName}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar esta avaliação?</AlertDialogTitle><AlertDialogDescription>A avaliação deixa de aparecer no histórico ativo. A remoção fica registada para fins de rastreabilidade.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-700 hover:bg-red-800" onClick={() => deleteEvaluation.mutate({ evaluationId: evaluation.id })}>Eliminar avaliação</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></td>}</tr>)}</tbody></table></div> : <EmptyEvaluations />}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Evolução por tempo de vida</CardTitle><CardDescription>Média ponderada de todos os provadores por momento de avaliação.</CardDescription></CardHeader><CardContent className="space-y-4">{selected.timeline.length ? selected.timeline.map(point => <div key={point.lifeDay}><div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-800">Dia {point.lifeDay}</span><span className="font-semibold text-teal-800">{formatScore(point.weightedAverage)} / 5</span></div><Progress value={(point.weightedAverage ?? 0) * 20} className="mt-2 h-2" /><p className="mt-1 text-xs text-slate-500">{point.evaluations} {point.evaluations === 1 ? "avaliação" : "avaliações"} · Sabor: {formatScore(point.criteria.flavourScore?.average)} · Textura: {formatScore(point.criteria.textureScore?.average)}</p></div>) : <EmptyEvaluations />}</CardContent></Card></div>

        {selected.status === "closed" && <Card className="border-emerald-200 bg-emerald-50/50"><CardContent className="flex gap-3 p-5"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="font-semibold text-emerald-950">Projeto fechado em {formatDate(selected.closedAt)}</p><p className="mt-1 text-sm text-emerald-900"><b>Conclusões finais:</b> {selected.finalAssessment}</p>{selected.closingNotes && <p className="mt-1 text-sm text-emerald-800">{selected.closingNotes}</p>}</div></CardContent></Card>}
      </div> : <Card><CardContent className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><Beaker className="h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-semibold text-slate-900">Selecione um projeto de I&D</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Consulte o histórico de provadores e a evolução da nota ao longo da vida da amostra.</p></CardContent></Card>}</section>
    </div>
  </div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-slate-800"><span>{label}{required && <span className="ml-1 text-red-700">*</span>}</span>{children}</label>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof CalendarDays; label: string; value: string; detail?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon className="h-3.5 w-3.5 text-teal-700" />{label}</div><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>;
}

function EmptyEvaluations() {
  return <div className="py-7 text-center text-sm text-slate-500"><Star className="mx-auto mb-2 h-6 w-6 text-slate-300" />Ainda não existem avaliações registadas.</div>;
}
