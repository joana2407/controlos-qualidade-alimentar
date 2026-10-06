import {
  BinaryResultPicker,
  ContextualHelpIcon,
  ResultPicker,
} from "@/components/quality/QualityUi";
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
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MODULES,
  SENSORY_FIELDS,
  suggestionLocationsForFactory,
} from "@/lib/quality";
import {
  FOOD_DEFENSE_CRITERIA,
  FOOD_DEFENSE_RISK_GUIDANCE,
} from "@/lib/foodDefenseCatalog";
import {
  readControlFactoryScope,
  writeControlFactoryScope,
} from "@/lib/controlFactoryScope";
import {
  currentLisbonDateKey,
  dateFromOperationalDateKey,
  isOperationalDateKey,
  readControlOperationalDate,
  writeControlOperationalDate,
} from "@/lib/controlOperationalDate";
import { trpc } from "@/lib/trpc";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { FragileOperationsPanel } from "@/components/quality/FragileOperationsPanel";
import { DISPATCH_CONTROL_CATALOG } from "@shared/dispatch-control";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Eye,
  ExternalLink,
  Factory,
  FilePlus2,
  FlaskConical,
  Gauge,
  History,
  ImagePlus,
  Lightbulb,
  MapPin,
  Microscope,
  PackageSearch,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  ThermometerSnowflake,
  Trash2,
  Truck,
  WandSparkles,
} from "lucide-react";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { toast } from "sonner";

type Result = "C" | "NC" | "N/A";
type VerificationEvidencePhoto = {
  key: string;
  url: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};
type RetroactiveReason =
  | "verified_not_registered"
  | "technical_unavailability"
  | "other";
const RETROACTIVE_REASON_OPTIONS: Array<{
  value: RetroactiveReason;
  label: string;
}> = [
  {
    value: "verified_not_registered",
    label: "Controlo verificado no dia agendado, mas não registado",
  },
  {
    value: "technical_unavailability",
    label:
      "Adiado por falta de disponibilidade técnica para verificação no dia agendado",
  },
  { value: "other", label: "Outra opção" },
];
const BPHF_CRITERIA = [
  "Estado de limpeza e conservação do fardamento",
  "Higienização das mãos dos manipuladores",
  "Cumprimento geral das regras de BPHF",
  "Estado de limpeza e organização dos cacifos do pessoal e de trabalho",
] as const;
const BPHF_CRITERIA_HELP: Record<(typeof BPHF_CRITERIA)[number], string> = {
  "Estado de limpeza e conservação do fardamento":
    "Confirme que o fardamento está limpo, íntegro e adequado à função, sem sujidade visível ou danos que possam comprometer a higiene.",
  "Higienização das mãos dos manipuladores":
    "Observe se a lavagem e desinfeção das mãos é realizada nos momentos necessários, com técnica adequada e sem práticas que possam recontaminar as mãos.",
  "Cumprimento geral das regras de BPHF":
    "Avalie o cumprimento global das boas práticas aplicáveis à área, incluindo comportamento higiénico, prevenção de contaminação e organização do posto.",
  "Estado de limpeza e organização dos cacifos do pessoal e de trabalho":
    "Confirme que os cacifos pessoais e de trabalho estão limpos, organizados, sem objetos indevidos e adequados à prevenção de contaminação.",
};
const CONTROL_ICONS = {
  bphf: ShieldCheck,
  metal_detectors: Gauge,
  sensory: FlaskConical,
  shelf_life: PackageSearch,
  monthly_checklist: ClipboardCheck,
  suggestion_boxes: Lightbulb,
  fragile_items: Boxes,
  dispatch_control: Truck,
  internal_analysis: Microscope,
  temperature_controls: ThermometerSnowflake,
  food_defense: ShieldCheck,
} as const;

type FactoryOption = { id: number; name: string; code?: string };
type ControlFactoryScope = {
  factories: FactoryOption[];
  factoryId: string;
  setFactoryId: (value: string) => void;
};
export const ControlFactoryContext = React.createContext<ControlFactoryScope>({
  factories: [],
  factoryId: "",
  setFactoryId: () => undefined,
});
const useControlFactory = () => React.useContext(ControlFactoryContext);
type ControlOperationalDateScope = {
  dateKey: string;
  setDateKey: (value: string) => void;
};
const ControlOperationalDateContext =
  React.createContext<ControlOperationalDateScope>({
    dateKey: currentLisbonDateKey(),
    setDateKey: () => undefined,
  });
const useControlOperationalDate = () =>
  React.useContext(ControlOperationalDateContext);
type ModuleProgress = {
  expected: number;
  completed: number;
  registeredToday: number;
  pending: string[];
  percentage: number;
};
type FactoryModuleProgress = {
  factoryId: number;
  expected: number;
  completed: number;
  registeredToday: number;
  percentage: number;
  pendingTaskId?: number;
};
const ModuleProgressContext = React.createContext<{
  items: Record<string, ModuleProgress>;
  byFactory: Record<string, FactoryModuleProgress[]>;
  isLoading: boolean;
}>({ items: {}, byFactory: {}, isLoading: false });
type DailyControlEntry = {
  id: number;
  title: string;
  area: string;
  factoryId?: number | null;
  result: string | null;
  notes?: string | null;
  payload: Record<string, unknown>;
  completedAt: Date | string;
  registeredByProfileId?: number | null;
  registeredByName?: string | null;
  registeredByTitle?: string | null;
};
type DispatchReferenceEdit = {
  name: string;
  orderedQuantity: number;
  verificationStatus: "verified" | "not_verified";
  notVerifiedReason: string;
  lots: Array<{ lot: string; dispatchedQuantity: number }>;
  productLabelResult: "C" | "NC";
  boxLabelResult: "C" | "NC";
  productTemperature: string;
  observations: string;
};
type PendingControlTask = {
  id: number;
  dueAt: Date | string;
  responsible?: string | null;
  factoryId: number | null;
  title?: string | null;
  description?: string | null;
  isFollowUp?: boolean;
  sourceEntryId?: number | null;
};

function dailyResultContext(entry: DailyControlEntry) {
  const payload = entry.payload ?? {};
  const values: string[] = [];
  const textValue = (key: string, label: string) => {
    const value = payload[key];
    if (typeof value === "string" && value.trim())
      values.push(`${label}: ${value}`);
  };
  textValue("product", "Produto");
  textValue("lot", "Lote");
  textValue("validity", "Validade");
  textValue("collaboratorName", "Colaborador");
  textValue("state", "Estado");
  textValue("containmentAction", "Ação de contenção");
  textValue("periodicity", "Periodicidade");
  textValue("referenceImageUrl", "Imagem de referência");
  textValue("orderNumber", "Encomenda");
  textValue("customer", "Cliente");
  const verificationSummary = payload.verificationSummary;
  if (verificationSummary && typeof verificationSummary === "object") {
    const { verified, notVerified } = verificationSummary as {
      verified?: unknown;
      notVerified?: unknown;
    };
    if (typeof verified === "number")
      values.push(
        `${verified} ${verified === 1 ? "referência verificada" : "referências verificadas"}`
      );
    if (typeof notVerified === "number" && notVerified > 0)
      values.push(
        `${notVerified} ${notVerified === 1 ? "referência não verificada" : "referências não verificadas"}`
      );
  }
  if (Array.isArray(payload.equipment) && payload.equipment.length)
    values.push(
      `${payload.equipment.length} ${payload.equipment.length === 1 ? "equipamento verificado" : "equipamentos verificados"}`
    );
  if (Array.isArray(payload.samples) && payload.samples.length)
    values.push(
      `${payload.samples.length} ${payload.samples.length === 1 ? "amostra registada" : "amostras registadas"}`
    );
  if (Array.isArray(payload.criteria) && payload.criteria.length)
    values.push(
      `${payload.criteria.length} ${payload.criteria.length === 1 ? "critério avaliado" : "critérios avaliados"}`
    );
  if (typeof payload.count === "number")
    values.push(`${payload.count} sugestão${payload.count === 1 ? "" : "ões"}`);
  return values.join(" · ");
}

function dispatchReferencesFromPayload(
  payload: Record<string, unknown>
): DispatchReferenceEdit[] {
  const source = Array.isArray(payload.productChecks)
    ? payload.productChecks
    : Array.isArray(payload.productValidations)
      ? payload.productValidations
      : [];
  return source.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const reference = item as Record<string, unknown>;
    if (typeof reference.name !== "string" || !reference.name.trim()) return [];
    const notVerified = reference.verificationStatus === "not_verified";
    const lots = Array.isArray(reference.lots)
      ? reference.lots.flatMap(lot => {
          if (!lot || typeof lot !== "object" || Array.isArray(lot)) return [];
          const value = lot as Record<string, unknown>;
          return typeof value.lot === "string"
            ? [{ lot: value.lot, dispatchedQuantity: Number(value.dispatchedQuantity ?? 0) }]
            : [];
        })
      : [];
    return [{
      name: reference.name,
      orderedQuantity: Number(reference.orderedQuantity ?? 0),
      verificationStatus: notVerified ? "not_verified" : "verified",
      notVerifiedReason:
        typeof reference.notVerifiedReason === "string"
          ? reference.notVerifiedReason
          : "",
      lots: lots.length ? lots : [{ lot: "", dispatchedQuantity: 0 }],
      productLabelResult: reference.productLabelResult === "NC" ? "NC" : "C",
      boxLabelResult: reference.boxLabelResult === "NC" ? "NC" : "C",
      productTemperature:
        reference.productTemperature === undefined || reference.productTemperature === null
          ? ""
          : String(reference.productTemperature),
      observations:
        typeof reference.observations === "string" ? reference.observations : "",
    }];
  });
}

function dispatchVehicleFromPayload(payload: Record<string, unknown>) {
  return {
    temperature:
      payload.vehicleTemperature === undefined || payload.vehicleTemperature === null
        ? ""
        : String(payload.vehicleTemperature),
    observations:
      typeof payload.observations === "string" ? payload.observations : "",
  };
}

function verificationEvidencePhotosFromPayload(
  payload: Record<string, unknown>
): VerificationEvidencePhoto[] {
  if (!Array.isArray(payload.evidencePhotos)) return [];
  return payload.evidencePhotos.flatMap(photo => {
    if (!photo || typeof photo !== "object" || Array.isArray(photo)) return [];
    const record = photo as Record<string, unknown>;
    if (
      typeof record.key !== "string" ||
      typeof record.url !== "string" ||
      typeof record.fileName !== "string" ||
      !["image/jpeg", "image/png", "image/webp"].includes(
        String(record.mimeType)
      )
    )
      return [];
    return [
      {
        key: record.key,
        url: record.url,
        fileName: record.fileName,
        mimeType: record.mimeType as VerificationEvidencePhoto["mimeType"],
      },
    ];
  });
}

function internalAnalysisSampleSummary(entry: DailyControlEntry) {
  const samples = Array.isArray(entry.payload?.samples)
    ? entry.payload.samples
    : [];
  return samples
    .map(sample => {
      if (!sample || typeof sample !== "object" || Array.isArray(sample))
        return null;
      const record = sample as Record<string, unknown>;
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
        (typeof record.ppm === "number" ||
          (typeof record.ppm === "string" && record.ppm.trim()))
          ? `Resultado: ${record.ppm}`
          : null,
      ].filter((part): part is string => Boolean(part));
      return parts.length ? parts.join(" · ") : null;
    })
    .filter((summary): summary is string => Boolean(summary));
}

