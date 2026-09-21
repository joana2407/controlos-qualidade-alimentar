import { SeverityBadge, StatusBadge } from "@/components/quality/QualityUi";
import { Badge } from "@/components/ui/badge";
import { OfflineIncidencePanel } from "@/components/OfflineIncidencePanel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateFormat, moduleLabel, MODULES } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Factory,
  FileWarning,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useQualityAccess } from "@/contexts/QualityAccessContext";

type OccurrenceType = "incidence" | "nonconformity";
const EXTERNAL_NONCONFORMITY_URL =
  "https://analiseocorrencias.manus.space/login";
type IncidenceTreatment = {
  status: "pending" | "in_progress" | "completed";
  correction: string;
  responsible: string;
  dueDate: string;
  completedAt: string;
  notes: string;
  evidencePhotos: Array<{
    key: string;
    url: string;
    fileName: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  }>;
};
type IncidenceTreatmentHistoryEntry = IncidenceTreatment & {
  revision: number;
  recordedAt: string;
  recordedByProfileId: number;
  recordedByName: string;
  recordedByTitle: string;
};
type FragileTreatmentReview = {
  periodicity: "D" | "S" | "Q" | "M";
  riskLevel: "1" | "2" | "3";
  rationale: string;
};
const emptyIncidenceTreatment = (): IncidenceTreatment => ({
  status: "pending",
  correction: "",
  responsible: "",
  dueDate: "",
  completedAt: "",
  notes: "",
  evidencePhotos: [],
});

type OccurrenceItem = {
  key: string;
  type: OccurrenceType;
  id: number;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  area: string;
  factoryId: number | null;
  module: string;
  date: Date;
  occurredOn: string;
  registeredAt: Date;
  severity: string | null;
  status: string;
  generatedNonconformity: boolean;
  treatmentStatus: "pending" | "no_nc" | "nc_generated";
  nonconformityId: number | null;
  occurrenceNumber: string | null;
  registeredByProfileId: number | null;
  registeredByName: string | null;
  registeredByTitle: string | null;
  evidencePhotos: Array<{
    key: string;
    url: string;
    fileName: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  }>;
  treatment: IncidenceTreatment;
  treatmentHistory: IncidenceTreatmentHistoryEntry[];
  followUpReviewAlerts: Array<{
    followUpTaskId: number;
    title: string;
    result: string;
    notes: string;
    completedAt: string;
    registeredByProfileId: number;
    registeredByName: string;
    registeredByTitle: string;
  }>;
  fragileTreatmentReview: FragileTreatmentReview | null;
  pointKey: string;
  plannedTaskId: number | null;
  plannedDate: string | null;
  bphfContext: {
    collaboratorName: string;
    criterion: string;
    result: string;
  } | null;
  collaboratorId: number | null;
  collaboratorName: string | null;
};

type SimilarIncidenceFilter = {
  title: string;
  module: string;
  factoryId: number | null;
  pointKey?: string | null;
  collaboratorId?: number | null;
  collaboratorName?: string | null;
  total: number;
};

const normaliseSimilarTitle = (value: string) =>
  value.trim().toLocaleLowerCase("pt-PT").replace(/\s+/g, " ");
const normaliseIsoDate = (value: unknown) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const portuguese = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return portuguese
    ? `${portuguese[3]}-${portuguese[2].padStart(2, "0")}-${portuguese[1].padStart(2, "0")}`
    : "";
};
const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const controlledPointKey = (item: {
  module: string;
  factoryId?: number | null;
  title?: string | null;
  area?: string | null;
  payload?: unknown;
}) => {
  const payload =
    item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? (item.payload as Record<string, unknown>)
      : {};
  const pointId = [
    "fragileItemId",
    "checklistItemId",
    "suggestionBoxId",
    "metalDetectorLineId",
    "temperaturePointId",
    "foodDefenseItemId",
  ]
    .map(key => payload[key])
    .find(value => typeof value === "number" || typeof value === "string");
  const pointName = [
    payload.line,
    payload.location,
    payload.equipmentName,
    payload.product,
    item.area,
    item.title,
  ].find(value => typeof value === "string" && value.trim());
  const discriminator =
    pointId !== undefined
      ? `id:${String(pointId)}`
      : `name:${normaliseSimilarTitle(String(pointName ?? "Ponto não identificado"))}`;
  return `${item.module}|${item.factoryId ?? "none"}|${discriminator}`;
};
const treatmentStatusFor = (item: {
  treatmentStatus?: string;
  generatedNonconformity?: boolean;
}): OccurrenceItem["treatmentStatus"] =>
  item.treatmentStatus === "no_nc"
    ? "no_nc"
    : item.generatedNonconformity
      ? "nc_generated"
      : "pending";
const incidenceTreatmentFrom = (value: unknown): IncidenceTreatment => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const photos = Array.isArray(record.evidencePhotos)
    ? record.evidencePhotos.filter(
        (photo): photo is IncidenceTreatment["evidencePhotos"][number] =>
          Boolean(
            photo &&
              typeof photo === "object" &&
              typeof (photo as { url?: unknown }).url === "string" &&
              typeof (photo as { key?: unknown }).key === "string"
          )
      )
    : [];
  return {
    status:
      record.status === "in_progress" || record.status === "completed"
        ? record.status
        : "pending",
    correction: typeof record.correction === "string" ? record.correction : "",
    responsible:
      typeof record.responsible === "string" ? record.responsible : "",
    dueDate: normaliseIsoDate(record.dueDate),
    completedAt: normaliseIsoDate(record.completedAt),
    notes: typeof record.notes === "string" ? record.notes : "",
    evidencePhotos: photos,
  };
};
const incidenceTreatmentHistoryFrom = (
  value: unknown
): IncidenceTreatmentHistoryEntry[] => {
  const entries = Array.isArray(value) ? value : [];
  return entries
    .map((entry, index) => {
      const record =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : {};
      const recordedAt =
        typeof record.recordedAt === "string" &&
        !Number.isNaN(new Date(record.recordedAt).getTime())
          ? record.recordedAt
          : "";
      if (!recordedAt) return null;
      return {
        ...incidenceTreatmentFrom(record),
        revision:
          typeof record.revision === "number" && record.revision > 0
            ? record.revision
            : index + 1,
        recordedAt,
        recordedByProfileId:
          typeof record.recordedByProfileId === "number"
            ? record.recordedByProfileId
            : 0,
        recordedByName:
          typeof record.recordedByName === "string" && record.recordedByName.trim()
            ? record.recordedByName
            : "Utilizador não identificado",
        recordedByTitle:
          typeof record.recordedByTitle === "string"
            ? record.recordedByTitle
            : "",
      };
    })
    .filter(
      (entry): entry is IncidenceTreatmentHistoryEntry => entry !== null
    )
    .sort((left, right) => left.revision - right.revision);
};
const bphfContextFrom = (
  module: string,
  payload: Record<string, unknown>,
  result: string
) =>
  module === "bphf"
    ? {
        collaboratorName:
          typeof payload.collaboratorName === "string" &&
          payload.collaboratorName.trim()
            ? payload.collaboratorName.trim()
            : "Não identificado",
        criterion:
          typeof payload.criterion === "string" && payload.criterion.trim()
            ? payload.criterion.trim()
            : "Não identificado",
        result,
      }
    : null;
const incidenceDetailLabels: Record<string, string> = {
  observationResult: "Resultado da verificação",
  product: "Produto",
  lot: "Lote",
  validity: "Validade",
  reason: "Motivo / observações do desvio",
  collaboratorName: "Colaborador inspecionado",
  collaboratorId: "Identificador do colaborador",
  criterion: "Critério verificado",
  area: "Área / zona",
  line: "Linha / equipamento",
  equipmentName: "Equipamento",
  location: "Localização",
  controlResult: "Resultado do controlo",
  verificationType: "Tipo de verificação",
  samplePoint: "Ponto de amostragem",
  orderNumber: "Número da encomenda",
  customer: "Cliente",
  expiry: "Validade",
};
const incidenceDetailHiddenKeys = new Set([
  "dailyIncidenceGenerated",
  "evidencePhotos",
  "photos",
  "plannedTaskId",
  "plannedDate",
  "sourceEntryId",
  "incidenceTreatment",
  "incidenceTreatmentHistory",
]);
const formatIncidenceDetailValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "Não indicado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};
const incidenceDetailsFrom = (payload: Record<string, unknown>) =>
  Object.entries(payload)
    .filter(([key, value]) => !incidenceDetailHiddenKeys.has(key) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      label: incidenceDetailLabels[key] ?? key,
      value: formatIncidenceDetailValue(value),
    }));
