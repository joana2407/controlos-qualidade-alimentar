import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogHeading,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OperatorAttribution } from "@/components/quality/OperatorAttribution";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { dateFormat, moduleLabel, MODULES } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  BarChart3,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileWarning,
  History,
  Pencil,
  RotateCcw,
  Search,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Link } from "wouter";
import "./reports-redesign.css";

type DetailRow = { label: string; value: string };
type ReportDetailFilterKey =
  | "inspectedCollaborator"
  | "verificationType"
  | "line"
  | "productName"
  | "lot"
  | "validity"
  | "customer"
  | "samplePoint"
  | "category"
  | "test"
  | "equipment"
  | "location"
  | "state"
  | "periodicity"
  | "analyst"
  | "deliveryNote"
  | "triage";
type ReportDetailFilter = {
  key: ReportDetailFilterKey;
  label: string;
  placeholder: string;
};

const REPORT_DETAIL_FILTERS: Record<string, ReportDetailFilter[]> = {
  bphf: [
    {
      key: "verificationType",
      label: "Ponto / tipo de verificação",
      placeholder: "Critério BPHF",
    },
  ],
  metal_detectors: [
    { key: "line", label: "Linha", placeholder: "Ex.: Linha 1" },
    { key: "productName", label: "Produto", placeholder: "Nome do produto" },
    { key: "lot", label: "Lote", placeholder: "Lote do produto" },
  ],
  sensory: [
    { key: "productName", label: "Produto", placeholder: "Nome do produto" },
    { key: "lot", label: "Lote", placeholder: "Lote do produto" },
    { key: "validity", label: "Validade", placeholder: "AAAA-MM-DD" },
  ],
  shelf_life: [
    { key: "productName", label: "Produto", placeholder: "Nome do produto" },
    { key: "lot", label: "Lote", placeholder: "Lote da amostra" },
    { key: "validity", label: "Validade", placeholder: "AAAA-MM-DD" },
    {
      key: "verificationType",
      label: "Tipo de verificação",
      placeholder: "Ex.: observação da amostra",
    },
  ],
  monthly_checklist: [
    {
      key: "verificationType",
      label: "Ponto de verificação",
      placeholder: "Nome do ponto",
    },
  ],
  suggestion_boxes: [
    {
      key: "location",
      label: "Localização",
      placeholder: "Caixa / localização",
    },
    { key: "triage", label: "Triagem", placeholder: "Estado da triagem" },
  ],
  fragile_items: [
    {
      key: "verificationType",
      label: "Ponto / tipo de verificação",
      placeholder: "Nome do ponto",
    },
    {
      key: "periodicity",
      label: "Periodicidade",
      placeholder: "Diária, semanal…",
    },
    { key: "state", label: "Estado", placeholder: "Íntegro, danificado…" },
  ],
  dispatch_control: [
    { key: "productName", label: "Produto", placeholder: "Nome do produto" },
    { key: "lot", label: "Lote", placeholder: "Lote expedido" },
    { key: "customer", label: "Cliente", placeholder: "Nome do cliente" },
    {
      key: "deliveryNote",
      label: "Guia de transporte",
      placeholder: "N.º da guia",
    },
    {
      key: "verificationType",
      label: "Tipo de expedição",
      placeholder: "Ambiente ou congelado",
    },
  ],
  internal_analysis: [
    { key: "productName", label: "Produto", placeholder: "Produto analisado" },
    { key: "lot", label: "Lote", placeholder: "Lote analisado" },
    {
      key: "customer",
      label: "Cliente",
      placeholder: "Cliente / identificação",
    },
    {
      key: "samplePoint",
      label: "Ponto de amostragem",
      placeholder: "Ponto de amostragem",
    },
    {
      key: "category",
      label: "Categoria",
      placeholder: "Categoria do alergénio",
    },
    { key: "test", label: "Teste", placeholder: "Tipo de teste" },
    { key: "analyst", label: "Analista", placeholder: "Nome do analista" },
  ],
  temperature_controls: [
    {
      key: "equipment",
      label: "Equipamento",
      placeholder: "Nome do equipamento",
    },
    {
      key: "line",
      label: "Linha / localização",
      placeholder: "Linha ou localização",
    },
  ],
  food_defense: [
    {
      key: "verificationType",
      label: "Ponto de verificação",
      placeholder: "Critério avaliado",
    },
    { key: "category", label: "Categoria / secção", placeholder: "Categoria" },
    { key: "periodicity", label: "Periodicidade", placeholder: "Anual" },
  ],
};

const INTERNAL_DETAIL_FIELDS = new Set([
  "key",
  "url",
  "mimeType",
  "collaboratorId",
  "analystProfileId",
  "fileName",
  "checklistItemId",
  "actualVerificationDate",
  "plannedDate",
  "plannedTaskId",
  "registeredAgainstPreviousPlan",
  "plannedAt",
  "taskId",
  "retroactiveJustification",
  "editHistory",
  "offlineManualIncidence",
  "offlineQueuedAt",
  "offlineSyncId",
  "offlineSyncStatus",
  "syncStatus",
  "syncAttempt",
  "clientRequestId",
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  const translated = {
    positive: "Positivo",
    negative: "Negativo",
    conform: "Conforme",
    nonconform: "Não conforme",
    open: "Aberta",
    in_progress: "Em tratamento",
    awaiting_validation: "A aguardar validação",
    closed: "Fechada",
    pending: "Pendente",
    completed: "Concluída",
    ambiente: "Ambiente",
    congelado: "Congelado",
  }[String(value).toLowerCase()];
  return translated ?? String(value);
}

function humanLabel(value: string): string {
  const translated = {
    collaboratorId: "Identificador do colaborador",
    collaboratorName: "Colaborador inspecionado",
    criterion: "Critério verificado",
    criterioLimpeza: "Critério de limpeza",
    observacao: "Observação",
    analyst: "Analista",
    analystProfileId: "Identificador do analista",
    category: "Categoria",
    photos: "Fotografias",
    samples: "Amostras",
    controlResult: "Resultado do controlo",
    fileName: "Nome do ficheiro",
    mimeType: "Tipo de ficheiro",
    samplePoint: "Ponto de amostragem",
    product: "Produto",
    lot: "Lote",
    result: "Resultado",
    label: "Designação",
    test: "Teste",
    profileLabel: "Perfil",
    temperatureLimits: "Limites de temperatura",
    sourceOrderDocument: "Documento da encomenda",
    orderNumber: "N.º da encomenda",
    customer: "Cliente",
    deliveryNote: "Guia de transporte",
    observations: "Observações",
    evidencePhotos: "Fotografias de evidência",
    occurredOn: "Data de ocorrência",
    registeredAheadOfPlannedDate: "Controlo antecipado",
  }[value];
  return (
    translated ??
    value
      .replace(/([A-Z])/g, " $1")
      .replace(/[._]/g, " ")
      .replace(/^./, letter => letter.toUpperCase())
  );
}

function flattenPayload(value: unknown, prefix = ""): DetailRow[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      flattenPayload(item, `${prefix}${prefix ? " · " : ""}${index + 1}`)
    );
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) => {
        if (INTERNAL_DETAIL_FIELDS.has(key)) return [];
        if (["photos", "evidencePhotos"].includes(key) && Array.isArray(item))
          return item.length
            ? [
                {
                  label: humanLabel(key),
                  value: `${item.length} fotografia${item.length === 1 ? "" : "s"} anexada${item.length === 1 ? "" : "s"}`,
                },
              ]
            : [];
        return flattenPayload(
          item,
          `${prefix}${prefix ? " · " : ""}${humanLabel(key)}`
        );
      }
    );
  return [{ label: prefix || "Dados registados", value: displayValue(value) }];
}