function DailyControlResults({
  results,
  operationalDate,
  isLoading,
  requiresFactory,
  module,
  focusedEntryId,
  openFocusedEntryForEditing = false,
}: {
  results: DailyControlEntry[];
  operationalDate: Date;
  isLoading: boolean;
  requiresFactory: boolean;
  module?: string;
  focusedEntryId?: number;
  openFocusedEntryForEditing?: boolean;
}) {
  const dateLabel = operationalDate.toLocaleDateString("pt-PT");
  const isSensory = module === "sensory";
  const isBphf = module === "bphf";
  const isInternalAnalysis = module === "internal_analysis";
  const isDispatch = module === "dispatch_control";
  const isFragile = module === "fragile_items";
  const [productFilter, setProductFilter] = useState("");
  const [lotFilter, setLotFilter] = useState("");
  const [criterionFilter, setCriterionFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const normalizedProductFilter = productFilter
    .trim()
    .toLocaleLowerCase("pt-PT");
  const normalizedLotFilter = lotFilter.trim().toLocaleLowerCase("pt-PT");
  const visibleResults = useMemo(() => {
    if (!isSensory && !isBphf) return results;
    return results.filter(entry => {
      const product =
        typeof entry.payload?.product === "string"
          ? entry.payload.product
          : entry.title;
      const lot =
        typeof entry.payload?.lot === "string" ? entry.payload.lot : "";
      const criterion =
        typeof entry.payload?.criterion === "string"
          ? entry.payload.criterion
          : entry.title;
      const matchesProduct =
        !isSensory ||
        !normalizedProductFilter ||
        product.toLocaleLowerCase("pt-PT").includes(normalizedProductFilter);
      const matchesLot =
        !isSensory ||
        !normalizedLotFilter ||
        lot.toLocaleLowerCase("pt-PT").includes(normalizedLotFilter);
      const matchesCriterion =
        !isBphf || criterionFilter === "all" || criterion === criterionFilter;
      const matchesResult =
        resultFilter === "all" || entry.result === resultFilter;
      return matchesProduct && matchesLot && matchesCriterion && matchesResult;
    });
  }, [
    criterionFilter,
    isBphf,
    isSensory,
    normalizedLotFilter,
    normalizedProductFilter,
    resultFilter,
    results,
  ]);
  const hasActiveFilters =
    (isSensory || isBphf) &&
    Boolean(
      normalizedProductFilter ||
        normalizedLotFilter ||
        criterionFilter !== "all" ||
        resultFilter !== "all"
    );
  const clearFilters = () => {
    setProductFilter("");
    setLotFilter("");
    setCriterionFilter("all");
    setResultFilter("all");
  };
  const { activeProfile, canManage } = useQualityAccess();
  const { factories } = useControlFactory();
  const bphfEmployees =
    trpc.quality.listBphfInspectionEmployees?.useQuery?.(
      undefined,
      { enabled: isBphf || isSensory }
    ) ?? { data: [], isLoading: false };
  const utils = trpc.useUtils();
  const [selectedEntry, setSelectedEntry] = useState<DailyControlEntry | null>(
    null
  );
  const selectedFragileItemId = useMemo(() => {
    const fragileItemId = selectedEntry?.payload?.fragileItemId;
    return module === "fragile_items" && typeof fragileItemId === "number"
      ? fragileItemId
      : 0;
  }, [module, selectedEntry]);
  const fragileHistoryInput = useMemo(
    () => ({ itemId: selectedFragileItemId }),
    [selectedFragileItemId]
  );
  const fragileHistory = trpc.quality.fragileInspectionHistory?.useQuery?.(
    fragileHistoryInput,
    { enabled: Boolean(selectedFragileItemId && selectedEntry) }
  ) ?? { data: [], isLoading: false };
  const [editingEntry, setEditingEntry] = useState<
    | (DailyControlEntry & {
        productName: string;
        lot: string;
        validity: string;
        collaboratorId: number | null;
        fragileState: "Íntegro" | "Danificado" | "Em falta";
        fragileContainmentAction: string;
        fragilePeriodicity: "D" | "S" | "Q" | "M";
        fragileReferenceImageUrl: string | null;
        fragileEvidencePhotos: VerificationEvidencePhoto[];
      })
    | null
  >(null);
  const [dispatchReferences, setDispatchReferences] = useState<
    DispatchReferenceEdit[]
  >([]);
  const [dispatchVehicle, setDispatchVehicle] = useState({
    temperature: "",
    observations: "",
  });
  const [deletingEntry, setDeletingEntry] = useState<DailyControlEntry | null>(
    null
  );
  const canModifyEntry = (entry: DailyControlEntry) =>
    canManage ||
    entry.registeredByProfileId === activeProfile?.id ||
    (!entry.registeredByProfileId &&
      entry.registeredByName === activeProfile?.name);
  const beginEdit = (entry: DailyControlEntry) => {
    setDispatchReferences(dispatchReferencesFromPayload(entry.payload));
    setDispatchVehicle(dispatchVehicleFromPayload(entry.payload));
    setEditingEntry({
      ...entry,
      productName:
        typeof entry.payload?.product === "string" ? entry.payload.product : "",
      lot: typeof entry.payload?.lot === "string" ? entry.payload.lot : "",
      validity:
        typeof entry.payload?.validity === "string"
          ? entry.payload.validity
          : "",
      collaboratorId:
        Number.isInteger(Number(entry.payload?.collaboratorId)) &&
        Number(entry.payload?.collaboratorId) > 0
          ? Number(entry.payload?.collaboratorId)
          : null,
      fragileState:
        entry.payload?.state === "Danificado" || entry.payload?.state === "Em falta"
          ? entry.payload.state
          : "Íntegro",
      fragileContainmentAction:
        typeof entry.payload?.containmentAction === "string"
          ? entry.payload.containmentAction
          : entry.notes ?? "",
      fragilePeriodicity:
        entry.payload?.periodicity === "D" ||
        entry.payload?.periodicity === "S" ||
        entry.payload?.periodicity === "Q" ||
        entry.payload?.periodicity === "M"
          ? entry.payload.periodicity
          : "M",
      fragileReferenceImageUrl:
        typeof entry.payload?.referenceImageUrl === "string"
          ? entry.payload.referenceImageUrl
          : null,
      fragileEvidencePhotos: verificationEvidencePhotosFromPayload(entry.payload),
    });
  };
  const handledFocusedEntry = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedEntryId || isLoading) return;
    const focusKey = `${focusedEntryId}:${openFocusedEntryForEditing ? "edit" : "view"}`;
    if (handledFocusedEntry.current === focusKey) return;
    const entry = results.find(result => result.id === focusedEntryId);
    if (!entry) return;
    handledFocusedEntry.current = focusKey;
    setSelectedEntry(entry);
    if (openFocusedEntryForEditing && canModifyEntry(entry)) beginEdit(entry);
  }, [focusedEntryId, isLoading, openFocusedEntryForEditing, results]);
  const updateControlEntry = trpc.quality.updateControlEntry.useMutation({
    onSuccess: data => {
      utils.quality.dashboard.invalidate();
      utils.quality.reports.invalidate();
      utils.quality.dailyControlResults.invalidate();
      utils.quality.listIncidences.invalidate();
      utils.quality.incidenceRecurrenceAlerts.invalidate();
      utils.quality.similarIncidenceAlerts.invalidate();
      utils.quality.listTasks.invalidate();
      setEditingEntry(null);
      setSelectedEntry(null);
      toast.success(
        data.incidenciaResolvida
          ? "Registo corrigido para Conforme. A incidência deixou de estar ativa."
          : "Registo de controlo atualizado."
      );
    },
    onError: error => toast.error(error.message),
  });
  const uploadFragileEditEvidence =
    trpc.quality.uploadVerificationEvidence?.useMutation?.({
      onError: error => toast.error(error.message),
    }) ?? {
      isPending: false,
      mutate: (..._args: unknown[]) => undefined,
    };
  const uploadFragileEditPhoto = async (file?: File) => {
    if (!file || !editingEntry || !isFragile) return;
    const photos = editingEntry.fragileEvidencePhotos;
    if (photos.length >= 8)
      return toast.error("Pode anexar no máximo 8 fotografias.");
    if (!file.type.match(/^image\/(jpeg|png|webp)$/))
      return toast.error("Use uma imagem JPG, PNG ou WEBP.");
    if (file.size > 4_500_000)
      return toast.error("A fotografia deve ter no máximo 4,5 MB.");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Não foi possível ler a fotografia."));
        reader.readAsDataURL(file);
      });
      uploadFragileEditEvidence.mutate(
        {
          module: "fragile_items",
          factoryId: editingEntry.factoryId ?? null,
          fileName: file.name,
          mimeType: file.type as VerificationEvidencePhoto["mimeType"],
          dataUrl,
        },
        {
          onSuccess: photo => {
            setEditingEntry(current =>
              current
                ? {
                    ...current,
                    fragileEvidencePhotos: [
                      ...current.fragileEvidencePhotos,
                      photo,
                    ],
                  }
                : current
            );
            toast.success("Fotografia da verificação adicionada.");
          },
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a fotografia."
      );
    }
  };
  const removeFragileEditPhoto = (key: string) =>
    setEditingEntry(current =>
      current
        ? {
            ...current,
            fragileEvidencePhotos: current.fragileEvidencePhotos.filter(
              photo => photo.key !== key
            ),
          }
        : current
    );
  const deleteControlEntry = trpc.quality.deleteControlEntry.useMutation({
    onSuccess: () => {
      utils.quality.dashboard.invalidate();
      utils.quality.reports.invalidate();
      utils.quality.dailyControlResults.invalidate();
      utils.quality.listBphfCollaboratorInspections.invalidate();
      utils.quality.controlAuthorization.invalidate();
      utils.quality.pendingControlTasks.invalidate();
      utils.quality.listTasks.invalidate();
      setDeletingEntry(null);
      setSelectedEntry(null);
      toast.success("Registo de controlo eliminado.");
    },
    onError: error => toast.error(error.message),
  });
  const supportsProductDetails =
    isSensory ||
    Boolean(
      editingEntry?.payload?.product ||
        editingEntry?.payload?.lot ||
        editingEntry?.payload?.validity
    );
  const updateDispatchReference = (
    index: number,
    changes: Partial<DispatchReferenceEdit>
  ) =>
    setDispatchReferences(current =>
      current.map((reference, referenceIndex) =>
        referenceIndex === index ? { ...reference, ...changes } : reference
      )
    );
  const updateDispatchLot = (
    referenceIndex: number,
    lotIndex: number,
    changes: Partial<DispatchReferenceEdit["lots"][number]>
  ) =>
    setDispatchReferences(current =>
      current.map((reference, index) =>
        index === referenceIndex
          ? {
              ...reference,
              lots: reference.lots.map((lot, currentLotIndex) =>
                currentLotIndex === lotIndex ? { ...lot, ...changes } : lot
              ),
            }
          : reference
      )
    );
  const addDispatchLot = (referenceIndex: number) =>
    setDispatchReferences(current =>
      current.map((reference, index) =>
        index === referenceIndex
          ? {
              ...reference,
              lots: [...reference.lots, { lot: "", dispatchedQuantity: 0 }],
            }
          : reference
      )
    );
  const removeDispatchLot = (referenceIndex: number, lotIndex: number) =>
    setDispatchReferences(current =>
      current.map((reference, index) =>
        index === referenceIndex
          ? {
              ...reference,
              lots:
                reference.lots.length <= 1
                  ? reference.lots
                  : reference.lots.filter((_, currentLotIndex) => currentLotIndex !== lotIndex),
            }
          : reference
      )
    );
  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingEntry) return;
    if (isDispatch && !dispatchReferences.length)
      return toast.error("Este registo de Expedição não tem referências para atualizar.");
    if (isDispatch && !dispatchVehicle.temperature.trim())
      return toast.error("Indique a temperatura do veículo antes de guardar a Expedição.");
    updateControlEntry.mutate({
      id: editingEntry.id,
      title: editingEntry.title,
      area: editingEntry.area,
      factoryId: editingEntry.factoryId ?? null,
      result: (editingEntry.result ?? "C") as "C" | "NC" | "N/A",
      notes: editingEntry.notes ?? "",
      productName: supportsProductDetails
        ? editingEntry.productName
        : undefined,
      lot: supportsProductDetails ? editingEntry.lot : undefined,
      validity: supportsProductDetails ? editingEntry.validity : undefined,
      collaboratorId:
        isBphf || isSensory ? editingEntry.collaboratorId : undefined,
      fragileState: isFragile ? editingEntry.fragileState : undefined,
      fragileContainmentAction: isFragile
        ? editingEntry.fragileContainmentAction
        : undefined,
      fragilePeriodicity: isFragile
        ? editingEntry.fragilePeriodicity
        : undefined,
      fragileReferenceImageUrl: isFragile
        ? editingEntry.fragileReferenceImageUrl
        : undefined,
      fragileEvidencePhotos: isFragile
        ? editingEntry.fragileEvidencePhotos
        : undefined,
      dispatchProductChecks: isDispatch
        ? dispatchReferences.map(reference =>
            reference.verificationStatus === "not_verified"
              ? {
                  verificationStatus: "not_verified" as const,
                  name: reference.name,
                  orderedQuantity: reference.orderedQuantity,
                  notVerifiedReason: reference.notVerifiedReason,
                }
              : {
                  verificationStatus: "verified" as const,
                  name: reference.name,
                  orderedQuantity: reference.orderedQuantity,
                  lots: reference.lots,
                  productLabelResult: reference.productLabelResult,
                  boxLabelResult: reference.boxLabelResult,
                  productTemperature: Number(reference.productTemperature),
                  observations: reference.observations || undefined,
                }
          )
        : undefined,
      dispatchVehicleTemperature: isDispatch
        ? Number(dispatchVehicle.temperature)
        : undefined,
      dispatchVehicleObservations: isDispatch
        ? dispatchVehicle.observations
        : undefined,
    });
  };
  return (
    <>
      <Card className="border-0 panel-shadow">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-teal-700">
                Consulta do dia
              </p>
              <CardTitle className="mt-1 flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-teal-700" />
                Resultados registados
              </CardTitle>
              <CardDescription className="mt-1">
                Verificações realizadas em {dateLabel}, apresentadas por ordem
                de registo.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              {isSensory && (
                <div className="grid w-full gap-2 sm:grid-cols-3 sm:items-end">
                  <div className="space-y-1 sm:w-56">
                    <Label
                      htmlFor="sensory-product-history-filter"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Filtrar por produto
                    </Label>
                    <Input
                      id="sensory-product-history-filter"
                      value={productFilter}
                      onChange={event => setProductFilter(event.target.value)}
                      placeholder="Pesquisar produto"
                      className="h-9 bg-white"
                    />
                  </div>
                  <div className="space-y-1 sm:w-44">
                    <Label
                      htmlFor="sensory-lot-history-filter"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Filtrar por lote
                    </Label>
                    <Input
                      id="sensory-lot-history-filter"
                      value={lotFilter}
                      onChange={event => setLotFilter(event.target.value)}
                      placeholder="Pesquisar lote"
                      className="h-9 bg-white"
                    />
                  </div>
                  <div className="space-y-1 sm:w-44">
                    <Label
                      htmlFor="sensory-result-history-filter"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Filtrar por resultado
                    </Label>
                    <Select
                      value={resultFilter}
                      onValueChange={setResultFilter}
                    >
                      <SelectTrigger
                        id="sensory-result-history-filter"
                        aria-label="Filtrar por resultado"
                        className="h-9 bg-white"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="C">Conforme</SelectItem>
                        <SelectItem value="NC">Não conforme</SelectItem>
                        <SelectItem value="N/A">Não aplicável</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {hasActiveFilters && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-9 justify-self-start px-2 text-slate-600 hover:text-slate-950 sm:col-span-3 sm:justify-self-end"
                    >
                      Limpar filtros
                    </Button>
                  )}
                </div>
              )}
              {isBphf && (
                <div className="flex w-full items-end gap-2 sm:w-auto">
                  <div className="space-y-1 sm:w-64">
                    <Label
                      htmlFor="bphf-criterion-history-filter"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Filtrar por tipo de verificação
                    </Label>
                    <Select
                      value={criterionFilter}
                      onValueChange={setCriterionFilter}
                    >
                      <SelectTrigger
                        id="bphf-criterion-history-filter"
                        aria-label="Filtrar por tipo de verificação"
                        className="h-9 bg-white"
                      >
                        <SelectValue placeholder="Todos os tipos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        {BPHF_CRITERIA.map(criterion => (
                          <SelectItem key={criterion} value={criterion}>
                            {criterion ===
                            "Estado de limpeza e conservação do fardamento"
                              ? "Fardamento"
                              : criterion ===
                                  "Higienização das mãos dos manipuladores"
                                ? "Higienização das mãos"
                                : criterion ===
                                    "Cumprimento geral das regras de BPHF"
                                  ? "Cumprimento BPHF"
                                  : "Cacifos"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {criterionFilter !== "all" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-9 px-2 text-slate-600 hover:text-slate-950"
                    >
                      Limpar filtros
                    </Button>
                  )}
                </div>
              )}
              <Badge
                variant="outline"
                className="w-fit border-teal-200 bg-teal-50 text-teal-800"
              >
                {visibleResults.length}{" "}
                {visibleResults.length === 1 ? "registo" : "registos"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
              A carregar resultados do dia…
            </p>
          ) : requiresFactory ? (
            <p className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
              Selecione a fábrica ou linha no cabeçalho para consultar os
              resultados registados.
            </p>
          ) : results.length > 0 && visibleResults.length === 0 ? (
            <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Não foram encontrados resultados com os filtros aplicados nesta
              data.
            </p>
          ) : visibleResults.length ? (
            <div className="divide-y overflow-hidden rounded-xl border border-slate-100">
              {visibleResults.map(entry => {
                const context = dailyResultContext(entry);
                const sampleSummaries = isInternalAnalysis
                  ? internalAnalysisSampleSummary(entry)
                  : [];
                const resultLabel =
                  entry.result === "C"
                    ? "Conforme"
                    : entry.result === "NC"
                      ? "Não conforme"
                      : entry.result === "N/A"
                        ? "Não aplicável"
                        : "Registado";
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950">
                        {entry.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {entry.area}
                        {context ? ` · ${context}` : ""}
                      </p>
                      {sampleSummaries.length ? (
                        <div className="mt-2 space-y-1.5">
                          {sampleSummaries.map((summary, index) => (
                            <p
                              key={`${entry.id}-sample-${index}`}
                              className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-slate-700"
                            >
                              {summary}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {entry.notes && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {entry.notes}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        Registado em{" "}
                        {new Date(entry.completedAt).toLocaleString("pt-PT")}
                        {entry.registeredByName
                          ? ` por ${entry.registeredByName}${entry.registeredByTitle ? ` · ${entry.registeredByTitle}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <Badge
                        className={
                          entry.result === "NC"
                            ? "bg-red-600 text-white hover:bg-red-600"
                            : entry.result === "C"
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                        }
                      >
                        {resultLabel}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-slate-500 hover:text-teal-700"
                        aria-label={`Ver detalhes de ${entry.title}`}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canModifyEntry(entry) && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-slate-500 hover:text-teal-700"
                            aria-label={`Editar ${entry.title}`}
                            onClick={() => beginEdit(entry)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-slate-500 hover:text-red-700"
                            aria-label={`Eliminar ${entry.title}`}
                            onClick={() => setDeletingEntry(entry)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
              Ainda não existem resultados registados para esta data.
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(selectedEntry)}
        onOpenChange={open => !open && setSelectedEntry(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do registo</DialogTitle>
            <DialogDescription>
              Consulta completa da verificação efetuada em{" "}
              {selectedEntry
                ? new Date(selectedEntry.completedAt).toLocaleString("pt-PT")
                : ""}
              .
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Controlo
                  </p>
                  <p className="mt-1 font-medium text-slate-950">
                    {selectedEntry.title}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Fábrica / linha
                  </p>
                  <p className="mt-1 font-medium text-slate-950">
                    {factories.find(
                      factory => factory.id === selectedEntry.factoryId
                    )?.name ??
                      (selectedEntry.factoryId
                        ? `Fábrica / linha ${selectedEntry.factoryId}`
                        : "Controlo comum")}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Área / linha operacional
                  </p>
                  <p className="mt-1 font-medium text-slate-950">
                    {selectedEntry.area}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Resultado
                  </p>
                  <p className="mt-1 font-medium text-slate-950">
                    {selectedEntry.result === "C"
                      ? "Conforme"
                      : selectedEntry.result === "NC"
                        ? "Não conforme"
                        : selectedEntry.result === "N/A"
                          ? "Não aplicável"
                          : "Registado"}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Dados da verificação
                </p>
                <p className="mt-2 text-slate-700">
                  {dailyResultContext(selectedEntry) ||
                    "Sem dados adicionais estruturados."}
                </p>
                {selectedEntry.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">
                    {selectedEntry.notes}
                  </p>
                )}
              </div>
              {module === "dispatch_control" ? (
                <section className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-3" aria-label="Detalhe completo das referências de expedição">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-teal-950">Referências da encomenda</p>
                      <p className="mt-1 text-xs text-teal-800">Estado, lotes, quantidades, rotulagem, temperatura e observações de cada referência.</p>
                    </div>
                    <Badge variant="outline" className="border-teal-200 bg-white text-teal-800">{dispatchReferencesFromPayload(selectedEntry.payload).length} referências</Badge>
                  </div>
                  <div className="space-y-3">
                    {dispatchReferencesFromPayload(selectedEntry.payload).map((reference, index) => (
                      <div key={`${reference.name}-${index}`} className="rounded-lg border border-teal-100 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-slate-950">{reference.name}</p><p className="mt-1 text-xs text-slate-600">Quantidade pedida: {reference.orderedQuantity}</p></div><Badge className={reference.verificationStatus === "not_verified" ? "bg-slate-100 text-slate-700 hover:bg-slate-100" : reference.productLabelResult === "NC" || reference.boxLabelResult === "NC" ? "bg-red-100 text-red-800 hover:bg-red-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{reference.verificationStatus === "not_verified" ? "Não verificada" : "Verificada"}</Badge></div>
                        {reference.verificationStatus === "not_verified" ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950"><span className="font-semibold">Motivo:</span> {reference.notVerifiedReason || "Não indicado"}</p> : <><div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><p className="rounded-md bg-slate-50 p-2"><span className="font-medium text-slate-700">Rótulo produto:</span> {reference.productLabelResult === "C" ? "Conforme" : "Não conforme"}</p><p className="rounded-md bg-slate-50 p-2"><span className="font-medium text-slate-700">Rótulo caixa:</span> {reference.boxLabelResult === "C" ? "Conforme" : "Não conforme"}</p><p className="rounded-md bg-slate-50 p-2"><span className="font-medium text-slate-700">Temperatura:</span> {reference.productTemperature || "—"} °C</p></div><div className="mt-3"><p className="text-xs font-medium text-slate-700">Lotes expedidos</p><div className="mt-1 flex flex-wrap gap-2">{reference.lots.map((lot, lotIndex) => <Badge key={`${lot.lot}-${lotIndex}`} variant="outline">{lot.lot || "Lote não indicado"} · {lot.dispatchedQuantity}</Badge>)}</div></div>{reference.observations ? <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">{reference.observations}</p> : null}</>}
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2"><p><span className="font-medium text-slate-700">Temperatura do veículo:</span> {dispatchVehicleFromPayload(selectedEntry.payload).temperature || "—"} °C</p><p><span className="font-medium text-slate-700">Observações do veículo:</span> {dispatchVehicleFromPayload(selectedEntry.payload).observations || "Sem observações"}</p></div>
                  {Array.isArray(selectedEntry.payload.reasons) && selectedEntry.payload.reasons.length ? <div className="rounded-lg border border-red-100 bg-red-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-red-800">Motivos e desvios identificados</p><ul className="mt-2 space-y-1 text-xs text-red-900">{selectedEntry.payload.reasons.filter((reason): reason is string => typeof reason === "string").map((reason, index) => <li key={`${reason}-${index}`}>• {reason}</li>)}</ul></div> : null}
                </section>
              ) : null}
              {module === "fragile_items" && selectedFragileItemId ? (
                <section
                  className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                  aria-label="Histórico completo do ponto de Quebráveis"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-slate-950">
                        <History className="h-4 w-4 text-teal-700" />
                        Histórico completo do ponto
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Todas as verificações, responsáveis e fotografias
                        anexadas.
                      </p>
                    </div>
                    <Badge variant="outline">
                      {fragileHistory.data?.length ?? 0}{" "}
                      {(fragileHistory.data?.length ?? 0) === 1
                        ? "registo"
                        : "registos"}
                    </Badge>
                  </div>
                  {fragileHistory.isLoading ? (
                    <p className="rounded-md bg-white p-3 text-sm text-muted-foreground">
                      A carregar histórico…
                    </p>
                  ) : fragileHistory.data?.length ? (
                    <div className="space-y-2">
                      {fragileHistory.data.map(history => (
                        <div
                          key={history.id}
                          className="rounded-md border border-slate-200 bg-white p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-950">
                                {history.state}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {new Date(history.completedAt).toLocaleString(
                                  "pt-PT"
                                )}
                                {history.registeredByName
                                  ? ` · ${history.registeredByName}${history.registeredByTitle ? ` · ${history.registeredByTitle}` : ""}`
                                  : ""}
                              </p>
                            </div>
                            <Badge
                              className={
                                history.result === "NC"
                                  ? "bg-red-600 text-white hover:bg-red-600"
                                  : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                              }
                            >
                              {history.result === "NC"
                                ? "Não conforme"
                                : "Conforme"}
                            </Badge>
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
                    <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
                      Ainda não existem verificações anteriores para este ponto.
                    </p>
                  )}
                </section>
              ) : null}
              <p className="text-xs text-slate-500">
                Registado por{" "}
                {selectedEntry.registeredByName ??
                  "utilizador não identificado"}
                {selectedEntry.registeredByTitle
                  ? ` · ${selectedEntry.registeredByTitle}`
                  : ""}{" "}
                em {new Date(selectedEntry.completedAt).toLocaleString("pt-PT")}
                .
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editingEntry)}
        onOpenChange={open => !open && setEditingEntry(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar registo de controlo</DialogTitle>
            <DialogDescription>
              A alteração fica registada no histórico. Apenas o técnico executor
              e a Responsável de Qualidade têm esta permissão.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitEdit}>
            {isDispatch && (
              <section className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/50 p-4" aria-label="Referências da encomenda">
                <div>
                  <p className="font-semibold text-teal-950">Referências da encomenda</p>
                  <p className="mt-1 text-sm text-teal-800">Atualize cada referência, incluindo lotes, quantidade expedida, rotulagem, temperatura, motivo de não verificação e observações.</p>
                </div>
                {dispatchReferences.length ? dispatchReferences.map((reference, referenceIndex) => (
                  <div key={`${reference.name}-${referenceIndex}`} className="space-y-4 rounded-xl border border-teal-100 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor={`dispatch-reference-name-${referenceIndex}`}>Referência {referenceIndex + 1}</Label>
                        <Input id={`dispatch-reference-name-${referenceIndex}`} value={reference.name} onChange={event => updateDispatchReference(referenceIndex, { name: event.target.value })} />
                      </div>
                      <div className="w-full space-y-2 sm:w-48">
                        <Label>Estado da referência</Label>
                        <Select value={reference.verificationStatus} onValueChange={value => updateDispatchReference(referenceIndex, { verificationStatus: value as DispatchReferenceEdit["verificationStatus"] })}>
                          <SelectTrigger aria-label={`Estado da referência ${reference.name || referenceIndex + 1}`}><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="verified">Verificada</SelectItem><SelectItem value="not_verified">Não verificada</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2"><Label htmlFor={`dispatch-ordered-${referenceIndex}`}>Quantidade pedida</Label><Input id={`dispatch-ordered-${referenceIndex}`} type="number" min="0" value={reference.orderedQuantity} onChange={event => updateDispatchReference(referenceIndex, { orderedQuantity: Number(event.target.value) })} /></div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><p className="text-xs font-medium text-slate-500">Quantidade expedida</p><p className="mt-1 font-semibold text-slate-950">{reference.verificationStatus === "not_verified" ? "Não aplicável" : reference.lots.reduce((total, lot) => total + Number(lot.dispatchedQuantity || 0), 0)}</p></div>
                    </div>
                    {reference.verificationStatus === "not_verified" ? (
                      <div className="space-y-2"><Label htmlFor={`dispatch-not-verified-${referenceIndex}`}>Motivo de não verificação</Label><Textarea id={`dispatch-not-verified-${referenceIndex}`} required value={reference.notVerifiedReason} onChange={event => updateDispatchReference(referenceIndex, { notVerifiedReason: event.target.value })} placeholder="Indique o motivo pelo qual esta referência não foi verificada." /></div>
                    ) : (
                      <>
                        <div className="space-y-2"><div className="flex items-center justify-between"><Label>Lotes expedidos</Label><Button type="button" size="sm" variant="outline" onClick={() => addDispatchLot(referenceIndex)}><Plus className="mr-2 h-4 w-4" />Adicionar lote</Button></div><div className="space-y-2">{reference.lots.map((lot, lotIndex) => <div key={`${referenceIndex}-lot-${lotIndex}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><Input aria-label={`Lote ${lotIndex + 1} da referência ${reference.name || referenceIndex + 1}`} value={lot.lot} onChange={event => updateDispatchLot(referenceIndex, lotIndex, { lot: event.target.value })} placeholder="Lote" /><Input aria-label={`Quantidade do lote ${lotIndex + 1} da referência ${reference.name || referenceIndex + 1}`} type="number" min="0" value={lot.dispatchedQuantity} onChange={event => updateDispatchLot(referenceIndex, lotIndex, { dispatchedQuantity: Number(event.target.value) })} placeholder="Quantidade" /><Button type="button" variant="ghost" size="icon" aria-label={`Remover lote ${lotIndex + 1}`} disabled={reference.lots.length <= 1} onClick={() => removeDispatchLot(referenceIndex, lotIndex)}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div>
                        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Rótulo do produto</Label><Select value={reference.productLabelResult} onValueChange={value => updateDispatchReference(referenceIndex, { productLabelResult: value as "C" | "NC" })}><SelectTrigger aria-label={`Rótulo do produto ${reference.name || referenceIndex + 1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="C">Conforme</SelectItem><SelectItem value="NC">Não conforme</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Rótulo da caixa</Label><Select value={reference.boxLabelResult} onValueChange={value => updateDispatchReference(referenceIndex, { boxLabelResult: value as "C" | "NC" })}><SelectTrigger aria-label={`Rótulo da caixa ${reference.name || referenceIndex + 1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="C">Conforme</SelectItem><SelectItem value="NC">Não conforme</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor={`dispatch-temperature-${referenceIndex}`}>Temperatura do produto (°C)</Label><Input id={`dispatch-temperature-${referenceIndex}`} type="number" step="0.1" value={reference.productTemperature} onChange={event => updateDispatchReference(referenceIndex, { productTemperature: event.target.value })} /></div></div>
                        <div className="space-y-2"><Label htmlFor={`dispatch-observations-${referenceIndex}`}>Observações da referência</Label><Textarea id={`dispatch-observations-${referenceIndex}`} value={reference.observations} onChange={event => updateDispatchReference(referenceIndex, { observations: event.target.value })} placeholder="Obrigatório quando a referência não está conforme." /></div>
                      </>
                    )}
                  </div>
                )) : <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Este registo não contém referências estruturadas para edição.</p>}
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="dispatch-vehicle-temperature">Temperatura do veículo (°C)</Label><Input id="dispatch-vehicle-temperature" type="number" step="0.1" value={dispatchVehicle.temperature} onChange={event => setDispatchVehicle(current => ({ ...current, temperature: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="dispatch-vehicle-observations">Observações gerais do veículo</Label><Textarea id="dispatch-vehicle-observations" value={dispatchVehicle.observations} onChange={event => setDispatchVehicle(current => ({ ...current, observations: event.target.value }))} placeholder="Obrigatório se a temperatura do veículo não estiver conforme." /></div></div>
              </section>
            )}
            <div className="space-y-2">
              <Label htmlFor="daily-entry-title">Título</Label>
              <Input
                id="daily-entry-title"
                required
                value={editingEntry?.title ?? ""}
                onChange={event =>
                  setEditingEntry(current =>
                    current
                      ? { ...current, title: event.target.value }
                      : current
                  )
                }
              />
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
              <div className="mb-3">
                <p className="font-semibold text-teal-950">Identificação do registo</p>
                <p className="mt-1 text-xs leading-5 text-teal-900">
                  Pode corrigir a fábrica/linha, a área e o título quando existiu um erro de digitação. A alteração fica registada no histórico.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daily-entry-factory">Fábrica / linha</Label>
                <Select
                  value={String(editingEntry?.factoryId ?? "common")}
                  onValueChange={value =>
                    setEditingEntry(current =>
                      current
                        ? {
                            ...current,
                            factoryId:
                              value === "common" ? null : Number(value),
                          }
                        : current
                    )
                  }
                >
                  <SelectTrigger id="daily-entry-factory" aria-label="Fábrica ou linha do registo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="common">Controlo comum</SelectItem>
                    {factories.map(factory => (
                      <SelectItem key={factory.id} value={String(factory.id)}>
                        {factory.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-entry-area">Área / linha</Label>
                <Input
                  id="daily-entry-area"
                  required
                  value={editingEntry?.area ?? ""}
                  onChange={event =>
                    setEditingEntry(current =>
                      current
                        ? { ...current, area: event.target.value }
                        : current
                    )
                  }
                />
              </div>
              </div>
            </div>
            {isFragile && (
              <section
                className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
                aria-label="Dados específicos da verificação de Quebráveis"
              >
                <div>
                  <p className="font-semibold text-amber-950">
                    Dados da verificação de Quebráveis
                  </p>
                  <p className="mt-1 text-xs text-amber-900">
                    A alteração sincroniza o resultado, o estado do ponto, a ação de contenção e as evidências da verificação.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="daily-entry-fragile-state">Estado da verificação</Label>
                    <Select
                      value={editingEntry?.fragileState ?? "Íntegro"}
                      onValueChange={value =>
                        setEditingEntry(current =>
                          current
                            ? {
                                ...current,
                                fragileState: value as
                                  | "Íntegro"
                                  | "Danificado"
                                  | "Em falta",
                                result: value === "Íntegro" ? "C" : "NC",
                                fragileContainmentAction:
                                  value === "Íntegro"
                                    ? ""
                                    : current.fragileContainmentAction,
                                notes:
                                  value === "Íntegro"
                                    ? ""
                                    : current.notes,
                              }
                            : current
                        )
                      }
                    >
                      <SelectTrigger
                        id="daily-entry-fragile-state"
                        aria-label="Estado da verificação de Quebráveis"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Íntegro">Íntegro</SelectItem>
                        <SelectItem value="Danificado">Danificado</SelectItem>
                        <SelectItem value="Em falta">Em falta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="daily-entry-fragile-periodicity">Periodicidade registada</Label>
                    <Select
                      value={editingEntry?.fragilePeriodicity ?? "M"}
                      onValueChange={value =>
                        setEditingEntry(current =>
                          current
                            ? {
                                ...current,
                                fragilePeriodicity: value as "D" | "S" | "Q" | "M",
                              }
                            : current
                        )
                      }
                    >
                      <SelectTrigger
                        id="daily-entry-fragile-periodicity"
                        aria-label="Periodicidade registada de Quebráveis"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="D">D — Diária</SelectItem>
                        <SelectItem value="S">S — Semanal</SelectItem>
                        <SelectItem value="Q">Q — Quinzenal</SelectItem>
                        <SelectItem value="M">M — Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily-entry-fragile-containment">
                    Ação de contenção / observações do desvio
                  </Label>
                  <Textarea
                    id="daily-entry-fragile-containment"
                    value={editingEntry?.fragileContainmentAction ?? ""}
                    required={editingEntry?.fragileState !== "Íntegro"}
                    onChange={event =>
                      setEditingEntry(current =>
                        current
                          ? {
                              ...current,
                              fragileContainmentAction: event.target.value,
                              notes: event.target.value,
                            }
                          : current
                      )
                    }
                    placeholder="Obrigatório quando o quebrável está danificado ou em falta."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily-entry-fragile-reference-image">
                    Imagem de referência
                  </Label>
                  <Input
                    id="daily-entry-fragile-reference-image"
                    value={editingEntry?.fragileReferenceImageUrl ?? ""}
                    onChange={event =>
                      setEditingEntry(current =>
                        current
                          ? {
                              ...current,
                              fragileReferenceImageUrl: event.target.value || null,
                            }
                          : current
                      )
                    }
                    placeholder="/manus-storage/..."
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-amber-200 bg-white p-3">
                  <div>
                    <Label htmlFor="daily-entry-fragile-evidence">
                      Fotografias da verificação
                    </Label>
                    <p className="mt-1 text-xs text-slate-600">
                      Pode manter, remover ou adicionar fotografias. O histórico da edição fica preservado.
                    </p>
                  </div>
                  {editingEntry?.fragileEvidencePhotos.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {editingEntry.fragileEvidencePhotos.map(photo => (
                        <div key={photo.key} className="relative rounded-lg border border-slate-200 p-1">
                          <img
                            src={photo.url}
                            alt={`Evidência: ${photo.fileName}`}
                            className="h-20 w-full rounded object-cover"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-7 w-full text-xs text-red-700 hover:text-red-800"
                            onClick={() => removeFragileEditPhoto(photo.key)}
                          >
                            Remover
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-slate-300 p-2 text-xs text-slate-600">
                      Sem fotografias associadas.
                    </p>
                  )}
                  <Input
                    id="daily-entry-fragile-evidence"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadFragileEditEvidence.isPending}
                    onChange={event => {
                      void uploadFragileEditPhoto(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
              </section>
            )}
            {(isBphf || isSensory) && (
              <div className="space-y-2">
                <Label
                  htmlFor={
                    isSensory
                      ? "daily-entry-sensory-collaborator"
                      : "daily-entry-bphf-collaborator"
                  }
                >
                  {isSensory
                    ? "Colaborador responsável pelo produto"
                    : "Colaborador inspecionado"}
                </Label>
                <Select
                  value={String(editingEntry?.collaboratorId ?? "none")}
                  onValueChange={value =>
                    setEditingEntry(current =>
                      current
                        ? {
                            ...current,
                            collaboratorId:
                              value === "none" ? null : Number(value),
                          }
                        : current
                    )
                  }
                >
                  <SelectTrigger
                    id={
                      isSensory
                        ? "daily-entry-sensory-collaborator"
                        : "daily-entry-bphf-collaborator"
                    }
                    aria-label={
                      isSensory
                        ? "Colaborador responsável pelo produto"
                        : "Colaborador inspecionado"
                    }
                  >
                    <SelectValue placeholder="Selecione o colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem colaborador / não aplicável</SelectItem>
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
                <p className="text-xs text-slate-500">
                  {isSensory
                    ? "Selecione o colaborador responsável pelo produto avaliado. A alteração ficará no histórico e na incidência associada."
                    : "Selecione o colaborador observado neste registo BPHF. A alteração ficará no histórico."}
                </p>
              </div>
            )}
            {supportsProductDetails && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="daily-entry-product">Nome do produto</Label>
                  <Input
                    id="daily-entry-product"
                    required={isSensory}
                    value={editingEntry?.productName ?? ""}
                    onChange={event =>
                      setEditingEntry(current =>
                        current
                          ? { ...current, productName: event.target.value }
                          : current
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily-entry-lot">Lote</Label>
                  <Input
                    id="daily-entry-lot"
                    value={editingEntry?.lot ?? ""}
                    onChange={event =>
                      setEditingEntry(current =>
                        current
                          ? { ...current, lot: event.target.value }
                          : current
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily-entry-validity">Validade</Label>
                  <Input
                    id="daily-entry-validity"
                    type="date"
                    value={editingEntry?.validity ?? ""}
                    onChange={event =>
                      setEditingEntry(current =>
                        current
                          ? { ...current, validity: event.target.value }
                          : current
                      )
                    }
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Resultado</Label>
              <Select
                value={editingEntry?.result ?? "C"}
                  onValueChange={value =>
                    setEditingEntry(current =>
                      current
                        ? {
                            ...current,
                            result: value,
                            ...(isFragile && value === "C"
                              ? {
                                  fragileState: "Íntegro" as const,
                                  fragileContainmentAction: "",
                                  fragileEvidencePhotos: [],
                                  notes: "",
                                }
                              : isFragile && value === "NC"
                                ? {
                                    fragileState: "Danificado" as const,
                                  }
                                : {}),
                          }
                        : current
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
            <div className="space-y-2">
              <Label htmlFor="daily-entry-notes">Observações</Label>
              <Textarea
                id="daily-entry-notes"
                value={editingEntry?.notes ?? ""}
                onChange={event =>
                  setEditingEntry(current =>
                    current
                      ? { ...current, notes: event.target.value }
                      : current
                  )
                }
              />
            </div>
            <Button
              className="w-full"
              disabled={
                updateControlEntry.isPending ||
                (isSensory && !editingEntry?.productName.trim())
              }
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
            <AlertDialogTitle>Eliminar registo?</AlertDialogTitle>
            <AlertDialogDescription>
              O resultado deixará de aparecer nos painéis, relatórios e
              indicadores. A ação fica registada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-800"
              disabled={deleteControlEntry.isPending}
              onClick={() =>
                deletingEntry &&
                deleteControlEntry.mutate({ id: deletingEntry.id })
              }
            >
              {deleteControlEntry.isPending
                ? "A eliminar…"
                : "Eliminar registo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ControlScheduleSummary({
  module,
  operationalDate,
  isPreviousPending,
  isFuturePlanned,
  pendingTasks,
  isLoading,
}: {
  module: string;
  operationalDate: Date;
  isPreviousPending: boolean;
  isFuturePlanned: boolean;
  pendingTasks: PendingControlTask[];
  isLoading: boolean;
}) {
  const hrefFor = (task: PendingControlTask) => {
    const dueDate = new Date(task.dueAt);
    const plannedDate = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;
    const params = new URLSearchParams({
      plannedTaskId: String(task.id),
      plannedDate,
    });
    if (task.factoryId !== null)
      params.set("factoryId", String(task.factoryId));
    return `/controlos/${module}?${params.toString()}`;
  };
  return (
      <Card className="border-0 panel-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleAlert className="h-4 w-4 text-amber-600" />
            Pendências e seguimentos anteriores
          </CardTitle>
          <CardDescription>
            Abra cada item para preencher o controlo ou registar o resultado do
            seguimento na respetiva data prevista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
              A procurar pendências anteriores…
            </p>
          ) : pendingTasks.length ? (
            <div className="divide-y overflow-hidden rounded-xl border border-amber-100">
              {pendingTasks.map(task => (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-950">
                      {task.isFollowUp ? "Seguimento pendente" : "Pendente desde"}{" "}
                      {new Date(task.dueAt).toLocaleDateString("pt-PT")}
                    </p>
                    {task.title ? <p className="mt-1 text-sm font-medium text-slate-800">{task.title}</p> : null}
                    {task.description ? <p className="mt-1 text-sm text-slate-600">{task.description}</p> : null}
                    <p className="mt-1 text-sm text-muted-foreground">
                      {task.responsible
                        ? `Responsável atribuído: ${task.responsible}`
                        : "Plano do Dia publicado"}
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                  >
                    <Link href={task.isFollowUp ? `/?taskId=${task.id}` : hrefFor(task)}>
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      {task.isFollowUp ? "Abrir seguimento" : "Abrir pendência"}
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
              Não existem pendências de dias anteriores para este controlo.
            </p>
          )}
        </CardContent>
      </Card>
  );
}

function ModuleHeader({
  label,
  description,
  icon: Icon,
  critical = false,
  commonToAllOperations = false,
  hideProgress = false,
  children,
}: {
  label: string;
  description: string;
  icon: typeof ClipboardCheck;
  critical?: boolean;
  commonToAllOperations?: boolean;
  hideProgress?: boolean;
  children?: React.ReactNode;
}) {
  const { factories, factoryId, setFactoryId } = useControlFactory();
  const { dateKey, setDateKey } = useControlOperationalDate();
  const helpAnchor =
    (
      {
        "Verificação de BPHF": "bphf",
        "Verificação de detetores de metais": "metal_detectors",
        "Controlo sensorial de produto acabado": "sensory",
        "Controlo de amostras em shelf_life": "shelf_life",
        "Controlo de amostras em shelf-life": "shelf_life",
        "Checklist mensal": "monthly_checklist",
        "Caixas de sugestões": "suggestion_boxes",
        Quebráveis: "fragile_items",
        "Controlo à expedição": "dispatch_control",
        "Análises internas": "internal_analysis",
        "Controlos de Temperatura": "temperature_controls",
        "Food Defense": "food_defense",
      } as Record<string, string>
    )[label] ?? "bphf";
  const selectClass = critical
    ? "border-red-200 bg-white text-red-900"
    : "border-slate-600 bg-slate-800 text-white [&>svg]:text-slate-300";
  const progressState = React.useContext(ModuleProgressContext);
  const progress = progressState.items[helpAnchor];
  const scheduledFactories = (progressState.byFactory[helpAnchor] ?? [])
    .filter(item => item.expected > 0)
    .map(item => ({
      ...item,
      name:
        factories.find(factory => factory.id === item.factoryId)?.name ??
        "Fábrica",
    }));
  const progressValue = progress?.percentage ?? 0;

  return (
    <header
      className={
        critical
          ? "rounded-2xl border border-red-200 bg-red-50 px-6 py-5"
          : "rounded-2xl bg-slate-900 px-6 py-5 text-white"
      }
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/controlos">
            <Button
              variant={critical ? "outline" : "secondary"}
              size="icon"
              className={
                critical
                  ? "border-red-200 bg-white text-red-800 hover:bg-red-100"
                  : "bg-slate-800 text-white hover:bg-slate-700"
              }
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={
                critical
                  ? "rounded-xl bg-red-100 p-3 text-red-700"
                  : "rounded-xl bg-teal-500/15 p-3 text-teal-300"
              }
            >
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p
                className={
                  critical
                    ? "font-mono-ui text-xs uppercase tracking-[0.17em] text-red-700"
                    : "font-mono-ui text-xs uppercase tracking-[0.17em] text-teal-300"
                }
              >
                Registo operacional
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {label}
              </h1>
              <p
                className={
                  critical
                    ? "mt-1 text-sm text-red-800"
                    : "mt-1 text-sm text-slate-300"
                }
              >
                {description}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div
            className={
              critical
                ? "rounded-xl border border-red-200 bg-white/80 p-3"
                : "rounded-xl border border-slate-700 bg-slate-800/70 p-3"
            }
          >
            <div className="flex items-center gap-2">
              <CalendarClock
                className={
                  critical ? "h-4 w-4 text-red-700" : "h-4 w-4 text-teal-300"
                }
              />
              <Label
                htmlFor="control-operational-date"
                className={
                  critical
                    ? "text-xs font-medium text-red-800"
                    : "text-xs font-medium text-slate-200"
                }
              >
                Data do controlo
              </Label>
            </div>
            <Input
              id="control-operational-date"
              type="date"
              value={dateKey}
              aria-label="Data do controlo"
              onChange={event => setDateKey(event.target.value)}
              className={`mt-2 h-10 min-w-44 ${selectClass}`}
            />
          </div>
          {!commonToAllOperations && (
            <div
              className={
                critical
                  ? "rounded-xl border border-red-200 bg-white/80 p-3"
                  : "rounded-xl border border-slate-700 bg-slate-800/70 p-3"
              }
            >
              <div className="flex items-center gap-2">
                <Factory
                  className={
                    critical ? "h-4 w-4 text-red-700" : "h-4 w-4 text-teal-300"
                  }
                />
                <span
                  className={
                    critical
                      ? "text-xs font-medium text-red-800"
                      : "text-xs font-medium text-slate-200"
                  }
                >
                  Fábrica / linha
                </span>
              </div>
              <Select value={factoryId} onValueChange={setFactoryId}>
                <SelectTrigger
                  className={`mt-2 w-full min-w-60 ${selectClass}`}
                >
                  <SelectValue placeholder="Selecione a fábrica" />
                </SelectTrigger>
                <SelectContent>
                  {factories.map(factory => (
                    <SelectItem key={factory.id} value={String(factory.id)}>
                      {factory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Link href={`/ajuda#${helpAnchor}`}>
            <Button
              variant={critical ? "outline" : "secondary"}
              className={
                critical
                  ? "border-red-200 bg-white text-red-800 hover:bg-red-100"
                  : "bg-slate-800 text-white hover:bg-slate-700"
              }
            >
              <CircleHelp className="mr-2 h-4 w-4" />
              Ajuda
            </Button>
          </Link>
        </div>
      </div>
      {children}
      {!hideProgress && (
        <div
          className={
            critical
              ? "mt-5 rounded-xl border border-red-200 bg-white/80 p-4"
              : "mt-5 rounded-xl border border-slate-700 bg-slate-800/70 p-4"
          }
          aria-label="Evolução do preenchimento por fábrica"
        >
          <div className="flex items-center justify-between gap-4">
            <span
              className={
                critical
                  ? "text-sm font-medium text-red-900"
                  : "text-sm font-medium text-white"
              }
            >
              {commonToAllOperations
                ? "Preenchimento do controlo comum"
                : "Preenchimento por fábrica"}
            </span>
            {commonToAllOperations && (
              <span
                className={
                  critical
                    ? "font-mono-ui text-sm text-red-800"
                    : "font-mono-ui text-sm text-teal-300"
                }
              >
                {progressState.isLoading ? "A calcular…" : `${progressValue}%`}
              </span>
            )}
          </div>
          {progressState.isLoading ? (
            <p
              className={
                critical
                  ? "mt-3 text-xs text-red-800"
                  : "mt-3 text-xs text-slate-300"
              }
            >
              A obter os controlos agendados…
            </p>
          ) : commonToAllOperations ? (
            <>
              <Progress value={progressValue} className="mt-3 h-2" />
              <p
                className={
                  critical
                    ? "mt-2 text-xs text-red-800"
                    : "mt-2 text-xs text-slate-300"
                }
              >
                {progress?.expected
                  ? `${progress.completed} de ${progress.expected} verificações concluídas`
                  : "Sem controlos agendados"}
              </p>
            </>
          ) : scheduledFactories.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scheduledFactories.map(item => (
                <div
                  key={item.factoryId}
                  className={
                    critical
                      ? "rounded-xl border border-red-100 bg-white p-3"
                      : "rounded-xl border border-slate-700 bg-slate-900/50 p-3"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className={
                        critical
                          ? "text-sm font-medium text-red-950"
                          : "text-sm font-medium text-white"
                      }
                    >
                      {item.name}
                    </p>
                    <span
                      className={
                        critical
                          ? "font-mono-ui text-sm text-red-800"
                          : "font-mono-ui text-sm text-teal-300"
                      }
                    >
                      {item.percentage}%
                    </span>
                  </div>
                  <Progress value={item.percentage} className="mt-3 h-2" />
                  <p
                    className={
                      critical
                        ? "mt-2 text-xs text-red-800"
                        : "mt-2 text-xs text-slate-300"
                    }
                  >
                    {item.completed} de {item.expected} controlo
                    {item.expected === 1 ? "" : "s"} concluído
                    {item.completed === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p
              className={
                critical
                  ? "mt-3 text-sm text-red-800"
                  : "mt-3 text-sm text-slate-300"
              }
            >
              Sem controlos agendados
            </p>
          )}
        </div>
      )}
    </header>
  );
}

function Notes({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>Observações {required ? "(obrigatórias)" : ""}</Label>
      <Textarea
        value={value}
        required={required}
        onChange={event => onChange(event.target.value)}
        placeholder="Registe observações, evidências ou contexto relevante."
      />
    </div>
  );
}

function NcEvidenceUploader({
  module,
  photos,
  onChange,
  title = "Fotografia da incidência",
  description = "Anexe fotografias do desvio ou da incidência. Formatos JPG, PNG ou WEBP até 4,5 MB.",
  maxPhotos = 5,
  tone = "red",
}: {
  module: (typeof MODULES)[number]["id"];
  photos: VerificationEvidencePhoto[];
  onChange: (photos: VerificationEvidencePhoto[]) => void;
  title?: string;
  description?: string;
  maxPhotos?: number;
  tone?: "red" | "teal";
}) {
  const { factoryId } = useControlFactory();
  const upload = trpc.quality.uploadVerificationEvidence.useMutation({
    onError: error => toast.error(error.message),
  });
  const isTeal = tone === "teal";
  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (photos.length >= maxPhotos)
      return toast.error(
        `Pode anexar no máximo ${maxPhotos} fotografia${maxPhotos === 1 ? "" : "s"}.`
      );
    if (!file.type.match(/^image\/(jpeg|png|webp)$/))
      return toast.error("Use uma imagem JPG, PNG ou WEBP.");
    if (file.size > 4_500_000)
      return toast.error("A fotografia deve ter no máximo 4,5 MB.");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Não foi possível ler a fotografia."));
        reader.readAsDataURL(file);
      });
      upload.mutate(
        {
          module,
          factoryId: factoryId ? Number(factoryId) : null,
          fileName: file.name,
          mimeType: file.type as VerificationEvidencePhoto["mimeType"],
          dataUrl,
        },
        {
          onSuccess: photo => {
            onChange([...photos, photo]);
            toast.success(`${title} adicionada.`);
          },
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a fotografia."
      );
    }
  }
  return (
    <div
      className={`space-y-3 rounded-xl border border-dashed p-4 ${isTeal ? "border-teal-200 bg-teal-50/60" : "border-red-200 bg-red-50/60"}`}
    >
      <div>
        <Label>{title}</Label>
        <p
          className={`mt-1 text-xs leading-5 ${isTeal ? "text-teal-900" : "text-red-900"}`}
        >
          {description}
        </p>
      </div>
      <Input
        aria-label={title}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={event => uploadPhoto(event.target.files?.[0])}
        disabled={upload.isPending || photos.length >= maxPhotos}
      />
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map(photo => (
            <div key={photo.url} className="relative">
              <img
                src={photo.url}
                alt={`${title}: ${photo.fileName}`}
                className={`h-24 w-full rounded-lg border object-cover ${isTeal ? "border-teal-100" : "border-red-100"}`}
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -right-2 -top-2 h-5 w-5 rounded-full"
                aria-label={`Remover ${photo.fileName}`}
                onClick={() =>
                  onChange(photos.filter(item => item.url !== photo.url))
                }
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ControlAccessBlocked({
  module,
  label,
  description,
  reason,
  isLoading,
  results,
  operationalDate,
  resultsLoading,
  requiresFactory,
}: {
  module: keyof typeof CONTROL_ICONS;
  label: string;
  description: string;
  reason: string;
  isLoading: boolean;
  results: DailyControlEntry[];
  operationalDate: Date;
  resultsLoading: boolean;
  requiresFactory: boolean;
}) {
  const Icon = CONTROL_ICONS[module];
  const commonToAllOperations =
    module === "dispatch_control" || module === "internal_analysis";
  return (
    <>
      <ModuleHeader
        label={label}
        description={description}
        icon={Icon}
        critical={module === "metal_detectors"}
        commonToAllOperations={commonToAllOperations}
      />
      <Card className="border border-amber-200 bg-amber-50/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-800">
            <CircleAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-amber-950">
              Preenchimento indisponível
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900">
              {isLoading
                ? "A confirmar a autorização do Plano do Dia…"
                : reason}
            </p>
            <p className="mt-3 text-sm text-amber-800">
              A Responsável de Qualidade deve publicar o controlo, atribuir-lhe
              um responsável e selecionar a fábrica ou linha aplicável antes do
              preenchimento.
            </p>
          </div>
        </CardContent>
      </Card>
      <DailyControlResults
        results={results}
        operationalDate={operationalDate}
        isLoading={resultsLoading}
        requiresFactory={requiresFactory}
        module={module}
      />
    </>
  );
}

function PreviousPlanNotice({
  dueAt,
  performedDate,
  onPerformedDateChange,
  reason,
  onReasonChange,
  justification,
  onJustificationChange,
}: {
  dueAt: Date | string | null | undefined;
  performedDate: string;
  onPerformedDateChange: (value: string) => void;
  reason: RetroactiveReason | "";
  onReasonChange: (value: RetroactiveReason) => void;
  justification: string;
  onJustificationChange: (value: string) => void;
}) {
  if (!dueAt) return null;
  const plannedDate = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (plannedDate >= today) return null;
  const toDateInputValue = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return (
    <Card className="border-2 border-amber-300 bg-amber-50 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-200 p-3 text-amber-950">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono-ui text-xs font-bold uppercase tracking-[0.16em] text-amber-900">
                Controlo retroativo
              </p>
              <p className="mt-1 font-semibold text-amber-950">
                Este controlo é relativo ao dia{" "}
                <span className="inline-flex rounded-md bg-amber-200 px-2 py-0.5 font-mono-ui text-base font-bold text-amber-950">
                  {plannedDate.toLocaleDateString("pt-PT")}
                </span>
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
                Está a preencher verificações previstas para esta data, e não
                para o dia atual. A data prevista será mantida no registo.
              </p>
            </div>
          </div>
          <div className="w-full space-y-2">
            <Label className="font-semibold text-amber-950">
              {reason === "technical_unavailability"
                ? "Data real da verificação"
                : "Data de realização"}
            </Label>
            <Input
              required
              type="date"
              min={toDateInputValue(plannedDate)}
              max={toDateInputValue(today)}
              value={performedDate}
              onChange={event => onPerformedDateChange(event.target.value)}
              className="border-amber-300 bg-white text-slate-950"
            />
            {reason === "technical_unavailability" ? (
              <p className="text-xs leading-5 text-amber-900">
                Indique obrigatoriamente o dia em que a verificação foi
                efetivamente realizada.
              </p>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white/70 p-4">
          <Label className="font-semibold text-amber-950">
            Justificação do preenchimento fora da data prevista
          </Label>
          <Select
            value={reason}
            onValueChange={value => onReasonChange(value as RetroactiveReason)}
          >
            <SelectTrigger className="mt-2 border-amber-300 bg-white text-slate-950">
              <SelectValue placeholder="Selecione a justificação obrigatória" />
            </SelectTrigger>
            <SelectContent>
              {RETROACTIVE_REASON_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {reason === "other" && (
            <div className="mt-3 space-y-2">
              <Label className="text-amber-950">Indique a justificação</Label>
              <Textarea
                required
                value={justification}
                onChange={event => onJustificationChange(event.target.value)}
                placeholder="Descreva o motivo do preenchimento fora da data prevista."
                className="border-amber-300 bg-white text-slate-950"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AnticipatedPlanNotice({
  dueAt,
}: {
  dueAt: Date | string | null | undefined;
}) {
  if (!dueAt) return null;
  const plannedDate = new Date(dueAt);
  return (
    <Card className="border-2 border-sky-300 bg-sky-50 shadow-sm">
      <CardContent className="flex items-start gap-3 p-5">
        <div className="rounded-xl bg-sky-200 p-3 text-sky-950">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <p className="font-mono-ui text-xs font-bold uppercase tracking-[0.16em] text-sky-900">
            Controlo antecipado
          </p>
          <p className="mt-1 font-semibold text-sky-950">
            Está a antecipar um controlo previsto para{" "}
            <span className="inline-flex rounded-md bg-sky-200 px-2 py-0.5 font-mono-ui text-base font-bold text-sky-950">
              {plannedDate.toLocaleDateString("pt-PT")}
            </span>
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-900">
            O controlo ficará concluído no Plano do Dia dessa data, mas o
            registo identificará a realização antecipada e a data efetiva de
            hoje.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ModuleControl() {
  const [, params] = useRoute("/controlos/:module");
  const [, setLocation] = useLocation();
  const module = params?.module ?? "bphf";
  const { activeProfile } = useQualityAccess();
  const search = useSearch();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const config = MODULES.find(item => item.id === module);
  const metadata = trpc.quality.metadata.useQuery();
  const bphfAreas = Array.from(
    new Set(
      metadata.data?.areas
        .filter(area => area.group === "bphf")
        .map(area => area.name) ?? []
    )
  );
  const factories = metadata.data?.factories ?? [];
  const [factoryId, setFactoryId] = useState(
    () => queryParams.get("factoryId") ?? readControlFactoryScope()
  );
  const metalAreasForFactory = factoryId
    ? (metadata.data?.areas
        .filter(
          area => area.group === "metal" && area.factoryId === Number(factoryId)
        )
        .map(area => area.name) ?? [])
    : [];
  useEffect(() => {
    writeControlFactoryScope(factoryId);
  }, [factoryId]);
  const bphfAreasForFactory = factoryId
    ? (metadata.data?.areas
        .filter(
          area =>
            area.group === "bphf" &&
            area.factoryId === Number(factoryId) &&
            ["Embalagem", "Limpeza", "Produção"].includes(area.name)
        )
        .map(area => area.name) ?? [])
    : [];
  const isSharedControl =
    module === "dispatch_control" || module === "internal_analysis";
  const plannedTaskId = Number(queryParams.get("plannedTaskId")) || undefined;
  const focusedEntryId = Number(queryParams.get("entryId")) || undefined;
  const openFocusedEntryForEditing = queryParams.get("edit") === "1";
  const plannedDateKey = queryParams.get("plannedDate");
  const explicitDateKey = queryParams.get("date");
  const storedOperationalDateKey = readControlOperationalDate(module);
  const hasExplicitOperationalDate =
    isOperationalDateKey(explicitDateKey);
  const [operationalDateKey, setOperationalDateKey] = useState(() => {
    if (isOperationalDateKey(explicitDateKey)) return explicitDateKey;
    if (isOperationalDateKey(plannedDateKey)) return plannedDateKey;
    return storedOperationalDateKey ?? currentLisbonDateKey();
  });
  const resultsOnly = queryParams.get("view") === "results";
  const operationalDate = useMemo(
    () => dateFromOperationalDateKey(operationalDateKey),
    [operationalDateKey]
  );
  useEffect(() => {
    const factoryFromQuery = queryParams.get("factoryId");
    if (factoryFromQuery) setFactoryId(factoryFromQuery);
  }, [queryParams]);
  useEffect(() => {
    const dateFromQuery = isOperationalDateKey(explicitDateKey)
      ? explicitDateKey
      : isOperationalDateKey(plannedDateKey)
        ? plannedDateKey
        : undefined;
    if (dateFromQuery) {
      setOperationalDateKey(dateFromQuery);
      return;
    }
    setOperationalDateKey(
      readControlOperationalDate(module) ?? currentLisbonDateKey()
    );
  }, [explicitDateKey, module, plannedDateKey]);
  const selectOperationalDate = (value: string) => {
    if (!isOperationalDateKey(value)) return;
    writeControlOperationalDate(module, value);
    setOperationalDateKey(value);
    const next = new URLSearchParams(search);
    next.set("date", value);
    next.delete("plannedDate");
    next.delete("plannedTaskId");
    next.delete("pending");
    next.delete("entryId");
    next.delete("edit");
    setLocation(`/controlos/${module}?${next.toString()}`);
  };
  const authorization = trpc.quality.controlAuthorization?.useQuery?.({
    module: (config?.id ?? "bphf") as (typeof MODULES)[number]["id"],
    factoryId: isSharedControl
      ? undefined
      : factoryId
        ? Number(factoryId)
        : undefined,
    plannedTaskId,
    plannedDate: operationalDate,
    viewerProfileId: activeProfile?.id,
  }) ?? { data: undefined, isLoading: false };
  const progressDateInput = useMemo(() => {
    const dueAt =
      !hasExplicitOperationalDate &&
      (authorization.data?.isPreviousPending ||
        authorization.data?.isFuturePlanned)
        ? authorization.data.dueAt
        : undefined;
    if (dueAt) {
      const plannedDate = new Date(dueAt);
      return new Date(
        plannedDate.getFullYear(),
        plannedDate.getMonth(),
        plannedDate.getDate(),
        12
      );
    }
    return operationalDate;
  }, [
    authorization.data?.dueAt,
    authorization.data?.isFuturePlanned,
    authorization.data?.isPreviousPending,
    hasExplicitOperationalDate,
    operationalDate,
  ]);
  const dashboard = trpc.quality.dashboard.useQuery({
    date: progressDateInput,
  });
  const controlFactories = useMemo(() => {
    if (module !== "food_defense") return factories;
    const scheduledFactoryIds = new Set(
      ((dashboard.data?.moduleProgressByFactory as Record<
        string,
        FactoryModuleProgress[]
      > | undefined)?.food_defense ?? [])
        .filter(item => item.expected > 0)
        .map(item => item.factoryId)
    );
    return scheduledFactoryIds.size
      ? factories.filter(factory => scheduledFactoryIds.has(factory.id))
      : factories;
  }, [dashboard.data?.moduleProgressByFactory, factories, module]);
  useEffect(() => {
    if (
      module === "food_defense" &&
      factoryId &&
      controlFactories.length &&
      !controlFactories.some(factory => factory.id === Number(factoryId))
    )
      setFactoryId(String(controlFactories[0].id));
  }, [controlFactories, factoryId, module]);
  const dailyResultsInput = useMemo(
    () => ({
      module: (config?.id ?? "bphf") as (typeof MODULES)[number]["id"],
      operationalDate: progressDateInput,
      factoryId: isSharedControl
        ? null
        : factoryId
          ? Number(factoryId)
          : undefined,
    }),
    [config?.id, factoryId, isSharedControl, progressDateInput]
  );
  const dailyResults = trpc.quality.dailyControlResults?.useQuery?.(
    dailyResultsInput,
    { enabled: Boolean(config) && (isSharedControl || Boolean(factoryId)) }
  ) ?? { data: undefined, isLoading: false };
  const pendingTasksInput = useMemo(
    () => ({
      module: (config?.id ?? "bphf") as (typeof MODULES)[number]["id"],
      factoryId: isSharedControl
        ? null
        : factoryId
          ? Number(factoryId)
          : undefined,
      viewerProfileId: activeProfile?.id,
    }),
    [activeProfile?.id, config?.id, factoryId, isSharedControl]
  );
  const pendingTasks = trpc.quality.pendingControlTasks?.useQuery?.(
    pendingTasksInput,
    { enabled: Boolean(config) && (isSharedControl || Boolean(factoryId)) }
  ) ?? { data: undefined, isLoading: false };
  const utils = trpc.useUtils();
  const [performedDate, setPerformedDate] = useState("");
  const [retroactiveReason, setRetroactiveReason] = useState<
    RetroactiveReason | ""
  >("");
  const [retroactiveJustification, setRetroactiveJustification] = useState("");
  useEffect(() => {
    if (authorization.data?.isPreviousPending && authorization.data.dueAt) {
      const date = new Date(authorization.data.dueAt);
      setPerformedDate(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      );
    } else {
      setPerformedDate("");
      setRetroactiveReason("");
      setRetroactiveJustification("");
    }
  }, [authorization.data?.dueAt, authorization.data?.isPreviousPending]);
  const createEntry = trpc.quality.createEntry.useMutation({
    onSuccess: data => {
      utils.quality.dashboard.invalidate();
      utils.quality.reports.invalidate();
      utils.quality.listNcs.invalidate();
      utils.quality.fragilePending.invalidate();
      utils.quality.temperatureHistory.invalidate();
      utils.quality.controlAuthorization.invalidate();
      utils.quality.pendingControlTasks.invalidate();
      utils.quality.listTasks.invalidate();
      utils.quality.dailyControlResults?.invalidate?.();
      utils.quality.fragileInspectionHistory?.invalidate?.();
      toast[data.critical ? "error" : "success"](
        data.critical
          ? "Incidência crítica registada. Crie uma Não Conformidade no formulário próprio se necessário."
          : "Controlo registado com sucesso."
      );
    },
    onError: error => toast.error(error.message),
  });
  if (!config) return <div className="p-8">Módulo não encontrado.</div>;
  const withRetroactiveJustification = (input: any) => {
    if (!authorization.data?.isPreviousPending) return input;
    if (!retroactiveReason) {
      toast.error(
        "Selecione a justificação do preenchimento fora da data prevista."
      );
      return null;
    }
    if (retroactiveReason === "other" && !retroactiveJustification.trim()) {
      toast.error("Indique a justificação para a opção selecionada.");
      return null;
    }
    return {
      ...input,
      performedAt: performedDate,
      retroactiveReason,
      retroactiveJustification:
        retroactiveReason === "other"
          ? retroactiveJustification.trim()
          : undefined,
    };
  };
  const scopedCreateEntry = {
    isPending: createEntry.isPending,
    mutate: (input: any) => {
      const datedInput = withRetroactiveJustification(input);
      if (!datedInput) return;
      const taskInput = datedInput.plannedTaskId ?? authorization.data?.taskId
        ? {
            ...datedInput,
            plannedTaskId:
              datedInput.plannedTaskId ?? authorization.data?.taskId,
          }
        : datedInput;
      if (isSharedControl) return createEntry.mutate(taskInput);
      if (!factoryId)
        return toast.error(
          "Selecione a fábrica ou linha antes de registar o controlo."
        );
      createEntry.mutate({ ...taskInput, factoryId: Number(factoryId) });
    },
    mutateAsync: async (input: any) => {
      const datedInput = withRetroactiveJustification(input);
      if (!datedInput) throw new Error("Justificação retroativa obrigatória");
      const taskInput = datedInput.plannedTaskId ?? authorization.data?.taskId
        ? {
            ...datedInput,
            plannedTaskId:
              datedInput.plannedTaskId ?? authorization.data?.taskId,
          }
        : datedInput;
      if (isSharedControl) return createEntry.mutateAsync(taskInput);
      if (!factoryId) {
        toast.error(
          "Selecione a fábrica ou linha antes de registar o controlo."
        );
        throw new Error("Fábrica obrigatória");
      }
      return createEntry.mutateAsync({
        ...taskInput,
        factoryId: Number(factoryId),
      });
    },
  };
  const props = {
    createEntry: scopedCreateEntry,
    plannedTaskId: authorization.data?.taskId,
    referenceDate: authorization.data?.dueAt,
    bphfCriteria: authorization.data?.bphfCriteria,
    bphfCriterionTaskIds: authorization.data?.bphfCriterionTaskIds,
    metalDetectorLines: authorization.data?.metalDetectorLines,
    foodDefenseEntries:
      module === "food_defense"
        ? ((dailyResults.data?.entries ?? []) as DailyControlEntry[])
        : [],
  };
  if (resultsOnly)
    return (
      <ControlOperationalDateContext.Provider
        value={{ dateKey: operationalDateKey, setDateKey: selectOperationalDate }}
      >
        <ControlFactoryContext.Provider
          value={{ factories: controlFactories, factoryId, setFactoryId }}
        >
        <ModuleProgressContext.Provider
          value={{
            items:
              (dashboard.data?.moduleProgress as
                | Record<string, ModuleProgress>
                | undefined) ?? {},
            byFactory:
              (dashboard.data?.moduleProgressByFactory as
                | Record<string, FactoryModuleProgress[]>
                | undefined) ?? {},
            isLoading: dashboard.isLoading,
          }}
        >
          <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6">
            <section className="mx-auto max-w-5xl space-y-6">
              <ModuleHeader
                label={config.label}
                description="Consulta dos resultados registados na data selecionada."
                icon={CONTROL_ICONS[config.id as keyof typeof CONTROL_ICONS]}
              />
              <DailyControlResults
                results={
                  (dailyResults.data?.entries ?? []) as DailyControlEntry[]
                }
                operationalDate={progressDateInput}
                isLoading={dailyResults.isLoading}
                requiresFactory={!isSharedControl && !factoryId}
                module={module}
                focusedEntryId={focusedEntryId}
                openFocusedEntryForEditing={openFocusedEntryForEditing}
              />
            </section>
          </div>
        </ModuleProgressContext.Provider>
        </ControlFactoryContext.Provider>
      </ControlOperationalDateContext.Provider>
    );
  if (
    authorization.isLoading ||
    (authorization.data && !authorization.data.allowed)
  )
    return (
      <ControlOperationalDateContext.Provider
        value={{ dateKey: operationalDateKey, setDateKey: selectOperationalDate }}
      >
        <ControlFactoryContext.Provider
          value={{ factories: controlFactories, factoryId, setFactoryId }}
        >
        <ModuleProgressContext.Provider
          value={{
            items:
              (dashboard.data?.moduleProgress as
                | Record<string, ModuleProgress>
                | undefined) ?? {},
            byFactory:
              (dashboard.data?.moduleProgressByFactory as
                | Record<string, FactoryModuleProgress[]>
                | undefined) ?? {},
            isLoading: dashboard.isLoading,
          }}
        >
          <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6">
            <section className="mx-auto max-w-5xl space-y-6">
              <ControlAccessBlocked
                module={config.id as keyof typeof CONTROL_ICONS}
                label={config.label}
                description={config.description}
                reason={
                  authorization.data?.reason ??
                  "A confirmar a autorização do Plano do Dia."
                }
                isLoading={authorization.isLoading}
                results={
                  (dailyResults.data?.entries ?? []) as DailyControlEntry[]
                }
                operationalDate={progressDateInput}
                resultsLoading={dailyResults.isLoading}
                requiresFactory={!isSharedControl && !factoryId}
              />
            </section>
          </div>
        </ModuleProgressContext.Provider>
        </ControlFactoryContext.Provider>
      </ControlOperationalDateContext.Provider>
    );
  return (
    <ControlOperationalDateContext.Provider
      value={{ dateKey: operationalDateKey, setDateKey: selectOperationalDate }}
    >
      <ControlFactoryContext.Provider
        value={{ factories: controlFactories, factoryId, setFactoryId }}
      >
      <ModuleProgressContext.Provider
        value={{
          items:
            (dashboard.data?.moduleProgress as
              | Record<string, ModuleProgress>
              | undefined) ?? {},
          byFactory:
            (dashboard.data?.moduleProgressByFactory as
              | Record<string, FactoryModuleProgress[]>
              | undefined) ?? {},
          isLoading: dashboard.isLoading,
        }}
      >
        <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6">
          <section className="mx-auto max-w-5xl space-y-6">
            <PreviousPlanNotice
              dueAt={
                authorization.data?.isPreviousPending
                  ? authorization.data.dueAt
                  : null
              }
              performedDate={performedDate}
              onPerformedDateChange={setPerformedDate}
              reason={retroactiveReason}
              onReasonChange={setRetroactiveReason}
              justification={retroactiveJustification}
              onJustificationChange={setRetroactiveJustification}
            />
            <AnticipatedPlanNotice
              dueAt={
                authorization.data?.isFuturePlanned
                  ? authorization.data.dueAt
                  : null
              }
            />
            <ControlScheduleSummary
              module={module}
              operationalDate={progressDateInput}
              isPreviousPending={Boolean(authorization.data?.isPreviousPending)}
              isFuturePlanned={Boolean(authorization.data?.isFuturePlanned)}
              pendingTasks={(pendingTasks.data ?? []) as PendingControlTask[]}
              isLoading={pendingTasks.isLoading}
            />
            {module === "bphf" && (
              <Bphf {...props} areas={bphfAreasForFactory} />
            )}
            {module === "metal_detectors" && (
              <MetalDetectors {...props} areas={metalAreasForFactory} />
            )}
            {module === "sensory" && <Sensory {...props} areas={bphfAreas} />}
            {module === "shelf_life" && (
              <ShelfLife {...props} areas={bphfAreas} />
            )}
            {module === "monthly_checklist" && (
              <MonthlyChecklistV2 {...props} />
            )}
            {module === "suggestion_boxes" && (
              <SuggestionBoxes {...props} factoryId={factoryId} />
            )}
            {module === "fragile_items" && (
              <>
                <ModuleHeader
                  label="Quebráveis"
                  description="Inspecione os pontos por periodicidade, área e estado de integridade."
                  icon={Boxes}
                />
                <FragileOperationsPanel
                  {...props}
                  factoryId={factoryId}
                  referenceDate={progressDateInput}
                  plannedTaskId={authorization.data?.taskId}
                  showHeader={false}
                />
              </>
            )}
            {module === "dispatch_control" && (
              <DispatchControl
                operationalDateKey={operationalDateKey}
                plannedTaskId={authorization.data?.taskId}
                isPreviousPending={Boolean(authorization.data?.isPreviousPending)}
                performedAt={
                  authorization.data?.isPreviousPending
                    ? performedDate
                    : undefined
                }
                retroactiveReason={retroactiveReason}
                retroactiveJustification={retroactiveJustification}
              />
            )}
            {module === "internal_analysis" && <InternalAnalysis {...props} />}
            {module === "temperature_controls" && (
              <TemperatureControls {...props} />
            )}
            {module === "food_defense" && <FoodDefense {...props} />}
            <DailyControlResults
              results={
                (dailyResults.data?.entries ?? []) as DailyControlEntry[]
              }
              operationalDate={progressDateInput}
                isLoading={dailyResults.isLoading}
                requiresFactory={!isSharedControl && !factoryId}
                module={module}
                focusedEntryId={focusedEntryId}
                openFocusedEntryForEditing={openFocusedEntryForEditing}
              />
          </section>
        </div>
      </ModuleProgressContext.Provider>
      </ControlFactoryContext.Provider>
    </ControlOperationalDateContext.Provider>
  );
}

function BphfLegacy({ createEntry, areas }: any) {
  const { factoryId } = useControlFactory();
  const areaSignature = areas.join("|");
  const employees = trpc.quality.listBphfInspectionEmployees.useQuery();
  const utils = trpc.useUtils();
  const [areasByCriterion, setAreasByCriterion] = useState<
    Record<string, string>
  >({});
  const [collaboratorsByCriterion, setCollaboratorsByCriterion] = useState<
    Record<string, string>
  >({});
  const [results, setResults] = useState<Record<string, Result | "">>(() =>
    Object.fromEntries(BPHF_CRITERIA.map(item => [item, ""]))
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [registered, setRegistered] = useState<Record<string, boolean>>({});
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [criterionForEmployee, setCriterionForEmployee] = useState<
    string | null
  >(null);
  const [inspectionFilter, setInspectionFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const inspectionInput = useMemo(
    () => ({
      collaboratorId:
        inspectionFilter === "all" ? undefined : Number(inspectionFilter),
      factoryId: factoryId ? Number(factoryId) : undefined,
      result: resultFilter === "all" ? undefined : (resultFilter as Result),
    }),
    [factoryId, inspectionFilter, resultFilter]
  );
  const inspections = trpc.quality.listBphfCollaboratorInspections.useQuery(
    inspectionInput,
    { enabled: Boolean(factoryId) }
  );
  const addEmployee = trpc.quality.addBphfInspectionEmployee.useMutation({
    onSuccess: employee => {
      utils.quality.listBphfInspectionEmployees.invalidate();
      if (criterionForEmployee)
        setCollaboratorsByCriterion(current => ({
          ...current,
          [criterionForEmployee]: String(employee.id),
        }));
      setNewEmployeeName("");
      setCriterionForEmployee(null);
      setEmployeeDialogOpen(false);
      toast.success(
        employee.alreadyExists
          ? "Colaborador já constava na lista e foi selecionado."
          : "Colaborador adicionado à lista de inspeção."
      );
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    setAreasByCriterion({});
    setCollaboratorsByCriterion({});
    setResults(Object.fromEntries(BPHF_CRITERIA.map(item => [item, ""])));
    setNotes({});
    setRegistered({});
  }, [areaSignature]);
  const openEmployeeDialog = (criterion: string) => {
    setCriterionForEmployee(criterion);
    setNewEmployeeName("");
    setEmployeeDialogOpen(true);
  };
  async function registerCriterion(criterion: (typeof BPHF_CRITERIA)[number]) {
    const area = areasByCriterion[criterion];
    const collaboratorId = collaboratorsByCriterion[criterion];
    const result = results[criterion];
    const collaborator = employees.data?.find(
      item => String(item.id) === collaboratorId
    );
    if (!area) return toast.error("Selecione a área verificada neste ponto.");
    if (!collaborator)
      return toast.error("Selecione o colaborador inspecionado neste ponto.");
    if (!result)
      return toast.error(
        "Selecione C, NC ou N/A antes de registar este ponto."
      );
    if (result === "NC" && !notes[criterion]?.trim())
      return toast.error("Inclua uma observação para o resultado NC.");
    await createEntry.mutateAsync({
      module: "bphf",
      title: criterion,
      area,
      result,
      notes: notes[criterion] || undefined,
      payload: {
        criterion,
        collaboratorId: collaborator.id,
        collaboratorName: collaborator.name,
      },
      createNonconformity: false,
      severity: "medium",
    });
    setRegistered(current => ({ ...current, [criterion]: true }));
    utils.quality.listBphfCollaboratorInspections.invalidate();
    toast.success(`Ponto BPHF registado para ${collaborator.name}.`);
  }
  return (
    <>
      <ModuleHeader
        label="Verificação de BPHF"
        description="Registe cada ponto de BPHF de forma independente, identificando a área e o colaborador inspecionado."
        icon={ShieldCheck}
      />
      <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-5">
        <p className="font-medium text-teal-950">
          Registo por ponto verificado
        </p>
        <p className="mt-1 text-sm text-teal-800">
          Cada ponto pode ser avaliado numa área diferente e em momentos
          distintos. Não existe uma resposta pré-selecionada: escolha sempre C,
          NC ou N/A antes de registar.
        </p>
      </div>
      <div className="space-y-5">
        {BPHF_CRITERIA.map((criterion, index) => {
          const result = results[criterion];
          return (
            <Card key={criterion} className="border-0 panel-shadow">
              <CardContent className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="font-mono-ui rounded-lg bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex items-start gap-1.5">
                        <p className="font-medium">{criterion}</p>
                        <ContextualHelpIcon
                          label={`Explicação do critério BPHF: ${criterion}`}
                          className="mt-0.5 shrink-0"
                        >
                          {BPHF_CRITERIA_HELP[criterion]}
                        </ContextualHelpIcon>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Preencha apenas quando este ponto for efetivamente
                        verificado.
                      </p>
                    </div>
                  </div>
                  {registered[criterion] && (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      Registado
                    </Badge>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Área verificada</Label>
                    <Select
                      value={areasByCriterion[criterion] ?? ""}
                      onValueChange={value =>
                        setAreasByCriterion(current => ({
                          ...current,
                          [criterion]: value,
                        }))
                      }
                      disabled={!areas.length}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            areas.length
                              ? "Selecione a área"
                              : "Selecione primeiro a fábrica"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {areas.map((item: string) => (
                          <SelectItem value={item} key={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Colaborador inspecionado</Label>
                    <div className="flex gap-2">
                      <Select
                        value={collaboratorsByCriterion[criterion] ?? ""}
                        onValueChange={value =>
                          setCollaboratorsByCriterion(current => ({
                            ...current,
                            [criterion]: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o colaborador" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.data?.map(employee => (
                            <SelectItem
                              key={employee.id}
                              value={String(employee.id)}
                            >
                              {employee.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Adicionar colaborador para ${criterion}`}
                        onClick={() => openEmployeeDialog(criterion)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Resultado</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["C", "NC", "N/A"] as Result[]).map(option => (
                      <Button
                        key={option}
                        type="button"
                        variant={
                          result === option
                            ? option === "NC"
                              ? "destructive"
                              : "default"
                            : "outline"
                        }
                        onClick={() =>
                          setResults(current => ({
                            ...current,
                            [criterion]: option,
                          }))
                        }
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
                <Notes
                  value={notes[criterion] ?? ""}
                  onChange={value =>
                    setNotes(current => ({ ...current, [criterion]: value }))
                  }
                  required={result === "NC"}
                />
                <Button
                  type="button"
                  className="w-full"
                  disabled={
                    createEntry.isPending ||
                    !areasByCriterion[criterion] ||
                    !collaboratorsByCriterion[criterion] ||
                    !result
                  }
                  variant={result === "NC" ? "destructive" : "default"}
                  onClick={() => registerCriterion(criterion)}
                >
                  {createEntry.isPending
                    ? "A registar…"
                    : registered[criterion]
                      ? "Registar nova verificação deste ponto"
                      : "Registar ponto verificado"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card className="border-0 panel-shadow">
        <CardHeader>
          <CardTitle>Colaboradores inspecionados</CardTitle>
          <CardDescription>
            Filtre os registos BPHF para consultar rapidamente o colaborador, o
            ponto avaliado e o resultado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              value={inspectionFilter}
              onValueChange={setInspectionFilter}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os colaboradores</SelectItem>
                {employees.data?.map(employee => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os resultados</SelectItem>
                <SelectItem value="C">Conforme (C)</SelectItem>
                <SelectItem value="NC">Não Conforme (NC)</SelectItem>
                <SelectItem value="N/A">Não aplicável (N/A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!factoryId ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
              Selecione a fábrica no cabeçalho para consultar os colaboradores
              inspecionados.
            </p>
          ) : inspections.isLoading ? (
            <p className="text-sm text-muted-foreground">
              A carregar registos…
            </p>
          ) : inspections.data?.length ? (
            <div className="divide-y overflow-hidden rounded-xl border border-slate-100">
              {inspections.data.map(inspection => (
                <div
                  key={inspection.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{inspection.collaboratorName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {inspection.criterion} · {inspection.area}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(inspection.completedAt).toLocaleString("pt-PT")}
                    </p>
                  </div>
                  <Badge
                    className={
                      inspection.result === "NC"
                        ? "bg-red-600 text-white hover:bg-red-600"
                        : inspection.result === "C"
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                    }
                  >
                    {inspection.result}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
              Não existem registos com os filtros selecionados.
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar colaborador inspecionado</DialogTitle>
            <DialogDescription>
              O colaborador ficará disponível para todos os pontos de
              verificação BPHF.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do colaborador</Label>
              <Input
                value={newEmployeeName}
                onChange={event => setNewEmployeeName(event.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <Button
              className="w-full"
              disabled={!newEmployeeName.trim() || addEmployee.isPending}
              onClick={() => addEmployee.mutate({ name: newEmployeeName })}
            >
              {addEmployee.isPending ? "A adicionar…" : "Adicionar colaborador"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Bphf({
  createEntry,
  areas,
  plannedTaskId,
  referenceDate,
  bphfCriteria,
  bphfCriterionTaskIds,
}: any) {
  const { factoryId } = useControlFactory();
  const employees = trpc.quality.listBphfInspectionEmployees.useQuery();
  const utils = trpc.useUtils();
  const [areasByCriterion, setAreasByCriterion] = useState<
    Record<string, string>
  >({});
  const [collaboratorsByCriterion, setCollaboratorsByCriterion] = useState<
    Record<string, string>
  >({});
  const [employeeSearchByCriterion, setEmployeeSearchByCriterion] = useState<
    Record<string, string>
  >({});
  const [openEmployeeSearchCriterion, setOpenEmployeeSearchCriterion] =
    useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result | "">>(() =>
    Object.fromEntries(BPHF_CRITERIA.map(criterion => [criterion, ""]))
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [evidenceByCriterion, setEvidenceByCriterion] = useState<
    Record<string, VerificationEvidencePhoto[]>
  >({});
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [criterionForEmployee, setCriterionForEmployee] = useState<
    string | null
  >(null);
  const [inspectionFilter, setInspectionFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const operationalDate = useMemo(
    () => (referenceDate ? new Date(referenceDate) : new Date()),
    [referenceDate]
  );
  const operationalDateLabel = operationalDate.toLocaleDateString("pt-PT");
  const plannedCriteria = useMemo(
    () =>
      Array.isArray(bphfCriteria)
        ? BPHF_CRITERIA.filter(criterion => bphfCriteria.includes(criterion))
        : [...BPHF_CRITERIA],
    [bphfCriteria]
  );
  const bphfPlannedTaskIds = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(bphfCriterionTaskIds ?? {}).filter(
            (value): value is number => typeof value === "number"
          )
        )
      ),
    [bphfCriterionTaskIds]
  );
  const inspectionInput = useMemo(
    () => ({
      collaboratorId:
        inspectionFilter === "all" ? undefined : Number(inspectionFilter),
      factoryId: factoryId ? Number(factoryId) : undefined,
      result: resultFilter === "all" ? undefined : (resultFilter as Result),
      operationalDate,
      plannedTaskIds:
        bphfPlannedTaskIds.length > 1 ? bphfPlannedTaskIds : undefined,
      plannedTaskId:
        bphfPlannedTaskIds.length <= 1 ? plannedTaskId : undefined,
    }),
    [
      bphfPlannedTaskIds,
      factoryId,
      inspectionFilter,
      operationalDate,
      plannedTaskId,
      resultFilter,
    ]
  );
  const inspections = trpc.quality.listBphfCollaboratorInspections.useQuery(
    inspectionInput,
    { enabled: Boolean(factoryId) }
  );
  const completedAreasByCriterion = useMemo(
    () =>
      new Map(
        plannedCriteria.map(criterion => [
          criterion,
          new Set(
            (inspections.data ?? [])
              .filter(inspection => inspection.criterion === criterion)
              .map(inspection => inspection.area)
          ),
        ])
      ),
    [inspections.data, plannedCriteria]
  );
  const addEmployee = trpc.quality.addBphfInspectionEmployee.useMutation({
    onSuccess: employee => {
      utils.quality.listBphfInspectionEmployees.invalidate();
      if (criterionForEmployee)
        setCollaboratorsByCriterion(current => ({
          ...current,
          [criterionForEmployee]: String(employee.id),
        }));
      if (criterionForEmployee)
        setEmployeeSearchByCriterion(current => ({
          ...current,
          [criterionForEmployee]: employee.name,
        }));
      setNewEmployeeName("");
      setCriterionForEmployee(null);
      setEmployeeDialogOpen(false);
      toast.success(
        employee.alreadyExists
          ? "Colaborador já constava na lista e foi selecionado."
          : "Colaborador adicionado à lista de inspeção."
      );
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    setAreasByCriterion({});
    setCollaboratorsByCriterion({});
    setEmployeeSearchByCriterion({});
    setResults(
      Object.fromEntries(plannedCriteria.map(criterion => [criterion, ""]))
    );
    setNotes({});
    setEvidenceByCriterion({});
  }, [factoryId, areas.join("|"), plannedCriteria]);

  const openEmployeeDialog = (criterion: string) => {
    setCriterionForEmployee(criterion);
    setNewEmployeeName("");
    setEmployeeDialogOpen(true);
  };
  async function registerCriterion(criterion: (typeof BPHF_CRITERIA)[number]) {
    const area = areasByCriterion[criterion];
    const collaboratorId = collaboratorsByCriterion[criterion];
    const result = results[criterion];
    const collaborator = employees.data?.find(
      employee => String(employee.id) === collaboratorId
    );
    if (!area) return toast.error("Selecione a área verificada neste ponto.");
    if (result !== "N/A" && !collaborator)
      return toast.error("Selecione o colaborador inspecionado neste ponto.");
    if (!result)
      return toast.error(
        "Selecione C, NC ou N/A antes de registar este ponto."
      );
    if (result === "NC" && !notes[criterion]?.trim())
      return toast.error("Inclua uma observação para o resultado NC.");
    await createEntry.mutateAsync({
      module: "bphf",
      plannedTaskId: bphfCriterionTaskIds?.[criterion] ?? plannedTaskId,
      title: criterion,
      area,
      result,
      notes: notes[criterion] || undefined,
      payload: {
        criterion,
        collaboratorId: collaborator?.id,
        collaboratorName: collaborator?.name ?? "Não aplicável",
        evidencePhotos: evidenceByCriterion[criterion] ?? [],
      },
      createNonconformity: false,
      severity: "medium",
    });
    setAreasByCriterion(current => ({ ...current, [criterion]: "" }));
    setCollaboratorsByCriterion(current => ({ ...current, [criterion]: "" }));
    setEmployeeSearchByCriterion(current => ({ ...current, [criterion]: "" }));
    setResults(current => ({ ...current, [criterion]: "" }));
    setNotes(current => ({ ...current, [criterion]: "" }));
    setEvidenceByCriterion(current => ({ ...current, [criterion]: [] }));
    utils.quality.listBphfCollaboratorInspections.invalidate();
    toast.success(
      result === "N/A"
        ? `Área ${area} registada como não aplicável.`
        : `Área ${area} registada para ${collaborator?.name}.`
    );
  }

  return (
    <>
      <ModuleHeader
        label="Verificação de BPHF"
        description="Registe as inspeções BPHF previstas no Plano do Dia por Área/Zona e colaborador. Pode acrescentar verificações adicionais às inspeções planeadas."
        icon={ShieldCheck}
      />
      <Card className="border border-teal-100 bg-teal-50/70 shadow-sm">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <p className="font-semibold text-teal-950">Conclusão por área</p>
            <p className="mt-1 text-sm leading-6 text-teal-900">
              No dia {operationalDateLabel}, o mínimo fica cumprido quando cada
              inspeção prevista tem pelo menos uma verificação em todas as
              Áreas/Zonas da fábrica selecionada. Pode continuar a registar
              outras verificações nas mesmas áreas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Mínimo por área cumprido
            </Badge>
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
              Área pendente
            </Badge>
            {bphfPlannedTaskIds.length > 1 && (
              <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">
                Plano atualizado · {bphfPlannedTaskIds.length - 1} adenda(s) incluída(s)
              </Badge>
            )}
            <span className="text-teal-800">
              Os campos ficam sempre vazios até serem escolhidos manualmente.
            </span>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-5">
        {plannedCriteria.map((criterion, index) => {
          const completedAreas =
            completedAreasByCriterion.get(criterion) ?? new Set<string>();
          const pendingAreas = areas.filter(
            (area: string) => !completedAreas.has(area)
          );
          const complete = Boolean(areas.length) && pendingAreas.length === 0;
          const result = results[criterion];
          const employeeSearch = employeeSearchByCriterion[criterion] ?? "";
          const normalizedEmployeeSearch = employeeSearch
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("pt-PT");
          const filteredEmployees = (employees.data ?? []).filter(employee =>
            employee.name
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLocaleLowerCase("pt-PT")
              .includes(normalizedEmployeeSearch)
          );
          return (
            <Card
              key={criterion}
              className={`border-0 panel-shadow ${complete ? "ring-1 ring-emerald-200" : "ring-1 ring-amber-100"}`}
            >
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span
                      className={`font-mono-ui rounded-lg px-2 py-1 text-xs font-semibold ${complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex items-start gap-1.5">
                        <p className="font-medium">{criterion}</p>
                        <ContextualHelpIcon
                          label={`Explicação do critério BPHF: ${criterion}`}
                          className="mt-0.5 shrink-0"
                        >
                          {BPHF_CRITERIA_HELP[criterion]}
                        </ContextualHelpIcon>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {complete
                          ? "O mínimo de uma verificação por área foi cumprido hoje. Pode adicionar mais verificações."
                          : `${pendingAreas.length} de ${areas.length || 0} área(s) ainda por verificar.`}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      complete
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                        : "bg-amber-100 text-amber-900 hover:bg-amber-100"
                    }
                  >
                    {complete ? "Mínimo concluído" : "Em preenchimento"}
                  </Badge>
                </div>
                {areas.length ? (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    {areas.map((area: string) => (
                      <span
                        key={area}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${completedAreas.has(area) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                      >
                        {completedAreas.has(area) ? "✓ " : "• "}
                        {area}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
                    Selecione a fábrica ou linha no cabeçalho para carregar as
                    áreas BPHF.
                  </p>
                )}
                {areas.length && (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`bphf-area-${index}`}>
                          Área verificada
                        </Label>
                        <Select
                          value={areasByCriterion[criterion] ?? ""}
                          onValueChange={value =>
                            setAreasByCriterion(current => ({
                              ...current,
                              [criterion]: value,
                            }))
                          }
                        >
                          <SelectTrigger
                            id={`bphf-area-${index}`}
                            aria-label={`Área verificada para ${criterion}`}
                          >
                            <SelectValue placeholder="Selecione a área" />
                          </SelectTrigger>
                          <SelectContent>
                            {areas.map((area: string) => (
                              <SelectItem value={area} key={area}>
                                {area}
                                {completedAreas.has(area)
                                  ? " — mínimo registado"
                                  : " — pendente"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Colaborador inspecionado</Label>
                        {result === "N/A" && (
                          <p className="text-xs text-muted-foreground">
                            Não é necessário indicar colaborador quando o
                            resultado é N/A.
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Popover
                            open={openEmployeeSearchCriterion === criterion}
                            onOpenChange={open =>
                              setOpenEmployeeSearchCriterion(
                                open ? criterion : null
                              )
                            }
                          >
                            <PopoverAnchor asChild>
                              <Input
                                id={`bphf-employee-search-${index}`}
                                role="combobox"
                                aria-expanded={
                                  openEmployeeSearchCriterion === criterion
                                }
                                aria-controls={`bphf-employee-options-${index}`}
                                aria-label={`Selecione o colaborador para ${criterion}`}
                                value={
                                  result === "N/A"
                                    ? "Não aplicável"
                                    : employeeSearch
                                }
                                disabled={result === "N/A"}
                                onFocus={() =>
                                  setOpenEmployeeSearchCriterion(criterion)
                                }
                                onChange={event => {
                                  const nextSearch = event.target.value;
                                  setEmployeeSearchByCriterion(current => ({
                                    ...current,
                                    [criterion]: nextSearch,
                                  }));
                                  setOpenEmployeeSearchCriterion(criterion);
                                  const selectedEmployee = employees.data?.find(
                                    employee =>
                                      String(employee.id) ===
                                      collaboratorsByCriterion[criterion]
                                  );
                                  const normalizedNextSearch = nextSearch
                                    .normalize("NFD")
                                    .replace(/[\u0300-\u036f]/g, "")
                                    .toLocaleLowerCase("pt-PT");
                                  if (
                                    selectedEmployee &&
                                    !selectedEmployee.name
                                      .normalize("NFD")
                                      .replace(/[\u0300-\u036f]/g, "")
                                      .toLocaleLowerCase("pt-PT")
                                      .includes(normalizedNextSearch)
                                  ) {
                                    setCollaboratorsByCriterion(current => ({
                                      ...current,
                                      [criterion]: "",
                                    }));
                                  }
                                }}
                                placeholder="Selecione o colaborador"
                              />
                            </PopoverAnchor>
                            <PopoverContent
                              align="start"
                              className="w-[--radix-popover-trigger-width] p-0"
                              onOpenAutoFocus={event => event.preventDefault()}
                            >
                              <Command shouldFilter={false}>
                                <CommandList id={`bphf-employee-options-${index}`}>
                                  <CommandEmpty>
                                    Nenhum colaborador encontrado.
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {filteredEmployees.map(employee => (
                                      <CommandItem
                                        key={employee.id}
                                        value={employee.name}
                                        onSelect={() => {
                                          setCollaboratorsByCriterion(current => ({
                                            ...current,
                                            [criterion]: String(employee.id),
                                          }));
                                          setEmployeeSearchByCriterion(current => ({
                                            ...current,
                                            [criterion]: employee.name,
                                          }));
                                          setOpenEmployeeSearchCriterion(null);
                                        }}
                                      >
                                        {employee.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Adicionar colaborador para ${criterion}`}
                            onClick={() => openEmployeeDialog(criterion)}
                            disabled={result === "N/A"}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Resultado</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["C", "NC", "N/A"] as Result[]).map(option => (
                          <Button
                            key={option}
                            type="button"
                            variant={
                              result === option
                                ? option === "NC"
                                  ? "destructive"
                                  : "default"
                                : "outline"
                            }
                            onClick={() =>
                              setResults(current => ({
                                ...current,
                                [criterion]: option,
                              }))
                            }
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <Notes
                      value={notes[criterion] ?? ""}
                      onChange={value =>
                        setNotes(current => ({
                          ...current,
                          [criterion]: value,
                        }))
                      }
                      required={result === "NC"}
                    />
                    {result === "NC" && (
                      <NcEvidenceUploader
                        module="bphf"
                        photos={evidenceByCriterion[criterion] ?? []}
                        onChange={photos =>
                          setEvidenceByCriterion(current => ({
                            ...current,
                            [criterion]: photos,
                          }))
                        }
                      />
                    )}
                    <Button
                      type="button"
                      className="w-full"
                      disabled={
                        createEntry.isPending ||
                        !areasByCriterion[criterion] ||
                        !result ||
                        (result !== "N/A" &&
                          !collaboratorsByCriterion[criterion])
                      }
                      variant={result === "NC" ? "destructive" : "default"}
                      onClick={() => registerCriterion(criterion)}
                    >
                      {createEntry.isPending
                        ? "A registar…"
                        : completedAreas.has(areasByCriterion[criterion] ?? "")
                          ? "Registar verificação adicional"
                          : "Registar área verificada"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card className="border-0 panel-shadow">
        <CardHeader>
          <CardTitle>Colaboradores inspecionados</CardTitle>
          <CardDescription>
            Filtre os registos BPHF para consultar rapidamente o colaborador, o
            ponto avaliado e o resultado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              value={inspectionFilter}
              onValueChange={setInspectionFilter}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os colaboradores</SelectItem>
                {employees.data?.map(employee => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resultFilter} onValueChange={setResultFilter}>
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
          {!factoryId ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
              Selecione a fábrica no cabeçalho para consultar os colaboradores
              inspecionados.
            </p>
          ) : inspections.isLoading ? (
            <p className="text-sm text-muted-foreground">
              A carregar registos…
            </p>
          ) : inspections.data?.length ? (
            <div className="divide-y overflow-hidden rounded-xl border border-slate-100">
              {inspections.data.map(inspection => (
                <div
                  key={inspection.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{inspection.collaboratorName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {inspection.criterion} · {inspection.area}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(inspection.completedAt).toLocaleString("pt-PT")}
                    </p>
                  </div>
                  <Badge
                    className={
                      inspection.result === "NC"
                        ? "bg-red-600 text-white hover:bg-red-600"
                        : inspection.result === "C"
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                    }
                  >
                    {inspection.result}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
              Não existem registos com os filtros selecionados.
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar colaborador inspecionado</DialogTitle>
            <DialogDescription>
              O colaborador ficará disponível para todos os pontos de
              verificação BPHF.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do colaborador</Label>
              <Input
                value={newEmployeeName}
                onChange={event => setNewEmployeeName(event.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <Button
              className="w-full"
              disabled={!newEmployeeName.trim() || addEmployee.isPending}
              onClick={() => addEmployee.mutate({ name: newEmployeeName })}
            >
              {addEmployee.isPending ? "A adicionar…" : "Adicionar colaborador"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type MetalProductCheck = {
  product: string;
  lot: string;
  result: "" | "C" | "NC";
  notes: string;
  evidencePhotos: VerificationEvidencePhoto[];
};
const newMetalProduct = (): MetalProductCheck => ({
  product: "",
  lot: "",
  result: "",
  notes: "",
  evidencePhotos: [],
});

function MetalDetectors({ createEntry, areas, referenceDate, metalDetectorLines }: any) {
  const { factoryId } = useControlFactory();
  const [area, setArea] = useState("");
  const [products, setProducts] = useState<MetalProductCheck[]>([
    newMetalProduct(),
  ]);
  const plannedAreas = useMemo(
    () =>
      Array.isArray(metalDetectorLines)
        ? areas.filter((line: string) => metalDetectorLines.includes(line))
        : areas,
    [areas, metalDetectorLines]
  );
  const areaSignature = plannedAreas.join("|");
  const operationalDate = useMemo(
    () => (referenceDate ? new Date(referenceDate) : new Date()),
    [referenceDate]
  );
  const lineResultsInput = useMemo(
    () => ({
      module: "metal_detectors" as const,
      operationalDate,
      factoryId: factoryId ? Number(factoryId) : undefined,
    }),
    [factoryId, operationalDate]
  );
  const lineResults = trpc.quality.dailyControlResults?.useQuery?.(
    lineResultsInput,
    { enabled: Boolean(factoryId) }
  ) ?? { data: undefined, isLoading: false };
  const verifiedLines = useMemo(
    () =>
      new Set(
        (lineResults.data?.entries ?? []).map(
          (entry: DailyControlEntry) => entry.area
        )
      ),
    [lineResults.data?.entries]
  );
  const operationalDateLabel = operationalDate.toLocaleDateString("pt-PT");
  useEffect(() => setArea(""), [areaSignature]);
  const updateProduct = (
    index: number,
    updater: (product: MetalProductCheck) => MetalProductCheck
  ) =>
    setProducts(items =>
      items.map((item, itemIndex) =>
        itemIndex === index ? updater(item) : item
      )
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!area)
      return toast.error("Selecione a linha ou área antes de registar.");
    const incomplete = products.find(
      item => !item.product.trim() || !item.result
    );
    if (incomplete)
      return toast.error(
        "Identifique todos os produtos e escolha explicitamente C ou NC."
      );
    const invalid = products.find(
      item => item.result === "NC" && !item.notes.trim()
    );
    if (invalid)
      return toast.error(
        `A observação é obrigatória para o produto ${invalid.product} com resultado NC.`
      );
    await Promise.all(
      products.map(item =>
        createEntry.mutateAsync({
          module: "metal_detectors",
          title: `Detetor de metais — ${area} · ${item.product}`,
          area,
          result: item.result as "C" | "NC",
          notes: item.notes || undefined,
          payload: {
            product: item.product,
            lot: item.lot || null,
            productValidation: item.result,
            evidencePhotos: item.evidencePhotos,
          },
          createNonconformity: false,
          severity: "critical",
        })
      )
    );
    toast.success(
      `${products.length} produto${products.length === 1 ? "" : "s"} registado${products.length === 1 ? "" : "s"} na verificação de metais.`
    );
    setProducts([newMetalProduct()]);
  }
  const containsNc = products.some(item => item.result === "NC");
  return (
    <>
      <ModuleHeader
        label="Verificação de detetores de metais"
        description="Registe os produtos testados por linha ou área, com conformidade individual."
        icon={Gauge}
        critical
      />
      <Card className="border border-teal-100 bg-teal-50/70 shadow-sm">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <p className="font-semibold text-teal-950">Conclusão por linha</p>
            <p className="mt-1 text-sm leading-6 text-teal-900">
              No dia {operationalDateLabel}, o controlo só fica concluído quando
              todas as linhas selecionadas no Plano do Dia têm pelo menos uma
              verificação registada. Pode registar produtos adicionais em
              qualquer linha.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Linha verificada
            </Badge>
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
              Linha pendente
            </Badge>
            <span className="text-teal-800">
              Escolha manualmente a linha e a conformidade de cada produto.
            </span>
          </div>
          {plannedAreas.length ? (
            <div className="flex flex-wrap gap-2 md:col-span-2">
              {plannedAreas.map((line: string) => (
                <span
                  key={line}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${verifiedLines.has(line) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                >
                  {verifiedLines.has(line) ? "✓ " : "• "}
                  {line}
                  {verifiedLines.has(line) ? " — verificada" : " — pendente"}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-teal-800 md:col-span-2">
              Selecione a fábrica ou linha no cabeçalho para carregar as linhas
              a verificar.
            </p>
          )}
        </CardContent>
      </Card>
      <form onSubmit={submit} className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardContent className="space-y-5 p-6">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="font-semibold">Regra crítica ativa</p>
                  <p className="mt-1 text-red-800">
                    Cada produto NC fica registado como incidência crítica. Se
                    justificar uma Não Conformidade, crie-a no formulário
                    próprio e associe a incidência.
                  </p>
                </div>
              </div>
            </div>
            <div className="max-w-md space-y-2">
              <Label>Linha / área</Label>
              <Select
                value={area}
                onValueChange={setArea}
                disabled={!plannedAreas.length}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      plannedAreas.length
                        ? "Selecione a linha"
                        : "Selecione primeiro a fábrica ou linha"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {plannedAreas.map((item: string) => (
                    <SelectItem value={item} key={item}>
                      {item}
                      {verifiedLines.has(item)
                        ? " — verificada"
                        : " — pendente"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Produtos verificados</CardTitle>
                <CardDescription>
                  Adicione todos os produtos testados. A conformidade e a
                  observação são registadas de forma independente por produto.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setProducts(items => [...items, newMetalProduct()])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Produto
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {products.map((item, index) => (
              <div
                key={index}
                className={`space-y-4 rounded-xl border p-4 ${item.result === "NC" ? "border-red-200 bg-red-50/40" : "border-slate-100"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono-ui text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Produto {index + 1}
                  </p>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-500 hover:text-red-700"
                    disabled={products.length === 1}
                    onClick={() =>
                      setProducts(items =>
                        items.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Produto</Label>
                    <Input
                      required
                      value={item.product}
                      onChange={event =>
                        updateProduct(index, current => ({
                          ...current,
                          product: event.target.value,
                        }))
                      }
                      placeholder="Produto testado"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Lote{" "}
                      <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      value={item.lot}
                      onChange={event =>
                        updateProduct(index, current => ({
                          ...current,
                          lot: event.target.value,
                        }))
                      }
                      placeholder="Lote do produto"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Conformidade do produto</Label>
                  <BinaryResultPicker
                    value={item.result}
                    onChange={value =>
                      updateProduct(index, current => ({
                        ...current,
                        result: value,
                      }))
                    }
                  />
                </div>
                <Notes
                  value={item.notes}
                  onChange={value =>
                    updateProduct(index, current => ({
                      ...current,
                      notes: value,
                    }))
                  }
                  required={item.result === "NC"}
                />
                {item.result === "NC" && (
                  <NcEvidenceUploader
                    module="metal_detectors"
                    photos={item.evidencePhotos}
                    onChange={photos =>
                      updateProduct(index, current => ({
                        ...current,
                        evidencePhotos: photos,
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Button
          className="w-full"
          size="lg"
          variant={containsNc ? "destructive" : "default"}
          disabled={createEntry.isPending || !area}
        >
          {createEntry.isPending
            ? "A registar…"
            : containsNc
              ? "Registar incidência crítica por produto"
              : "Concluir verificação de produtos"}
        </Button>
      </form>
    </>
  );
}

type SensoryScores = {
  aspeto: number;
  fimDeBoca: number;
  cor: number;
  cheiro: number;
  textura: number;
  sabor: number;
};
type SensoryProductCheck = {
  product: string;
  lot: string;
  validity: string;
  collaboratorId: string;
  scores: SensoryScores;
  notes: string;
  evidencePhotos: VerificationEvidencePhoto[];
};
const newSensoryScores = (): SensoryScores => ({
  aspeto: 3,
  fimDeBoca: 3,
  cor: 3,
  cheiro: 3,
  textura: 3,
  sabor: 3,
});
const newSensoryProduct = (): SensoryProductCheck => ({
  product: "",
  lot: "",
  validity: "",
  collaboratorId: "none",
  scores: newSensoryScores(),
  notes: "",
  evidencePhotos: [],
});
const SENSORY_WEIGHT_VALUES: SensoryScores = {
  aspeto: 0.1,
  fimDeBoca: 0.15,
  cor: 0.15,
  cheiro: 0.1,
  textura: 0.1,
  sabor: 0.4,
};
function sensoryCalculation(scores: SensoryScores) {
  const weightedScore = Object.entries(SENSORY_WEIGHT_VALUES).reduce(
    (total, [key, weight]) =>
      total + scores[key as keyof SensoryScores] * weight,
    0
  );
  return {
    scoreOnFive: Number(weightedScore.toFixed(2)),
    percentage: Number((weightedScore * 20).toFixed(1)),
  };
}

function Sensory({ createEntry }: any) {
  const sensoryCollaborators =
    trpc.quality.listBphfInspectionEmployees?.useQuery?.() ?? {
      data: [],
    };
  const collaborators = sensoryCollaborators.data ?? [];
  const [products, setProducts] = useState<SensoryProductCheck[]>([
    newSensoryProduct(),
  ]);
  const calculations = useMemo(
    () => products.map(item => sensoryCalculation(item.scores)),
    [products]
  );
  const updateProduct = (
    index: number,
    updater: (product: SensoryProductCheck) => SensoryProductCheck
  ) =>
    setProducts(items =>
      items.map((item, itemIndex) =>
        itemIndex === index ? updater(item) : item
      )
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!products.length)
      return toast.error("Adicione pelo menos um produto para verificar.");
    const incomplete = products.find(
      item => !item.product.trim() || !item.lot.trim() || !item.validity
    );
    if (incomplete)
      return toast.error(
        "Preencha o produto, lote e validade em todos os produtos antes de concluir."
      );
    const invalidNotes = products.find(
      (item, index) => calculations[index].percentage < 50 && !item.notes.trim()
    );
    if (invalidNotes)
      return toast.error(
        `Inclua observações no produto ${invalidNotes.product} quando o resultado for Não conforme.`
      );
    await Promise.all(
      products.map((item, index) => {
        const calculation = calculations[index];
        const result = calculation.percentage >= 50 ? "C" : "NC";
        const collaborator = collaborators.find(
          (employee: { id: number; name: string }) =>
            String(employee.id) === item.collaboratorId
        );
        return createEntry.mutateAsync({
          module: "sensory",
          title: `Controlo sensorial — ${item.product.trim()}`,
          area: "Controlo sensorial",
          result,
          notes: item.notes.trim() || undefined,
          payload: {
            product: item.product.trim(),
            lot: item.lot.trim(),
            validity: item.validity,
            collaboratorId: collaborator?.id,
            collaboratorName: collaborator?.name,
            scores: item.scores,
            calculation,
            weights: {
              Aspeto: "10%",
              "Fim de boca": "15%",
              Cor: "15%",
              Cheiro: "10%",
              Textura: "10%",
              Sabor: "40%",
            },
            evidencePhotos: item.evidencePhotos,
          },
          createNonconformity: false,
          severity: "medium",
        });
      })
    );
    toast.success(
      `${products.length} produto${products.length === 1 ? "" : "s"} sensorial${products.length === 1 ? "" : "s"} registado${products.length === 1 ? "" : "s"}.`
    );
    setProducts([newSensoryProduct()]);
  }
  return (
    <>
      <ModuleHeader
        label="Controlo sensorial de produto acabado"
        description="Avalie um ou vários produtos acabados com os seis parâmetros e pesos fixos definidos."
        icon={FlaskConical}
      />
      <Card className="border border-violet-100 bg-violet-50/70 shadow-sm">
        <CardContent className="p-5">
          <p className="font-semibold text-violet-950">Produtos a verificar</p>
          <p className="mt-1 text-sm leading-6 text-violet-900">
            Registe pelo menos um produto. Pode adicionar vários produtos no
            mesmo controlo; cada produto tem lote, validade, avaliação
            sensorial, resultado e observações próprios.
          </p>
        </CardContent>
      </Card>
      <form onSubmit={submit} className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Produtos verificados</CardTitle>
                <CardDescription>
                  {products.length}{" "}
                  {products.length === 1
                    ? "produto preparado"
                    : "produtos preparados"}
                  . O resultado ponderado é calculado individualmente.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setProducts(items => [...items, newSensoryProduct()])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar produto
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {products.map((item, index) => {
              const calculation = calculations[index];
              const isNc = calculation.percentage < 50;
              return (
                <div
                  key={index}
                  className={`space-y-5 rounded-2xl border p-5 ${isNc ? "border-red-200 bg-red-50/40" : "border-slate-100 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono-ui text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Produto {index + 1}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Avaliação independente deste produto
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-500 hover:text-red-700"
                      disabled={products.length === 1}
                      aria-label={`Remover produto ${index + 1}`}
                      onClick={() =>
                        setProducts(items =>
                          items.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor={`sensory-product-${index}`}>
                        Produto
                      </Label>
                      <Input
                        id={`sensory-product-${index}`}
                        required
                        value={item.product}
                        onChange={event =>
                          updateProduct(index, current => ({
                            ...current,
                            product: event.target.value,
                          }))
                        }
                        placeholder="Produto acabado"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`sensory-lot-${index}`}>Lote</Label>
                      <Input
                        id={`sensory-lot-${index}`}
                        required
                        value={item.lot}
                        onChange={event =>
                          updateProduct(index, current => ({
                            ...current,
                            lot: event.target.value,
                          }))
                        }
                        placeholder="Lote"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`sensory-validity-${index}`}>
                        Validade
                      </Label>
                      <Input
                        id={`sensory-validity-${index}`}
                        required
                        type="date"
                        value={item.validity}
                        onChange={event =>
                          updateProduct(index, current => ({
                            ...current,
                            validity: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`sensory-collaborator-${index}`}>
                        Colaborador responsável
                      </Label>
                      <Select
                        value={item.collaboratorId}
                        onValueChange={value =>
                          updateProduct(index, current => ({
                            ...current,
                            collaboratorId: value,
                          }))
                        }
                      >
                        <SelectTrigger
                          id={`sensory-collaborator-${index}`}
                          aria-label={`Colaborador responsável pelo produto ${index + 1}`}
                        >
                          <SelectValue placeholder="Não aplicável" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não aplicável</SelectItem>
                          {collaborators.map((collaborator: { id: number; name: string }) => (
                            <SelectItem
                              key={collaborator.id}
                              value={String(collaborator.id)}
                            >
                              {collaborator.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        Opcional. Fica associado à incidência se o resultado for não conforme.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {SENSORY_FIELDS.map(field => (
                      <Card
                        key={field.key}
                        className="border border-slate-100 shadow-none"
                      >
                        <CardContent className="flex items-center justify-between gap-3 p-4">
                          <div>
                            <p className="font-medium">{field.label}</p>
                            <p className="font-mono-ui mt-1 text-xs text-teal-700">
                              Peso fixo: {field.weight}
                            </p>
                          </div>
                          <Select
                            value={String(item.scores[field.key])}
                            onValueChange={value =>
                              updateProduct(index, current => ({
                                ...current,
                                scores: {
                                  ...current.scores,
                                  [field.key]: Number(value),
                                },
                              }))
                            }
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map(value => (
                                <SelectItem value={String(value)} key={value}>
                                  {value} / 5
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Card className="border-0 bg-slate-900 text-white shadow-none">
                    <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
                      <Notes
                        value={item.notes}
                        onChange={value =>
                          updateProduct(index, current => ({
                            ...current,
                            notes: value,
                          }))
                        }
                        required={isNc}
                      />
                      <div className="rounded-xl bg-white/10 px-5 py-4 text-center">
                        <p className="font-mono-ui text-[11px] uppercase tracking-[0.15em] text-teal-300">
                          Resultado ponderado
                        </p>
                        <p className="mt-1 font-mono-ui text-3xl font-semibold">
                          {calculation.percentage}%
                        </p>
                        <p className="text-sm text-slate-300">
                          {calculation.scoreOnFive} / 5
                        </p>
                        <Badge
                          className={
                            isNc
                              ? "mt-2 bg-red-500 text-white hover:bg-red-500"
                              : "mt-2 bg-emerald-500 text-emerald-950 hover:bg-emerald-500"
                          }
                        >
                          {isNc ? "Não conforme" : "Conforme"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                  <NcEvidenceUploader
                    module="sensory"
                    photos={item.evidencePhotos}
                    onChange={photos =>
                      updateProduct(index, current => ({
                        ...current,
                        evidencePhotos: photos,
                      }))
                    }
                    title="Fotografia do produto"
                    description="Opcional. Documente o estado visual do produto avaliado. Formatos JPG, PNG ou WEBP até 4,5 MB."
                    maxPhotos={1}
                    tone="teal"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Button
          size="lg"
          className="w-full"
          variant={
            products.some((_, index) => calculations[index].percentage < 50)
              ? "destructive"
              : "default"
          }
          disabled={createEntry.isPending}
        >
          {createEntry.isPending
            ? "A registar…"
            : `Registar ${products.length} produto${products.length === 1 ? "" : "s"} sensorial${products.length === 1 ? "" : "s"}`}
        </Button>
      </form>
    </>
  );
}

type DispatchLot = { lot: string; dispatchedQuantity: string };
type DispatchProductCheck = {
  name: string;
  orderedQuantity: number;
  verificationStatus: "verified" | "not_verified";
  notVerifiedReason: string;
  lots: DispatchLot[];
  productLabelResult: "" | "C" | "NC";
  boxLabelResult: "" | "C" | "NC";
  productTemperature: string;
  observations: string;
};
const newDispatchProduct = (
  name = "",
  orderedQuantity = 0
): DispatchProductCheck => ({
  name,
  orderedQuantity,
  verificationStatus: "verified",
  notVerifiedReason: "",
  lots: [{ lot: "", dispatchedQuantity: "" }],
  productLabelResult: "",
  boxLabelResult: "",
  productTemperature: "",
  observations: "",
});

export function DispatchControl({
  operationalDateKey = currentLisbonDateKey(),
  plannedTaskId,
  isPreviousPending = false,
  performedAt,
  retroactiveReason,
  retroactiveJustification,
}: {
  operationalDateKey?: string;
  plannedTaskId?: number;
  isPreviousPending?: boolean;
  performedAt?: string;
  retroactiveReason?: RetroactiveReason | "";
  retroactiveJustification?: string;
} = {}) {
  const utils = trpc.useUtils();
  const { canManage } = useQualityAccess();
  const dispatchOrders = trpc.quality.listDispatchOrders.useQuery({
    operationalDate: operationalDateKey,
  });
  const [dispatchOrderId, setDispatchOrderId] = useState<number | undefined>();
  const [selectedDispatchOrder, setSelectedDispatchOrder] = useState<number | null>(null);
  const [profile, setProfile] = useState<"ambiente" | "congelado">("ambiente");
  const [orderNumber, setOrderNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [vehicleTemperature, setVehicleTemperature] = useState("");
  const [vehicleObservations, setVehicleObservations] = useState("");
  const [evidencePhotos, setEvidencePhotos] = useState<
    VerificationEvidencePhoto[]
  >([]);
  const [importedOrder, setImportedOrder] = useState<{
    orderNumber: string;
    customer: string;
    products: Array<{ name: string; orderedQuantity: number }>;
    warnings: string[];
    document: { name: string; url: string };
  } | null>(null);
  const [productChecks, setProductChecks] = useState<DispatchProductCheck[]>([
    newDispatchProduct(),
  ]);
  const [openProduct, setOpenProduct] = useState<number | null>(0);
  const profileDefinition =
    DISPATCH_CONTROL_CATALOG.profiles.find(item => item.id === profile) ??
    DISPATCH_CONTROL_CATALOG.profiles[0];
  const limit = profileDefinition.productTemperatureLimit;
  const updateProduct = (
    index: number,
    updater: (item: DispatchProductCheck) => DispatchProductCheck
  ) =>
    setProductChecks(items =>
      items.map((item, itemIndex) =>
        itemIndex === index ? updater(item) : item
      )
    );
  const productStatus = (item: DispatchProductCheck) => {
    if (item.verificationStatus === "not_verified")
      return {
        dispatched: 0,
        complete: Boolean(
          item.name.trim() && item.notVerifiedReason.trim().length >= 3
        ),
        result: "N/A" as const,
        unverified: true,
      };
    const dispatched = item.lots.reduce(
      (total, lot) => total + Number(lot.dispatchedQuantity || 0),
      0
    );
    const complete = Boolean(
      item.name.trim() &&
        item.lots.every(
          lot => lot.lot.trim() && lot.dispatchedQuantity !== ""
        ) &&
        item.productTemperature !== "" &&
        item.productLabelResult &&
        item.boxLabelResult
    );
    const result =
      complete &&
      dispatched === item.orderedQuantity &&
      item.productLabelResult === "C" &&
      item.boxLabelResult === "C" &&
      Number(item.productTemperature) <= limit
        ? ("C" as const)
        : ("NC" as const);
    return { dispatched, complete, result, unverified: false };
  };
  const allProductsComplete =
    productChecks.length > 0 &&
    productChecks.every(item => productStatus(item).complete);
  const vehicleResult =
    vehicleTemperature !== "" && Number(vehicleTemperature) <= limit
      ? "C"
      : "NC";
  const globalResult =
    !allProductsComplete ||
    vehicleTemperature === "" ||
    productChecks.some(item => productStatus(item).result === "NC") ||
    vehicleResult === "NC"
      ? "NC"
      : productChecks.some(item => productStatus(item).result === "N/A")
        ? "N/A"
        : "C";
  const parseOrderPdf = trpc.quality.parseDispatchOrderPdf.useMutation({
    onSuccess: data => {
      setImportedOrder(data);
      setDispatchOrderId(undefined);
      setSelectedDispatchOrder(null);
      setOrderNumber(data.orderNumber);
      setCustomer(data.customer);
      setProductChecks(
        data.products.length
          ? data.products.map(item =>
              newDispatchProduct(item.name, item.orderedQuantity)
            )
          : [newDispatchProduct()]
      );
      setOpenProduct(data.products.length ? 0 : null);
      toast.success(
        "Encomenda importada. Valide cada produto e respetivos lotes antes de concluir."
      );
    },
    onError: error => toast.error(error.message),
  });
  const savePreloadedOrder = trpc.quality.createDispatchOrder.useMutation({
    onSuccess: () => {
      utils.quality.listDispatchOrders.invalidate({ operationalDate: operationalDateKey });
      toast.success("Encomenda guardada para preenchimento pela equipa de qualidade.");
    },
    onError: error => toast.error(error.message),
  });
  const register = trpc.quality.registerDispatchControl.useMutation({
    onSuccess: data => {
      utils.quality.dashboard.invalidate();
      utils.quality.dailyControlResults.invalidate();
      utils.quality.controlAuthorization.invalidate();
      utils.quality.reports.invalidate();
      utils.quality.listNcs.invalidate();
      toast[data.conformity.result === "NC" ? "error" : "success"](
        data.conformity.result === "NC"
          ? "Expedição registada como incidência. Registe uma Não Conformidade no formulário próprio se necessário."
          : data.conformity.result === "N/A"
            ? "Expedição registada com referências não verificadas e motivos rastreáveis."
            : "Controlo à expedição registado como conforme."
      );
      setOrderNumber("");
      setCustomer("");
      setDeliveryNote("");
      setVehicleTemperature("");
      setVehicleObservations("");
      setImportedOrder(null);
      setDispatchOrderId(undefined);
      setSelectedDispatchOrder(null);
      setProductChecks([newDispatchProduct()]);
      setOpenProduct(0);
    },
    onError: error => toast.error(error.message),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const incompleteProduct = productChecks.find(
      item => !productStatus(item).complete
    );
    if (incompleteProduct)
      return toast.error(
        incompleteProduct.verificationStatus === "not_verified"
          ? `Indique um motivo com pelo menos 3 caracteres para a referência não verificada: ${incompleteProduct.name || "sem nome"}.`
          : "Preencha a validação obrigatória de todos os produtos, lotes, resultados e temperatura do carro."
      );
    if (vehicleTemperature === "")
      return toast.error(
        "Preencha a temperatura do carro antes de fechar a expedição."
      );
    const invalidProduct = productChecks.find(
      item => productStatus(item).result === "NC" && !item.observations.trim()
    );
    if (invalidProduct)
      return toast.error(
        `Inclua observações no produto ${invalidProduct.name} quando a validação não está conforme.`
      );
    if (vehicleResult === "NC" && !vehicleObservations.trim())
      return toast.error(
        "Inclua uma observação geral quando a temperatura do carro não está conforme."
      );
    const first =
      productChecks.find(item => item.verificationStatus === "verified") ??
      productChecks[0]!;
    const firstStatus = productStatus(first);
    register.mutate({
      profile,
      orderNumber,
      customer,
      deliveryNote: deliveryNote || undefined,
      product: first.name,
      lot:
        first.verificationStatus === "not_verified"
          ? "NÃO VERIFICADO"
          : first.lots[0]!.lot,
      orderedBoxes: first.orderedQuantity,
      dispatchedBoxes: firstStatus.dispatched,
      productLabelResult:
        first.verificationStatus === "not_verified"
          ? "C"
          : (first.productLabelResult as "C" | "NC"),
      boxLabelResult:
        first.verificationStatus === "not_verified"
          ? "C"
          : (first.boxLabelResult as "C" | "NC"),
      productTemperature:
        first.verificationStatus === "not_verified"
          ? 0
          : Number(first.productTemperature),
      vehicleTemperature: Number(vehicleTemperature),
      observations: vehicleObservations || undefined,
      orderItems:
        importedOrder?.products ??
        productChecks.map(item => ({
          name: item.name,
          orderedQuantity: item.orderedQuantity,
        })),
      productChecks: productChecks.map(item =>
        item.verificationStatus === "not_verified"
          ? {
              verificationStatus: "not_verified" as const,
              name: item.name,
              orderedQuantity: item.orderedQuantity,
              notVerifiedReason: item.notVerifiedReason.trim(),
            }
          : {
              verificationStatus: "verified" as const,
              name: item.name,
              orderedQuantity: item.orderedQuantity,
              lots: item.lots.map(lot => ({
                lot: lot.lot,
                dispatchedQuantity: Number(lot.dispatchedQuantity),
              })),
              productLabelResult: item.productLabelResult as "C" | "NC",
              boxLabelResult: item.boxLabelResult as "C" | "NC",
              productTemperature: Number(item.productTemperature),
              observations: item.observations || undefined,
            }
      ),
      evidencePhotos,
      sourceOrderDocument: importedOrder?.document,
      dispatchOrderId,
      plannedTaskId,
      performedAt: isPreviousPending ? performedAt : undefined,
      retroactiveReason: isPreviousPending
        ? retroactiveReason || undefined
        : undefined,
      retroactiveJustification:
        isPreviousPending && retroactiveReason === "other"
          ? retroactiveJustification?.trim() || undefined
          : undefined,
    });
  }
  async function importOrderPdf(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf")
      return toast.error("Selecione uma encomenda em formato PDF.");
    if (file.size > 12_000_000)
      return toast.error("A encomenda PDF deve ter no máximo 12 MB.");
    try {
      parseOrderPdf.mutate({
        fileName: file.name,
        mimeType: "application/pdf",
        dataUrl: await fileAsDataUrl(file),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível ler a encomenda PDF."
      );
    }
  }
  return (
    <>
      <ModuleHeader
        label="Controlo à expedição"
        description="Verificação diária única, comum a todas as fábricas e linhas. Pode registar controlos adicionais sempre que necessário."
        icon={Truck}
        commonToAllOperations
      />
      <form className="space-y-5" onSubmit={submit}>
        <Card className="border border-indigo-100 bg-indigo-50/60 shadow-sm">
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="font-medium text-indigo-950">
                Encomendas carregadas para {operationalDateKey.split("-").reverse().join("/")}
              </p>
              <p className="mt-1 text-sm text-indigo-800">
                A Responsável de Qualidade pode preparar várias encomendas. Selecione uma para iniciar a verificação.
              </p>
            </div>
            {dispatchOrders.isLoading ? (
              <p className="text-sm text-indigo-800">A carregar encomendas…</p>
            ) : dispatchOrders.data?.length ? (
              <div className="divide-y overflow-hidden rounded-xl border border-indigo-100 bg-white">
                {dispatchOrders.data.map(order => (
                  <div key={order.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{order.orderNumber} · {order.customer}</p>
                      <p className="text-xs text-slate-600">
                        {order.profile === "congelado" ? "Congelado" : "Ambiente"} · {order.orderItems.length} produto(s) · {order.status === "pending" ? "Pendente de verificação" : order.status === "verified" ? `Verificada por ${order.verifiedByName ?? "equipa"}` : "Cancelada"}
                      </p>
                    </div>
                    {order.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedDispatchOrder === order.id ? "default" : "outline"}
                        onClick={() => {
                          setSelectedDispatchOrder(order.id);
                          setDispatchOrderId(order.id);
                          setProfile(order.profile);
                          setOrderNumber(order.orderNumber);
                          setCustomer(order.customer);
                          setDeliveryNote(order.deliveryNote ?? "");
                          setProductChecks(order.orderItems.map(item => newDispatchProduct(item.name, item.orderedQuantity)));
                          setOpenProduct(order.orderItems.length ? 0 : null);
                          setImportedOrder(order.sourceDocument ? {
                            orderNumber: order.orderNumber,
                            customer: order.customer,
                            products: order.orderItems,
                            warnings: [],
                            document: order.sourceDocument,
                          } : null);
                        }}
                      >
                        {selectedDispatchOrder === order.id ? "Encomenda selecionada" : "Usar encomenda"}
                      </Button>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Sem ação</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-indigo-200 bg-white p-3 text-sm text-indigo-800">
                Ainda não existem encomendas carregadas para esta data. A Responsável pode carregar uma abaixo.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border border-teal-100 bg-teal-50/60 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-teal-950">
                  Importar encomenda PDF
                </p>
                <p className="mt-1 text-sm text-teal-800">
                  O sistema extrai o cliente, número da encomenda, produtos e
                  quantidades pedidas. Confirme sempre os campos antes do
                  registo.
                </p>
              </div>
              <div className="shrink-0">
                <Input
                  aria-label="Carregar encomenda em PDF"
                  type="file"
                  accept="application/pdf"
                  onChange={event => importOrderPdf(event.target.files?.[0])}
                  disabled={parseOrderPdf.isPending}
                />
              </div>
            </div>
            {parseOrderPdf.isPending && (
              <p className="text-sm font-medium text-teal-800">
                A analisar a encomenda…
              </p>
            )}
            {importedOrder && (
              <div className="rounded-xl border border-teal-100 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {importedOrder.document.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Foram carregadas todas as linhas da encomenda para
                      validação individual.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setImportedOrder(null);
                      setProductChecks([newDispatchProduct()]);
                      setOpenProduct(0);
                    }}
                  >
                    Remover importação
                  </Button>
                  {canManage && !dispatchOrderId && importedOrder.products.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={savePreloadedOrder.isPending}
                      onClick={() =>
                        savePreloadedOrder.mutate({
                          operationalDate: operationalDateKey,
                          profile,
                          orderNumber: importedOrder.orderNumber,
                          customer: importedOrder.customer,
                          deliveryNote: deliveryNote || undefined,
                          orderItems: importedOrder.products,
                          sourceDocument: importedOrder.document,
                        })
                      }
                    >
                      {savePreloadedOrder.isPending ? "A guardar…" : "Guardar para a equipa"}
                    </Button>
                  )}
                </div>
                {importedOrder.products.length ? (
                  <div className="mt-3 divide-y overflow-hidden rounded-xl border border-slate-100">
                    {importedOrder.products.map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span>{item.name}</span>
                        <span className="font-mono-ui font-semibold text-teal-800">
                          {item.orderedQuantity} cx
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-amber-800">
                    Não foram identificadas linhas de produto. Preencha os
                    produtos manualmente.
                  </p>
                )}
                {importedOrder.warnings.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
                    {importedOrder.warnings.map(warning => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 panel-shadow">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-slate-950">
                  Perfil de validação
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Valide cada produto antes do fecho da expedição.
                </p>
              </div>
              <Select
                value={profile}
                onValueChange={value =>
                  setProfile(value as "ambiente" | "congelado")
                }
              >
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPATCH_CONTROL_CATALOG.profiles.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>N.º Encomenda</Label>
                <Input
                  required
                  value={orderNumber}
                  onChange={event => setOrderNumber(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input
                  required
                  value={customer}
                  onChange={event => setCustomer(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  N.º Guia{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  value={deliveryNote}
                  onChange={event => setDeliveryNote(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Produtos da encomenda</CardTitle>
                <CardDescription>
                  Todos os produtos importados são listados. Abra cada linha
                  para validar lotes, quantidades, rotulagem e temperatura ou
                  justificar quando uma referência não foi verificada.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setProductChecks(items => [...items, newDispatchProduct()]);
                  setOpenProduct(productChecks.length);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar produto
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {productChecks.map((item, index) => {
              const status = productStatus(item);
              const isOpen = openProduct === index;
              return (
                <div
                  key={index}
                  className={`overflow-hidden rounded-xl border ${status.complete && status.result === "NC" ? "border-red-200" : status.complete && status.result === "N/A" ? "border-amber-200" : "border-slate-100"}`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-slate-50"
                    onClick={() => setOpenProduct(isOpen ? null : index)}
                  >
                    <div>
                      <p className="font-medium">
                        {item.name || `Produto ${index + 1}`}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.orderedQuantity} cx pedidas · {status.dispatched}{" "}
                        cx registadas por lote
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {status.complete && (
                        <Badge
                          className={
                            status.result === "C"
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                              : status.result === "N/A"
                                ? "bg-amber-100 text-amber-900 hover:bg-amber-100"
                                : "bg-red-600 text-white hover:bg-red-600"
                          }
                        >
                          {status.result === "N/A" ? "Não verificada" : status.result}
                        </Badge>
                      )}
                      {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-slate-500" />
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="space-y-5 border-t border-slate-100 p-4">
                      <div className="grid gap-4 md:grid-cols-[1fr_10rem]">
                        <div className="space-y-2">
                          <Label>Produto</Label>
                          <Input
                            required
                            value={item.name}
                            onChange={event =>
                              updateProduct(index, current => ({
                                ...current,
                                name: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Qtd. pedida</Label>
                          <Input
                            required
                            min="0"
                            type="number"
                            value={item.orderedQuantity}
                            onChange={event =>
                              updateProduct(index, current => ({
                                ...current,
                                orderedQuantity: Number(event.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                        <Label>Estado da referência</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={item.verificationStatus === "verified" ? "default" : "outline"}
                            onClick={() => updateProduct(index, current => ({ ...current, verificationStatus: "verified" }))}
                          >
                            Verificada
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={item.verificationStatus === "not_verified" ? "secondary" : "outline"}
                            className={item.verificationStatus === "not_verified" ? "bg-amber-100 text-amber-950 hover:bg-amber-200" : ""}
                            onClick={() => updateProduct(index, current => ({ ...current, verificationStatus: "not_verified" }))}
                          >
                            Não verificada
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">Use «Não verificada» apenas quando a referência não puder ser inspecionada nesta expedição. O motivo fica registado no relatório.</p>
                      </div>
                      {item.verificationStatus === "not_verified" ? (
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <Label htmlFor={`dispatch-not-verified-reason-${index}`}>Motivo de não verificação <span className="text-red-600">(obrigatório)</span></Label>
                          <Textarea
                            id={`dispatch-not-verified-reason-${index}`}
                            required
                            value={item.notVerifiedReason}
                            onChange={event => updateProduct(index, current => ({ ...current, notVerifiedReason: event.target.value }))}
                            placeholder="Ex.: referência indisponível no momento da expedição."
                          />
                          <p className="text-xs text-amber-900">Esta referência fica registada como Não verificada; não é tratada como Conforme.</p>
                        </div>
                      ) : (
                        <>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>
                            Quantidade expedida por lote{" "}
                            <span className="text-red-600">(obrigatória)</span>
                          </Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateProduct(index, current => ({
                                ...current,
                                lots: [
                                  ...current.lots,
                                  { lot: "", dispatchedQuantity: "" },
                                ],
                              }))
                            }
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Lote
                          </Button>
                        </div>
                        {item.lots.map((lot, lotIndex) => (
                          <div
                            key={lotIndex}
                            className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_11rem_auto]"
                          >
                            <div className="space-y-1">
                              <Label className="text-xs">Lote</Label>
                              <Input
                                required
                                value={lot.lot}
                                onChange={event =>
                                  updateProduct(index, current => ({
                                    ...current,
                                    lots: current.lots.map(
                                      (currentLot, currentIndex) =>
                                        currentIndex === lotIndex
                                          ? {
                                              ...currentLot,
                                              lot: event.target.value,
                                            }
                                          : currentLot
                                    ),
                                  }))
                                }
                                placeholder="N.º do lote"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Qtd. expedida</Label>
                              <Input
                                required
                                min="0"
                                type="number"
                                value={lot.dispatchedQuantity}
                                onChange={event =>
                                  updateProduct(index, current => ({
                                    ...current,
                                    lots: current.lots.map(
                                      (currentLot, currentIndex) =>
                                        currentIndex === lotIndex
                                          ? {
                                              ...currentLot,
                                              dispatchedQuantity:
                                                event.target.value,
                                            }
                                          : currentLot
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="self-end text-slate-500 hover:text-red-700"
                              disabled={item.lots.length === 1}
                              onClick={() =>
                                updateProduct(index, current => ({
                                  ...current,
                                  lots: current.lots.filter(
                                    (_, currentIndex) =>
                                      currentIndex !== lotIndex
                                  ),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Rotulagem do produto</Label>
                          <BinaryResultPicker
                            value={item.productLabelResult}
                            onChange={value =>
                              updateProduct(index, current => ({
                                ...current,
                                productLabelResult: value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Rotulagem da caixa</Label>
                          <BinaryResultPicker
                            value={item.boxLabelResult}
                            onChange={value =>
                              updateProduct(index, current => ({
                                ...current,
                                boxLabelResult: value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <Label>Temp. produto (°C)</Label>
                            <ContextualHelpIcon label="Ajuda sobre a temperatura do produto">
                              A temperatura do produto deve ser igual ou
                              inferior a {limit} °C.
                            </ContextualHelpIcon>
                          </div>
                          <Input
                            required
                            type="number"
                            step="0.1"
                            value={item.productTemperature}
                            onChange={event =>
                              updateProduct(index, current => ({
                                ...current,
                                productTemperature: event.target.value,
                              }))
                            }
                            placeholder={`Máximo ${limit} °C`}
                          />
                        </div>
                      </div>
                      <Notes
                        value={item.observations}
                        onChange={value =>
                          updateProduct(index, current => ({
                            ...current,
                            observations: value,
                          }))
                        }
                        required={status.complete && status.result === "NC"}
                      />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle>Fecho da expedição</CardTitle>
            <CardDescription>
              Registe a temperatura do carro e feche a expedição quando todas
              as referências estiverem verificadas ou justificadamente não
              verificadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr_0.8fr]">
              <div className="space-y-2 rounded-xl border border-slate-100 p-4">
                <div className="flex items-center gap-1.5">
                  <Label>Temp. do carro (°C)</Label>
                  <ContextualHelpIcon label="Ajuda sobre a temperatura do carro">
                    A temperatura do compartimento de transporte deve ser igual
                    ou inferior a {limit} °C.
                  </ContextualHelpIcon>
                </div>
                <Input
                  required
                  type="number"
                  step="0.1"
                  value={vehicleTemperature}
                  onChange={event => setVehicleTemperature(event.target.value)}
                  placeholder={`Máximo ${limit} °C`}
                />
              </div>
              <div
                className={`rounded-xl border p-4 ${globalResult === "C" ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"}`}
              >
                <p className="font-mono-ui text-xs uppercase tracking-[0.12em]">
                  Conformidade geral
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {allProductsComplete && vehicleTemperature !== ""
                    ? globalResult === "C"
                      ? "Conforme"
                      : "Não conforme"
                    : "A aguardar validações"}
                </p>
                <p className="mt-1 text-sm opacity-80">
                  {globalResult === "N/A"
                    ? "Expedição encerrada com referências não verificadas; consulte os motivos no registo."
                    : "Produtos e temperatura do carro são avaliados no fecho."}
                </p>
              </div>
            </div>
            <Notes
              value={vehicleObservations}
              onChange={setVehicleObservations}
              required={vehicleTemperature !== "" && vehicleResult === "NC"}
            />
            {globalResult === "NC" && (
              <NcEvidenceUploader
                module="dispatch_control"
                photos={evidencePhotos}
                onChange={setEvidencePhotos}
              />
            )}
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4 text-sm text-teal-900">
              <p className="font-medium">Registos adicionais</p>
              <p className="mt-1 text-teal-800">
                A primeira expedição do dia conclui a verificação diária
                obrigatória. Pode submeter mais expedições neste mesmo
                formulário sem criar novas pendências.
              </p>
            </div>
            <Button
              className="w-full"
              size="lg"
              variant={globalResult === "NC" ? "destructive" : "default"}
              disabled={
                register.isPending ||
                !allProductsComplete ||
                vehicleTemperature === ""
              }
            >
              {register.isPending
                ? "A registar…"
                : globalResult === "NC"
                  ? "Registar incidência à expedição"
                  : globalResult === "N/A"
                    ? "Registar expedição com referências não verificadas"
                    : "Registar controlo à expedição"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </>
  );
}

export function ShelfLife({ createEntry }: any) {
  const [result, setResult] = useState<"" | "C" | "NC">("");
  const [registeredEvaluations, setRegisteredEvaluations] = useState(0);
  const [product, setProduct] = useState("");
  const [lot, setLot] = useState("");
  const [validity, setValidity] = useState("");
  const [reason, setReason] = useState("");
  const [evidencePhotos, setEvidencePhotos] = useState<
    VerificationEvidencePhoto[]
  >([]);
  const isNcComplete = Boolean(
    product.trim() && lot.trim() && validity && reason.trim()
  );
  const resetEvaluation = () => {
    setResult("");
    setProduct("");
    setLot("");
    setValidity("");
    setReason("");
    setEvidencePhotos([]);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!result)
      return toast.error("Escolha explicitamente C ou NC antes de registar.");
    if (result === "NC" && !isNcComplete)
      return toast.error(
        "Em caso de NC, identifique o produto, lote, validade e motivo da incidência."
      );
    createEntry.mutate(
      {
        module: "shelf_life",
        title:
          result === "NC"
            ? `Incidência shelf-life — ${product}`
            : "Shelf-life — Conforme",
        area: "Shelf-life",
        result: result as "C" | "NC",
        notes: result === "NC" ? reason : undefined,
        payload: {
          observationResult: result,
          product: result === "NC" ? product : null,
          lot: result === "NC" ? lot : null,
          validity: result === "NC" ? validity : null,
          reason: result === "NC" ? reason : null,
          dailyIncidenceGenerated: result === "NC",
          evidencePhotos,
        },
        createNonconformity: false,
        severity: "medium",
      },
      {
        onSuccess: () => {
          setRegisteredEvaluations(current => current + 1);
          resetEvaluation();
          toast.success("Avaliação Shelf-life registada. Pode adicionar outra.");
        },
      }
    );
  }

  return (
    <>
      <ModuleHeader
        label="Controlo de amostras em shelf-life"
        description="Registe a verificação diária como C ou NC. Os dados de rastreabilidade surgem apenas quando existe uma incidência."
        icon={PackageSearch}
      />
      <form onSubmit={submit} className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardContent className="space-y-5 p-6">
            <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
              <p className="font-medium text-teal-950">
                Verificação diária da amostra
              </p>
              <p className="mt-1 text-sm text-teal-800">
                Registe primeiro o resultado. Um NC cria uma incidência diária
                que pode, se necessário, ser associada posteriormente a uma Não
                Conformidade.
              </p>
              {registeredEvaluations ? (
                <p className="mt-2 text-sm font-medium text-teal-950">
                  {registeredEvaluations} avaliação{registeredEvaluations === 1 ? "" : "ões"} registada{registeredEvaluations === 1 ? "" : "s"} nesta sessão. Cada avaliação é validada individualmente.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Resultado da verificação global:</Label>
                <ContextualHelpIcon label="Explicação do resultado da verificação global">
                  Selecione C quando a amostra estiver conforme. Escolha NC
                  quando existir um desvio; serão pedidos os dados de
                  rastreabilidade e criada uma incidência diária.
                </ContextualHelpIcon>
              </div>
              <BinaryResultPicker
                value={result}
                onChange={setResult}
                showHelp={false}
              />
            </div>
            {result === "NC" && (
              <div className="space-y-5 rounded-2xl border border-red-200 bg-red-50/60 p-5">
                <div>
                  <p className="font-semibold text-red-950">
                    Detalhe da incidência
                  </p>
                  <p className="mt-1 text-sm text-red-800">
                    Estes dados são obrigatórios para garantir a rastreabilidade
                    da incidência.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="shelf-life-product">Produto</Label>
                    <Input
                      id="shelf-life-product"
                      required
                      value={product}
                      onChange={event => setProduct(event.target.value)}
                      placeholder="Produto da amostra"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shelf-life-lot">Lote</Label>
                    <Input
                      id="shelf-life-lot"
                      required
                      value={lot}
                      onChange={event => setLot(event.target.value)}
                      placeholder="Lote"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shelf-life-validity">Validade</Label>
                    <Input
                      id="shelf-life-validity"
                      required
                      type="date"
                      value={validity}
                      onChange={event => setValidity(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shelf-life-reason">
                    Motivo / observações da incidência
                  </Label>
                  <Textarea
                    id="shelf-life-reason"
                    required
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    placeholder="Descreva o desvio observado na amostra."
                  />
                </div>
                <NcEvidenceUploader
                  module="shelf_life"
                  photos={evidencePhotos}
                  onChange={setEvidencePhotos}
                />
              </div>
            )}
            <Button
              size="lg"
              className="w-full"
              variant={result === "NC" ? "destructive" : "default"}
              disabled={
                createEntry.isPending ||
                !result ||
                (result === "NC" && !isNcComplete)
              }
            >
              {result === "NC"
                ? registeredEvaluations
                  ? "Registar nova incidência"
                  : "Registar incidência"
                : result === "C"
                  ? registeredEvaluations
                    ? "Registar nova verificação conforme"
                    : "Registar verificação conforme"
                  : "Selecione o resultado"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </>
  );
}

function MonthlyChecklistLegacy({ createEntry }: any) {
  const { factories, factoryId, setFactoryId } = useControlFactory();
  const { canManage } = useQualityAccess();
  const monthlyFactories = factories.filter(factory =>
    [1, 2, 3].includes(factory.id)
  );
  const items = trpc.quality.listChecklistItems.useQuery(
    factoryId ? { factoryId: Number(factoryId) } : undefined
  );
  const monthlyProgress = trpc.quality.monthlyChecklistProgress.useQuery();
  const initialize = trpc.quality.initializeChecklist.useMutation({
    onSuccess: () => {
      items.refetch();
      toast.success("Itens iniciais de checklist configurados.");
    },
    onError: error => toast.error(error.message),
  });
  const addItem = trpc.quality.addChecklistItem.useMutation({
    onSuccess: () => {
      items.refetch();
      setNewLabel("");
      setNewFactoryIds([]);
      toast.success("Ponto de controlo adicionado.");
    },
    onError: error => toast.error(error.message),
  });
  const updateItem = trpc.quality.updateChecklistItem.useMutation({
    onSuccess: () => {
      items.refetch();
      setEditingItem(null);
      setNewLabel("");
      setNewFactoryIds([]);
      toast.success("Ponto de controlo atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const removeItem = trpc.quality.removeChecklistItem.useMutation({
    onSuccess: () => {
      items.refetch();
      toast.success("Ponto de controlo removido.");
    },
    onError: error => toast.error(error.message),
  });
  const [area, setArea] = useState("");
  const [results, setResults] = useState<Record<number, Result>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [manageOpen, setManageOpen] = useState(false);
  const [newArea, setNewArea] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newFactoryIds, setNewFactoryIds] = useState<number[]>([]);
  const [editingItem, setEditingItem] = useState<any>(null);
  useEffect(() => {
    if (
      monthlyFactories.length &&
      !monthlyFactories.some(factory => String(factory.id) === factoryId)
    )
      setFactoryId(String(monthlyFactories[0].id));
  }, [factoryId, monthlyFactories, setFactoryId]);
  const availableAreas = Array.from(
    new Set(
      items.data?.map(item => item.area).filter(value => value !== "Geral") ??
        []
    )
  );
  useEffect(() => {
    if (availableAreas.length && !availableAreas.includes(area))
      setArea(availableAreas[0]);
  }, [area, availableAreas]);
  const grouped = items.data?.filter(item => item.area === area) ?? [];
  const applicable = grouped.filter(
    item => (results[item.id] ?? "C") !== "N/A"
  );
  const conformity = applicable.length
    ? Math.round(
        (applicable.filter(item => (results[item.id] ?? "C") === "C").length /
          applicable.length) *
          100
      )
    : 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      grouped.some(
        item => (results[item.id] ?? "C") === "NC" && !notes[item.id]?.trim()
      )
    )
      return toast.error("Inclua observações em todos os itens NC.");
    await Promise.all(
      grouped.map(item => {
        const result = results[item.id] ?? "C";
        return createEntry.mutateAsync({
          module: "monthly_checklist",
          title: item.label,
          area,
          result,
          notes: notes[item.id] || undefined,
          payload: { checklistItemId: item.id },
          createNonconformity: result === "NC",
          severity: "medium",
        });
      })
    );
    toast.success("Checklist mensal registada.");
  }
  return (
    <>
      <ModuleHeader
        label="Checklist mensal"
        description="Avalie os pontos por Área/Zona e acompanhe o preenchimento do mês nas três fábricas."
        icon={ClipboardCheck}
        hideProgress
      />
      <Card className="border-0 panel-shadow">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Preenchimento do mês</CardTitle>
              <CardDescription>
                Acompanhe a conclusão do checklist mensal por fábrica.
              </CardDescription>
            </div>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setManageOpen(true)}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Gerir pontos
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {monthlyFactories.map(factory => {
            const progress = monthlyProgress.data?.find(
              item => item.factoryId === factory.id
            );
            return (
              <div
                key={factory.id}
                className="rounded-xl border border-slate-100 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{factory.name}</p>
                  <span className="font-mono-ui text-sm text-teal-700">
                    {progress?.percentage ?? 0}%
                  </span>
                </div>
                <Progress
                  value={progress?.percentage ?? 0}
                  className="mt-3 h-2"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {progress?.completed ?? 0} de {progress?.total ?? 0} pontos
                  concluídos
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <form onSubmit={submit} className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="w-full max-w-md space-y-2">
              <Label>Área/Zona</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a Área/Zona" />
                </SelectTrigger>
                <SelectContent>
                  {availableAreas.map(item => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full max-w-xs">
              <div className="mb-2 flex justify-between text-sm">
                <span>Taxa conformidade</span>
                <span className="font-mono-ui font-semibold">
                  {conformity}%
                </span>
              </div>
              <Progress value={conformity} />
            </div>
          </CardContent>
        </Card>
        {!items.isLoading && !items.data?.length && (
          <Button
            type="button"
            variant="outline"
            onClick={() => initialize.mutate()}
            disabled={initialize.isPending}
          >
            {initialize.isPending
              ? "A configurar…"
              : "Carregar pontos iniciais"}
          </Button>
        )}
        {grouped.map((item, index) => {
          const result = results[item.id] ?? "C";
          return (
            <Card key={item.id} className="border-0 panel-shadow">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="font-mono-ui rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="font-medium">{item.label}</p>
                  </div>
                  {canManage && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-slate-500 hover:text-red-700"
                      onClick={() => removeItem.mutate({ id: item.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <ResultPicker
                  value={result}
                  onChange={value =>
                    setResults(current => ({ ...current, [item.id]: value }))
                  }
                />
                <Notes
                  value={notes[item.id] ?? ""}
                  onChange={value =>
                    setNotes(current => ({ ...current, [item.id]: value }))
                  }
                  required={result === "NC"}
                />
              </CardContent>
            </Card>
          );
        })}
        {grouped.length > 0 && (
          <Button className="w-full" size="lg" disabled={createEntry.isPending}>
            Concluir checklist mensal
          </Button>
        )}
      </form>
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerir pontos de controlo</DialogTitle>
            <DialogDescription>
              Adicione pontos às fábricas escolhidas ou remova pontos
              diretamente da lista mensal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Área/Zona</Label>
              <Input
                value={newArea}
                onChange={event => setNewArea(event.target.value)}
                placeholder="Selecione ou escreva uma Área/Zona"
              />
            </div>
            <div className="space-y-2">
              <Label>Novo ponto</Label>
              <Input
                value={newLabel}
                onChange={event => setNewLabel(event.target.value)}
                placeholder="Descrição do ponto de controlo"
              />
            </div>
            <div className="space-y-2">
              <Label>Fábricas atribuídas</Label>
              <div className="flex flex-wrap gap-2">
                {monthlyFactories.map(factory => (
                  <Button
                    key={factory.id}
                    type="button"
                    size="sm"
                    variant={
                      factoryId === String(factory.id) ? "default" : "outline"
                    }
                    onClick={() => setFactoryId(String(factory.id))}
                  >
                    {factory.name}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={
                !factoryId ||
                !newLabel.trim() ||
                !newArea.trim() ||
                addItem.isPending
              }
              onClick={() =>
                addItem.mutate({
                  factoryIds: [Number(factoryId)],
                  areaNames: [newArea],
                  label: newLabel,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar ponto
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MonthlyChecklistV2({ createEntry }: any) {
  const { factories, factoryId, setFactoryId } = useControlFactory();
  const { canManage } = useQualityAccess();
  const monthlyFactories = factories.filter(factory =>
    [1, 2, 3].includes(factory.id)
  );
  const items = trpc.quality.listChecklistItems.useQuery(
    factoryId ? { factoryId: Number(factoryId) } : undefined
  );
  const checklistAreas = trpc.quality.listChecklistAreas.useQuery();
  const monthlyProgress = trpc.quality.monthlyChecklistProgress.useQuery();
  const selectedFactoryProgress = monthlyProgress.data?.find(
    item => item.factoryId === Number(factoryId)
  );
  const utils = trpc.useUtils();
  const [area, setArea] = useState("");
  const [results, setResults] = useState<Record<number, Result | "">>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [evidenceByItem, setEvidenceByItem] = useState<
    Record<number, VerificationEvidencePhoto[]>
  >({});
  const [manageOpen, setManageOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [pointAreas, setPointAreas] = useState<string[]>([]);
  const [pointLabel, setPointLabel] = useState("");
  const [pointFactoryIds, setPointFactoryIds] = useState<number[]>([]);
  const [newAreaName, setNewAreaName] = useState("");
  const [editingArea, setEditingArea] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const refresh = () => {
    items.refetch();
    checklistAreas.refetch();
    monthlyProgress.refetch();
    utils.quality.listChecklistItems.invalidate();
    utils.quality.listChecklistAreas.invalidate();
  };
  const addItem = trpc.quality.addChecklistItem.useMutation({
    onSuccess: () => {
      refresh();
      setEditorOpen(false);
      toast.success("Ponto de controlo adicionado.");
    },
    onError: error => toast.error(error.message),
  });
  const updateItem = trpc.quality.updateChecklistItem.useMutation({
    onSuccess: () => {
      refresh();
      setEditorOpen(false);
      toast.success("Ponto de controlo atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const removeItem = trpc.quality.removeChecklistItem.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Ponto de controlo removido.");
    },
    onError: error => toast.error(error.message),
  });
  const addArea = trpc.quality.addChecklistArea.useMutation({
    onSuccess: () => {
      refresh();
      setNewAreaName("");
      toast.success("Área/Zona adicionada.");
    },
    onError: error => toast.error(error.message),
  });
  const updateArea = trpc.quality.updateChecklistArea.useMutation({
    onSuccess: () => {
      refresh();
      setEditingArea(null);
      setNewAreaName("");
      toast.success("Área/Zona atualizada.");
    },
    onError: error => toast.error(error.message),
  });
  const removeArea = trpc.quality.removeChecklistArea.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Área/Zona removida.");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (
      monthlyFactories.length &&
      !monthlyFactories.some(factory => String(factory.id) === factoryId)
    )
      setFactoryId(String(monthlyFactories[0].id));
  }, [factoryId, monthlyFactories, setFactoryId]);
  const areas = useMemo(() => {
    const names = new Set((checklistAreas.data ?? []).map(item => item.name));
    (items.data ?? []).forEach(item =>
      (item.areaNames ?? [item.area]).forEach(name => names.add(name))
    );
    if (!names.size) names.add("Geral");
    return Array.from(names).sort((left, right) =>
      left.localeCompare(right, "pt-PT")
    );
  }, [checklistAreas.data, items.data]);
  useEffect(() => {
    if (areas.length && !areas.includes(area)) setArea(areas[0]);
  }, [area, areas]);
  const grouped = (items.data ?? []).filter(item =>
    (item.areaNames ?? [item.area]).includes(area)
  );
  const applicable = grouped.filter(
    item => results[item.id] && results[item.id] !== "N/A"
  );
  const conformity = applicable.length
    ? Math.round(
        (applicable.filter(item => results[item.id] === "C").length /
          applicable.length) *
          100
      )
    : 0;

  const openCreate = () => {
    setManageOpen(false);
    setEditingItem(null);
    setPointAreas(areas[0] ? [areas[0]] : []);
    setPointLabel("");
    setPointFactoryIds(factoryId ? [Number(factoryId)] : []);
    setEditorOpen(true);
  };
  const openEdit = (item: any) => {
    setManageOpen(false);
    setEditingItem(item);
    setPointAreas(item.areaNames?.length ? item.areaNames : [item.area]);
    setPointLabel(item.label);
    setPointFactoryIds(item.factoryIds ?? []);
    setEditorOpen(true);
  };
  const toggleFactory = (id: number) =>
    setPointFactoryIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id]
    );
  const togglePointArea = (name: string) =>
    setPointAreas(current =>
      current.includes(name)
        ? current.filter(item => item !== name)
        : [...current, name]
    );
  const toggleAllPointAreas = () =>
    setPointAreas(current =>
      areas.length > 0 && areas.every(name => current.includes(name))
        ? []
        : [...areas]
    );
  const savePoint = () => {
    if (!pointAreas.length || !pointLabel.trim() || !pointFactoryIds.length)
      return toast.error(
        "Indique pelo menos uma Área/Zona, o ponto e uma fábrica."
      );
    const input = {
      factoryIds: pointFactoryIds,
      areaNames: pointAreas,
      label: pointLabel.trim(),
    };
    if (editingItem) updateItem.mutate({ id: editingItem.id, ...input });
    else addItem.mutate(input);
  };
  const saveArea = () => {
    const name = newAreaName.replace(/\s+/g, " ").trim();
    if (name.length < 2)
      return toast.error(
        "Indique um nome de Área/Zona com pelo menos 2 caracteres."
      );
    if (editingArea) updateArea.mutate({ id: editingArea.id, name });
    else addArea.mutate({ name });
  };
  const startEditArea = (item: { id: number; name: string }) => {
    setEditingArea(item);
    setNewAreaName(item.name);
  };
  const cancelEditArea = () => {
    setEditingArea(null);
    setNewAreaName("");
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (grouped.some(item => !results[item.id]))
      return toast.error(
        "Escolha explicitamente C, NC ou N/A em todos os pontos antes de concluir."
      );
    if (
      grouped.some(item => results[item.id] === "NC" && !notes[item.id]?.trim())
    )
      return toast.error("Inclua observações em todos os pontos NC.");
    await Promise.all(
      grouped.map(item => {
        const result = results[item.id] as Result;
        return createEntry.mutateAsync({
          module: "monthly_checklist",
          title: item.label,
          area,
          result,
          notes: notes[item.id] || undefined,
          payload: {
            checklistItemId: item.id,
            evidencePhotos: evidenceByItem[item.id] ?? [],
          },
          createNonconformity: false,
          severity: "medium",
        });
      })
    );
    refresh();
    toast.success("Checklist mensal registado.");
  }

  return (
    <>
      <ModuleHeader
        label="Checklist mensal"
        description="Avalie os pontos por Área/Zona e acompanhe o preenchimento do mês nas três fábricas."
        icon={ClipboardCheck}
        hideProgress
      >
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                Preenchimento do mês
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Acompanhe a conclusão do checklist mensal nas três fábricas.
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-slate-700 text-white hover:bg-slate-600"
                  onClick={() => setManageOpen(true)}
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Gerir pontos e Áreas/Zonas
                </Button>
                <Button
                  size="sm"
                  className="bg-teal-600 text-white hover:bg-teal-500"
                  onClick={openCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo ponto
                </Button>
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {monthlyFactories.map(factory => {
              const progress = monthlyProgress.data?.find(
                item => item.factoryId === factory.id
              );
              return (
                <div
                  key={factory.id}
                  className="rounded-xl border border-slate-700 bg-slate-900/50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">
                      {factory.name}
                    </p>
                    <span className="font-mono-ui text-sm text-teal-300">
                      {progress?.percentage ?? 0}%
                    </span>
                  </div>
                  <Progress
                    value={progress?.percentage ?? 0}
                    className="mt-3 h-2"
                  />
                  <p className="mt-2 text-xs text-slate-300">
                    {progress?.completed ?? 0} de {progress?.total ?? 0} Áreas/Zonas
                    concluídas
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-teal-950">Conclusão por Área/Zona</p>
              <p className="mt-1 max-w-2xl text-sm text-teal-900">
                O preenchimento da fábrica selecionada só atinge 100% quando todas as Áreas/Zonas aplicáveis têm pelo menos uma verificação mensal registada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 font-medium text-emerald-800">Área/Zona concluída</span>
              <span className="rounded-full bg-amber-100 px-3 py-1.5 font-medium text-amber-900">Área/Zona pendente</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedFactoryProgress?.areas?.map(areaProgress => (
              <div
                key={areaProgress.areaName}
                className={`rounded-xl border p-3 ${areaProgress.minimumMet ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-950">{areaProgress.areaName}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${areaProgress.minimumMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                    {areaProgress.minimumMet ? "Concluída" : "Pendente"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-700">
                  {areaProgress.completed} de {areaProgress.total} pontos registados nesta Área/Zona.
                </p>
              </div>
            ))}
            {!selectedFactoryProgress?.areas?.length && (
              <p className="rounded-xl border border-dashed border-teal-200 bg-white p-3 text-sm text-teal-900">
                Não existem Áreas/Zonas com pontos ativos para esta fábrica.
              </p>
            )}
          </div>
        </div>
      </ModuleHeader>
      <form onSubmit={submit} className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="w-full max-w-md space-y-2">
              <Label>Área/Zona</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a Área/Zona" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map(item => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full max-w-xs">
              <div className="mb-2 flex justify-between text-sm">
                <span>Taxa conformidade</span>
                <span className="font-mono-ui font-semibold">
                  {conformity}%
                </span>
              </div>
              <Progress value={conformity} />
              <p className="mt-1 text-xs text-muted-foreground">
                Os pontos N/A não entram no cálculo.
              </p>
            </div>
          </CardContent>
        </Card>
        {grouped.map((item, index) => {
          const result = results[item.id] ?? "";
          return (
            <Card key={item.id} className="border-0 panel-shadow">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="font-mono-ui rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="font-medium">{item.label}</p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-slate-500 hover:text-teal-700"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-slate-500 hover:text-red-700"
                        onClick={() => removeItem.mutate({ id: item.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <ResultPicker
                  value={result}
                  onChange={value =>
                    setResults(current => ({ ...current, [item.id]: value }))
                  }
                />
                <Notes
                  value={notes[item.id] ?? ""}
                  onChange={value =>
                    setNotes(current => ({ ...current, [item.id]: value }))
                  }
                  required={result === "NC"}
                />
                {result === "NC" && (
                  <NcEvidenceUploader
                    module="monthly_checklist"
                    photos={evidenceByItem[item.id] ?? []}
                    onChange={photos =>
                      setEvidenceByItem(current => ({
                        ...current,
                        [item.id]: photos,
                      }))
                    }
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
        {grouped.length > 0 && (
          <Button
            className="w-full"
            size="lg"
            disabled={
              createEntry.isPending || grouped.some(item => !results[item.id])
            }
          >
            Concluir checklist mensal
          </Button>
        )}
      </form>
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Gerir pontos e Áreas/Zonas</DialogTitle>
            <DialogDescription>
              Consulte e mantenha os pontos e as Áreas/Zonas da fábrica
              selecionada, sem sair da Checklist mensal.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-slate-950">
                Áreas/Zonas da Checklist Mensal
              </p>
              <p className="text-sm text-slate-600">
                Crie uma nova Área/Zona ou altere o nome de uma existente. Os
                pontos associados acompanham a alteração.
              </p>
            </div>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={event => {
                event.preventDefault();
                saveArea();
              }}
            >
              <Label htmlFor="new-checklist-area" className="sr-only">
                Nome da Área/Zona
              </Label>
              <Input
                id="new-checklist-area"
                value={newAreaName}
                onChange={event => setNewAreaName(event.target.value)}
                placeholder="Ex.: Produção"
              />
              <Button
                type="submit"
                disabled={addArea.isPending || updateArea.isPending}
              >
                {editingArea ? "Guardar nome" : "Criar Área/Zona"}
              </Button>
              {editingArea && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEditArea}
                >
                  Cancelar
                </Button>
              )}
            </form>
            <div className="mt-3 space-y-2">
              {checklistAreas.isLoading ? (
                <p className="text-sm text-slate-600">
                  A carregar Áreas/Zonas…
                </p>
              ) : (
                (checklistAreas.data ?? []).map(item => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-white bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-950">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.itemCount}{" "}
                        {item.itemCount === 1
                          ? "ponto associado"
                          : "pontos associados"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startEditArea(item)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      disabled={item.itemCount > 0 || removeArea.isPending}
                      onClick={() => removeArea.mutate({ id: item.id })}
                      aria-label={`Eliminar Área/Zona ${item.name}`}
                    >
                      Eliminar
                    </Button>
                  </div>
                ))
              )}
              {!checklistAreas.isLoading &&
                !(checklistAreas.data ?? []).length && (
                  <p className="text-sm text-slate-600">
                    Ainda não existem Áreas/Zonas configuradas.
                  </p>
                )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo ponto
            </Button>
          </div>
          <div className="divide-y rounded-xl border border-slate-100">
            {items.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">
                A carregar pontos de controlo…
              </p>
            ) : (
              (items.data ?? []).map(item => (
                <div key={item.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(item.areaNames ?? [item.area]).join(", ")} ·{" "}
                      {(item.factoryIds ?? [])
                        .map(
                          id =>
                            monthlyFactories.find(factory => factory.id === id)
                              ?.name
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Editar ${item.label}`}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      aria-label={`Eliminar ${item.label}`}
                      onClick={() => removeItem.mutate({ id: item.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
            {!items.isLoading && !(items.data ?? []).length && (
              <p className="p-4 text-sm text-muted-foreground">
                Não existem pontos configurados para esta fábrica.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? "Editar ponto de controlo"
                : "Novo ponto de controlo"}
            </DialogTitle>
            <DialogDescription>
              Defina a Área/Zona, o ponto e as fábricas onde deve ser
              verificado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Áreas/Zonas atribuídas</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={toggleAllPointAreas}
                  disabled={!areas.length}
                >
                  {areas.length > 0 && areas.every(name => pointAreas.includes(name))
                    ? "Limpar seleção"
                    : "Todas as Áreas/Zonas"}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {areas.map(item => (
                  <Button
                    key={item}
                    type="button"
                    variant={pointAreas.includes(item) ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => togglePointArea(item)}
                    aria-pressed={pointAreas.includes(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
              {!areas.length && (
                <p className="text-sm text-muted-foreground">
                  Crie primeiro uma Área/Zona no painel de gestão.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ponto de controlo</Label>
              <Input
                value={pointLabel}
                onChange={event => setPointLabel(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fábricas atribuídas</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {monthlyFactories.map(factory => (
                  <Button
                    key={factory.id}
                    type="button"
                    variant={
                      pointFactoryIds.includes(factory.id)
                        ? "default"
                        : "outline"
                    }
                    className="justify-start"
                    onClick={() => toggleFactory(factory.id)}
                  >
                    {factory.name}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={addItem.isPending || updateItem.isPending}
              onClick={savePoint}
            >
              {editingItem ? "Guardar alterações" : "Adicionar ponto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ALLERGEN_ANALYSIS_CATEGORIES = [
  {
    label: "Glúten",
    tests: [
      "Análise ao glúten superfícies",
      "Glúten fardamento",
      "Teste rápido ao glúten Matérias-primas",
      "Teste rápido glúten Produto acabado",
      "Teste Elisa glúten MP",
      "Teste Elisa Glúten Produto acabado",
    ],
  },
  { label: "Soja", tests: ["Teste rápido soja"] },
  { label: "Leite", tests: ["Teste rápido leite"] },
  { label: "Ovo", tests: ["Teste rápido ovo"] },
  { label: "Mostarda", tests: ["Teste rápido mostarda"] },
  { label: "Sésamo", tests: ["Teste rápido sementes de sésamo"] },
  {
    label: "Frutos de Casca Rija",
    tests: [
      "Teste rápido nozes",
      "Teste rápido amêndoas",
      "Teste rápido avelãs",
    ],
  },
  { label: "Tremoço", tests: ["Teste Elisa Tremoço"] },
] as const;

type AnalysisResult = "negative" | "positive" | "conform" | "nonconform";
const ANALYSIS_RESULTS: Array<{
  value: AnalysisResult;
  label: string;
  controlResult: "C" | "NC";
}> = [
  { value: "negative", label: "Negativo", controlResult: "C" },
  { value: "positive", label: "Positivo", controlResult: "NC" },
  { value: "conform", label: "Conforme", controlResult: "C" },
  { value: "nonconform", label: "Não Conforme", controlResult: "NC" },
];

export function InternalAnalysis({ createEntry }: any) {
  const { activeProfile } = useQualityAccess();
  const [tests, setTests] = useState<string[]>([]);
  const [samples, setSamples] = useState<
    Array<{
      product: string;
      client: string;
      lot: string;
      result: AnalysisResult | "";
      ppm: string;
    }>
  >([{ product: "", client: "", lot: "", result: "", ppm: "" }]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<
    Array<{
      url: string;
      fileName: string;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
    }>
  >([]);
  const utils = trpc.useUtils();
  const uploadPhoto = trpc.quality.uploadInternalAnalysisPhoto.useMutation({
    onError: error => toast.error(error.message),
  });
  const selectedAnalyses = tests.reduce<
    Array<{ test: string; category: string }>
  >((selected, test) => {
    const category = ALLERGEN_ANALYSIS_CATEGORIES.find(item =>
      item.tests.some(analysis => analysis === test)
    );
    if (category) selected.push({ test, category: String(category.label) });
    return selected;
  }, []);
  const selectedCategories = Array.from(
    new Set(selectedAnalyses.map(item => item.category))
  );
  const isElisa = selectedAnalyses.some(item =>
    item.test.toLocaleLowerCase("pt-PT").includes("elisa")
  );
  const selectTest = (test: string) =>
    setTests(current =>
      current.includes(test)
        ? current.filter(item => item !== test)
        : [...current, test]
    );
  const updateSample = (
    index: number,
    update: (sample: (typeof samples)[number]) => (typeof samples)[number]
  ) =>
    setSamples(current =>
      current.map((sample, sampleIndex) =>
        sampleIndex === index ? update(sample) : sample
      )
    );
  const addSample = () =>
    setSamples(current => [
      ...current,
      { product: "", client: "", lot: "", result: "", ppm: "" },
    ]);
  const isLimitOfQuantification = (value: string) =>
    value.trim().toLocaleUpperCase("pt-PT") === "<L.Q.";
  const validElisaResult = (value: string) =>
    isLimitOfQuantification(value) ||
    (value.trim() !== "" &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0);

  async function addPhoto(file?: File) {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/))
      return toast.error("Use uma fotografia JPG, PNG ou WEBP.");
    if (file.size > 4_500_000)
      return toast.error("Cada fotografia deve ter no máximo 4,5 MB.");
    if (photos.length >= 5)
      return toast.error("Pode anexar até cinco fotografias por análise.");
    try {
      const dataUrl = await fileAsDataUrl(file);
      uploadPhoto.mutate(
        {
          fileName: file.name,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
          dataUrl,
        },
        { onSuccess: photo => setPhotos(current => [...current, photo]) }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível ler a fotografia."
      );
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedAnalyses.length)
      return toast.error("Selecione pelo menos uma análise de alergénio.");
    if (!activeProfile)
      return toast.error(
        "Não foi possível identificar o analista a partir da sessão PIN."
      );
    const incomplete = samples.find(
      sample =>
        !sample.product.trim() ||
        !sample.client.trim() ||
        !sample.lot.trim() ||
        !sample.result ||
        (isElisa && !validElisaResult(sample.ppm))
    );
    if (incomplete)
      return toast.error(
        isElisa
          ? "Preencha produto, cliente, lote e um valor em ppm ou <L.Q. para todas as amostras."
          : "Preencha produto, cliente e lote para todas as amostras."
      );
    const samplesWithResult = samples.map(sample => ({
      ...sample,
      label: ANALYSIS_RESULTS.find(item => item.value === sample.result)!.label,
      controlResult: ANALYSIS_RESULTS.find(
        item => item.value === sample.result
      )!.controlResult,
      ppm: isElisa
        ? isLimitOfQuantification(sample.ppm)
          ? "<L.Q."
          : Number(sample.ppm)
        : null,
    }));
    const result = samplesWithResult.some(
      sample => sample.controlResult === "NC"
    )
      ? "NC"
      : "C";
    const title =
      selectedAnalyses.length === 1
        ? (selectedAnalyses[0]?.test ?? "Análise interna")
        : `${selectedAnalyses.length} análises internas`;
    createEntry.mutate(
      {
        module: "internal_analysis",
        title,
        area: selectedCategories.join(", "),
        result,
        notes,
        payload: {
          category: selectedCategories.join(", "),
          test: selectedAnalyses[0]?.test ?? null,
          tests,
          analyses: selectedAnalyses,
          analyst: activeProfile.name,
          analystProfileId: activeProfile.id,
          samples: samplesWithResult,
          photos,
        },
        createNonconformity: false,
        severity: "medium",
      },
      {
        onSuccess: () => {
          utils.quality.reports.invalidate();
          setTests([]);
          setSamples([
            { product: "", client: "", lot: "", result: "", ppm: "" },
          ]);
          setNotes("");
          setPhotos([]);
        },
      }
    );
  }

  return (
    <>
      <ModuleHeader
        label="Análises internas"
        description="Registe a monitorização de alergénios por categoria, produto, cliente, resultado e evidência."
        icon={Microscope}
        commonToAllOperations
      />
      <form onSubmit={submit} className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle>Identificação da análise</CardTitle>
            <CardDescription>
              Selecione uma análise para validar. Cada validação fica registada
              individualmente e pode adicionar novas análises no mesmo dia.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1.5fr_.75fr]">
            <div className="space-y-3">
              <Label>Categoria e análise</Label>
              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                {ALLERGEN_ANALYSIS_CATEGORIES.map(category => (
                  <div key={category.label}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {category.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {category.tests.map(test => (
                        <Button
                          key={test}
                          type="button"
                          size="sm"
                          variant={tests.includes(test) ? "default" : "outline"}
                          onClick={() => selectTest(test)}
                        >
                          {test}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tests.length
                  ? `${tests.length} análise(s) selecionada(s): ${tests.join(", ")}.`
                  : "Selecione uma análise para iniciar a respetiva validação."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Analista responsável</Label>
              <Input
                readOnly
                value={activeProfile?.name ?? "Sessão PIN não identificada"}
                aria-label="Analista responsável"
              />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Amostras e cliente</CardTitle>
                <CardDescription>
                  Registe um ou mais produtos, cada um associado a um cliente,
                  lote e resultado próprio.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addSample}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Amostra
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {samples.map((sample, index) => (
              <div
                key={index}
                className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono-ui text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Amostra {index + 1}
                  </p>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-500 hover:text-red-700"
                    disabled={samples.length === 1}
                    onClick={() =>
                      setSamples(current =>
                        current.filter(
                          (_, sampleIndex) => sampleIndex !== index
                        )
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Produto / material</Label>
                    <Input
                      required
                      value={sample.product}
                      onChange={event =>
                        updateSample(index, current => ({
                          ...current,
                          product: event.target.value,
                        }))
                      }
                      placeholder="Produto ou matéria-prima"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <Input
                      required
                      value={sample.client}
                      onChange={event =>
                        updateSample(index, current => ({
                          ...current,
                          client: event.target.value,
                        }))
                      }
                      placeholder="Nome do cliente"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Lote</Label>
                    <Input
                      required
                      value={sample.lot}
                      onChange={event =>
                        updateSample(index, current => ({
                          ...current,
                          lot: event.target.value,
                        }))
                      }
                      placeholder="Lote ou identificação"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Resultado</Label>
                    <Select
                      value={sample.result}
                      onValueChange={value =>
                        updateSample(index, current => ({
                          ...current,
                          result: value as AnalysisResult,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o resultado" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANALYSIS_RESULTS.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isElisa && (
                    <div className="space-y-2">
                      <Label>Resultado Elisa (ppm ou &lt;L.Q.)</Label>
                      <Input
                        required
                        inputMode="decimal"
                        value={sample.ppm}
                        onChange={event =>
                          updateSample(index, current => ({
                            ...current,
                            ppm: event.target.value,
                          }))
                        }
                        placeholder="Valor numérico ou <L.Q."
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle>Observações e evidências</CardTitle>
            <CardDescription>
              As observações são obrigatórias; as fotografias selecionadas ficam
              associadas à análise que está a validar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Notes value={notes} onChange={setNotes} required />
            <div className="space-y-3 rounded-xl border border-dashed border-teal-200 bg-teal-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-teal-900">
                <ImagePlus className="h-4 w-4" />
                Fotografias de evidência
              </div>
              <Input
                aria-label="Adicionar fotografia de evidência"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => addPhoto(event.target.files?.[0])}
                disabled={uploadPhoto.isPending || photos.length >= 5}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map(photo => (
                  <div
                    key={photo.url}
                    className="relative overflow-hidden rounded-lg border border-teal-100 bg-white"
                  >
                    <img
                      src={photo.url}
                      alt={`Evidência: ${photo.fileName}`}
                      className="h-28 w-full object-cover"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 h-7 w-7"
                      aria-label={`Remover fotografia ${photo.fileName}`}
                      onClick={() =>
                        setPhotos(current =>
                          current.filter(item => item.url !== photo.url)
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <p className="truncate px-2 py-1 text-xs text-slate-600">
                      {photo.fileName}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              size="lg"
              variant={
                samples.some(
                  sample =>
                    ANALYSIS_RESULTS.find(item => item.value === sample.result)
                      ?.controlResult === "NC"
                )
                  ? "destructive"
                  : "default"
              }
              disabled={
                createEntry.isPending ||
                uploadPhoto.isPending ||
                !tests.length ||
                !activeProfile ||
                samples.some(sample => !sample.result)
              }
            >
              {createEntry.isPending
                ? "A registar…"
                : "Validar análise"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </>
  );
}

const TEMPERATURE_EQUIPMENT_BY_FACTORY: Record<
  string,
  Array<{ id: string; name: string; area: string; limit: number }>
> = {
  "1": [
    {
      id: "f1-freezer-1",
      name: "Equipamento de congelação 1",
      area: "Área da Qualidade",
      limit: -18,
    },
    {
      id: "f1-freezer-2",
      name: "Equipamento de congelação 2",
      area: "Área da Qualidade",
      limit: -18,
    },
  ],
  "2": [
    {
      id: "f2-cold-room",
      name: "Câmara de Frio",
      area: "Câmara de Frio",
      limit: 10,
    },
    {
      id: "f2-dispatch-freezer",
      name: "Arca de Congelação expedição",
      area: "Expedição",
      limit: -18,
    },
  ],
};
const AUTOMATIC_TEMPERATURE_PLATFORM_URL =
  "https://s31-iot.tekonelectronics.com/Login?returnUrl=%2FDashboard";

export function TemperatureControls({ createEntry }: any) {
  const { factoryId, factories } = useControlFactory();
  const equipment = TEMPERATURE_EQUIPMENT_BY_FACTORY[factoryId] ?? [];
  const factory = factories.find((item: any) => String(item.id) === factoryId);
  const [readings, setReadings] = useState<
    Record<string, { temperature: string; notes: string }>
  >({});
  const [evidencePhotos, setEvidencePhotos] = useState<
    VerificationEvidencePhoto[]
  >([]);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyEquipmentId, setHistoryEquipmentId] = useState("");
  const allEquipment = useMemo(
    () => Object.values(TEMPERATURE_EQUIPMENT_BY_FACTORY).flat(),
    []
  );
  const historyInput = useMemo(
    () => ({
      startDate: historyStartDate
        ? new Date(`${historyStartDate}T12:00:00`)
        : undefined,
      endDate: historyEndDate
        ? new Date(`${historyEndDate}T12:00:00`)
        : undefined,
      equipmentId: historyEquipmentId || undefined,
    }),
    [historyEndDate, historyEquipmentId, historyStartDate]
  );
  const history = trpc.quality.temperatureHistory.useQuery(historyInput);

  useEffect(() => {
    setReadings(
      Object.fromEntries(
        (TEMPERATURE_EQUIPMENT_BY_FACTORY[factoryId] ?? []).map(item => [
          item.id,
          { temperature: "", notes: "" },
        ])
      )
    );
  }, [factoryId]);
  const updateReading = (
    id: string,
    field: "temperature" | "notes",
    value: string
  ) =>
    setReadings(current => ({
      ...current,
      [id]: {
        temperature: current[id]?.temperature ?? "",
        notes: current[id]?.notes ?? "",
        [field]: value,
      },
    }));

  async function submitEquipment(
    item: (typeof TEMPERATURE_EQUIPMENT_BY_FACTORY)[string][number]
  ) {
    if (!factoryId || !factory || !equipment.length)
      return toast.error(
        "Selecione a Fábrica 1 ou a Fábrica 2 para este controlo."
      );
    const reading = readings[item.id];
    if (
      !reading ||
      reading.temperature === "" ||
      !Number.isFinite(Number(reading.temperature))
    )
      return toast.error("Indique a temperatura medida neste equipamento.");
    const temperature = Number(reading.temperature);
    const result = temperature <= item.limit ? "C" : "NC";
    const notes = reading.notes.trim() || null;
    if (result === "NC" && !notes)
      return toast.error(
        "Inclua uma observação para o equipamento fora do limite."
      );
    await createEntry.mutateAsync({
      module: "temperature_controls",
      title: `Controlo de Temperatura — ${item.name}`,
      area: item.area,
      result,
      notes: notes ?? undefined,
      payload: {
        equipment: [
          {
            ...item,
            temperature,
            result,
            notes,
          },
        ],
        evidencePhotos: result === "NC" ? evidencePhotos : [],
      },
      createNonconformity: false,
      severity: result === "NC" ? "high" : "low",
    });
    setReadings(current => ({
      ...current,
      [item.id]: { temperature: "", notes: "" },
    }));
    setEvidencePhotos([]);
  }

  const hasNc = equipment.some(item => {
    const value = Number(readings[item.id]?.temperature);
    return (
      readings[item.id]?.temperature !== "" &&
      Number.isFinite(value) &&
      value > item.limit
    );
  });
  return (
    <>
      <ModuleHeader
        label="Controlos de Temperatura"
        description="Registe temperaturas dos equipamentos críticos. É obrigatória uma verificação diária mínima por equipamento, podendo efetuar registos adicionais."
        icon={ThermometerSnowflake}
      />
      <div className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Verificação manual por equipamento</CardTitle>
                <CardDescription>
                  Os limites são validados automaticamente: congelação ≤ -18 ºC
                  e câmara de frio ≤ 10 ºC. Registe cada equipamento de forma
                  independente; pode acrescentar novas leituras ao longo do dia.
                </CardDescription>
              </div>
              <Button asChild type="button" variant="outline">
                <a
                  href={AUTOMATIC_TEMPERATURE_PLATFORM_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ThermometerSnowflake className="mr-2 h-4 w-4" />
                  Plataforma automática
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!factoryId || !equipment.length ? (
              <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-5 text-sm text-sky-900">
                Selecione a Fábrica 1 ou a Fábrica 2 no topo. Os restantes
                equipamentos serão consultados na plataforma de verificação
                automática.
              </div>
            ) : (
              equipment.map(item => {
                const reading = readings[item.id] ?? {
                  temperature: "",
                  notes: "",
                };
                const temperature =
                  reading.temperature === ""
                    ? null
                    : Number(reading.temperature);
                const result =
                  temperature === null || !Number.isFinite(temperature)
                    ? null
                    : temperature <= item.limit
                      ? "C"
                      : "NC";
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 ${result === "NC" ? "border-red-200 bg-red-50/60" : result === "C" ? "border-emerald-200 bg-emerald-50/50" : "border-slate-100 bg-slate-50/60"}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-slate-950">
                          {item.name}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.area} · Limite: ≤ {item.limit} ºC
                        </p>
                      </div>
                      {result && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${result === "C" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                        >
                          {result === "C" ? "Conforme" : "Fora do limite"}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
                      <div className="space-y-2">
                        <Label htmlFor={`temperature-${item.id}`}>
                          Temperatura medida (ºC)
                        </Label>
                        <Input
                          id={`temperature-${item.id}`}
                          required
                          type="number"
                          step="0.1"
                          value={reading.temperature}
                          onChange={event =>
                            updateReading(
                              item.id,
                              "temperature",
                              event.target.value
                            )
                          }
                          placeholder="Ex.: -18,5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`temperature-note-${item.id}`}>
                          Observações {result === "NC" ? "(obrigatórias)" : ""}
                        </Label>
                        <Input
                          id={`temperature-note-${item.id}`}
                          required={result === "NC"}
                          value={reading.notes}
                          onChange={event =>
                            updateReading(item.id, "notes", event.target.value)
                          }
                          placeholder="Estado do equipamento, ação tomada ou observações"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="mt-4 w-full sm:w-auto"
                      disabled={
                        createEntry.isPending ||
                        reading.temperature === "" ||
                        !Number.isFinite(Number(reading.temperature)) ||
                        (result === "NC" && !reading.notes.trim())
                      }
                      onClick={() => void submitEquipment(item)}
                    >
                      {createEntry.isPending
                        ? "A registar…"
                        : "Registar leitura deste equipamento"}
                    </Button>
                  </div>
                );
              })
            )}
            {hasNc && (
              <NcEvidenceUploader
                module="temperature_controls"
                photos={evidencePhotos}
                onChange={setEvidencePhotos}
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="border-0 panel-shadow">
        <CardHeader>
          <CardTitle>Consulta de resultados</CardTitle>
          <CardDescription>
            Filtre os registos por intervalo de datas e equipamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Data inicial</Label>
              <Input
                aria-label="Data inicial de temperaturas"
                type="date"
                value={historyStartDate}
                onChange={event => {
                  setHistoryStartDate(event.target.value);
                  if (historyEndDate && event.target.value > historyEndDate)
                    setHistoryEndDate(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Data final</Label>
              <Input
                aria-label="Data final de temperaturas"
                type="date"
                min={historyStartDate}
                value={historyEndDate}
                onChange={event => setHistoryEndDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Equipamento</Label>
              <Select
                value={historyEquipmentId || "all"}
                onValueChange={value =>
                  setHistoryEquipmentId(value === "all" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os equipamentos</SelectItem>
                  {allEquipment.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {history.isLoading ? (
            <p className="text-sm text-muted-foreground">
              A carregar resultados…
            </p>
          ) : history.data?.length ? (
            <div className="divide-y overflow-hidden rounded-xl border border-slate-100">
              {history.data.map(item => (
                <div
                  key={`${item.entryId}-${item.equipmentId}`}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-950">{item.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.area} ·{" "}
                      {new Date(item.completedAt).toLocaleDateString("pt-PT")} ·{" "}
                      {item.temperature ?? "—"} ºC
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Verificado em{" "}
                      {new Date(item.completedAt).toLocaleString("pt-PT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      {item.registeredByName
                        ? ` por ${item.registeredByName}${item.registeredByTitle ? ` · ${item.registeredByTitle}` : ""}`
                        : ""}
                    </p>
                    {item.notes ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${item.result === "NC" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}
                  >
                    {item.result === "NC" ? "NC" : "C"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Sem resultados para os filtros selecionados.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function FoodDefense({
  createEntry,
  plannedTaskId,
  foodDefenseEntries = [],
}: {
  createEntry: any;
  plannedTaskId?: number;
  foodDefenseEntries?: DailyControlEntry[];
}) {
  const { factoryId } = useControlFactory();
  const [assessments, setAssessments] = useState<
    Record<
      string,
      {
        result?: Result;
        notes: string;
        probability: string;
        severity: string;
        newMeasures: string;
        owner: string;
        deadline: string;
      }
    >
  >({});
  const [evidencePhotos, setEvidencePhotos] = useState<
    VerificationEvidencePhoto[]
  >([]);
  const sections = useMemo(
    () => Array.from(new Set(FOOD_DEFENSE_CRITERIA.map(item => item.section))),
    []
  );
  const assessment = (id: string) =>
    assessments[id] ?? {
      result: undefined,
      notes: "",
      probability: "",
      severity: "",
      newMeasures: "",
      owner: "",
      deadline: "",
    };
  const update = (
    id: string,
    changes: Partial<ReturnType<typeof assessment>>
  ) =>
    setAssessments(current => ({
      ...current,
      [id]: { ...assessment(id), ...changes },
    }));
  const completedCriterionIds = useMemo(() => {
    const ids = new Set<string>();
    foodDefenseEntries.forEach(entry => {
      const payload = entry.payload ?? {};
      if (typeof payload.foodDefenseCriterionId === "string")
        ids.add(payload.foodDefenseCriterionId);
      if (Array.isArray(payload.criteria))
        payload.criteria.forEach(criterion => {
          if (
            criterion &&
            typeof criterion === "object" &&
            typeof (criterion as Record<string, unknown>).id === "string"
          )
            ids.add((criterion as Record<string, string>).id);
        });
    });
    return ids;
  }, [foodDefenseEntries]);
  const completed = completedCriterionIds.size;
  const ncItems = FOOD_DEFENSE_CRITERIA.filter(
    item => assessment(item.id).result === "NC"
  );
  const riskFor = (itemId: string) => {
    const value = assessment(itemId);
    const probability = Number(value.probability);
    const severity = Number(value.severity);
    if (!probability || !severity) return null;
    const vulnerability = probability * severity;
    return {
      vulnerability,
      guidance:
        FOOD_DEFENSE_RISK_GUIDANCE.find(item => vulnerability >= item.min) ??
        FOOD_DEFENSE_RISK_GUIDANCE.at(-1)!,
    };
  };
  const suggestMeasure = trpc.quality.suggestFoodDefenseMeasure.useMutation({
    onSuccess: (data, variables) =>
      update(variables.itemId, { newMeasures: data.suggestion }),
    onError: error => toast.error(error.message),
  });
  const requestMeasureSuggestion = (
    item: (typeof FOOD_DEFENSE_CRITERIA)[number]
  ) => {
    const value = assessment(item.id);
    const risk = riskFor(item.id);
    if (!factoryId)
      return toast.error("Selecione a fábrica para gerar a sugestão.");
    if (!risk)
      return toast.error(
        "Selecione a probabilidade e a severidade antes de pedir uma sugestão."
      );
    suggestMeasure.mutate({
      itemId: item.id,
      factoryId: Number(factoryId),
      criterion: item.criterion,
      section: item.section,
      notes: value.notes,
      probability: Number(value.probability),
      severity: Number(value.severity),
      vulnerability: risk.vulnerability,
      riskGuidance: `${risk.guidance.label}: ${risk.guidance.action}`,
      existingMeasure: value.newMeasures,
      plannedTaskId,
    });
  };
  function registerPoint(item: (typeof FOOD_DEFENSE_CRITERIA)[number]) {
    if (!factoryId)
      return toast.error("Selecione a fábrica antes de registar este ponto.");
    const value = assessment(item.id);
    if (!value.result)
      return toast.error("Selecione o resultado antes de registar este ponto.");
    const risk = riskFor(item.id);
    if (value.result === "NC" && (!value.probability || !value.severity))
      return toast.error(
        "Em cada NC indique probabilidade e severidade para calcular a vulnerabilidade."
      );
    const criterion = {
      ...item,
      ...value,
      vulnerability: risk?.vulnerability ?? null,
      riskLevel: risk?.guidance.label ?? null,
      recommendedAction: risk?.guidance.action ?? null,
    };
    createEntry.mutate({
      module: "food_defense",
      title: `Food Defense · ${item.id}`,
      area: item.section,
      factoryId: Number(factoryId),
      result: value.result,
      notes: value.notes.trim() || "Ponto validado individualmente.",
      payload: {
        periodicity: "annual",
        foodDefenseCriterionId: item.id,
        foodDefenseCriterion: item.criterion,
        criteria: [criterion],
        riskMatrix: "V = Probabilidade × Severidade",
        evidencePhotos,
      },
      createNonconformity: false,
      severity:
        value.result === "NC" && (risk?.vulnerability ?? 0) >= 6
        ? "critical"
        : value.result === "NC"
          ? "high"
          : "low",
    });
  }
  return (
    <>
      <ModuleHeader
        label="Food Defense"
        description="Avaliação anual baseada na checklist de segurança, acessos, operações, fornecimentos e pessoal."
        icon={ShieldCheck}
      />
      <div className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle>Checklist anual Food Defense</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">
                {completed} / {FOOD_DEFENSE_CRITERIA.length} critérios registados
              </Badge>
              <Badge
                className={
                  ncItems.length
                    ? "bg-red-100 text-red-800 hover:bg-red-100"
                    : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                }
              >
                {ncItems.length} NC
              </Badge>
            </div>
          </CardContent>
        </Card>
        {sections.map((section, sectionIndex) => {
          const criteria = FOOD_DEFENSE_CRITERIA.filter(
            item => item.section === section
          );
          const completeInSection = criteria.filter(item =>
            completedCriterionIds.has(item.id)
          ).length;
          return (
            <details
              key={section}
              open={sectionIndex === 0}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white panel-shadow"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-slate-50 px-5 py-4">
                <div>
                  <p className="font-semibold text-slate-950">{section}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {criteria.length} critérios · {completeInSection}/
                    {criteria.length} avaliados
                  </p>
                </div>
                <ChevronDown className="h-5 w-5 text-slate-500" />
              </summary>
              <div className="space-y-4 p-4">
                {section.toLocaleLowerCase("pt-PT") === "segurança geral" ? (
                  <a
                    href="https://visionofhumanity.org/indexes/global-peace-index/"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                  >
                    <span>
                      <span className="block font-semibold">Classificação anual de Portugal</span>
                      <span className="mt-1 block text-xs text-sky-800">Consultar o Global Peace Index antes de validar os critérios de Segurança Geral.</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </a>
                ) : null}
                {criteria.map((item, index) => {
                  const value = assessment(item.id);
                  const risk = riskFor(item.id);
                  const pointRegistered = completedCriterionIds.has(item.id);
                  return (
                    <Card
                      key={item.id}
                      className={`border ${value.result === "NC" ? "border-red-200 bg-red-50/40" : pointRegistered ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100"}`}
                    >
                      <CardContent className="space-y-4 p-4">
                        <div className="flex gap-3">
                          <span className="font-mono-ui h-6 shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {index + 1}
                          </span>
                          <p className="font-medium text-slate-950">
                            {item.criterion}
                          </p>
                        </div>
                        <Badge className={pointRegistered ? "w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "w-fit bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                          {pointRegistered ? "Ponto registado" : "Ponto por registar"}
                        </Badge>
                        <div className="space-y-2">
                          <Label>Resultado da avaliação atual</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {(["C", "NC", "N/A"] as Result[]).map(result => (
                              <Button
                                key={result}
                                type="button"
                                variant={
                                  value.result === result
                                    ? result === "NC"
                                      ? "destructive"
                                      : "default"
                                    : "outline"
                                }
                                onClick={() => update(item.id, { result })}
                              >
                                {result}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <Notes
                          value={value.notes}
                          onChange={notes => update(item.id, { notes })}
                        />
                        {value.result === "NC" && (
                          <div className="space-y-4 rounded-xl border border-red-200 bg-white/80 p-4">
                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="space-y-2">
                                <Label>Probabilidade (P)</Label>
                                <Select
                                  value={value.probability}
                                  onValueChange={probability =>
                                    update(item.id, { probability })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="1–3" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1">1 · Baixa</SelectItem>
                                    <SelectItem value="2">2 · Média</SelectItem>
                                    <SelectItem value="3">3 · Alta</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Severidade (S)</Label>
                                <Select
                                  value={value.severity}
                                  onValueChange={severity =>
                                    update(item.id, { severity })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="1–3" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1">1 · Baixa</SelectItem>
                                    <SelectItem value="2">2 · Média</SelectItem>
                                    <SelectItem value="3">3 · Alta</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                                <p className="text-xs font-medium text-red-900">
                                  Vulnerabilidade (V)
                                </p>
                                <p className="mt-1 text-xl font-semibold text-red-950">
                                  {risk?.vulnerability ?? "—"}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-red-800">
                                  {risk?.guidance.label ?? "Selecione P e S"}
                                </p>
                              </div>
                            </div>
                            {risk && (
                              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                                <span className="font-semibold">
                                  Ação indicada:
                                </span>{" "}
                                {risk.guidance.action}
                              </p>
                            )}
                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Label>Nova medida de controlo</Label>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={!risk || suggestMeasure.isPending}
                                    onClick={() =>
                                      requestMeasureSuggestion(item)
                                    }
                                  >
                                    <WandSparkles className="mr-2 h-4 w-4" />
                                    {suggestMeasure.isPending
                                      ? "A sugerir…"
                                      : "Sugerir com IA"}
                                  </Button>
                                </div>
                                <Textarea
                                  value={value.newMeasures}
                                  onChange={event =>
                                    update(item.id, {
                                      newMeasures: event.target.value,
                                    })
                                  }
                                  placeholder="Medida proposta ou sugestão gerada por IA"
                                />
                                <p className="text-xs leading-5 text-slate-500">
                                  A sugestão é editável e deve ser validada pela
                                  equipa antes do registo.
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label>Responsável</Label>
                                <Input
                                  value={value.owner}
                                  onChange={event =>
                                    update(item.id, {
                                      owner: event.target.value,
                                    })
                                  }
                                  placeholder="Responsável pela medida"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Prazo</Label>
                                <Input
                                  type="date"
                                  value={value.deadline}
                                  onChange={event =>
                                    update(item.id, {
                                      deadline: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        <Button
                          type="button"
                          className="w-full"
                          variant={value.result === "NC" ? "destructive" : "default"}
                          disabled={createEntry.isPending || !value.result}
                          onClick={() => registerPoint(item)}
                        >
                          {createEntry.isPending
                            ? "A registar…"
                            : pointRegistered
                              ? "Registar nova validação deste ponto"
                              : "Registar este ponto"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </details>
          );
        })}
        {ncItems.length ? (
          <NcEvidenceUploader
            module="food_defense"
            photos={evidencePhotos}
            onChange={setEvidencePhotos}
          />
        ) : null}
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Registe cada ponto após a respetiva validação. A fábrica só fica completa quando todos os critérios aplicáveis tiverem pelo menos um registo.
        </p>
      </div>
    </>
  );
}

function SuggestionBoxes({
  createEntry,
  factoryId,
  referenceDate,
}: {
  createEntry: any;
  factoryId: string;
  referenceDate?: Date | string;
}) {
  const { factories } = useControlFactory();
  const factory = factories.find((item: any) => String(item.id) === factoryId);
  const locations = [...suggestionLocationsForFactory(factory?.code)];
  const operationalDate = useMemo(() => {
    const source = referenceDate ? new Date(referenceDate) : new Date();
    return new Date(
      source.getFullYear(),
      source.getMonth(),
      source.getDate(),
      12
    );
  }, [referenceDate]);
  const historyQuery = trpc.quality.dailyControlResults?.useQuery?.(
    {
      module: "suggestion_boxes",
      operationalDate,
      factoryId: factoryId ? Number(factoryId) : undefined,
    },
    { enabled: Boolean(factoryId) }
  ) ?? { data: undefined, isLoading: false };
  const suggestionResults =
    (historyQuery.data as { entries?: DailyControlEntry[] } | undefined)
      ?.entries ?? [];
  const verifiedLocations = useMemo(
    () => new Set(suggestionResults.map(entry => entry.area)),
    [suggestionResults]
  );
  const [location, setLocation] = useState("");
  const [count, setCount] = useState("0");
  const [triage, setTriage] = useState("Por triagem");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setLocation(current =>
      locations.includes(current as (typeof locations)[number]) &&
      !verifiedLocations.has(current)
        ? current
        : (locations.find(item => !verifiedLocations.has(item)) ??
          locations[0] ??
          "")
    );
  }, [factory?.code, locations.join("|"), verifiedLocations]);
  const completedLocations = locations.filter(item =>
    verifiedLocations.has(item)
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!location) return;
    createEntry.mutate({
      module: "suggestion_boxes",
      title: `Caixa de sugestões — ${location}`,
      area: location,
      notes,
      payload: { count: Number(count), triage },
      createNonconformity: false,
      severity: "low",
    });
  }
  return (
    <>
      <ModuleHeader
        label="Caixas de sugestões"
        description="Selecione a fábrica ou linha para ver apenas as caixas que lhe estão associadas."
        icon={Lightbulb}
      />
      {factoryId && locations.length ? (
        <Card className="border-0 bg-teal-50/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conclusão por área</CardTitle>
            <CardDescription>
              No dia {operationalDate.toLocaleDateString("pt-PT")}, cada
              localização deve ter pelo menos uma verificação registada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {locations.map(item => {
                const verified = verifiedLocations.has(item);
                return (
                  <div
                    key={item}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${verified ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {verified ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
                      ) : (
                        <CircleAlert className="h-5 w-5 shrink-0 text-amber-700" />
                      )}
                      <span className="truncate text-sm font-medium text-slate-900">
                        {item}
                      </span>
                    </div>
                    <Badge
                      className={
                        verified
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : "bg-amber-100 text-amber-900 hover:bg-amber-100"
                      }
                    >
                      {verified ? "Verificada" : "Pendente"}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
              <span>
                {completedLocations.length} de {locations.length} localizações
                verificadas
              </span>
              <Badge
                className={
                  completedLocations.length === locations.length
                    ? "bg-emerald-600 text-white hover:bg-emerald-600"
                    : "bg-amber-600 text-white hover:bg-amber-600"
                }
              >
                {locations.length
                  ? Math.round(
                      (completedLocations.length / locations.length) * 100
                    )
                  : 0}
                %
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <form onSubmit={submit}>
        <Card className="border-0 panel-shadow">
          <CardContent className="space-y-5 p-6">
            {!factoryId || !locations.length ? (
              <div className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
                Selecione Fábrica 1, Fábrica 2 ou Fábrica 3/SG no topo para
                registar a verificação de uma caixa de sugestões.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Localização</Label>
                    <Select value={location} onValueChange={setLocation}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map(item => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>N.º de registos</Label>
                    <Input
                      type="number"
                      min="0"
                      value={count}
                      onChange={event => setCount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado de triagem</Label>
                    <Select value={triage} onValueChange={setTriage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Por triagem", "Em análise", "Triada", "Fechada"].map(
                          item => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Notes value={notes} onChange={setNotes} />
                <Button className="w-full" size="lg">
                  {verifiedLocations.has(location)
                    ? "Registar verificação adicional"
                    : "Registar área verificada"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </form>
    </>
  );
}

function FragileInspection({ createEntry }: any) {
  const items = trpc.quality.listFragileItems.useQuery();
  const utils = trpc.useUtils();
  const addItem = trpc.quality.addFragileItem.useMutation({
    onSuccess: () => {
      utils.quality.listFragileItems.invalidate();
      toast.success("Item adicionado ao inventário.");
    },
    onError: error => toast.error(error.message),
  });
  const [itemId, setItemId] = useState("");
  const [state, setState] = useState("Íntegro");
  const [notes, setNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<"Vidro" | "Plástico rígido" | "Outro">(
    "Vidro"
  );
  const item = items.data?.find(entry => String(entry.id) === itemId);
  function submitInspection(event: FormEvent) {
    event.preventDefault();
    if (!item) return toast.error("Selecione um item do inventário.");
    if (state !== "Íntegro" && !notes.trim())
      return toast.error(
        "A ação de contenção é obrigatória em caso de dano ou ausência."
      );
    createEntry.mutate({
      module: "fragile_items",
      title: `Quebrável — ${item.name}`,
      area: item.location,
      result: state === "Íntegro" ? "C" : "NC",
      notes,
      payload: { fragileItemId: item.id, state, containmentAction: notes },
      createNonconformity: state !== "Íntegro",
      severity: state === "Danificado" ? "high" : "medium",
    });
  }
  function add(event: FormEvent) {
    event.preventDefault();
    addItem.mutate({ name, location, itemType: type });
    setDialogOpen(false);
    setName("");
    setLocation("");
  }
  return (
    <>
      <ModuleHeader
        label="Quebráveis"
        description="Inspecione os itens do inventário e associe a ação de contenção quando existir desvio."
        icon={Boxes}
      />
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar ao inventário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo item quebrável</DialogTitle>
            </DialogHeader>
            <form onSubmit={add} className="space-y-4">
              <div className="space-y-2">
                <Label>Item</Label>
                <Input
                  required
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="Ex.: Luminária de proteção"
                />
              </div>
              <div className="space-y-2">
                <Label>Localização</Label>
                <Input
                  required
                  value={location}
                  onChange={event => setLocation(event.target.value)}
                  placeholder="Ex.: Produção T"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={type}
                  onValueChange={value => setType(value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Vidro", "Plástico rígido", "Outro"].map(item => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full">Adicionar item</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <form onSubmit={submitInspection}>
        <Card className="border-0 panel-shadow">
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Item do inventário</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.data?.map(entry => (
                      <SelectItem key={entry.id} value={String(entry.id)}>
                        {entry.name} — {entry.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado da inspeção</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Íntegro", "Danificado", "Em falta"].map(entry => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ação de contenção / observações</Label>
              <Textarea
                value={notes}
                onChange={event => setNotes(event.target.value)}
                required={state !== "Íntegro"}
                placeholder="Obrigatório em caso de item danificado ou em falta."
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              variant={state === "Íntegro" ? "default" : "destructive"}
            >
              Registar inspeção
            </Button>
          </CardContent>
        </Card>
      </form>
    </>
  );
}

function FragileInspectionLegacy({
  createEntry,
  factoryId,
}: {
  createEntry: any;
  factoryId: string;
}) {
  const [periodicity, setPeriodicity] = useState("all");
  const [area, setArea] = useState("all");
  const [itemId, setItemId] = useState("");
  const [state, setState] = useState("Íntegro");
  const [notes, setNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newPeriodicity, setNewPeriodicity] = useState<"D" | "S" | "Q" | "M">(
    "M"
  );
  const [type, setType] = useState<"Vidro" | "Plástico rígido" | "Outro">(
    "Outro"
  );
  const utils = trpc.useUtils();
  const listInput = useMemo(
    () => ({
      factoryId: factoryId ? Number(factoryId) : undefined,
      periodicity:
        periodicity === "all"
          ? undefined
          : (periodicity as "D" | "S" | "Q" | "M"),
    }),
    [factoryId, periodicity]
  );
  const items = trpc.quality.listFragileItems.useQuery(listInput);
  const addItem = trpc.quality.addFragileItem.useMutation({
    onSuccess: () => {
      utils.quality.listFragileItems.invalidate();
      toast.success("Ponto de quebrável adicionado ao inventário.");
    },
    onError: error => toast.error(error.message),
  });
  const availableAreas = Array.from(
    new Set((items.data ?? []).map(entry => entry.location))
  ).sort();
  const visibleItems = (items.data ?? []).filter(
    entry => area === "all" || entry.location === area
  );
  const inventoryCount = factoryId ? visibleItems.length : 0;
  const item =
    visibleItems.find(entry => String(entry.id) === itemId) ??
    (items.data ?? []).find(entry => String(entry.id) === itemId);
  const periodLabel = {
    D: "Diário",
    S: "Semanal",
    Q: "Quinzenal",
    M: "Mensal",
  } as const;
  function submitInspection(event: FormEvent) {
    event.preventDefault();
    if (!factoryId)
      return toast.error("Selecione a fábrica antes de registar a inspeção.");
    if (!item) return toast.error("Selecione um ponto de controlo.");
    if (state !== "Íntegro" && !notes.trim())
      return toast.error(
        "A ação de contenção é obrigatória em caso de dano ou ausência."
      );
    createEntry.mutate({
      module: "fragile_items",
      title: `Quebrável — ${item.name}`,
      area: item.location,
      result: state === "Íntegro" ? "C" : "NC",
      notes,
      payload: {
        fragileItemId: item.id,
        state,
        containmentAction: notes,
        periodicity: item.periodicity,
        itemType: item.itemType,
        sourceSheet: item.sourceSheet,
      },
      createNonconformity: state !== "Íntegro",
      severity: state === "Danificado" ? "high" : "medium",
    });
  }
  function add(event: FormEvent) {
    event.preventDefault();
    if (!factoryId)
      return toast.error("Selecione a fábrica antes de criar um ponto.");
    addItem.mutate({
      name,
      location: newLocation,
      factoryId: Number(factoryId),
      periodicity: newPeriodicity,
      itemType: type,
    });
    setDialogOpen(false);
    setName("");
    setNewLocation("");
  }
  return (
    <>
      <ModuleHeader
        label="Quebráveis"
        description="Selecione a fábrica, a periodicidade e a área para inspecionar os pontos importados dos registos operacionais."
        icon={Boxes}
      />
      <div className="flex flex-col gap-4 rounded-2xl border border-teal-100 bg-teal-50/70 p-5 md:flex-row md:items-end">
        <div className="flex-1">
          <p className="font-medium text-teal-950">
            Pontos de controlo importados
          </p>
          <p className="mt-1 text-sm text-teal-800">
            O inventário reflete as áreas e frequências D, S, Q e M dos
            ficheiros de controlo de quebráveis.
          </p>
        </div>
        <Badge className="w-fit bg-teal-700 text-white hover:bg-teal-700">
          {factoryId
            ? `${inventoryCount} pontos disponíveis`
            : "Selecione a fábrica"}
        </Badge>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar ponto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo ponto quebrável</DialogTitle>
            </DialogHeader>
            <form onSubmit={add} className="space-y-4">
              <div className="space-y-2">
                <Label>Ponto de controlo</Label>
                <Input
                  required
                  value={name}
                  onChange={event => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Área</Label>
                <Input
                  required
                  value={newLocation}
                  onChange={event => setNewLocation(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Periodicidade</Label>
                  <Select
                    value={newPeriodicity}
                    onValueChange={value =>
                      setNewPeriodicity(value as "D" | "S" | "Q" | "M")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(periodLabel).map(([code, label]) => (
                        <SelectItem key={code} value={code}>
                          {code} — {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={type}
                    onValueChange={value => setType(value as typeof type)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Vidro", "Plástico rígido", "Outro"].map(itemType => (
                        <SelectItem key={itemType} value={itemType}>
                          {itemType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full">Adicionar ponto</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <form onSubmit={submitInspection} className="space-y-5">
        <Card className="border-0 panel-shadow">
          <CardContent className="space-y-5 p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Periodicidade</Label>
                <Select
                  value={periodicity}
                  onValueChange={value => {
                    setPeriodicity(value);
                    setArea("all");
                    setItemId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as periodicidades</SelectItem>
                    {Object.entries(periodLabel).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {code} — {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Área</Label>
                <Select
                  value={area}
                  onValueChange={value => {
                    setArea(value);
                    setItemId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as áreas</SelectItem>
                    {availableAreas.map(entry => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ponto de controlo</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        factoryId
                          ? "Selecione o ponto"
                          : "Selecione a fábrica primeiro"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleItems.map(entry => (
                      <SelectItem key={entry.id} value={String(entry.id)}>
                        {entry.name} · {entry.periodicity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {item && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <Badge variant="outline">{item.itemType}</Badge>
                <Badge className="bg-slate-900 text-white hover:bg-slate-900">
                  {item.periodicity} — {periodLabel[item.periodicity]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {item.location}
                </span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Estado da inspeção</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Íntegro", "Danificado", "Em falta"].map(entry => (
                    <SelectItem key={entry} value={entry}>
                      {entry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ação de contenção / observações</Label>
              <Textarea
                value={notes}
                onChange={event => setNotes(event.target.value)}
                required={state !== "Íntegro"}
                placeholder="Obrigatório em caso de item danificado ou em falta."
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              variant={state === "Íntegro" ? "default" : "destructive"}
              disabled={!factoryId || !item}
            >
              Registar inspeção
            </Button>
          </CardContent>
        </Card>
      </form>
    </>
  );
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function FragileInspectionV2({
  createEntry,
  factoryId,
  preselectedItemId = null,
  showHeader = true,
}: {
  createEntry: any;
  factoryId: string;
  preselectedItemId?: number | null;
  showHeader?: boolean;
}) {
  const metadata = trpc.quality.metadata.useQuery();
  const utils = trpc.useUtils();
  const [periodicity, setPeriodicity] = useState("all");
  const [area, setArea] = useState("all");
  const [itemId, setItemId] = useState(
    preselectedItemId ? String(preselectedItemId) : ""
  );
  const [state, setState] = useState("Íntegro");
  const [notes, setNotes] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [selectedFactoryId, setSelectedFactoryId] = useState("");
  const [selectedPeriodicity, setSelectedPeriodicity] = useState<
    "D" | "S" | "Q" | "M"
  >("M");
  const [selectedType, setSelectedType] = useState<
    "Vidro" | "Plástico rígido" | "Outro"
  >("Outro");
  const factoryInput = useMemo(
    () => (factoryId ? { factoryId: Number(factoryId) } : undefined),
    [factoryId]
  );
  const items = trpc.quality.listFragileItems.useQuery(factoryInput, {
    enabled: Boolean(factoryId),
  });
  const addItem = trpc.quality.addFragileItem.useMutation({
    onSuccess: () => {
      utils.quality.listFragileItems.invalidate();
      toast.success("Ponto de controlo criado.");
      setCreateOpen(false);
    },
    onError: error => toast.error(error.message),
  });
  const updateItem = trpc.quality.updateFragileItem.useMutation({
    onSuccess: () => {
      utils.quality.listFragileItems.invalidate();
      toast.success("Ponto de controlo atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const uploadImage = trpc.quality.uploadFragileReferenceImage.useMutation({
    onSuccess: () => {
      utils.quality.listFragileItems.invalidate();
      toast.success("Imagem de referência carregada.");
    },
    onError: error => toast.error(error.message),
  });
  const periodLabel = {
    D: "Diário",
    S: "Semanal",
    Q: "Quinzenal",
    M: "Mensal",
  } as const;
  const factoryItems = items.data ?? [];
  const availableAreas = Array.from(
    new Set(factoryItems.map(entry => entry.location))
  ).sort();
  const visibleItems = factoryItems.filter(
    entry =>
      (periodicity === "all" || entry.periodicity === periodicity) &&
      (area === "all" || entry.location === area)
  );
  const selectedItem =
    visibleItems.find(entry => String(entry.id) === itemId) ??
    factoryItems.find(entry => String(entry.id) === itemId);
  const factories = metadata.data?.factories ?? [];

  function resetEditor(entry?: any) {
    setEditing(entry ?? null);
    setName(entry?.name ?? "");
    setLocation(entry?.location ?? factoryItems[0]?.location ?? "");
    setSelectedFactoryId(String(entry?.factoryId ?? factoryId ?? ""));
    setSelectedPeriodicity(entry?.periodicity ?? "M");
    setSelectedType(entry?.itemType ?? "Outro");
  }

  function openCreate() {
    resetEditor();
    setSelectedFactoryId(factoryId);
    setCreateOpen(true);
  }
  function openEdit(entry: any) {
    resetEditor(entry);
    setEditOpen(true);
  }

  function saveNew(event: FormEvent) {
    event.preventDefault();
    if (!selectedFactoryId)
      return toast.error("Selecione a fábrica do novo ponto.");
    if (!location) return toast.error("Selecione a área do novo ponto.");
    addItem.mutate({
      name,
      location,
      factoryId: Number(selectedFactoryId),
      periodicity: selectedPeriodicity,
      itemType: selectedType,
    });
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (!selectedFactoryId)
      return toast.error("Selecione a fábrica do ponto de controlo.");
    if (!location) return toast.error("Selecione a área do ponto de controlo.");
    updateItem.mutate(
      {
        id: editing.id,
        name,
        location,
        factoryId: Number(selectedFactoryId),
        periodicity: selectedPeriodicity,
        itemType: selectedType,
      },
      { onSuccess: () => setEditOpen(false) }
    );
  }

  async function addReferenceImage(file?: File) {
    if (!file || !editing) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/))
      return toast.error("Use uma imagem JPG, PNG ou WEBP.");
    if (file.size > 4_500_000)
      return toast.error("A imagem deve ter no máximo 4,5 MB.");
    try {
      const dataUrl = await fileAsDataUrl(file);
      uploadImage.mutate(
        {
          itemId: editing.id,
          fileName: file.name,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
          dataUrl,
        },
        {
          onSuccess: result =>
            setEditing((current: any) =>
              current
                ? {
                    ...current,
                    referenceImageUrl: result.url,
                    referenceImageName: file.name,
                  }
                : current
            ),
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a imagem."
      );
    }
  }

  function submitInspection(event: FormEvent) {
    event.preventDefault();
    if (!factoryId)
      return toast.error("Selecione a fábrica antes de registar a inspeção.");
    if (!selectedItem) return toast.error("Selecione um ponto de controlo.");
    if (state !== "Íntegro" && !notes.trim())
      return toast.error(
        "A ação de contenção é obrigatória em caso de dano ou ausência."
      );
    createEntry.mutate({
      module: "fragile_items",
      title: `Quebrável — ${selectedItem.name}`,
      area: selectedItem.location,
      result: state === "Íntegro" ? "C" : "NC",
      notes,
      payload: {
        fragileItemId: selectedItem.id,
        state,
        containmentAction: notes,
        periodicity: selectedItem.periodicity,
        referenceImageUrl: selectedItem.referenceImageUrl,
      },
      createNonconformity: state !== "Íntegro",
      severity: state === "Danificado" ? "high" : "medium",
    });
  }

  const pointForm = (
    onSubmit: (event: FormEvent) => void,
    submitLabel: string,
    includeImage = false
  ) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome do ponto de controlo</Label>
        <Input
          required
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Ex.: Proteção acrílica da fatiadora"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Fábrica / linha</Label>
          <Select
            value={selectedFactoryId}
            onValueChange={value => {
              setSelectedFactoryId(value);
              setLocation(factoryItems[0]?.location ?? "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a fábrica" />
            </SelectTrigger>
            <SelectContent>
              {factories.map(factory => (
                <SelectItem key={factory.id} value={String(factory.id)}>
                  {factory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Área</Label>
          <Select
            value={location}
            onValueChange={setLocation}
            disabled={!selectedFactoryId || !availableAreas.length}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  selectedFactoryId
                    ? "Selecione a área"
                    : "Selecione primeiro a fábrica"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableAreas.map(entry => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Periodicidade</Label>
          <Select
            value={selectedPeriodicity}
            onValueChange={value =>
              setSelectedPeriodicity(value as "D" | "S" | "Q" | "M")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(periodLabel).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {code} — {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={selectedType}
            onValueChange={value =>
              setSelectedType(value as "Vidro" | "Plástico rígido" | "Outro")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Vidro", "Plástico rígido", "Outro"].map(type => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {includeImage && (
        <div className="space-y-3 rounded-xl border border-dashed border-teal-200 bg-teal-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-teal-900">
            <ImagePlus className="h-4 w-4" />
            Imagem de referência
          </div>
          {editing?.referenceImageUrl && (
            <img
              src={editing.referenceImageUrl}
              alt={`Referência: ${editing.name}`}
              className="h-32 w-full rounded-lg border border-teal-100 object-cover"
            />
          )}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={event => addReferenceImage(event.target.files?.[0])}
            disabled={uploadImage.isPending}
          />
          <p className="text-xs text-teal-800">
            JPG, PNG ou WEBP, até 4,5 MB. A imagem fica associada a este ponto
            de controlo.
          </p>
        </div>
      )}
      <Button
        className="w-full"
        disabled={addItem.isPending || updateItem.isPending}
      >
        {addItem.isPending || updateItem.isPending ? "A guardar…" : submitLabel}
      </Button>
    </form>
  );

  return (
    <>
      {showHeader && (
        <ModuleHeader
          label="Quebráveis"
          description="Gira os pontos por fábrica e área, incluindo a periodicidade e a imagem de referência de cada inspeção."
          icon={Boxes}
        />
      )}
      <div className="flex flex-col gap-4 rounded-2xl border border-teal-100 bg-teal-50/70 p-5 md:flex-row md:items-end">
        <div className="flex-1">
          <p className="font-medium text-teal-950">
            Catálogo operacional de pontos
          </p>
          <p className="mt-1 text-sm text-teal-800">
            Selecione uma fábrica para consultar, criar ou editar os pontos de
            controlo associados.
          </p>
        </div>
        <Badge className="w-fit bg-teal-700 text-white hover:bg-teal-700">
          {factoryId
            ? `${factoryItems.length} pontos na fábrica`
            : "Selecione a fábrica"}
        </Badge>
        <Button variant="outline" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar ponto
        </Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="border-0 panel-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-teal-700" />
              Gerir pontos de controlo
            </CardTitle>
            <CardDescription>
              Filtre os pontos da fábrica selecionada e edite o respetivo
              contexto operacional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={periodicity}
                onValueChange={value => {
                  setPeriodicity(value);
                  setArea("all");
                  setItemId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as periodicidades</SelectItem>
                  {Object.entries(periodLabel).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {code} — {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={area}
                onValueChange={value => {
                  setArea(value);
                  setItemId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as áreas</SelectItem>
                  {availableAreas.map(entry => (
                    <SelectItem key={entry} value={entry}>
                      {entry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!factoryId ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
                Selecione a fábrica no topo para listar os pontos de controlo.
              </p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {visibleItems.slice(0, 40).map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3"
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-teal-50 text-teal-700">
                      {entry.referenceImageUrl ? (
                        <img
                          src={entry.referenceImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImagePlus className="m-3 h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {entry.location} · {entry.periodicity} —{" "}
                        {periodLabel[entry.periodicity]}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Editar ${entry.name}`}
                      onClick={() => openEdit(entry)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {visibleItems.length > 40 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Mostram-se os primeiros 40 pontos. Use os filtros para
                    restringir a lista.
                  </p>
                )}
                {!visibleItems.length && (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
                    Não existem pontos com estes filtros.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <form onSubmit={submitInspection}>
          <Card className="border-0 panel-shadow">
            <CardHeader>
              <CardTitle>Registar inspeção</CardTitle>
              <CardDescription>
                O ponto selecionado transporta a fábrica, área e periodicidade
                para o registo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Ponto de controlo</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        factoryId
                          ? "Selecione o ponto"
                          : "Selecione a fábrica primeiro"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleItems.map(entry => (
                      <SelectItem key={entry.id} value={String(entry.id)}>
                        {entry.name} · {entry.periodicity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedItem && (
                <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/50 p-4">
                  {selectedItem.referenceImageUrl && (
                    <img
                      src={selectedItem.referenceImageUrl}
                      alt={`Referência de ${selectedItem.name}`}
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedItem.itemType}</Badge>
                    <Badge className="bg-slate-900 text-white hover:bg-slate-900">
                      {selectedItem.periodicity} —{" "}
                      {periodLabel[selectedItem.periodicity]}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {selectedItem.location}
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Estado da inspeção</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Íntegro", "Danificado", "Em falta"].map(entry => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Notes
                value={notes}
                onChange={setNotes}
                required={state !== "Íntegro"}
              />
              <Button
                className="w-full"
                size="lg"
                variant={state === "Íntegro" ? "default" : "destructive"}
                disabled={!factoryId || !selectedItem}
              >
                Registar inspeção
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar ponto de controlo</DialogTitle>
            <DialogDescription>
              Crie um ponto, indicando a fábrica, área, periodicidade e tipo de
              material.
            </DialogDescription>
          </DialogHeader>
          {pointForm(saveNew, "Criar ponto de controlo")}
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar ponto de controlo</DialogTitle>
            <DialogDescription>
              Atualize os dados operacionais e associe uma imagem de referência
              opcional.
            </DialogDescription>
          </DialogHeader>
          {pointForm(saveEdit, "Guardar alterações", true)}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FragileInspectionDashboard({
  createEntry,
  factoryId,
}: {
  createEntry: any;
  factoryId: string;
}) {
  const [periodicity, setPeriodicity] = useState("all");
  const [preselectedItemId, setPreselectedItemId] = useState<number | null>(
    null
  );
  const pendingInput = useMemo(
    () => (factoryId ? { factoryId: Number(factoryId) } : undefined),
    [factoryId]
  );
  const pending = trpc.quality.fragilePending.useQuery(pendingInput, {
    enabled: Boolean(factoryId),
  });
  const periodLabel = {
    D: "Diário",
    S: "Semanal",
    Q: "Quinzenal",
    M: "Mensal",
  } as const;
  const points = (pending.data ?? []).filter(
    point => periodicity === "all" || point.periodicity === periodicity
  );
  const counts = (pending.data ?? []).reduce<
    Record<"D" | "S" | "Q" | "M", number>
  >(
    (result, point) => {
      result[point.periodicity] += 1;
      return result;
    },
    { D: 0, S: 0, Q: 0, M: 0 }
  );
  const openInspection = (itemId: number) => {
    setPreselectedItemId(itemId);
    requestAnimationFrame(() =>
      document
        .getElementById("registo-quebraveis")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const unifiedIntro = (
    <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono-ui text-xs uppercase tracking-[0.16em] text-teal-700">
            Gestão operacional
          </p>
          <h2 className="mt-1 text-lg font-semibold text-teal-950">
            Pendências e catálogo de pontos
          </h2>
          <p className="mt-1 text-sm text-teal-800">
            Filtre a periodicidade, priorize inspeções em falta e consulte ou
            edite os pontos da fábrica selecionada no mesmo fluxo.
          </p>
        </div>
        <Select value={periodicity} onValueChange={setPeriodicity}>
          <SelectTrigger className="w-full bg-white md:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as periodicidades</SelectItem>
            {Object.entries(periodLabel).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {code} — {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {factoryId && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(periodLabel).map(([code, label]) => (
            <div
              key={code}
              className="rounded-xl border border-teal-100 bg-white p-3"
            >
              <p className="font-mono-ui text-xs text-muted-foreground">
                {code} · {label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {counts[code as "D" | "S" | "Q" | "M"]}
              </p>
              <p className="text-xs text-muted-foreground">pendentes</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <ModuleHeader
        label="Quebráveis"
        description="Centralize as pendências, o catálogo e o registo de inspeções num único fluxo operacional."
        icon={Boxes}
      />
      {unifiedIntro}
      <Card className="border-0 panel-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-teal-700" />
            Inspeções pendentes
          </CardTitle>
          <CardDescription>
            Registe diretamente os pontos em falta; o catálogo completo e a
            edição encontram-se na continuação desta mesma área.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!factoryId ? (
            <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm text-muted-foreground">
              Selecione uma fábrica ou linha no topo para calcular as inspeções
              pendentes.
            </div>
          ) : pending.isLoading ? (
            <p className="py-5 text-sm text-muted-foreground">
              A calcular pendências…
            </p>
          ) : points.length ? (
            <div className="divide-y rounded-xl border border-slate-100">
              {points.map(point => (
                <div
                  key={point.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-teal-100 bg-teal-50"
                      aria-label={
                        point.referenceImageUrl
                          ? `Imagem de referência do ponto ${point.name}`
                          : `Sem imagem de referência para ${point.name}`
                      }
                      title={
                        point.referenceImageUrl
                          ? `Imagem de referência: ${point.name}`
                          : "Sem imagem de referência"
                      }
                    >
                      {point.referenceImageUrl ? (
                        <img
                          src={point.referenceImageUrl}
                          alt={`Imagem de referência do ponto ${point.name}`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImagePlus
                          className="h-5 w-5 text-teal-600"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{point.name}</p>
                        <Badge className="bg-slate-900 text-white hover:bg-slate-900">
                          {point.periodicity} — {periodLabel[point.periodicity]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {point.location} ·{" "}
                        {point.lastInspectionAt
                          ? `Última inspeção: ${new Date(point.lastInspectionAt).toLocaleDateString("pt-PT")}`
                          : "Sem inspeções registadas"}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => openInspection(point.id)}>
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Registar inspeção
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-900">
              <CheckCircle2 className="mr-2 inline h-4 w-4" />
              Não existem pontos pendentes para os filtros selecionados.
            </div>
          )}
        </CardContent>
      </Card>
      <div id="registo-quebraveis">
        <FragileInspectionV2
          key={preselectedItemId ?? "sem-selecao"}
          createEntry={createEntry}
          factoryId={factoryId}
          preselectedItemId={preselectedItemId}
          showHeader={false}
        />
      </div>
    </div>
  );
}