const treatmentLabel = (status: IncidenceTreatment["status"]) =>
  status === "completed"
    ? "Tratamento concluído"
    : status === "in_progress"
      ? "Em tratamento"
      : "Tratamento pendente";
const treatmentTone = (status: IncidenceTreatment["status"]) =>
  status === "completed"
    ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
    : status === "in_progress"
      ? "bg-sky-100 text-sky-900 hover:bg-sky-100"
      : "bg-amber-100 text-amber-900 hover:bg-amber-100";
const treatmentSummaryLabel = (status: IncidenceTreatment["status"]) =>
  status === "completed"
    ? "Concluídos"
    : status === "in_progress"
      ? "Em curso"
      : "Pendentes";
const fragileRiskForPeriodicity = (
  periodicity: FragileTreatmentReview["periodicity"]
): FragileTreatmentReview["riskLevel"] =>
  periodicity === "D" ? "3" : periodicity === "M" ? "1" : "2";
const fragileTreatmentReviewFrom = (value: unknown): FragileTreatmentReview | null => {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const source =
    payload.fragileTreatmentReview &&
    typeof payload.fragileTreatmentReview === "object" &&
    !Array.isArray(payload.fragileTreatmentReview)
      ? (payload.fragileTreatmentReview as Record<string, unknown>)
      : payload;
  if (!Number(source.itemId ?? payload.fragileItemId)) return null;
  const periodicity =
    source.periodicity === "D" ||
    source.periodicity === "S" ||
    source.periodicity === "Q" ||
    source.periodicity === "M"
      ? source.periodicity
      : "S";
  return {
    periodicity,
    riskLevel:
      source.riskLevel === "1" ||
      source.riskLevel === "2" ||
      source.riskLevel === "3"
        ? source.riskLevel
        : fragileRiskForPeriodicity(periodicity),
    rationale: typeof source.rationale === "string" ? source.rationale : "",
  };
};
const fragilePeriodicityLabel: Record<FragileTreatmentReview["periodicity"], string> = {
  D: "Diária",
  S: "Semanal",
  Q: "Quinzenal",
  M: "Mensal",
};
const fragileRiskLabel: Record<FragileTreatmentReview["riskLevel"], string> = {
  "1": "Nível 1 — baixo",
  "2": "Nível 2 — moderado",
  "3": "Nível 3 — elevado",
};