function ResultBadge({ value }: { value: string | null | undefined }) {
  const className =
    value === "NC"
      ? "bg-red-600 text-white hover:bg-red-600"
      : value === "C"
        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
        : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  return <Badge className={className}>{value ?? "—"}</Badge>;
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  tone: "teal" | "amber" | "red";
}) {
  const colors = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  }[tone];
  return (
    <Card className="border-0 panel-shadow">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-xl p-3 ${colors}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-mono-ui mt-1 text-3xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailList({ payload }: { payload: unknown }) {
  const details = flattenPayload(asRecord(payload));
  if (!details.length)
    return (
      <p className="text-sm text-muted-foreground">
        Sem campos adicionais registados.
      </p>
    );
  return (
    <dl className="grid gap-x-5 gap-y-2 text-sm md:grid-cols-2">
      {details.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-2 border-b border-slate-100 py-2"
        >
          <dt className="font-medium text-slate-600">{item.label}</dt>
          <dd className="break-words text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function internalAnalysisProductSummary(entry: any) {
  if (entry.module !== "internal_analysis") return [];
  const payload = asRecord(entry.payload);
  const samples = Array.isArray(payload.samples) ? payload.samples : [];
  return samples
    .map(sample => {
      const record = asRecord(sample);
      const parts = [
        typeof record.product === "string" && record.product.trim()
          ? `Produto: ${record.product}`
          : null,
        typeof record.lot === "string" && record.lot.trim()
          ? `Lote: ${record.lot}`
          : null,
        typeof record.client === "string" && record.client.trim()
          ? `Cliente: ${record.client}`
          : null,
        typeof record.ppm === "number" ||
        (typeof record.ppm === "string" && record.ppm.trim())
          ? `Resultado: ${record.ppm}`
          : null,
      ].filter((part): part is string => Boolean(part));
      return parts.length ? parts.join(" · ") : null;
    })
    .filter((summary): summary is string => Boolean(summary));
}

function RetroactiveTraceability({ payload }: { payload: unknown }) {
  const record = asRecord(payload);
  const justification = asRecord(record.retroactiveJustification);
  if (typeof justification.label !== "string") return null;
  const plannedDate =
    typeof record.plannedDate === "string" ? record.plannedDate : null;
  const performedDate =
    typeof record.actualVerificationDate === "string"
      ? record.actualVerificationDate
      : null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="text-sm font-semibold text-amber-950">
        Rastreabilidade de preenchimento retroativo
      </p>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-amber-800">Data operacional prevista</p>
          <p className="mt-1 font-medium text-amber-950">
            {plannedDate ? dateFormat(plannedDate, false) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-amber-800">Data de realização</p>
          <p className="mt-1 font-medium text-amber-950">
            {performedDate
              ? dateFormat(`${performedDate}T12:00:00`, false)
              : "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-amber-800">Justificação</p>
          <p className="mt-1 font-medium text-amber-950">
            {justification.label}
          </p>
          {typeof justification.details === "string" &&
          justification.details.trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-amber-950">
              {justification.details}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EvidenceGallery({ payload }: { payload: unknown }) {
  const record = asRecord(payload);
  const nested = asRecord(record.executionReport);
  const candidates = [
    ...(Array.isArray(record.evidencePhotos) ? record.evidencePhotos : []),
    ...(Array.isArray(nested.evidencePhotos) ? nested.evidencePhotos : []),
  ];
  const photos = candidates.flatMap(item => {
    const photo = asRecord(item);
    return typeof photo.url === "string"
      ? [
          {
            url: photo.url,
            name:
              typeof photo.fileName === "string"
                ? photo.fileName
                : "Evidência fotográfica",
          },
        ]
      : [];
  });
  if (!photos.length) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Fotografias de evidência</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <a
            key={`${photo.url}-${index}`}
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-xl border border-slate-100 bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <img
              src={photo.url}
              alt={`Evidência ${index + 1}: ${photo.name}`}
              className="h-28 w-full object-cover transition-transform group-hover:scale-[1.03]"
            />
            <span className="block truncate px-2 py-1.5 text-xs text-slate-600">
              {photo.name}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  factoryName,
  onDetail,
  canModify,
  onEdit,
  onDelete,
}: {
  entry: any;
  factoryName: (id: number | null | undefined) => string;
  onDetail: (entry: any) => void;
  canModify: boolean;
  onEdit: (entry: any) => void;
  onDelete: (entry: any) => void;
}) {
  const productSummaries = internalAnalysisProductSummary(entry);
  return (
    <article className="px-6 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-950">{entry.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {moduleLabel(entry.module)} · {factoryName(entry.factoryId)} ·{" "}
            {entry.area} · {dateFormat(entry.completedAt)}
          </p>
          {productSummaries.length ? (
            <div className="mt-2 space-y-1">
              {productSummaries.map((summary, index) => (
                <p
                  key={`${entry.id}-product-${index}`}
                  className="text-sm text-slate-700"
                >
                  {summary}
                </p>
              ))}
            </div>
          ) : null}
          <OperatorAttribution
            name={entry.registeredByName}
            title={entry.registeredByTitle}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ResultBadge value={entry.result} />
          <Button size="sm" variant="outline" onClick={() => onDetail(entry)}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            Abrir detalhe
          </Button>
          {canModify && (
            <>
              <Button
                size="icon"
                variant="outline"
                aria-label={`Editar registo ${entry.title}`}
                onClick={() => onEdit(entry)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                aria-label={`Eliminar registo ${entry.title}`}
                onClick={() => onDelete(entry)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function downloadFullWorkbook(
  entries: any[],
  incidences: any[],
  factoryName: (id: number | null | undefined) => string,
  filters: Record<string, string>
) {
  const workbook = XLSX.utils.book_new();
  const rowForEntry = (entry: any, type: string) => ({
    Tipo: type,
    "Data de ocorrência":
      type === "Incidência" && entry.occurredOn
        ? dateFormat(`${entry.occurredOn}T12:00:00`)
        : dateFormat(entry.completedAt),
    "Data de registo": dateFormat(entry.completedAt),
    "Fábrica / linha": factoryName(entry.factoryId),
    Controlo: moduleLabel(entry.module),
    Área: entry.area,
    Resultado: entry.result ?? "",
    Título: entry.title,
    "Registado por": entry.registeredByName ?? "",
    Função: entry.registeredByTitle ?? "",
    Observações: entry.notes ?? "",
    ...Object.fromEntries(
      flattenPayload(asRecord(entry.payload)).map(detail => [
        `Detalhe · ${detail.label}`,
        detail.value,
      ])
    ),
  });
  const summaryRows = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([label, value]) => ({ Filtro: label, Valor: value }));
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      summaryRows.length
        ? summaryRows
        : [{ Filtro: "Filtros", Valor: "Sem filtros adicionais" }]
    ),
    "Filtros"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      entries.map(entry => rowForEntry(entry, "Controlo"))
    ),
    "Controlos"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      incidences.map(entry => rowForEntry(entry, "Incidência"))
    ),
    "Incidências"
  );
  XLSX.writeFile(workbook, "relatorio-operacional-filtrado.xlsx", {
    compression: true,
  });
}

function downloadArchivedWorkbook(archive: any) {
  const snapshot = asRecord(archive.snapshot);
  const plannedTasks = Array.isArray(snapshot.plannedTasks)
    ? snapshot.plannedTasks
    : [];
  const controlEntries = Array.isArray(snapshot.controlEntries)
    ? snapshot.controlEntries
    : [];
  const incidences = Array.isArray(snapshot.incidences)
    ? snapshot.incidences
    : [];
  const dailyNotes = Array.isArray(snapshot.dailyNotes)
    ? snapshot.dailyNotes
    : [];
  const workbook = XLSX.utils.book_new();
  const operationalDate = archive.operationalDate
    ? new Date(archive.operationalDate)
    : new Date();
  const rowForEntry = (entry: any) => ({
    "Data de ocorrência": asRecord(entry.payload).occurredOn
      ? dateFormat(`${String(asRecord(entry.payload).occurredOn)}T12:00:00`)
      : entry.completedAt
        ? dateFormat(entry.completedAt)
        : "",
    "Data de registo": entry.completedAt ? dateFormat(entry.completedAt) : "",
    Controlo: moduleLabel(entry.module ?? "not_applicable"),
    "Fábrica / linha": entry.factoryName ?? entry.factory ?? "",
    Área: entry.area ?? "",
    Resultado: entry.result ?? "",
    Título: entry.title ?? "",
    "Registado por": entry.registeredByName ?? "",
    Função: entry.registeredByTitle ?? "",
    Observações: entry.notes ?? "",
    ...Object.fromEntries(
      flattenPayload(asRecord(entry.payload)).map(detail => [
        `Detalhe · ${detail.label}`,
        detail.value,
      ])
    ),
  });
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "Data operacional": dateFormat(operationalDate, false),
        Versão: `V${archive.revision}`,
        Tipo:
          archive.archiveKind === "initial"
            ? "Arquivo diário inicial"
            : "Revisão retroativa",
        "Criado em": archive.createdAt ? dateFormat(archive.createdAt) : "",
        "Criado por": archive.createdBy ?? "",
        "Motivo da revisão": archive.revisionReason ?? "",
        "Tarefas planeadas": plannedTasks.length,
        Controlos: controlEntries.length,
        Incidências: incidences.length,
        Anotações: dailyNotes.length,
      },
    ]),
    "Resumo da versão"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      plannedTasks.map((task: any) => ({
        Controlo: moduleLabel(task.module ?? "not_applicable"),
        "Fábrica / linha": task.factoryName ?? task.factory ?? "",
        Responsável: task.responsible ?? task.assignedToName ?? "",
        Estado: displayValue(task.status ?? "pending"),
        Data: task.dueAt ? dateFormat(task.dueAt) : "",
      }))
    ),
    "Tarefas planeadas"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(controlEntries.map(rowForEntry)),
    "Controlos"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(incidences.map(rowForEntry)),
    "Incidências"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      dailyNotes.map((note: any) => ({
        Anotação: note.note ?? "",
        "Atualizada por": note.updatedByName ?? note.createdBy ?? "",
        Data: note.updatedAt ? dateFormat(note.updatedAt) : "",
      }))
    ),
    "Anotações"
  );
  const dateForFile = operationalDate.toISOString().slice(0, 10);
  XLSX.writeFile(
    workbook,
    `arquivo-diario-${dateForFile}-V${archive.revision}.xlsx`,
    { compression: true }
  );
}

function backupDownloadFrom(result: unknown, operationalDate: string) {
  const response = asRecord(result);
  const backup = asRecord(response.backup);
  const archive = asRecord(response.archive);
  const backupArchive = asRecord(backup.archive);
  const url = [
    backup.url,
    backupArchive.backupFileUrl,
    archive.backupFileUrl,
  ].find(value => typeof value === "string" && value.trim()) as
    | string
    | undefined;
  const key = [
    backup.key,
    backupArchive.backupFileKey,
    archive.backupFileKey,
  ].find(value => typeof value === "string" && value.trim()) as
    | string
    | undefined;
  return url
    ? {
        url,
        fileName:
          key?.split("/").at(-1) ?? `relatorio-diario-${operationalDate}.xlsx`,
        operationalDate,
      }
    : null;
}

function ArchiveExcelExport({
  archives,
  selectedId,
  onSelected,
  detail,
}: {
  archives: any[];
  selectedId: number | null;
  onSelected: (id: number) => void;
  detail: any;
}) {
  if (!archives.length) return null;
  return (
    <Card className="border border-teal-200 bg-teal-50/60">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-medium text-teal-950">
            Exportar uma versão arquivada
          </p>
          <p className="mt-1 text-sm text-teal-800">
            Gere um ficheiro Excel com o snapshot imutável da versão
            selecionada.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-64 space-y-1">
            <label className="text-xs font-medium text-teal-950">
              Versão a exportar
            </label>
            <Select
              value={selectedId ? String(selectedId) : ""}
              onValueChange={value => onSelected(Number(value))}
            >
              <SelectTrigger aria-label="Versão arquivada a exportar para Excel">
                <SelectValue placeholder="Selecione uma versão" />
              </SelectTrigger>
              <SelectContent>
                {archives.map(archive => (
                  <SelectItem key={archive.id} value={String(archive.id)}>
                    {dateFormat(archive.operationalDate, false)} · V
                    {archive.revision}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => detail.data && downloadArchivedWorkbook(detail.data)}
            disabled={!detail.data || detail.isLoading}
          >
            <Download className="mr-2 h-4 w-4" />
            {detail.isLoading ? "A preparar…" : "Exportar versão Excel"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { activeProfile, canManage } = useQualityAccess();
  const utils = trpc.useUtils();
  const archiveHistory =
    trpc.quality.dailyReportArchiveHistory?.useQuery?.() ?? {
      data: [],
      isLoading: false,
    };
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | null>(
    () =>
      Number(new URLSearchParams(window.location.search).get("archiveId")) ||
      null
  );
  const archiveDetail = trpc.quality.dailyReportArchiveDetail?.useQuery?.(
    { id: selectedArchiveId ?? 0 },
    { enabled: Boolean(selectedArchiveId) }
  ) ?? { data: null, isLoading: false };
  const [archiveExportId, setArchiveExportId] = useState<number | null>(null);
  const [manualBackupDownload, setManualBackupDownload] = useState<{
    url: string;
    fileName: string;
    operationalDate: string;
  } | null>(null);
  const archiveExportDetail = trpc.quality.dailyReportArchiveDetail?.useQuery?.(
    { id: archiveExportId ?? 0 },
    { enabled: Boolean(archiveExportId) }
  ) ?? { data: null, isLoading: false };
  const markArchiveViewed =
    trpc.quality.markDailyReportArchiveViewed?.useMutation?.({
      onSuccess: () => {
        utils.quality.dailyReportArchiveAttention?.invalidate();
      },
    }) ?? { mutate: () => undefined };
  const today = new Date().toISOString().slice(0, 10);
  const [factoryId, setFactoryId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [result, setResult] = useState("");
  const [ncStatus, setNcStatus] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [detailSearch, setDetailSearch] = useState("");
  const [detailFilters, setDetailFilters] = useState<
    Partial<Record<ReportDetailFilterKey, string>>
  >({});
  const [collaboratorProfileId, setCollaboratorProfileId] = useState("");
  const [inspectedCollaboratorId, setInspectedCollaboratorId] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const selectedFragileItemId = useMemo(() => {
    const payload = asRecord(selectedEntry?.payload);
    return selectedEntry?.module === "fragile_items" &&
      typeof payload.fragileItemId === "number"
      ? payload.fragileItemId
      : 0;
  }, [selectedEntry]);
  const fragileHistoryInput = useMemo(
    () => ({ itemId: selectedFragileItemId }),
    [selectedFragileItemId]
  );
  const fragileHistory = trpc.quality.fragileInspectionHistory?.useQuery?.(
    fragileHistoryInput,
    { enabled: Boolean(selectedFragileItemId) }
  ) ?? { data: [], isLoading: false };
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [deletingEntry, setDeletingEntry] = useState<any>(null);
  const metadata = trpc.quality.metadata.useQuery();
  const bphfEmployees =
    trpc.quality.listBphfInspectionEmployees?.useQuery?.() ?? { data: [] };
  const module = selectedModules.length === 1 ? selectedModules[0] : "";
  const setModule = (value: string) => {
    setDetailFilters({});
    setDetailSearch("");
    if (!value || value === "all") {
      setSelectedModules([]);
      return;
    }
    setSelectedModules(current => {
      const next = current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value];
      toast.message(
        next.length
          ? `${next.length} controlo${next.length === 1 ? "" : "s"} selecionado${next.length === 1 ? "" : "s"}.`
          : "Nenhum controlo selecionado; serão considerados todos."
      );
      return next;
    });
  };
  const selectedInspectedCollaborator =
    bphfEmployees.data?.find(
      collaborator => String(collaborator.id) === inspectedCollaboratorId
    )?.name ?? "";
  const queryInput = useMemo(
    () => ({
      factoryId: factoryId ? Number(factoryId) : undefined,
      startDate: startDate ? new Date(`${startDate}T12:00:00`) : undefined,
      endDate: endDate ? new Date(`${endDate}T12:00:00`) : undefined,
      modules: selectedModules.length
        ? (selectedModules as (typeof MODULES)[number]["id"][])
        : undefined,
      result: result ? (result as "C" | "NC" | "N/A") : undefined,
      ncStatus: ncStatus
        ? (ncStatus as
            | "open"
            | "in_progress"
            | "awaiting_validation"
            | "closed")
        : undefined,
      orderNumber: orderNumber || undefined,
      detailSearch: detailSearch || undefined,
      inspectedCollaborator:
        selectedInspectedCollaborator ||
        detailFilters.inspectedCollaborator ||
        undefined,
      verificationType: detailFilters.verificationType || undefined,
      line: detailFilters.line || undefined,
      productName: detailFilters.productName || undefined,
      lot: detailFilters.lot || undefined,
      validity: detailFilters.validity || undefined,
      customer: detailFilters.customer || undefined,
      samplePoint: detailFilters.samplePoint || undefined,
      category: detailFilters.category || undefined,
      test: detailFilters.test || undefined,
      equipment: detailFilters.equipment || undefined,
      location: detailFilters.location || undefined,
      state: detailFilters.state || undefined,
      periodicity: detailFilters.periodicity || undefined,
      analyst: detailFilters.analyst || undefined,
      deliveryNote: detailFilters.deliveryNote || undefined,
      triage: detailFilters.triage || undefined,
      collaboratorProfileId: collaboratorProfileId
        ? Number(collaboratorProfileId)
        : undefined,
    }),
    [
      collaboratorProfileId,
      detailFilters,
      detailSearch,
      endDate,
      factoryId,
      ncStatus,
      orderNumber,
      result,
      selectedInspectedCollaborator,
      selectedModules,
      startDate,
    ]
  );
  const reports = trpc.quality.reports.useQuery(queryInput);
  const createManualArchive =
    trpc.quality.createManualDailyReportArchive?.useMutation?.({
      onSuccess: archive => {
        utils.quality.dailyReportArchiveHistory?.invalidate();
        const download = backupDownloadFrom(archive, startDate);
        setManualBackupDownload(download);
        toast.success(
          download
            ? archive.created
              ? "Backup diário guardado e pronto a descarregar."
              : "O backup diário já existia e está pronto a descarregar."
            : "Arquivo diário guardado. O ficheiro Excel será disponibilizado no histórico."
        );
      },
      onError: error => toast.error(error.message),
    }) ?? { mutate: () => undefined, isPending: false };
  const updateControlEntry = trpc.quality.updateControlEntry.useMutation({
    onSuccess: () => {
      utils.quality.reports.invalidate();
      setEditingEntry(null);
      toast.success("Registo de controlo atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteControlEntry = trpc.quality.deleteControlEntry.useMutation({
    onSuccess: () => {
      utils.quality.reports.invalidate();
      setSelectedEntry(null);
      setDeletingEntry(null);
      toast.success("Registo de controlo eliminado.");
    },
    onError: error => toast.error(error.message),
  });
  const data = reports.data;
  const entries = data?.filteredEntries ?? [];
  const incidences = entries.filter(entry => entry.result === "NC");
  const selectedFactory =
    metadata.data?.factories.find(factory => String(factory.id) === factoryId)
      ?.name ?? "Todas as fábricas e linhas";
  const maxTrend = Math.max(
    ...(data?.trends.map(item => item.entries) ?? [1]),
    1
  );
  const factoryName = (id: number | null | undefined) =>
    metadata.data?.factories.find(factory => factory.id === id)?.name ??
    (id ? `Fábrica / linha ${id}` : "Controlo comum");
  const selectedCollaborator =
    metadata.data?.collaborators?.find(
      collaborator => String(collaborator.id) === collaboratorProfileId
    )?.name ?? "Todos os colaboradores";
  const archiveSnapshot = asRecord(archiveDetail.data?.snapshot);
  const archivedTasks = Array.isArray(archiveSnapshot.plannedTasks)
    ? archiveSnapshot.plannedTasks
    : [];
  const archivedEntries = Array.isArray(archiveSnapshot.controlEntries)
    ? archiveSnapshot.controlEntries
    : [];
  const archivedIncidences = Array.isArray(archiveSnapshot.incidences)
    ? archiveSnapshot.incidences
    : [];
  const archivedNotes = Array.isArray(archiveSnapshot.dailyNotes)
    ? archiveSnapshot.dailyNotes
    : [];
  const canModifyEntry = (entry: any) =>
    canManage ||
    entry.registeredByProfileId === activeProfile?.id ||
    (!entry.registeredByProfileId &&
      entry.registeredByName === activeProfile?.name);
  const openArchive = (archiveId: number) => {
    setSelectedArchiveId(archiveId);
    markArchiveViewed.mutate({ archiveId });
  };
  const beginEdit = (entry: any) =>
    setEditingEntry({
      ...entry,
      title: entry.title ?? "",
      area: entry.area ?? "",
      result: entry.result ?? "C",
      notes: entry.notes ?? "",
      collaboratorId:
        Number.isInteger(Number(entry.payload?.collaboratorId)) &&
        Number(entry.payload?.collaboratorId) > 0
          ? Number(entry.payload?.collaboratorId)
          : null,
    });
  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingEntry) return;
    updateControlEntry.mutate({
      id: editingEntry.id,
      title: editingEntry.title,
      area: editingEntry.area,
      result: editingEntry.result,
      notes: editingEntry.notes,
      collaboratorId:
        editingEntry.module === "bphf"
          ? editingEntry.collaboratorId ?? null
          : undefined,
    });
  };
  const resetFilters = () => {
    setFactoryId("");
    setStartDate(today);
    setEndDate(today);
    setSelectedModules([]);
    setControlsOpen(false);
    setResult("");
    setNcStatus("");
    setOrderNumber("");
    setDetailSearch("");
    setDetailFilters({});
    setCollaboratorProfileId("");
    setInspectedCollaboratorId("");
  };
  const updateDetailFilter = (key: ReportDetailFilterKey, value: string) =>
    setDetailFilters(current => ({ ...current, [key]: value }));
  const saveManualDailyBackup = () => {
    if (!startDate || startDate !== endDate) {
      toast.error(
        "Para guardar um backup diário, selecione apenas uma data no período."
      );
      return;
    }
    createManualArchive.mutate({ operationalDate: startDate });
  };
  const filterLabels = {
    "Data inicial": startDate,
    "Data final": endDate,
    "Fábrica / linha": selectedFactory,
    "Téc. responsável pelo preenchimento": selectedCollaborator,
    Colaborador: selectedInspectedCollaborator || "Todos os colaboradores",
    Controlo: selectedModules.length
      ? selectedModules.map(item => moduleLabel(item)).join(", ")
      : "Todos os controlos",
    Resultado: result || "Todos os resultados",
    "Estado da NC": ncStatus || "Todos os estados",
    Encomenda: orderNumber,
    "Pesquisa detalhada": detailSearch,
    ...Object.fromEntries(
      Object.entries(detailFilters).map(([key, value]) => [
        REPORT_DETAIL_FILTERS[module]?.find(field => field.key === key)
          ?.label ?? key,
        value,
      ])
    ),
  };

  return (
    <div className="reports-redesign app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6">
      <section className="mx-auto max-w-7xl space-y-8">
        <ArchiveExcelExport
          archives={archiveHistory.data ?? []}
          selectedId={archiveExportId}
          onSelected={setArchiveExportId}
          detail={archiveExportDetail}
        />
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-teal-700">
              Consulta operacional
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Relatórios
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Um único conjunto de filtros controla controlos, incidências,
              indicadores e a exportação Excel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button
                variant="outline"
                onClick={saveManualDailyBackup}
                disabled={
                  !startDate ||
                  startDate !== endDate ||
                  createManualArchive.isPending
                }
                title={
                  startDate !== endDate
                    ? "Selecione apenas uma data para guardar um backup diário."
                    : undefined
                }
              >
                <Archive className="mr-2 h-4 w-4" />
                {createManualArchive.isPending
                  ? "A guardar…"
                  : "Guardar backup diário"}
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/backups-diarios">
                <Archive className="mr-2 h-4 w-4" />
                Ver backups guardados
              </Link>
            </Button>
            <Button
              onClick={() =>
                downloadFullWorkbook(
                  entries,
                  incidences,
                  factoryName,
                  filterLabels
                )
              }
              disabled={!entries.length}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel completo
            </Button>
          </div>
        </header>
        {manualBackupDownload ? (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Backup diário pronto</p>
              <p className="mt-1 text-sm">
                {dateFormat(
                  `${manualBackupDownload.operationalDate}T12:00:00`,
                  false
                )}{" "}
                · {manualBackupDownload.fileName}
              </p>
            </div>
            <Button asChild size="sm">
              <a
                href={manualBackupDownload.url}
                download={manualBackupDownload.fileName}
              >
                <Download className="mr-2 h-4 w-4" />
                Descarregar backup
              </a>
            </Button>
          </div>
        ) : null}

        <Card className="border-0 panel-shadow">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-4 w-4 text-teal-700" />
                Filtros do relatório
              </CardTitle>
              <CardDescription>
                Aplicados a todos os dados e à exportação.
              </CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Limpar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Fábrica / linha</label>
                <Select
                  value={factoryId || "all"}
                  onValueChange={value =>
                    setFactoryId(value === "all" ? "" : value)
                  }
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
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Data inicial</label>
                <Input
                  aria-label="Data inicial da análise"
                  type="date"
                  value={startDate}
                  onChange={event => {
                    setStartDate(event.target.value);
                    if (event.target.value > endDate)
                      setEndDate(event.target.value);
                  }}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Data final</label>
                <Input
                  aria-label="Data final da análise"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={event => setEndDate(event.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">
                  Téc. responsável pelo preenchimento
                </label>
                <Select
                  value={collaboratorProfileId || "all"}
                  onValueChange={value =>
                    setCollaboratorProfileId(value === "all" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as técnicas</SelectItem>
                    {(metadata.data?.collaborators ?? []).map(collaborator => (
                      <SelectItem
                        key={collaborator.id}
                        value={String(collaborator.id)}
                      >
                        {collaborator.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Controlo</label>
                <Popover open={controlsOpen} onOpenChange={setControlsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                      aria-label="Selecionar um ou mais controlos"
                    >
                      {selectedModules.length
                        ? `${selectedModules.length} controlo${selectedModules.length === 1 ? " selecionado" : "s selecionados"}`
                        : "Todos os controlos"}
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-slate-100"
                      onClick={() => setModule("all")}
                    >
                      <Checkbox checked={!selectedModules.length} />
                      Todos os controlos
                    </button>
                    <div className="my-1 border-t" />
                    <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                      {MODULES.map(item => (
                        <button
                          type="button"
                          key={item.id}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100"
                          onClick={() => setModule(item.id)}
                        >
                          <Checkbox
                            checked={selectedModules.includes(item.id)}
                            aria-label={`Selecionar ${item.label}`}
                          />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Colaborador</label>
                <Select
                  value={inspectedCollaboratorId || "all"}
                  onValueChange={value =>
                    setInspectedCollaboratorId(value === "all" ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Filtrar por colaborador inspecionado ou associado">
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
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Resultado</label>
                <Select
                  value={result || "all"}
                  onValueChange={value =>
                    setResult(value === "all" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os resultados</SelectItem>
                    <SelectItem value="C">Conforme (C)</SelectItem>
                    <SelectItem value="NC">Não conforme (NC)</SelectItem>
                    <SelectItem value="N/A">Não aplicável (N/A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium">Estado da NC</label>
                <Select
                  value={ncStatus || "all"}
                  onValueChange={value =>
                    setNcStatus(value === "all" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estados</SelectItem>
                    <SelectItem value="open">Aberta</SelectItem>
                    <SelectItem value="in_progress">Em tratamento</SelectItem>
                    <SelectItem value="awaiting_validation">
                      A aguardar validação
                    </SelectItem>
                    <SelectItem value="closed">Fechada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {module === "dispatch_control" ? (
                <div className="min-w-0 space-y-1">
                  <label className="text-xs font-medium">N.º encomenda</label>
                  <Select
                    value={orderNumber || "all"}
                    onValueChange={value =>
                      setOrderNumber(value === "all" ? "" : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as encomendas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as encomendas</SelectItem>
                      {(data?.dispatchOrders ?? []).map(order => (
                        <SelectItem
                          key={order.orderNumber}
                          value={order.orderNumber}
                        >
                          {order.orderNumber} ·{" "}
                          {order.customer ?? "Sem cliente"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-teal-950">
                    Filtros específicos do controlo
                  </p>
                  <p className="text-xs text-teal-800">
                    Pesquise pelas variáveis registadas no controlo selecionado.
                    Pode combinar vários campos.
                  </p>
                </div>
                {(module ? REPORT_DETAIL_FILTERS[module]?.length : 0) ? (
                  <Badge
                    variant="outline"
                    className="w-fit border-teal-200 bg-white text-teal-800"
                  >
                    {REPORT_DETAIL_FILTERS[module]?.length} campos disponíveis
                  </Badge>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-teal-950">
                    Pesquisa livre
                  </label>
                  <Input
                    aria-label="Pesquisa livre nos detalhes do relatório"
                    value={detailSearch}
                    onChange={event => setDetailSearch(event.target.value)}
                    placeholder="Produto, lote, linha, equipamento…"
                  />
                </div>
                {module &&
                  REPORT_DETAIL_FILTERS[module]?.map(field => (
                    <div key={field.key} className="space-y-1">
                      <label
                        className="text-xs font-medium text-teal-950"
                        htmlFor={`report-detail-${field.key}`}
                      >
                        {field.label}
                      </label>
                      <Input
                        id={`report-detail-${field.key}`}
                        aria-label={`Filtrar por ${field.label.toLocaleLowerCase("pt-PT")}`}
                        value={detailFilters[field.key] ?? ""}
                        onChange={event =>
                          updateDetailFilter(field.key, event.target.value)
                        }
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
              </div>
              {module ? (
                <p className="text-xs text-teal-800">
                  Os campos apresentados correspondem ao controlo escolhido. A
                  pesquisa livre inclui também observações, título, área e dados
                  detalhados do registo.
                </p>
              ) : (
                <p className="text-xs text-teal-800">
                  Selecione um controlo para ver filtros específicos; a pesquisa
                  livre pode ser usada em todos os registos.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Metric
            icon={BarChart3}
            label="Registos encontrados"
            value={data?.filteredSummary?.total ?? 0}
            tone="teal"
          />
          <Metric
            icon={Target}
            label="Taxa de conformidade"
            value={`${data?.filteredSummary?.conformity ?? 0}%`}
            tone="amber"
          />
          <Metric
            icon={FileWarning}
            label="Incidências filtradas"
            value={incidences.length}
            tone="red"
          />
        </div>

        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle>Controlos e informações registadas</CardTitle>
            <CardDescription>
              {selectedFactory} · todos os dados e observações dos controlos
              abrangidos pelos filtros ativos.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y overflow-hidden rounded-xl border border-slate-100 p-0">
            {reports.isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">
                A procurar registos…
              </p>
            ) : entries.length ? (
              entries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  factoryName={factoryName}
                  onDetail={setSelectedEntry}
                  canModify={canModifyEntry(entry)}
                  onEdit={beginEdit}
                  onDelete={setDeletingEntry}
                />
              ))
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Não existem controlos para os filtros selecionados.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle>Incidências no período filtrado</CardTitle>
            <CardDescription>
              São apresentadas automaticamente a partir dos mesmos filtros
              aplicados aos controlos. Não necessita de selecionar nova data nem
              guardar ou exportar separadamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y overflow-hidden rounded-xl border border-red-100 p-0">
            {reports.isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">
                A procurar incidências…
              </p>
            ) : incidences.length ? (
              incidences.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  factoryName={factoryName}
                  onDetail={setSelectedEntry}
                  canModify={canModifyEntry(entry)}
                  onEdit={beginEdit}
                  onDelete={setDeletingEntry}
                />
              ))
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Não existem incidências para os filtros selecionados.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <Card className="border-0 panel-shadow">
            <CardHeader>
              <CardTitle>Conformidade por controlo</CardTitle>
              <CardDescription>
                Leitura comparativa do conjunto filtrado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {(data?.modules ?? []).filter(item => item.total > 0).length ? (
                (data?.modules ?? [])
                  .filter(item => item.total > 0)
                  .map(item => (
                    <div key={item.module}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {moduleLabel(item.module)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.total} registos · {item.nc} NC
                          </p>
                        </div>
                        <span className="font-mono-ui font-semibold">
                          {item.conformity}%
                        </span>
                      </div>
                      <Progress value={item.conformity} className="h-2" />
                    </div>
                  ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ainda não existem dados suficientes para esta leitura.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-0 panel-shadow">
            <CardHeader>
              <CardTitle>Conformidade por área</CardTitle>
              <CardDescription>
                Áreas abrangidas pelos filtros ativos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.areas.length ? (
                data.areas.map(item => (
                  <div
                    key={item.area}
                    className="rounded-xl border border-slate-100 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{item.area}</p>
                      <span className="font-mono-ui text-sm font-semibold text-teal-700">
                        {item.conformity}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.total} registos
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Não existem áreas para os filtros ativos.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-teal-700" />
              Evolução no período
            </CardTitle>
            <CardDescription>
              Volume de controlos e incidências distribuído pelas datas
              filtradas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-2">
              {(data?.trends ?? []).map(item => (
                <div
                  key={item.label}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div className="mb-1 text-center font-mono-ui text-[10px] text-red-700">
                    {item.nc} NC
                  </div>
                  <div
                    className="relative rounded-t bg-teal-100"
                    style={{
                      height: `${Math.max((item.entries / maxTrend) * 100, item.entries ? 8 : 2)}%`,
                    }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t bg-red-500/80"
                      style={{
                        height: `${item.entries ? (item.nc / item.entries) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-center font-mono-ui text-[10px] text-muted-foreground">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle>Arquivo diário com revisões</CardTitle>
            <CardDescription>
              Versões imutáveis do relatório operacional. Uma revisão retroativa
              preserva sempre as versões anteriores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {archiveHistory.isLoading ? (
              <p className="text-sm text-muted-foreground">
                A carregar o histórico de arquivos…
              </p>
            ) : archiveHistory.data?.length ? (
              <div className="divide-y overflow-hidden rounded-xl border border-slate-100">
                {archiveHistory.data.map(archive => (
                  <div
                    key={archive.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {dateFormat(archive.operationalDate, false)} · Versão{" "}
                        {archive.revision}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {archive.archiveKind === "initial"
                          ? "Arquivo diário inicial"
                          : "Revisão por preenchimento retroativo"}{" "}
                        · {archive.controls} controlos · {archive.incidences}{" "}
                        incidências
                      </p>
                      {archive.revisionReason ? (
                        <p className="mt-1 text-xs text-slate-600">
                          {archive.revisionReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground sm:text-right">
                      <div>
                        <p>{archive.createdBy}</p>
                        <p className="mt-1">{dateFormat(archive.createdAt)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openArchive(archive.id)}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Abrir versão
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                O primeiro arquivo será criado automaticamente às 23:55 do
                próximo dia útil. As revisões retroativas aparecerão aqui.
              </p>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={Boolean(selectedArchiveId)}
          onOpenChange={open => !open && setSelectedArchiveId(null)}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Arquivo diário{" "}
                {archiveDetail.data
                  ? `· ${dateFormat(archiveDetail.data.operationalDate, false)} · Versão ${archiveDetail.data.revision}`
                  : ""}
              </DialogTitle>
              <DialogDescription>
                Este snapshot é apenas de consulta e corresponde exatamente ao
                conteúdo arquivado nesta versão.
              </DialogDescription>
            </DialogHeader>
            {archiveDetail.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                A carregar a versão arquivada…
              </p>
            ) : archiveDetail.data ? (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="mt-1 font-medium">
                      {archiveDetail.data.archiveKind === "initial"
                        ? "Arquivo inicial"
                        : "Revisão retroativa"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Criado por</p>
                    <p className="mt-1 font-medium">
                      {archiveDetail.data.createdBy}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Criado em</p>
                    <p className="mt-1 font-medium">
                      {dateFormat(archiveDetail.data.createdAt)}
                    </p>
                  </div>
                  {archiveDetail.data.revisionReason ? (
                    <div className="sm:col-span-3">
                      <p className="text-xs text-muted-foreground">
                        Motivo da revisão
                      </p>
                      <p className="mt-1 font-medium">
                        {archiveDetail.data.revisionReason}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric
                    icon={Target}
                    label="Tarefas planeadas"
                    value={archivedTasks.length}
                    tone="teal"
                  />
                  <Metric
                    icon={BarChart3}
                    label="Controlos"
                    value={archivedEntries.length}
                    tone="amber"
                  />
                  <Metric
                    icon={FileWarning}
                    label="Incidências"
                    value={archivedIncidences.length}
                    tone="red"
                  />
                  <Metric
                    icon={FileWarning}
                    label="Anotações"
                    value={archivedNotes.length}
                    tone="teal"
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">
                    Controlos incluídos
                  </p>
                  {archivedEntries.length ? (
                    <div className="divide-y overflow-hidden rounded-xl border border-slate-100">
                      {archivedEntries.map((entry: any, index: number) => (
                        <div
                          key={`${entry.id ?? "entry"}-${index}`}
                          className="grid gap-1 p-3 text-sm sm:grid-cols-[1fr_auto]"
                        >
                          <div>
                            <p className="font-medium">
                              {entry.title ?? "Controlo sem título"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {moduleLabel(entry.module)} ·{" "}
                              {entry.area ?? "Sem área"} · realizado em{" "}
                              {entry.completedAt
                                ? dateFormat(entry.completedAt)
                                : "—"}
                            </p>
                          </div>
                          <ResultBadge value={entry.result} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                      Não existiam controlos concluídos nesta versão.
                    </p>
                  )}
                </div>
                {archivedIncidences.length ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold">
                      Incidências incluídas
                    </p>
                    <div className="divide-y overflow-hidden rounded-xl border border-red-100">
                      {archivedIncidences.map(
                        (incidence: any, index: number) => (
                          <div
                            key={`${incidence.id ?? "incidence"}-${index}`}
                            className="p-3 text-sm"
                          >
                            <p className="font-medium">
                              {incidence.title ?? "Incidência"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {moduleLabel(incidence.module)} ·{" "}
                              {incidence.severity ?? "Sem gravidade indicada"}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ) : null}
                {archivedNotes.length ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold">
                      Anotações do dia
                    </p>
                    <div className="space-y-2">
                      {archivedNotes.map((note: any, index: number) => (
                        <p
                          key={`${note.id ?? "note"}-${index}`}
                          className="rounded-xl border border-slate-100 p-3 text-sm text-slate-700"
                        >
                          {note.note ?? "Sem anotação"}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Não foi possível encontrar esta versão de arquivo.
              </p>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(selectedEntry)}
          onOpenChange={open => !open && setSelectedEntry(null)}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {selectedEntry?.title ?? "Detalhe do controlo"}
              </DialogTitle>
              <DialogDescription>
                Todos os campos, observações e evidências do registo
                selecionado.
              </DialogDescription>
            </DialogHeader>
            {selectedEntry ? (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Controlo</p>
                    <p className="mt-1 font-medium">
                      {moduleLabel(selectedEntry.module)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Resultado</p>
                    <div className="mt-1">
                      <ResultBadge value={selectedEntry.result} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Área</p>
                    <p className="mt-1 font-medium">{selectedEntry.area}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Concluído em
                    </p>
                    <p className="mt-1 font-medium">
                      {dateFormat(selectedEntry.completedAt)}
                    </p>
                  </div>
                </div>
                <OperatorAttribution
                  name={selectedEntry.registeredByName}
                  title={selectedEntry.registeredByTitle}
                />
                <RetroactiveTraceability payload={selectedEntry.payload} />
                <div>
                  <p className="mb-2 text-sm font-semibold">Dados registados</p>
                  <DetailList payload={selectedEntry.payload} />
                </div>
                <EvidenceGallery payload={selectedEntry.payload} />
                {selectedEntry.module === "fragile_items" &&
                selectedFragileItemId ? (
                  <section
                    className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
                    aria-label="Histórico completo do ponto de Quebráveis"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <History className="h-4 w-4 text-teal-700" />
                          Histórico completo do ponto
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Todas as verificações, responsáveis e fotografias
                          anexadas deste ponto.
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-white text-slate-700"
                      >
                        {fragileHistory.data?.length ?? 0}{" "}
                        {(fragileHistory.data?.length ?? 0) === 1
                          ? "registo"
                          : "registos"}
                      </Badge>
                    </div>
                    {fragileHistory.isLoading ? (
                      <p className="rounded-lg bg-white p-3 text-sm text-muted-foreground">
                        A carregar histórico…
                      </p>
                    ) : fragileHistory.data?.length ? (
                      <div className="space-y-2">
                        {fragileHistory.data.map(history => (
                          <div
                            key={history.id}
                            className="rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-slate-950">
                                  {history.state}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {dateFormat(history.completedAt)}
                                  {history.registeredByName
                                    ? ` · ${history.registeredByName}${history.registeredByTitle ? ` · ${history.registeredByTitle}` : ""}`
                                    : ""}
                                </p>
                              </div>
                              <ResultBadge value={history.result} />
                            </div>
                            {history.notes && (
                              <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                                {history.notes}
                              </p>
                            )}
                            {history.evidencePhotos?.length ? (
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                {history.evidencePhotos.map(photo => (
                                  <a
                                    key={photo.url}
                                    href={photo.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="overflow-hidden rounded-md border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                                  >
                                    <img
                                      src={photo.url}
                                      alt={`Fotografia da verificação: ${photo.fileName ?? "evidência"}`}
                                      className="h-20 w-full object-cover"
                                    />
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
                        Ainda não existem verificações anteriores para este
                        ponto.
                      </p>
                    )}
                  </section>
                ) : null}
                <div>
                  <p className="text-sm font-semibold">Observações</p>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 p-3 text-sm text-slate-800">
                    {selectedEntry.notes?.trim() ||
                      "Sem observações registadas."}
                  </p>
                </div>
                {canModifyEntry(selectedEntry) && (
                  <div className="flex justify-end gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      onClick={() => beginEdit(selectedEntry)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar registo
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setDeletingEntry(selectedEntry)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar registo
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(editingEntry)}
          onOpenChange={open => !open && setEditingEntry(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar registo de controlo</DialogTitle>
              <DialogDescription>
                A alteração fica registada no histórico do controlo. Apenas o
                técnico executor e a Responsável de Qualidade têm esta
                permissão.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submitEdit}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Título</label>
                <Input
                  required
                  value={editingEntry?.title ?? ""}
                  onChange={event =>
                    setEditingEntry((entry: any) =>
                      entry ? { ...entry, title: event.target.value } : entry
                    )
                  }
                />
              </div>
              {editingEntry?.module === "bphf" && (
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="report-entry-bphf-collaborator"
                  >
                    Colaborador inspecionado
                  </label>
                  <Select
                    value={String(editingEntry?.collaboratorId ?? "none")}
                    onValueChange={value =>
                      setEditingEntry((entry: any) =>
                        entry
                          ? {
                              ...entry,
                              collaboratorId:
                                value === "none" ? null : Number(value),
                            }
                          : entry
                      )
                    }
                  >
                    <SelectTrigger
                      id="report-entry-bphf-collaborator"
                      aria-label="Colaborador inspecionado"
                    >
                      <SelectValue placeholder="Selecione o colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Sem colaborador / não aplicável
                      </SelectItem>
                      {(bphfEmployees.data ?? []).map(collaborator => (
                        <SelectItem
                          key={collaborator.id}
                          value={String(collaborator.id)}
                        >
                          {collaborator.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Área</label>
                  <Input
                    required
                    value={editingEntry?.area ?? ""}
                    onChange={event =>
                      setEditingEntry((entry: any) =>
                        entry ? { ...entry, area: event.target.value } : entry
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Resultado</label>
                  <Select
                    value={editingEntry?.result ?? "C"}
                    onValueChange={value =>
                      setEditingEntry((entry: any) =>
                        entry ? { ...entry, result: value } : entry
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="C">Conforme (C)</SelectItem>
                      <SelectItem value="NC">Não conforme (NC)</SelectItem>
                      <SelectItem value="N/A">Não aplicável (N/A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  value={editingEntry?.notes ?? ""}
                  onChange={event =>
                    setEditingEntry((entry: any) =>
                      entry ? { ...entry, notes: event.target.value } : entry
                    )
                  }
                />
              </div>
              <Button
                className="w-full"
                disabled={updateControlEntry.isPending}
              >
                {updateControlEntry.isPending
                  ? "A guardar…"
                  : "Guardar alterações"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={Boolean(deletingEntry)}
          onOpenChange={open => !open && setDeletingEntry(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogHeading>Eliminar este registo?</AlertDialogHeading>
              <AlertDialogDescription>
                O registo deixa de aparecer nos Relatórios, mas a respetiva
                rastreabilidade é preservada no histórico interno.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-700 hover:bg-red-800"
                onClick={() =>
                  deletingEntry &&
                  deleteControlEntry.mutate({ id: deletingEntry.id })
                }
                disabled={deleteControlEntry.isPending}
              >
                {deleteControlEntry.isPending
                  ? "A eliminar…"
                  : "Eliminar registo"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
