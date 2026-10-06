import { OperatorPinGate } from "@/components/OperatorPinGate";
import { QualityManagerCopilot } from "@/components/quality/QualityManagerCopilot";
import { QualityAccessProvider, useQualityAccess } from "@/contexts/QualityAccessContext";
import { trpc } from "@/lib/trpc";
import { canAccessWorkspace } from "@/lib/workspaceAccess";
import { hasQualityExternalPanelAccess, hasQualityPanelAccess, panelsForQualityPath, type QualityExternalPanelKey } from "@shared/quality-panel-access";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { Activity, AlertTriangle, Archive, ArrowLeft, BarChart3, BookOpenCheck, Boxes, ChevronDown, ClipboardCheck, ClipboardList, Factory, FilePlus2, FileWarning, FlaskConical, KeyRound, LayoutDashboard, ListChecks, Magnet, MessageSquareMore, MessageSquareWarning, Microscope, PackageSearch, PanelLeft, RefreshCw, Ruler, Settings2, ShieldAlert, ShieldCheck, ThermometerSnowflake, TimerReset, TrendingDown, Truck, Wrench } from "lucide-react";
import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { lisbonDateLabel, lisbonTimeLabel } from "@shared/lisbon-time";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';

const menuItems = [
  { icon: LayoutDashboard, label: "Hoje", path: "/qualicontrol" },
  { icon: BookOpenCheck, label: "Plataforma", path: "/plataforma" },
  { icon: ClipboardCheck, label: "Controlos", path: "/controlos" },
  { icon: FileWarning, label: "Incidências", path: "/incidencias" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios" },
  { icon: Activity, label: "Análise operacional", path: "/analise-operacional" },
  { icon: Archive, label: "Backups diários", path: "/backups-diarios" },
  { icon: Settings2, label: "Configuração", path: "/configuracao" },
];

const controlPanels = [
  { icon: ShieldCheck, label: "BPHF", path: "/controlos/bphf" },
  { icon: Magnet, label: "Detetores de metais", path: "/controlos/metal_detectors" },
  { icon: FlaskConical, label: "Controlo sensorial", path: "/controlos/sensory" },
  { icon: TimerReset, label: "Shelf-life", path: "/controlos/shelf_life" },
  { icon: ListChecks, label: "Checklist mensal", path: "/controlos/monthly_checklist" },
  { icon: MessageSquareMore, label: "Caixas de sugestões", path: "/controlos/suggestion_boxes" },
  { icon: Boxes, label: "Quebráveis", path: "/controlos/fragile_items" },
  { icon: Truck, label: "Controlo à expedição", path: "/controlos/dispatch_control" },
  { icon: Microscope, label: "Análises internas", path: "/controlos/internal_analysis" },
  { icon: ThermometerSnowflake, label: "Controlos de Temperatura", path: "/controlos/temperature_controls" },
  { icon: ShieldAlert, label: "Food Defense", path: "/controlos/food_defense" },
];

const occurrencePanels = [
  { icon: BarChart3, label: "Dashboard", path: "/ocorrencias" },
  { icon: ClipboardList, label: "Ocorrências", path: "/ocorrencias/lista" },
  { icon: FilePlus2, label: "Nova ocorrência", path: "/ocorrencias/nova" },
  { icon: MessageSquareWarning, label: "Dashboard de reclamações", path: "/reclamacoes" },
  { icon: ClipboardList, label: "Reclamações a fornecedores", path: "/reclamacoes/lista" },
  { icon: FilePlus2, label: "Nova reclamação", path: "/reclamacoes/nova" },
];

const preparedExternalPanels: Array<{
  accessKey: QualityExternalPanelKey;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClass: string;
  url?: string;
  factories?: Array<{ label: string; iconClass: string; url: string }>;
}> = [
  { accessKey: "occurrences", icon: ClipboardList, label: "Gestão de Ocorrências", iconClass: "bg-red-50 text-red-700", url: "https://analiseocorrencias.manus.space/login" },
  { accessKey: "raw_materials", icon: PackageSearch, label: "Gestão de MP", iconClass: "bg-amber-50 text-amber-700", url: "https://gestaompas.lovable.app" },
  { accessKey: "sensory_control", icon: Microscope, label: "Controlo Sensorial", iconClass: "bg-teal-50 text-teal-700", url: "https://id-interno.lovable.app/" },
  { accessKey: "artisan_rd", icon: FlaskConical, label: "I&D · Artisan", iconClass: "bg-cyan-50 text-cyan-700", url: "https://joseloureiro1607.github.io/Artisan/" },
  { accessKey: "calibration", icon: Ruler, label: "Plano Calibração", iconClass: "bg-violet-50 text-violet-700", url: "https://planocalibracao.manus.space/" },
  { accessKey: "maintenance", icon: Wrench, label: "Plano de Manutenção", iconClass: "bg-blue-50 text-blue-700", url: "https://manutencaoprenventiva-as.manus.space/" },
  {
    accessKey: "production_breakdowns",
    icon: TrendingDown,
    label: "Quebras de produção",
    iconClass: "bg-rose-50 text-rose-700",
    factories: [
      { label: "Fábrica 1 · Fatiado", iconClass: "text-teal-700", url: "https://quebrasdash-tyuemnk4.manus.space/" },
      { label: "Fábrica 2 · Granel", iconClass: "text-amber-700", url: "https://quebrasdash-tyuemnk4.manus.space/" },
      { label: "Fábrica 3 · Sem Gluten", iconClass: "text-violet-700", url: "https://quebrasdash-fce2dkya.manus.space/" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
  workspace = "quality",
}: {
  children: React.ReactNode;
  workspace?: "quality" | "occurrences" | "selector";
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const access = trpc.quality.accessStatus.useQuery();
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (access.isLoading || !access.data) return <DashboardLayoutSkeleton />;
  if (!access.data.activeProfile) return <OperatorPinGate access={access.data} />;
  const accessValue = { activeProfile: access.data.activeProfile, canManage: access.data.canManage, canOperate: access.data.activeProfile?.role !== "viewer" };
  if (workspace === "selector") return <QualityAccessProvider value={accessValue}>{children}</QualityAccessProvider>;
  if (workspace === "quality" && !canAccessWorkspace(access.data.activeProfile, workspace)) return <QualityAccessProvider value={accessValue}><main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Acesso restrito</p><h1 className="mt-3 text-2xl font-bold text-slate-950">O QualiControl não está autorizado para o seu perfil.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Contacte a Responsável de Qualidade para rever as permissões do seu perfil PIN.</p><Button className="mt-6" onClick={() => window.location.assign("/")}>Voltar ao início</Button></section></main></QualityAccessProvider>;

  return (
    <QualityAccessProvider value={accessValue}><SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider></QualityAccessProvider>
  );
}

function OccurrencesWorkspaceContent({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { activeProfile } = useQualityAccess();
  const utils = trpc.useUtils();
  const access = trpc.occurrences.access.useQuery();
  const deactivate = trpc.quality.deactivatePinProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.quality.accessStatus.invalidate(),
        utils.quality.dashboard.invalidate(),
        utils.quality.listTasks.invalidate(),
        utils.quality.pendingControlTasks.invalidate(),
        utils.quality.controlAuthorization.invalidate(),
        utils.quality.dailyControlResults.invalidate(),
      ]);
    },
  });
  const panels = access.data?.scope === "reclamacoes" ? occurrencePanels.filter((panel) => panel.path.startsWith("/reclamacoes")) : occurrencePanels;

  return <>
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="h-16 justify-center">
        <div className="flex w-full items-center gap-2 px-3">
          <ClipboardList className="h-5 w-5 text-blue-700" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block truncate font-semibold tracking-tight">Gestão de Ocorrências</span><span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Ocorrências A&S</span></div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarMenu className="px-2 py-1">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setLocation("/")} tooltip="Áreas de trabalho" className="h-10 transition-all font-normal"><ArrowLeft className="h-4 w-4" /><span>Áreas de trabalho</span></SidebarMenuButton>
          </SidebarMenuItem>
          {panels.map((panel) => {
            const isActive = panel.path === "/ocorrencias" ? location === "/ocorrencias" : location.startsWith(panel.path);
            return <SidebarMenuItem key={panel.path}><SidebarMenuButton isActive={isActive} onClick={() => setLocation(panel.path)} tooltip={panel.label} className="h-10 transition-all font-normal"><panel.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} /><span>{panel.label}</span></SidebarMenuButton></SidebarMenuItem>;
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center"><Avatar className="h-9 w-9 border shrink-0"><AvatarFallback className="text-xs font-medium">{activeProfile?.name?.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium leading-none">{activeProfile?.name || "-"}</p><p className="mt-1.5 truncate text-xs text-muted-foreground">{activeProfile?.title || "-"}</p></div></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={() => deactivate.mutate()} className="cursor-pointer"><KeyRound className="mr-2 h-4 w-4" /><span>Terminar acesso PIN</span></DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset><main className="flex-1 p-4">{children}</main></SidebarInset>
  </>;
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function LisbonOperationalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="flex items-center justify-between gap-3 border-b border-teal-100 bg-teal-50/80 px-4 py-2 text-xs text-teal-950"><div className="flex min-w-0 items-center gap-2" aria-label={`Data e hora de Lisboa: ${lisbonDateLabel(now)} ${lisbonTimeLabel(now)}`}><span className="font-medium">Lisboa</span><span className="text-teal-700">{lisbonDateLabel(now)}</span><span className="font-mono-ui font-semibold tabular-nums">{lisbonTimeLabel(now)}</span><span className="hidden text-teal-700 sm:inline">· Dia operacional muda às 00:00</span></div><Button type="button" variant="outline" size="sm" className="h-7 shrink-0 border-teal-200 bg-white/80 px-2 text-teal-800 hover:bg-teal-100 hover:text-teal-950" onClick={() => window.location.reload()} aria-label="Atualizar dados da plataforma" title="Atualizar dados da plataforma"><RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Atualizar</span></Button></div>;
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [controlsOpen, setControlsOpen] = useState(() => location.startsWith("/controlos"));
  const [productionBreakdownsOpen, setProductionBreakdownsOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = [...menuItems, ...controlPanels].find(item => item.path === location);
  const isMobile = useIsMobile();
  const { activeProfile, canManage, canOperate } = useQualityAccess();
  const utils = trpc.useUtils();
  const deactivate = trpc.quality.deactivatePinProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.quality.accessStatus.invalidate(),
        utils.quality.dashboard.invalidate(),
        utils.quality.listTasks.invalidate(),
        utils.quality.pendingControlTasks.invalidate(),
        utils.quality.controlAuthorization.invalidate(),
        utils.quality.dailyControlResults.invalidate(),
      ]);
    },
  });
  const canAccessPanelPath = (path: string) => hasQualityPanelAccess(activeProfile!.role, activeProfile!.panelAccess, panelsForQualityPath(path));
  const visibleMenuItems = menuItems.filter((item) => (item.path !== "/configuracao" || canManage) && canAccessPanelPath(item.path));
  const visibleControlPanels = controlPanels.filter(panel => canAccessPanelPath(panel.path));
  const visibleExternalPanels = preparedExternalPanels.filter(panel => hasQualityExternalPanelAccess(activeProfile!.role, activeProfile!.externalPanelAccess, panel.accessKey));
  const canViewCurrentPanel = canAccessPanelPath(location);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    if (location.startsWith("/controlos")) setControlsOpen(true);
  }, [location]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <img src="/manus-storage/qualicontrol-logo_e5bfd122.png" alt="Logótipo A&S" className="h-9 w-10 shrink-0 object-contain" />
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold tracking-tight truncate">QualiControl</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Segurança alimentar</span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                if (item.path === "/controlos") {
                  return <SidebarMenuItem key={item.path}><div className="flex items-center"><SidebarMenuButton isActive={isActive} onClick={() => { setControlsOpen(true); setLocation(item.path); }} tooltip={item.label} className="h-10 flex-1 transition-all font-normal"><item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} /><span>{item.label}</span></SidebarMenuButton>{!isCollapsed && <button type="button" aria-label={controlsOpen ? "Fechar módulos de controlo" : "Abrir módulos de controlo"} aria-expanded={controlsOpen} onClick={() => setControlsOpen((open) => !open)} className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronDown className={`h-4 w-4 transition-transform ${controlsOpen ? "rotate-0" : "-rotate-90"}`} /></button>}</div></SidebarMenuItem>;
                }
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            {controlsOpen && !isCollapsed && visibleControlPanels.length > 0 && <div className="relative z-10 isolate mx-2 mb-3 rounded-xl border border-slate-700/90 bg-slate-950 p-2 text-slate-100 shadow-lg"><div className="flex items-center justify-between gap-2 border-b border-slate-800 px-2 pb-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">Controlos Operacionais</p><div className="flex items-center gap-1"><span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-200">{visibleControlPanels.length}</span><Button type="button" variant="ghost" size="sm" aria-label="Minimizar Controlos Operacionais" className="h-7 px-2 text-[11px] font-medium text-teal-100 hover:bg-slate-800 hover:text-white" onClick={() => setControlsOpen(false)}>Minimizar <ChevronDown className="ml-1 h-3.5 w-3.5" /></Button></div></div><SidebarMenu className="mt-1 gap-1 px-0 py-0">{visibleControlPanels.map((panel) => { const panelActive = location === panel.path; return <SidebarMenuItem key={panel.path} className="min-w-0"><SidebarMenuButton isActive={panelActive} onClick={() => setLocation(panel.path)} tooltip={panel.label} className="h-auto min-h-10 min-w-0 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800 hover:text-white data-[active=true]:bg-teal-600 data-[active=true]:text-white [&>span:last-child]:!overflow-visible [&>span:last-child]:!text-clip [&>span:last-child]:!whitespace-normal"><panel.icon className={`h-4 w-4 shrink-0 ${panelActive ? "text-white" : "text-teal-200"}`} /><span className="min-w-0 leading-5">{panel.label}</span></SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu><Button type="button" variant="ghost" size="sm" className="mt-2 h-8 w-full text-xs text-teal-100 hover:bg-slate-800 hover:text-white" onClick={() => setLocation("/controlos")}>Ver painel de controlos</Button></div>}
            {visibleExternalPanels.length > 0 && <SidebarMenu className="mt-2 border-t border-border/70 px-2 py-2">
              {!isCollapsed && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Painéis externos</p>}
              {visibleExternalPanels.map((panel) => panel.factories ? <SidebarMenuItem key={panel.label}><SidebarMenuButton onClick={() => isCollapsed ? toast.info(`${panel.label}: abra a barra lateral para escolher a fábrica.`) : setProductionBreakdownsOpen((open) => !open)} tooltip={`${panel.label} — selecionar fábrica`} aria-expanded={productionBreakdownsOpen} className="h-10 text-muted-foreground transition-all hover:text-foreground"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${panel.iconClass}`}><panel.icon className="h-3.5 w-3.5" /></span><span>{panel.label}</span>{!isCollapsed && <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${productionBreakdownsOpen ? "rotate-0" : "-rotate-90"}`} />}</SidebarMenuButton>{productionBreakdownsOpen && !isCollapsed && <div className="ml-8 border-l border-border/70 py-1"><SidebarMenu className="px-2 py-0">{panel.factories.map((factory) => <SidebarMenuItem key={factory.label}><SidebarMenuButton onClick={() => window.open(factory.url, "_blank", "noopener,noreferrer")} tooltip={`${factory.label} — abrir painel externo`} className="h-8 text-sm text-muted-foreground transition-all hover:text-foreground"><Factory className={`h-3.5 w-3.5 ${factory.iconClass}`} /><span>{factory.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></div>}</SidebarMenuItem> : <SidebarMenuItem key={panel.label}><SidebarMenuButton onClick={() => window.open(panel.url, "_blank", "noopener,noreferrer")} tooltip={`${panel.label} — abrir painel externo`} className="h-10 text-muted-foreground transition-all hover:text-foreground"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${panel.iconClass}`}><panel.icon className="h-3.5 w-3.5" /></span><span>{panel.label}</span></SidebarMenuButton></SidebarMenuItem>)}
            </SidebarMenu>}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {activeProfile?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {activeProfile?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {activeProfile?.title || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => deactivate.mutate()} className="cursor-pointer">
                  <KeyRound className="mr-2 h-4 w-4" />
                  <span>Terminar acesso PIN</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <LisbonOperationalClock />
        {!canOperate && <div className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"><div className="mx-auto flex max-w-7xl items-center gap-2"><ShieldCheck className="h-4 w-4 text-sky-700" /><span><strong>Modo consulta:</strong> pode consultar a informação, mas não pode registar, editar, eliminar ou publicar.</span></div></div>}
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{canViewCurrentPanel ? children : <section className="mx-auto grid min-h-[55vh] max-w-lg place-items-center text-center"><Card className="border-amber-200 bg-amber-50"><CardContent className="p-8"><ShieldAlert className="mx-auto h-8 w-8 text-amber-700" /><h1 className="mt-4 text-xl font-semibold text-amber-950">Painel não autorizado</h1><p className="mt-2 text-sm leading-6 text-amber-900">O seu perfil não tem acesso a este painel. Contacte a Responsável de Qualidade para rever as suas autorizações.</p><Button className="mt-5" onClick={() => setLocation("/qualicontrol")}>Voltar aos painéis autorizados</Button></CardContent></Card></section>}</main>
        {canManage && <QualityManagerCopilot />}
      </SidebarInset>
    </>
  );
}