export default function Nonconformities() {
  const utils = trpc.useUtils();
  const { canManage, activeProfile } = useQualityAccess();
  const [, setLocation] = useLocation();
  const [factoryId, setFactoryId] = useState("");
  const [collaboratorId, setCollaboratorId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [occurrenceNumberDraft, setOccurrenceNumberDraft] = useState("");
  const [editingIncidence, setEditingIncidence] = useState(false);
  const [incidenceTitleDraft, setIncidenceTitleDraft] = useState("");
  const [incidenceNotesDraft, setIncidenceNotesDraft] = useState("");
  const [incidenceOccurredOnDraft, setIncidenceOccurredOnDraft] = useState("");
  const [incidenceCollaboratorIdDraft, setIncidenceCollaboratorIdDraft] = useState("none");
  const [incidencePhotosDraft, setIncidencePhotosDraft] = useState<
    OccurrenceItem["evidencePhotos"]
  >([]);
  const [editingTreatment, setEditingTreatment] = useState(false);
  const [treatmentDraft, setTreatmentDraft] = useState<IncidenceTreatment>(
    emptyIncidenceTreatment()
  );
  const [fragileTreatmentReviewDraft, setFragileTreatmentReviewDraft] =
    useState<FragileTreatmentReview>({
      periodicity: "S",
      riskLevel: "2",
      rationale: "",
    });
  const [confirmDeleteIncidence, setConfirmDeleteIncidence] = useState(false);
  const [similarFilter, setSimilarFilter] =
    useState<SimilarIncidenceFilter | null>(null);
  const [treatmentFilter, setTreatmentFilter] = useState<
    IncidenceTreatment["status"] | "all" | "follow_up_review_pending"
  >("all");
  const [openNcOnly, setOpenNcOnly] = useState(false);
  const [creatingFollowUpTask, setCreatingFollowUpTask] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDescription, setFollowUpDescription] = useState("");
  const [followUpDueDate, setFollowUpDueDate] = useState("");
  const [followUpAssigneeId, setFollowUpAssigneeId] = useState("");
  const filters = useMemo(
    () => ({
      factoryId: factoryId ? Number(factoryId) : undefined,
      collaboratorId: collaboratorId ? Number(collaboratorId) : undefined,
      startDate: startDate ? new Date(`${startDate}T12:00:00`) : undefined,
      endDate: endDate ? new Date(`${endDate}T12:00:00`) : undefined,
    }),
    [collaboratorId, endDate, factoryId, startDate]
  );
  const metadata = trpc.quality.metadata.useQuery();
  const bphfEmployees = trpc.quality.listBphfInspectionEmployees.useQuery();
  const incidences = trpc.quality.listIncidences.useQuery(filters);
  const ncs = trpc.quality.listNcs.useQuery(filters);
  const recurrenceAlerts = trpc.quality.incidenceRecurrenceAlerts.useQuery(
    undefined,
    { enabled: canManage }
  );
  const similarIncidenceAlerts = trpc.quality.similarIncidenceAlerts.useQuery(
    undefined,
    { enabled: canManage }
  );
  const invalidateIncidencePanels = () => {
    utils.quality.listIncidences.invalidate();
    utils.quality.listNcs.invalidate();
    utils.quality.incidenceRecurrenceAlerts.invalidate();
    utils.quality.similarIncidenceAlerts.invalidate();
    utils.quality.dailyIncidenceSummary?.invalidate?.();
    utils.quality.dailyIncidences?.invalidate?.();
    utils.quality.dashboard.invalidate();
    utils.quality.reports.invalidate();
  };
  const updateIncidence = trpc.quality.updateIncidence.useMutation({
    onSuccess: () => {
      invalidateIncidencePanels();
      toast.success("Estado da incidência atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteIncidence = trpc.quality.deleteIncidence.useMutation({
    onSuccess: () => {
      invalidateIncidencePanels();
      setSelectedKey("");
      setConfirmDeleteIncidence(false);
      toast.success(
        "Incidência eliminada da lista operacional. A rastreabilidade foi preservada."
      );
    },
    onError: error => toast.error(error.message),
  });
  const uploadIncidencePhoto =
    trpc.quality.uploadVerificationEvidence.useMutation({
      onError: error => toast.error(error.message),
    });

  const factoryName = (id: number | null | undefined) =>
    metadata.data?.factories.find(factory => factory.id === id)?.name ??
    "Sem fábrica/linha";
  const occurrences = useMemo<OccurrenceItem[]>(
    () =>
      [
        ...(incidences.data ?? [])
          .filter(item => {
            const payload =
              item.payload &&
              typeof item.payload === "object" &&
              !Array.isArray(item.payload)
                ? (item.payload as Record<string, unknown>)
                : {};
            const treatment = incidenceTreatmentFrom(
              (item as any).treatment ?? payload.incidenceTreatment
            );
            const hasFollowUpReviewPending = Array.isArray(
              (item as any).followUpReviewAlerts
            ) && (item as any).followUpReviewAlerts.length > 0;
            const matchesSameCollaborator = similarFilter?.collaboratorId
              ? Number(payload.collaboratorId) === similarFilter.collaboratorId
              : similarFilter?.pointKey
                ? controlledPointKey(item) === similarFilter.pointKey
                : normaliseSimilarTitle(item.title) ===
                  normaliseSimilarTitle(similarFilter?.title ?? "");
            const matchesFactory =
              Boolean(similarFilter?.collaboratorId) ||
              item.factoryId === similarFilter?.factoryId;
            const matchesSimilar =
              !similarFilter ||
              (item.result === "NC" &&
                !item.generatedNonconformity &&
                item.module === similarFilter.module &&
                matchesFactory &&
                matchesSameCollaborator);
            return (
              matchesSimilar &&
              (treatmentFilter === "all" ||
                (treatmentFilter === "follow_up_review_pending"
                  ? hasFollowUpReviewPending
                  : treatment.status === treatmentFilter))
            );
          })
          .map(item => ({
            key: `i-${item.id}`,
            type: "incidence" as const,
            id: item.id,
            title: item.title,
            description: item.notes ?? "Sem observações.",
            payload:
              item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
                ? (item.payload as Record<string, unknown>)
                : {},
            area: item.area,
            factoryId: item.factoryId,
            module: item.module,
            date: new Date(`${item.occurredOn ?? localDateKey(item.completedAt)}T12:00:00`),
            occurredOn: item.occurredOn ?? localDateKey(item.completedAt),
            registeredAt: item.completedAt,
            severity: null,
            status:
              item.treatmentStatus === "nc_generated"
                ? "linked"
                : item.treatmentStatus,
            generatedNonconformity: item.generatedNonconformity,
            treatmentStatus: treatmentStatusFor(item),
            nonconformityId: item.nonconformityId,
            occurrenceNumber: item.occurrenceNumber,
            registeredByProfileId: item.registeredByProfileId,
            registeredByName: item.registeredByName,
            registeredByTitle: item.registeredByTitle,
            evidencePhotos: Array.isArray((item.payload as any)?.evidencePhotos)
              ? (item.payload as any).evidencePhotos
              : Array.isArray((item.payload as any)?.photos)
                ? (item.payload as any).photos
                : [],
            treatment: incidenceTreatmentFrom(
              (item as any).treatment ??
                (item.payload as any)?.incidenceTreatment
            ),
            treatmentHistory: incidenceTreatmentHistoryFrom(
              (item as any).treatmentHistory ??
                (item.payload as any)?.incidenceTreatmentHistory
            ),
            followUpReviewAlerts: Array.isArray(
              (item as any).followUpReviewAlerts
            )
              ? (item as any).followUpReviewAlerts
              : [],
            fragileTreatmentReview: fragileTreatmentReviewFrom(item.payload),
            plannedTaskId:
              Number((item.payload as Record<string, unknown>)?.plannedTaskId) ||
              null,
            plannedDate:
              normaliseIsoDate(
                (item.payload as Record<string, unknown>)?.plannedDate
              ) || null,
            bphfContext: bphfContextFrom(
              item.module,
              (item.payload as Record<string, unknown>) ?? {},
              item.result ?? "NC"
            ),
            collaboratorId: Number((item.payload as Record<string, unknown>)?.collaboratorId) || null,
            collaboratorName: typeof (item.payload as Record<string, unknown>)?.collaboratorName === "string" ? (item.payload as Record<string, unknown>).collaboratorName as string : null,
            pointKey: controlledPointKey(item),
          })),
        ...(!similarFilter && (treatmentFilter !== "pending" || openNcOnly)
          ? (ncs.data ?? [])
          : []
        ).map(item => ({
          key: `n-${item.id}`,
          type: "nonconformity" as const,
          id: item.id,
          title: item.title,
          description: item.description,
          payload: {},
          area: item.area,
          factoryId: item.factoryId,
          module: item.module,
          date: item.detectedAt,
          occurredOn: localDateKey(item.detectedAt),
          registeredAt: item.detectedAt,
          severity: item.severity,
          status: item.status,
          generatedNonconformity: true,
          treatmentStatus: "nc_generated" as const,
          nonconformityId: item.id,
          occurrenceNumber: null,
          registeredByProfileId: item.reportedByProfileId,
          registeredByName: item.reportedByName,
          registeredByTitle: item.reportedByTitle,
          evidencePhotos: [],
          treatment: {
            ...emptyIncidenceTreatment(),
            status: "completed" as const,
          },
          treatmentHistory: [],
          followUpReviewAlerts: [],
          fragileTreatmentReview: null,
          plannedTaskId: null,
          plannedDate: null,
          bphfContext: null,
          collaboratorId: null,
          collaboratorName: null,
          pointKey: controlledPointKey(item),
        })),
      ]
        .filter(item =>
          !openNcOnly ||
          (item.type === "nonconformity"
            ? item.status !== "closed"
            : item.generatedNonconformity && !item.nonconformityId)
        )
        .sort(
        (left, right) =>
          new Date(right.date).getTime() - new Date(left.date).getTime()
      ),
    [incidences.data, ncs.data, openNcOnly, similarFilter, treatmentFilter]
  );
  const selected = occurrences.find(item => item.key === selectedKey) ?? null;
  const followUpTaskInput = useMemo(
    () => ({ sourceEntryId: selected?.type === "incidence" ? selected.id : 0 }),
    [selected?.id, selected?.type]
  );
  const followUpTasks =
    trpc.quality.listIncidenceFollowUpTasks?.useQuery?.(
      followUpTaskInput,
      { enabled: selected?.type === "incidence" }
    ) ?? { data: [], isLoading: false };
  const createFollowUpTask =
    trpc.quality.createIncidenceFollowUpTask?.useMutation?.({
      onSuccess: () => {
        utils.quality.listIncidenceFollowUpTasks.invalidate();
        utils.quality.listTasks.invalidate();
        setCreatingFollowUpTask(false);
        toast.success("Tarefa de seguimento criada e atribuída.");
      },
      onError: error => toast.error(error.message),
    }) ?? { mutate: () => undefined, isPending: false };
  const treatmentSummary = useMemo(() => {
    const summary: Record<IncidenceTreatment["status"], number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
    };
    const visibleIncidences = occurrences.filter(
      item => item.type === "incidence"
    );
    visibleIncidences.forEach(item => {
        summary[item.treatment.status] += 1;
    });
    return {
      ...summary,
      total: summary.pending + summary.in_progress + summary.completed,
      open: summary.pending + summary.in_progress,
      generatedNc: visibleIncidences.filter(item => item.generatedNonconformity)
        .length,
    };
  }, [occurrences]);

  useEffect(() => {
    setOccurrenceNumberDraft(selected?.occurrenceNumber ?? "");
    setIncidenceTitleDraft(selected?.title ?? "");
    setIncidenceNotesDraft(selected?.description ?? "");
    setIncidenceOccurredOnDraft(selected?.occurredOn ?? "");
    setIncidenceCollaboratorIdDraft(
      selected?.collaboratorId ? String(selected.collaboratorId) : "none"
    );
    setIncidencePhotosDraft(selected?.evidencePhotos ?? []);
    setTreatmentDraft(selected?.treatment ?? emptyIncidenceTreatment());
    setFragileTreatmentReviewDraft(
      selected?.fragileTreatmentReview ?? {
        periodicity: "S",
        riskLevel: "2",
        rationale: "",
      }
    );
    setEditingIncidence(false);
    setEditingTreatment(false);
    setConfirmDeleteIncidence(false);
  }, [selected?.key, selected?.occurrenceNumber]);

  const clearDates = () => {
    setStartDate("");
    setEndDate("");
    setTreatmentFilter("all");
    setOpenNcOnly(false);
    setSelectedKey("");
  };
  const openSimilarIncidences = (alert: SimilarIncidenceFilter) => {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    setSimilarFilter(alert);
    setFactoryId(alert.factoryId ? String(alert.factoryId) : "");
    setStartDate(since.toISOString().slice(0, 10));
    setEndDate("");
    setSelectedKey("");
  };
  const updateGeneratedState = (value: "yes" | "no") => {
    if (!selected || selected.type !== "incidence") return;
    const generatedNonconformity = value === "yes";
    updateIncidence.mutate({
      id: selected.id,
      generatedNonconformity,
      occurrenceNumber: generatedNonconformity ? occurrenceNumberDraft : "",
    });
  };
  const saveOccurrenceNumber = () => {
    if (!selected || selected.type !== "incidence") return;
    updateIncidence.mutate({
      id: selected.id,
      generatedNonconformity: true,
      occurrenceNumber: occurrenceNumberDraft,
    });
  };
  const ncStateLabel = (item: OccurrenceItem) =>
    item.treatmentStatus === "nc_generated"
      ? item.occurrenceNumber
        ? `NC gerada · n.º ${item.occurrenceNumber}`
        : "NC gerada · n.º por registar"
      : item.treatmentStatus === "no_nc"
        ? "Não gerou NC"
        : "Decisão pendente";
  const canEditSelectedIncidence = Boolean(
    selected?.type === "incidence" &&
      (canManage || selected.registeredByProfileId === activeProfile?.id)
  );
  const openOriginVerification = () => {
    if (!selected || selected.type !== "incidence") return;
    if (!MODULES.some(item => item.id === selected.module)) {
      toast.error("Esta incidência não está associada a uma verificação de controlo.");
      return;
    }
    const query = new URLSearchParams({
      plannedDate: selected.plannedDate || localDateKey(selected.date),
      entryId: String(selected.id),
      view: "results",
      ...(canEditSelectedIncidence ? { edit: "1" } : {}),
    });
    if (selected.factoryId) query.set("factoryId", String(selected.factoryId));
    if (selected.plannedTaskId)
      query.set("plannedTaskId", String(selected.plannedTaskId));
    setLocation(`/controlos/${selected.module}?${query.toString()}`);
  };
  const startFollowUpTask = () => {
    if (!selected || selected.type !== "incidence") return;
    const context = selected.bphfContext
      ? `Repetir ${selected.bphfContext.criterion.toLocaleLowerCase("pt-PT")} para ${selected.bphfContext.collaboratorName}.`
      : `Repetir a verificação: ${selected.title}.`;
    setFollowUpTitle(`Seguimento — ${selected.title}`.slice(0, 180));
    setFollowUpDescription(`${context} Incidência registada em ${dateFormat(selected.date, false)}.`);
    setFollowUpDueDate("");
    setFollowUpAssigneeId("");
    setCreatingFollowUpTask(true);
  };
  const addIncidencePhoto = async (file?: File) => {
    if (!file || !selected || selected.type !== "incidence") return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return toast.error("Selecione uma imagem JPG, PNG ou WEBP.");
    if (file.size > 5_000_000)
      return toast.error("A fotografia deve ter no máximo 5 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Não foi possível ler a fotografia."));
      reader.readAsDataURL(file);
    });
    uploadIncidencePhoto.mutate(
      {
        module: selected.module as any,
        factoryId: selected.factoryId ?? undefined,
        fileName: file.name,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        dataUrl,
      },
      {
        onSuccess: photo => {
          setIncidencePhotosDraft(current => [...current, photo]);
          toast.success(
            "Fotografia adicionada. Guarde a incidência para concluir."
          );
        },
      }
    );
  };
  const addTreatmentPhoto = async (file?: File) => {
    if (!file || !selected || selected.type !== "incidence") return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return toast.error("Selecione uma imagem JPG, PNG ou WEBP.");
    if (file.size > 5_000_000)
      return toast.error("A fotografia deve ter no máximo 5 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Não foi possível ler a fotografia."));
      reader.readAsDataURL(file);
    });
    uploadIncidencePhoto.mutate(
      {
        module: selected.module as any,
        factoryId: selected.factoryId ?? undefined,
        fileName: file.name,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        dataUrl,
      },
      {
        onSuccess: photo => {
          setTreatmentDraft(current => ({
            ...current,
            evidencePhotos: [...current.evidencePhotos, photo],
          }));
          toast.success(
            "Fotografia adicionada ao tratamento. Guarde para concluir."
          );
        },
      }
    );
  };

  return (
    <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-red-700">
              Registo e tratamento transversal
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Incidências
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe incidências registadas nos controlos, a decisão sobre a
              geração de NC e as Não Conformidades formalmente abertas.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-center gap-2">
                <Factory className="h-4 w-4 text-red-700" />
                <Select
                  value={factoryId || "all"}
                  onValueChange={value => {
                    setFactoryId(value === "all" ? "" : value);
                    setSelectedKey("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      Todas as fábricas e linhas
                    </SelectItem>
                    {(metadata.data?.factories ?? []).map(factory => (
                      <SelectItem key={factory.id} value={String(factory.id)}>
                        {factory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Colaborador</Label>
                <Select
                  value={collaboratorId || "all"}
                  onValueChange={value => {
                    setCollaboratorId(value === "all" ? "" : value);
                    setSelectedKey("");
                  }}
                >
                  <SelectTrigger aria-label="Filtrar incidências por colaborador responsável">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os colaboradores</SelectItem>
                    {(bphfEmployees.data ?? []).map(collaborator => (
                      <SelectItem key={collaborator.id} value={String(collaborator.id)}>
                        {collaborator.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Data inicial</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={event => {
                    setStartDate(event.target.value);
                    if (endDate && event.target.value > endDate)
                      setEndDate(event.target.value);
                    setSelectedKey("");
                  }}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Data final</Label>
                <Input
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={event => {
                    setEndDate(event.target.value);
                    setSelectedKey("");
                  }}
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={clearDates}>
                Limpar intervalo de datas
              </Button>
              <Button
                variant={openNcOnly ? "default" : "outline"}
                size="sm"
                aria-pressed={openNcOnly}
                onClick={() => {
                  setOpenNcOnly(current => !current);
                  setSelectedKey("");
                }}
              >
                {openNcOnly
                  ? "A mostrar NC abertas"
                  : "Mostrar apenas NC abertas"}
              </Button>
            </div>
          </div>
          <OfflineIncidencePanel variant="header" />
        </header>
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Resumo das incidências</CardTitle>
              <CardDescription>
                Tratamentos, incidências abertas e NC geradas nos resultados visíveis.
              </CardDescription>
            </div>
            <Select
              value={treatmentFilter}
              onValueChange={value => {
                setTreatmentFilter(
                  value as
                    | IncidenceTreatment["status"]
                    | "all"
                    | "follow_up_review_pending"
                );
                setSelectedKey("");
              }}
            >
              <SelectTrigger
                aria-label="Filtrar incidências por estado de tratamento"
                className="w-full bg-white sm:w-64"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todos os tratamentos
                </SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="in_progress">Em curso</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="follow_up_review_pending">
                  Revisão de tratamento pendente
                </SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent aria-label="Resumo gráfico dos tratamentos" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {(["pending", "in_progress", "completed"] as const).map(status => (
                <div
                  key={status}
                  className={`rounded-xl border p-3 ${
                    status === "completed"
                      ? "border-emerald-200 bg-emerald-50"
                      : status === "in_progress"
                        ? "border-sky-200 bg-sky-50"
                        : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                    {treatmentSummaryLabel(status)}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">
                    {treatmentSummary[status]}
                  </p>
                </div>
              ))}
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  Incidências abertas
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {treatmentSummary.open}
                </p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  NC geradas
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {treatmentSummary.generatedNc}
                </p>
              </div>
            </div>
            <div
              className="flex h-3 overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`Gráfico de tratamentos: ${treatmentSummary.pending} pendentes, ${treatmentSummary.in_progress} em curso e ${treatmentSummary.completed} concluídos`}
            >
              {treatmentSummary.total ? (
                <>
                  <span
                    className="bg-amber-400"
                    style={{ width: `${(treatmentSummary.pending / treatmentSummary.total) * 100}%` }}
                  />
                  <span
                    className="bg-sky-500"
                    style={{ width: `${(treatmentSummary.in_progress / treatmentSummary.total) * 100}%` }}
                  />
                  <span
                    className="bg-emerald-500"
                    style={{ width: `${(treatmentSummary.completed / treatmentSummary.total) * 100}%` }}
                  />
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
        {!canManage &&
        canEditSelectedIncidence &&
        selected?.type === "incidence" ? (
          <Card className="border border-teal-200 bg-teal-50/60">
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="font-medium text-teal-950">
                  Editar a incidência registada por si
                </p>
                <p className="mt-1 text-sm text-teal-800">
                  Pode corrigir o título, as observações e juntar fotografias. A
                  decisão sobre abertura de NC permanece a cargo da Responsável
                  de Qualidade.
                </p>
              </div>
              {editingIncidence ? (
                <div className="space-y-3">
                  <Input
                    aria-label="Data em que a incidência ocorreu"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={incidenceOccurredOnDraft}
                    onChange={event =>
                      setIncidenceOccurredOnDraft(event.target.value)
                    }
                  />
                  <Input
                    aria-label="Título da incidência"
                    value={incidenceTitleDraft}
                    onChange={event =>
                      setIncidenceTitleDraft(event.target.value)
                    }
                  />
                  <div className="space-y-1">
                    <Label>Colaborador responsável</Label>
                    <Select
                      value={incidenceCollaboratorIdDraft}
                      onValueChange={setIncidenceCollaboratorIdDraft}
                    >
                      <SelectTrigger aria-label="Colaborador responsável pela incidência">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não aplicável</SelectItem>
                        {(bphfEmployees.data ?? []).map(collaborator => (
                          <SelectItem key={collaborator.id} value={String(collaborator.id)}>
                            {collaborator.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    aria-label="Observações da incidência"
                    value={incidenceNotesDraft}
                    onChange={event =>
                      setIncidenceNotesDraft(event.target.value)
                    }
                    rows={4}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="incidence-photo">
                      Fotografias de evidência
                    </Label>
                    <Input
                      id="incidence-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event =>
                        addIncidencePhoto(event.target.files?.[0])
                      }
                      disabled={uploadIncidencePhoto.isPending}
                    />
                    {incidencePhotosDraft.length ? (
                      <div className="flex flex-wrap gap-2">
                        {incidencePhotosDraft.map((photo, index) => (
                          <div
                            key={`${photo.url}-${index}`}
                            className="relative"
                          >
                            <img
                              src={photo.url}
                              alt={photo.fileName}
                              className="h-16 w-16 rounded-lg border border-teal-200 object-cover"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="absolute -right-2 -top-2 h-5 w-5"
                              aria-label={`Remover ${photo.fileName}`}
                              onClick={() =>
                                setIncidencePhotosDraft(current =>
                                  current.filter(
                                    (_, photoIndex) => photoIndex !== index
                                  )
                                )
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        updateIncidence.mutate(
                          {
                            id: selected.id,
                            title: incidenceTitleDraft,
                            notes: incidenceNotesDraft,
                            occurredOn: incidenceOccurredOnDraft,
                            collaboratorId:
                              incidenceCollaboratorIdDraft === "none"
                                ? null
                                : Number(incidenceCollaboratorIdDraft),
                            evidencePhotos: incidencePhotosDraft,
                          },
                          {
                            onSuccess: () => {
                              invalidateIncidencePanels();
                              setEditingIncidence(false);
                              toast.success("Incidência atualizada.");
                            },
                          }
                        )
                      }
                      disabled={
                        updateIncidence.isPending ||
                        uploadIncidencePhoto.isPending
                      }
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Guardar alterações
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingIncidence(false);
                        setIncidencePhotosDraft(selected.evidencePhotos);
                        setIncidenceOccurredOnDraft(selected.occurredOn);
                        setIncidenceCollaboratorIdDraft(
                          selected.collaboratorId
                            ? String(selected.collaboratorId)
                            : "none"
                        );
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingIncidence(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar a minha incidência
                </Button>
              )}
            </CardContent>
          </Card>
        ) : null}
        {canManage && recurrenceAlerts.data?.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">
                  Avaliação de Não Conformidade recomendada
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  Os colaboradores abaixo acumularam pelo menos 3 incidências
                  ainda sem NC gerada nos últimos 6 meses.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recurrenceAlerts.data.map(alert => (
                    <Badge
                      key={alert.collaboratorId}
                      className="bg-amber-200 text-amber-950 hover:bg-amber-200"
                    >
                      {alert.collaboratorName} · {alert.total} incidências
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {canManage && similarIncidenceAlerts.data?.length ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
              <div>
                <p className="font-semibold">Abertura de NC obrigatória</p>
                <p className="mt-1 text-sm text-red-900">
                  Foram registadas 3 ou mais incidências NC no mesmo ponto de
                  controlo identificado, ainda sem NC associada, nos últimos 6
                  meses. Nos controlos BPHF, a repetição é calculada pelo
                  colaborador inspecionado. Incidências registadas sem controlo
                  associado são tratadas individualmente e não são somadas neste
                  alerta.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {similarIncidenceAlerts.data.map(alert => (
                    <Button
                      key={`${alert.module}-${alert.factoryId}-${alert.collaboratorId ?? alert.title}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-red-200 bg-red-100 text-red-950 hover:bg-red-200"
                      onClick={() =>
                        openSimilarIncidences({
                          title: alert.title,
                          module: alert.module,
                          factoryId: alert.factoryId,
                          pointKey: alert.pointKey,
                          collaboratorId: alert.collaboratorId,
                          collaboratorName: alert.collaboratorName,
                          total: alert.total,
                        })
                      }
                      aria-label={`Abrir as ${alert.total} incidências semelhantes: ${alert.title}, ${alert.factoryName}`}
                    >
                      {alert.total} × {alert.title} · {alert.factoryName}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {similarFilter ? (
          <div
            className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p>
              A visualizar as{" "}
              <strong>{similarFilter.total} incidências no mesmo ponto</strong>
              {similarFilter.collaboratorName ? (
                <>
                  {" "}
                  do colaborador inspecionado «{similarFilter.collaboratorName}»
                </>
              ) : (
                <> de «{similarFilter.title}»</>
              )}{" "}
              sem NC associada, nos últimos seis meses.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-red-200 bg-white text-red-900 hover:bg-red-100"
              onClick={() => {
                setSimilarFilter(null);
                setSelectedKey("");
              }}
            >
              Limpar acesso direto
            </Button>
          </div>
        ) : null}
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-0 panel-shadow">
            <CardHeader className="border-b border-slate-100">
              <CardTitle>Lista de Incidências</CardTitle>
              <CardDescription>
                O estado de geração de NC é apresentado em cada incidência,
                respeitando os filtros selecionados.
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[680px] space-y-3 overflow-auto p-4">
              {incidences.isLoading || ncs.isLoading ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : occurrences.length ? (
                occurrences.map(item => (
                  <button
                    onClick={() => {
                      setSelectedKey(item.key);
                      setDetailsExpanded(true);
                    }}
                    key={item.key}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedKey === item.key ? "border-teal-400 bg-teal-50" : "border-slate-100 bg-white hover:border-slate-300"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">
                            {item.title}
                          </p>
                          {item.type === "incidence" &&
                          item.followUpReviewAlerts.length ? (
                            <span
                              role="img"
                              aria-label="Aviso: revisão do tratamento pendente"
                              title="Revisão do tratamento pendente"
                              className="inline-flex text-red-600"
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </span>
                          ) : null}
                          <Badge
                            className={
                              item.type === "incidence"
                                ? "bg-amber-100 text-amber-900 hover:bg-amber-100"
                                : "bg-red-100 text-red-900 hover:bg-red-100"
                            }
                          >
                            {item.type === "incidence"
                              ? "Incidência"
                              : "Não Conformidade"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {factoryName(item.factoryId)} ·{" "}
                          {moduleLabel(item.module)} · {item.area}
                        </p>
                        {item.type === "incidence" ? (
                          <>
                            <p className="mt-2 text-xs text-slate-600">
                              Decisão de NC: {ncStateLabel(item)}
                            </p>
                            <Badge className={`mt-2 ${treatmentTone(item.treatment.status)}`}>
                              {treatmentLabel(item.treatment.status)}
                            </Badge>
                            {item.followUpReviewAlerts.length ? (
                              <Badge className="mt-2 bg-amber-200 text-amber-950 hover:bg-amber-200">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                {item.followUpReviewAlerts.length === 1
                                  ? "1 seguimento a rever"
                                  : `${item.followUpReviewAlerts.length} seguimentos a rever`}
                              </Badge>
                            ) : null}
                            <p className="mt-2 text-xs text-slate-600">
                              Registada por:{" "}
                              <span className="font-medium">
                                {item.registeredByName ??
                                  "Utilizador não identificado"}
                              </span>
                              {item.registeredByTitle
                                ? ` · ${item.registeredByTitle}`
                                : ""}
                            </p>
                          </>
                        ) : null}
                      </div>
                      {item.severity ? (
                        <SeverityBadge value={item.severity as any} />
                      ) : (
                        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{item.type === "incidence" ? "Ocorrida em " : "Registada em "}{dateFormat(item.date)}</span>
                      {item.type === "nonconformity" && (
                        <StatusBadge value={item.status as any} />
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-xl bg-emerald-50 p-8 text-center text-sm text-emerald-800">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6" />
                  Sem incidências para os filtros selecionados.
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-0 panel-shadow">
            <CardHeader className="border-b border-slate-100">
              <CardTitle>
                {selected
                  ? selected.type === "incidence"
                    ? "Detalhe da incidência"
                    : "Detalhe da Não Conformidade"
                  : "Selecione uma Incidência"}
              </CardTitle>
              <CardDescription>
                {selected
                  ? "Consulte o registo e indique claramente se originou uma Não Conformidade."
                  : "A lista reúne incidências e Não Conformidades no intervalo escolhido."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {selected ? (
                <div className="space-y-5">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          selected.type === "incidence"
                            ? "bg-amber-100 text-amber-900 hover:bg-amber-100"
                            : "bg-red-100 text-red-900 hover:bg-red-100"
                        }
                      >
                        {selected.type === "incidence"
                          ? "Incidência"
                          : "Não Conformidade"}
                      </Badge>
                      {selected.severity && (
                        <SeverityBadge value={selected.severity as any} />
                      )}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {selected.description}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {factoryName(selected.factoryId)} · {selected.area} ·{" "}
                      {selected.type === "incidence" ? `Ocorrida em ${dateFormat(selected.date)}` : dateFormat(selected.date)}
                    </p>
                    {selected.type === "incidence" && (
                      <p className="mt-2 text-xs text-slate-600">
                        Registada em {dateFormat(selected.registeredAt)} por:{" "}
                        <span className="font-medium">
                          {selected.registeredByName ??
                            "Utilizador não identificado"}
                        </span>
                        {selected.registeredByTitle
                          ? ` · ${selected.registeredByTitle}`
                          : ""}
                      </p>
                    )}
                  </div>
                  {selected.type === "incidence" && selected.bphfContext ? (
                    <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                      <p className="text-sm font-semibold text-teal-950">
                        Contexto da verificação BPHF
                      </p>
                      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-xs font-medium text-teal-700">
                            Colaborador inspecionado
                          </dt>
                          <dd className="mt-1 font-medium text-slate-900">
                            {selected.bphfContext.collaboratorName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-teal-700">
                            Área/Zona e critério
                          </dt>
                          <dd className="mt-1 text-slate-900">
                            {selected.area} · {selected.bphfContext.criterion}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-teal-700">
                            Resultado
                          </dt>
                          <dd className="mt-1 font-medium text-red-800">
                            {selected.bphfContext.result === "NC"
                              ? "Não conforme"
                              : selected.bphfContext.result}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-xs text-teal-900">
                        Observações: {selected.description}
                      </p>
                    </div>
                  ) : null}
                  {selected.type === "incidence" &&
                  selected.module === "sensory" &&
                  selected.collaboratorName ? (
                    <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-4">
                      <p className="text-sm font-semibold text-violet-950">
                        Contexto do controlo sensorial
                      </p>
                      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-violet-700">
                            Colaborador responsável pelo produto
                          </dt>
                          <dd className="mt-1 font-medium text-slate-900">
                            {selected.collaboratorName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-violet-700">
                            Produto e lote
                          </dt>
                          <dd className="mt-1 text-slate-900">
                            {typeof selected.payload.product === "string"
                              ? selected.payload.product
                              : "Produto não identificado"}
                            {typeof selected.payload.lot === "string" &&
                            selected.payload.lot
                              ? ` · ${selected.payload.lot}`
                              : ""}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                  {selected.type === "incidence" &&
                  incidenceDetailsFrom(selected.payload).length ? (
                    <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-amber-950">
                            Detalhes da verificação e do desvio
                          </p>
                          <p className="mt-1 text-xs text-amber-900">
                            Informação registada no momento em que a incidência foi detetada.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-white text-amber-900 hover:bg-white">
                            {moduleLabel(selected.module)}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                            aria-expanded={detailsExpanded}
                            aria-controls="incidence-verification-details"
                            onClick={() => setDetailsExpanded(current => !current)}
                          >
                            {detailsExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            {detailsExpanded ? "Minimizar detalhes" : "Mostrar detalhes"}
                          </Button>
                        </div>
                      </div>
                      {detailsExpanded && (
                        <dl id="incidence-verification-details" className="mt-4 grid gap-3 sm:grid-cols-2">
                          {incidenceDetailsFrom(selected.payload).map(detail => (
                            <div key={detail.key} className="rounded-lg border border-amber-100 bg-white/80 p-3">
                              <dt className="text-xs font-medium text-amber-800">{detail.label}</dt>
                              <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{detail.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </section>
                  ) : null}
                  {selected.type === "incidence" &&
                  selected.evidencePhotos.length ? (
                    <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
                      <div className="flex items-center gap-2">
                        <ImagePlus className="h-4 w-4 text-teal-700" />
                        <p className="text-sm font-medium text-teal-950">
                          Fotografias de evidência
                        </p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {selected.evidencePhotos.map((photo, index) => (
                          <a
                            key={`${photo.url}-${index}`}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="overflow-hidden rounded-lg border border-teal-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                          >
                            <img
                              src={photo.url}
                              alt={`Evidência da incidência: ${photo.fileName}`}
                              className="h-28 w-full object-cover"
                            />
                            <p className="truncate px-2 py-1 text-xs text-slate-600">
                              {photo.fileName}
                            </p>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selected.type === "incidence" ? (
                    <>
                      <div className="space-y-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
                        <div>
                          <p className="font-medium text-amber-950">
                            Decisão sobre a incidência
                          </p>
                          <p className="mt-1 text-sm text-amber-900">
                            Indique se esta incidência gerou uma Não
                            Conformidade e, quando aplicável, registe o número
                            de ocorrência atribuído no sistema externo.
                          </p>
                        </div>
                        {canManage && (
                          <div className="space-y-2">
                            <Label>
                              Esta incidência gerou uma Não Conformidade?
                            </Label>
                            <Select
                              value={
                                selected.generatedNonconformity ? "yes" : "no"
                              }
                              onValueChange={value =>
                                updateGeneratedState(value as "yes" | "no")
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no">Não gerou NC</SelectItem>
                                <SelectItem value="yes">Gerou NC</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {selected.generatedNonconformity ? (
                          <div className="space-y-3 rounded-lg border border-emerald-200 bg-white/70 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                              <CheckCircle2 className="h-4 w-4" />
                              Não Conformidade gerada
                              {selected.nonconformityId
                                ? ` · registo interno #${selected.nonconformityId}`
                                : ""}
                            </div>
                            {canManage && (
                              <div className="space-y-2">
                                <Label>N.º de ocorrência</Label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <Input
                                    value={occurrenceNumberDraft}
                                    onChange={event =>
                                      setOccurrenceNumberDraft(
                                        event.target.value
                                      )
                                    }
                                    placeholder="Ex.: 2026-014"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={saveOccurrenceNumber}
                                    disabled={updateIncidence.isPending}
                                  >
                                    <Save className="mr-2 h-4 w-4" />
                                    Guardar número
                                  </Button>
                                </div>
                              </div>
                            )}
                            <Button asChild>
                              <a
                                href={EXTERNAL_NONCONFORMITY_URL}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Abrir gestão de Não Conformidades
                              </a>
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-slate-200 bg-white/70 p-3 text-sm text-slate-700">
                            Não foi gerada uma Não Conformidade para esta
                            incidência.
                          </div>
                        )}
                      </div>
                      <div className="space-y-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-teal-950">
                              Tratamento da incidência
                            </p>
                            <p className="mt-1 text-sm text-teal-900">
                              Registe a correção e acompanhe o respetivo fecho,
                              mesmo que a incidência não gere uma Não
                              Conformidade.
                            </p>
                          </div>
                          <Badge
                            className={treatmentTone(selected.treatment.status)}
                          >
                            {treatmentLabel(selected.treatment.status)}
                          </Badge>
                        </div>
                        {selected.treatmentHistory.length ? (
                          <section className="rounded-lg border border-teal-200 bg-white/75 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-teal-950">
                                  Histórico do tratamento
                                </p>
                                <p className="mt-0.5 text-xs text-teal-800">
                                  Cada edição guardada mantém a data, o tipo de tratamento e as pessoas envolvidas.
                                </p>
                              </div>
                              <Badge className="bg-teal-100 text-teal-900 hover:bg-teal-100">
                                {selected.treatmentHistory.length} {selected.treatmentHistory.length === 1 ? "edição" : "edições"}
                              </Badge>
                            </div>
                            <ol className="mt-3 space-y-2">
                              {[...selected.treatmentHistory]
                                .reverse()
                                .map(history => (
                                  <li
                                    key={`${history.revision}-${history.recordedAt}`}
                                    className="rounded-md border border-slate-200 bg-slate-50 p-3"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-700">
                                          Edição {history.revision}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          Tipo de tratamento:
                                        </span>
                                        <Badge className={treatmentTone(history.status)}>
                                          {treatmentLabel(history.status)}
                                        </Badge>
                                      </div>
                                      <time
                                        dateTime={history.recordedAt}
                                        className="text-xs text-slate-500"
                                      >
                                        Registado em {new Date(history.recordedAt).toLocaleString("pt-PT", {
                                          timeZone: "Europe/Lisbon",
                                        })}
                                      </time>
                                    </div>
                                    <div className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                                      <p>
                                        <span className="font-medium text-teal-800">
                                          Responsável pelo tratamento:
                                        </span>{" "}
                                        {history.responsible || "Não indicado"}
                                      </p>
                                      <p>
                                        <span className="font-medium text-teal-800">
                                          Registado por:
                                        </span>{" "}
                                        {history.recordedByName}
                                        {history.recordedByTitle
                                          ? ` · ${history.recordedByTitle}`
                                          : ""}
                                      </p>
                                    </div>
                                    {(history.correction || history.notes) && (
                                      <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                                        {history.correction || history.notes}
                                      </p>
                                    )}
                                  </li>
                                ))}
                            </ol>
                          </section>
                        ) : null}
                        {selected.followUpReviewAlerts.length ? (
                          <div
                            className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                            role="alert"
                          >
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                              <div>
                                <p className="font-semibold">
                                  Revisão do tratamento necessária
                                </p>
                                <p className="mt-1 text-xs text-amber-900">
                                  Um seguimento associado foi concluído. Reveja e
                                  guarde o tratamento desta incidência para confirmar
                                  a decisão tomada.
                                </p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {selected.followUpReviewAlerts.map(alert => (
                                <div
                                  key={alert.followUpTaskId}
                                  className="rounded-md border border-amber-200 bg-white/70 p-2 text-xs"
                                >
                                  <p className="font-medium">{alert.title}</p>
                                  <p className="mt-1">
                                    Resultado: <strong>{alert.result}</strong> · {new Date(alert.completedAt).toLocaleString("pt-PT")}
                                  </p>
                                  <p>
                                    Registado por {alert.registeredByName} · {alert.registeredByTitle}
                                  </p>
                                  <p className="mt-1 text-amber-900">
                                    {alert.notes}
                                  </p>
                                </div>
                              ))}
                            </div>
                            {canManage ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                                onClick={() => setEditingTreatment(true)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Rever tratamento
                              </Button>
                            ) : (
                              <p className="text-xs text-amber-900">
                                A Responsável de Qualidade deve rever o tratamento.
                              </p>
                            )}
                          </div>
                        ) : null}
                        {editingTreatment ? (
                          <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label>Estado do tratamento</Label>
                                <Select
                                  value={treatmentDraft.status}
                                  onValueChange={value =>
                                    setTreatmentDraft(current => ({
                                      ...current,
                                      status:
                                        value as IncidenceTreatment["status"],
                                    }))
                                  }
                                >
                                  <SelectTrigger aria-label="Estado do tratamento">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">
                                      Tratamento pendente
                                    </SelectItem>
                                    <SelectItem value="in_progress">
                                      Em tratamento
                                    </SelectItem>
                                    <SelectItem value="completed">
                                      Tratamento concluído
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Responsável pelo tratamento</Label>
                                <Input
                                  aria-label="Responsável pelo tratamento"
                                  value={treatmentDraft.responsible}
                                  onChange={event =>
                                    setTreatmentDraft(current => ({
                                      ...current,
                                      responsible: event.target.value,
                                    }))
                                  }
                                  placeholder="Nome do responsável"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Prazo</Label>
                                <Input
                                  aria-label="Prazo do tratamento"
                                  type="date"
                                  value={treatmentDraft.dueDate}
                                  onChange={event =>
                                    setTreatmentDraft(current => ({
                                      ...current,
                                      dueDate: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Data de conclusão</Label>
                                <Input
                                  aria-label="Data de conclusão do tratamento"
                                  type="date"
                                  value={treatmentDraft.completedAt}
                                  onChange={event =>
                                    setTreatmentDraft(current => ({
                                      ...current,
                                      completedAt: event.target.value,
                                    }))
                                  }
                                  disabled={
                                    treatmentDraft.status !== "completed"
                                  }
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Correção / tratamento efetuado</Label>
                              <Textarea
                                aria-label="Correção ou tratamento efetuado"
                                value={treatmentDraft.correction}
                                onChange={event =>
                                  setTreatmentDraft(current => ({
                                    ...current,
                                    correction: event.target.value,
                                  }))
                                }
                                rows={3}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Observações de tratamento</Label>
                              <Textarea
                                aria-label="Observações de tratamento"
                                value={treatmentDraft.notes}
                                onChange={event =>
                                  setTreatmentDraft(current => ({
                                    ...current,
                                    notes: event.target.value,
                                  }))
                                }
                                rows={3}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="incidence-treatment-photo">
                                Evidências do tratamento
                              </Label>
                              <Input
                                id="incidence-treatment-photo"
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={event =>
                                  addTreatmentPhoto(event.target.files?.[0])
                                }
                                disabled={uploadIncidencePhoto.isPending}
                              />
                              {treatmentDraft.evidencePhotos.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {treatmentDraft.evidencePhotos.map(
                                    (photo, index) => (
                                      <div
                                        key={`${photo.url}-${index}`}
                                        className="relative"
                                      >
                                        <img
                                          src={photo.url}
                                          alt={photo.fileName}
                                          className="h-16 w-16 rounded-lg border border-teal-200 object-cover"
                                        />
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="destructive"
                                          className="absolute -right-2 -top-2 h-5 w-5"
                                          aria-label={`Remover ${photo.fileName} do tratamento`}
                                          onClick={() =>
                                            setTreatmentDraft(current => ({
                                              ...current,
                                              evidencePhotos:
                                                current.evidencePhotos.filter(
                                                  (_, photoIndex) =>
                                                    photoIndex !== index
                                                ),
                                            }))
                                          }
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateIncidence.mutate(
                                    {
                                      id: selected.id,
                                      treatment: {
                                        ...treatmentDraft,
                                        dueDate: normaliseIsoDate(
                                          treatmentDraft.dueDate
                                        ),
                                        completedAt: normaliseIsoDate(
                                          treatmentDraft.completedAt
                                        ),
                                      },
                                    },
                                    {
                                      onSuccess: () => {
                                        invalidateIncidencePanels();
                                        setEditingTreatment(false);
                                        toast.success(
                                          "Tratamento da incidência guardado."
                                        );
                                      },
                                    }
                                  )
                                }
                                disabled={
                                  updateIncidence.isPending ||
                                  uploadIncidencePhoto.isPending
                                }
                              >
                                <Save className="mr-2 h-4 w-4" />
                                Guardar tratamento
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setTreatmentDraft(selected.treatment);
                                  setEditingTreatment(false);
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 text-sm text-slate-700">
                            <p>
                              {selected.treatment.correction ||
                                "Ainda não foi registada uma correção para esta incidência."}
                            </p>
                            {selected.treatment.responsible ||
                            selected.treatment.dueDate ||
                            selected.treatment.completedAt ? (
                              <div className="grid gap-2 text-xs sm:grid-cols-3">
                                <p>
                                  <span className="font-medium text-teal-800">
                                    Responsável:
                                  </span>{" "}
                                  {selected.treatment.responsible || "—"}
                                </p>
                                <p>
                                  <span className="font-medium text-teal-800">
                                    Prazo:
                                  </span>{" "}
                                  {selected.treatment.dueDate || "—"}
                                </p>
                                <p>
                                  <span className="font-medium text-teal-800">
                                    Conclusão:
                                  </span>{" "}
                                  {selected.treatment.completedAt || "—"}
                                </p>
                              </div>
                            ) : null}
                            {selected.treatment.notes ? (
                              <p className="rounded-lg bg-white/70 p-3 text-xs text-slate-700">
                                {selected.treatment.notes}
                              </p>
                            ) : null}
                            {selected.treatment.evidencePhotos.length ? (
                              <div className="grid grid-cols-3 gap-2">
                                {selected.treatment.evidencePhotos.map(
                                  photo => (
                                    <a
                                      key={photo.url}
                                      href={photo.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="overflow-hidden rounded-lg border border-teal-200"
                                    >
                                      <img
                                        src={photo.url}
                                        alt={`Evidência do tratamento: ${photo.fileName}`}
                                        className="h-20 w-full object-cover"
                                      />
                                    </a>
                                  )
                                )}
                              </div>
                            ) : null}
                            {canEditSelectedIncidence ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingTreatment(true)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                {selected.treatment.status === "pending"
                                  ? "Iniciar tratamento"
                                  : "Atualizar tratamento"}
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                      {selected.type === "incidence" ? (
                        <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                          <div>
                            <p className="font-medium text-sky-950">
                              Verificação que originou a incidência
                            </p>
                            <p className="mt-1 text-sm text-sky-900">
                              Consulte o registo original. Ao corrigi-lo para Conforme,
                              esta incidência deixa de estar ativa e os seguimentos ainda
                              pendentes são cancelados.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100"
                            onClick={openOriginVerification}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {canEditSelectedIncidence
                              ? "Ver / editar verificação de origem"
                              : "Consultar verificação de origem"}
                          </Button>
                        </section>
                      ) : null}
                      {selected.type === "incidence" ? (
                        <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium text-violet-950">
                                Tarefas de seguimento
                              </p>
                              <p className="mt-1 text-sm text-violet-900">
                                A Responsável pode atribuir uma nova verificação a partir
                                desta incidência, mantendo o ponto e o colaborador de
                                origem no contexto da tarefa.
                              </p>
                            </div>
                            {canManage && !creatingFollowUpTask ? (
                              <Button type="button" size="sm" onClick={startFollowUpTask}>
                                <Plus className="mr-2 h-4 w-4" />
                                Criar tarefa de seguimento
                              </Button>
                            ) : null}
                          </div>
                          {followUpTasks.isLoading ? (
                            <p className="text-sm text-violet-800">A carregar tarefas associadas…</p>
                          ) : followUpTasks.data?.length ? (
                            <div className="space-y-2">
                              {followUpTasks.data.map(task => (
                                <div key={task.id} className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm text-slate-800">
                                  <p className="font-medium">{task.title}</p>
                                  <p className="mt-1 text-xs text-slate-600">
                                    {task.responsible} · {dateFormat(task.dueAt, false)} · {task.status === "pending" ? "Por realizar" : task.status === "completed" ? "Concluída" : "Cancelada"}
                                  </p>
                                  {task.executionReport ? (
                                    <div className="mt-2 rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-950">
                                      <p className="font-semibold">
                                        Nova verificação: {task.executionReport.result === "C" ? "Conforme" : "Não conforme"}
                                      </p>
                                      <p className="mt-1 whitespace-pre-wrap">
                                        {task.executionReport.notes}
                                      </p>
                                      <p className="mt-1 text-emerald-800">
                                        Registado por {task.executionReport.registeredByName ?? task.responsible}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-violet-800">Ainda não existem tarefas de seguimento associadas.</p>
                          )}
                          {canManage && creatingFollowUpTask ? (
                            <form
                              className="space-y-3 rounded-lg border border-violet-200 bg-white p-3"
                              onSubmit={event => {
                                event.preventDefault();
                                if (!followUpAssigneeId)
                                  return toast.error("Selecione a técnica responsável.");
                                if (!followUpDueDate)
                                  return toast.error("Indique a data da tarefa de seguimento.");
                                createFollowUpTask.mutate({
                                  sourceEntryId: selected.id,
                                  title: followUpTitle,
                                  description: followUpDescription,
                                  dueAt: new Date(`${followUpDueDate}T12:00:00`),
                                  assigneeProfileIds: [Number(followUpAssigneeId)],
                                });
                              }}
                            >
                              <div className="space-y-2">
                                <Label htmlFor="follow-up-title">Tarefa de seguimento</Label>
                                <Input id="follow-up-title" value={followUpTitle} onChange={event => setFollowUpTitle(event.target.value)} required />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="follow-up-description">Instrução para a técnica</Label>
                                <Textarea id="follow-up-description" value={followUpDescription} onChange={event => setFollowUpDescription(event.target.value)} rows={3} required />
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor="follow-up-date">Data de execução</Label>
                                  <Input id="follow-up-date" type="date" value={followUpDueDate} onChange={event => setFollowUpDueDate(event.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                  <Label>Técnica responsável</Label>
                                  <Select value={followUpAssigneeId || "unassigned"} onValueChange={value => setFollowUpAssigneeId(value === "unassigned" ? "" : value)}>
                                    <SelectTrigger aria-label="Técnica responsável pela tarefa de seguimento"><SelectValue placeholder="Selecionar técnica" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">Selecionar técnica</SelectItem>
                                      {(metadata.data?.collaborators ?? []).filter(profile => profile.title !== "Resp. Qualidade").map(profile => <SelectItem key={profile.id} value={String(profile.id)}>{profile.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button type="submit" size="sm" disabled={createFollowUpTask.isPending}>
                                  <Save className="mr-2 h-4 w-4" />
                                  {createFollowUpTask.isPending ? "A criar…" : "Criar e atribuir tarefa"}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setCreatingFollowUpTask(false)}>Cancelar</Button>
                              </div>
                            </form>
                          ) : null}
                        </section>
                      ) : null}
                      {canManage && selected.module === "fragile_items" && selected.fragileTreatmentReview ? (
                        <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
                          <div>
                            <p className="font-medium text-red-950">
                              Decisão sobre o ponto de Quebráveis
                            </p>
                            <p className="mt-1 text-sm text-red-900">
                              Reavalie o risco de contaminação física e a periodicidade de acompanhamento. Esta decisão atualiza o ponto de controlo e fica registada nesta incidência.
                            </p>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Categoria de risco</Label>
                              <Select
                                value={fragileTreatmentReviewDraft.riskLevel}
                                onValueChange={value => {
                                  const riskLevel = value as FragileTreatmentReview["riskLevel"];
                                  setFragileTreatmentReviewDraft(current => ({
                                    ...current,
                                    riskLevel,
                                    periodicity:
                                      riskLevel === "3"
                                        ? "D"
                                        : riskLevel === "1"
                                          ? "M"
                                          : current.periodicity === "D" || current.periodicity === "M"
                                            ? "S"
                                            : current.periodicity,
                                  }));
                                }}
                              >
                                <SelectTrigger aria-label="Categoria de risco do ponto de Quebráveis">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(fragileRiskLabel).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Periodicidade de acompanhamento</Label>
                              <Select
                                value={fragileTreatmentReviewDraft.periodicity}
                                onValueChange={value =>
                                  setFragileTreatmentReviewDraft(current => ({
                                    ...current,
                                    periodicity: value as FragileTreatmentReview["periodicity"],
                                  }))
                                }
                              >
                                <SelectTrigger aria-label="Periodicidade de acompanhamento do ponto de Quebráveis">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(fragilePeriodicityLabel).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Justificação da reavaliação</Label>
                            <Textarea
                              aria-label="Justificação da reavaliação de Quebráveis"
                              value={fragileTreatmentReviewDraft.rationale}
                              onChange={event =>
                                setFragileTreatmentReviewDraft(current => ({
                                  ...current,
                                  rationale: event.target.value,
                                }))
                              }
                              placeholder="Descreva o risco de contaminação física e a razão da nova frequência."
                              rows={3}
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              updateIncidence.mutate({
                                id: selected.id,
                                fragileTreatmentReview: fragileTreatmentReviewDraft,
                              })
                            }
                            disabled={updateIncidence.isPending}
                          >
                            <Save className="mr-2 h-4 w-4" />
                            Aplicar decisão ao ponto
                          </Button>
                        </div>
                      ) : null}
                      {canManage && (
                        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                          <p className="text-sm font-medium text-slate-900">
                            Gestão pela Responsável de Qualidade
                          </p>
                          {editingIncidence ? (
                            <div className="space-y-3">
                              <Input
                                aria-label="Data em que a incidência ocorreu"
                                type="date"
                                max={new Date().toISOString().slice(0, 10)}
                                value={incidenceOccurredOnDraft}
                                onChange={event =>
                                  setIncidenceOccurredOnDraft(event.target.value)
                                }
                              />
                              <Input
                                value={incidenceTitleDraft}
                                onChange={event =>
                                  setIncidenceTitleDraft(event.target.value)
                                }
                              />
                              <div className="space-y-1">
                                <Label>Colaborador responsável</Label>
                                <Select
                                  value={incidenceCollaboratorIdDraft}
                                  onValueChange={setIncidenceCollaboratorIdDraft}
                                >
                                  <SelectTrigger aria-label="Colaborador responsável pela incidência">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Não aplicável</SelectItem>
                                    {(bphfEmployees.data ?? []).map(collaborator => (
                                      <SelectItem key={collaborator.id} value={String(collaborator.id)}>
                                        {collaborator.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Textarea
                                value={incidenceNotesDraft}
                                onChange={event =>
                                  setIncidenceNotesDraft(event.target.value)
                                }
                                rows={4}
                              />
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    updateIncidence.mutate(
                                      {
                                        id: selected.id,
                                        title: incidenceTitleDraft,
                                        notes: incidenceNotesDraft,
                                        occurredOn: incidenceOccurredOnDraft,
                                        collaboratorId:
                                          incidenceCollaboratorIdDraft === "none"
                                            ? null
                                            : Number(incidenceCollaboratorIdDraft),
                                      },
                                      {
                                        onSuccess: () => {
                                          utils.quality.listIncidences.invalidate();
                                          setEditingIncidence(false);
                                          toast.success(
                                            "Incidência atualizada."
                                          );
                                        },
                                      }
                                    )
                                  }
                                  disabled={updateIncidence.isPending}
                                >
                                  <Save className="mr-2 h-4 w-4" />
                                  Guardar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingIncidence(false);
                                    setIncidenceOccurredOnDraft(selected.occurredOn);
                                    setIncidenceCollaboratorIdDraft(
                                      selected.collaboratorId
                                        ? String(selected.collaboratorId)
                                        : "none"
                                    );
                                  }}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingIncidence(true)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar incidência
                              </Button>
                              {confirmDeleteIncidence ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() =>
                                    deleteIncidence.mutate({ id: selected.id })
                                  }
                                  disabled={deleteIncidence.isPending}
                                >
                                  {deleteIncidence.isPending
                                    ? "A eliminar…"
                                    : "Confirmar eliminação"}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-red-200 text-red-700"
                                  onClick={() =>
                                    setConfirmDeleteIncidence(true)
                                  }
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar incidência
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-900">
                      <p className="font-medium">
                        Registo formal de Não Conformidade
                      </p>
                      <p className="mt-1">
                        O tratamento, ações corretivas, evidências e validação
                        de eficácia continuam associados a este registo.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-80 flex-col items-center justify-center text-center text-muted-foreground">
                  <FileWarning className="mb-3 h-8 w-8" />
                  <p className="font-medium">Selecione uma Incidência</p>
                  <p className="mt-1 text-sm">
                    Aqui poderá consultar se gerou uma Não Conformidade e
                    registar o respetivo número de ocorrência.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
