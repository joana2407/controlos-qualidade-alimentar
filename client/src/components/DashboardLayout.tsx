import { OperatorPinGate } from "@/components/OperatorPinGate";
import { QualityAccessProvider, useQualityAccess } from "@/contexts/QualityAccessContext";
import { trpc } from "@/lib/trpc";
import { canAccessWorkspace } from "@/lib/workspaceAccess";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, ArrowLeft, BarChart3, BookOpenCheck, Boxes, ChevronDown, ClipboardCheck, ClipboardList, FilePlus2, FileWarning, FlaskConical, KeyRound, LayoutDashboard, ListChecks, Magnet, MessageSquareMore, MessageSquareWarning, Microscope, PanelLeft, Settings2, ShieldCheck, TimerReset, Truck } from "lucide-react";
import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';

const menuItems = [
  { icon: LayoutDashboard, label: "Hoje", path: "/qualicontrol" },
  { icon: BookOpenCheck, label: "Plataforma", path: "/plataforma" },
  { icon: ClipboardCheck, label: "Controlos", path: "/controlos" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios" },
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
];

const occurrencePanels = [
  { icon: BarChart3, label: "Dashboard", path: "/ocorrencias" },
  { icon: ClipboardList, label: "Ocorrências", path: "/ocorrencias/lista" },
  { icon: FilePlus2, label: "Nova ocorrência", path: "/ocorrencias/nova" },
  { icon: MessageSquareWarning, label: "Dashboard de reclamações", path: "/reclamacoes" },
  { icon: ClipboardList, label: "Reclamações a fornecedores", path: "/reclamacoes/lista" },
  { icon: FilePlus2, label: "Nova reclamação", path: "/reclamacoes/nova" },
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
  const [location] = useLocation();
  const access = trpc.quality.accessStatus.useQuery();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (location === "/plataforma") return <>{children}</>;

  if (access.isLoading || !access.data) return <DashboardLayoutSkeleton />;
  if (!access.data.activeProfile) return <OperatorPinGate access={access.data} />;
  if (workspace === "selector") return <QualityAccessProvider value={{ activeProfile: access.data.activeProfile, canManage: access.data.canManage }}>{children}</QualityAccessProvider>;
  if (workspace === "quality" && !canAccessWorkspace(access.data.activeProfile, workspace)) return <QualityAccessProvider value={{ activeProfile: access.data.activeProfile, canManage: access.data.canManage }}><main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Acesso restrito</p><h1 className="mt-3 text-2xl font-bold text-slate-950">O QualiControl não está autorizado para o seu perfil.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Contacte a Responsável de Qualidade para rever as permissões do seu perfil PIN.</p><Button className="mt-6" onClick={() => window.location.assign("/")}>Voltar ao início</Button></section></main></QualityAccessProvider>;

  return (
    <QualityAccessProvider value={{ activeProfile: access.data.activeProfile, canManage: access.data.canManage }}><SidebarProvider
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
  const deactivate = trpc.quality.deactivatePinProfile.useMutation({ onSuccess: () => utils.quality.accessStatus.invalidate() });
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

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [controlsOpen, setControlsOpen] = useState(() => location.startsWith("/controlos"));
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = [...menuItems, ...controlPanels].find(item => item.path === location);
  const isMobile = useIsMobile();
  const { activeProfile, canManage } = useQualityAccess();
  const utils = trpc.useUtils();
  const deactivate = trpc.quality.deactivatePinProfile.useMutation({ onSuccess: () => utils.quality.accessStatus.invalidate() });
  const visibleMenuItems = menuItems.filter((item) => item.path !== "/configuracao" || canManage);

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
                  return <React.Fragment key={item.path}><SidebarMenuItem><div className="flex items-center"><SidebarMenuButton isActive={isActive} onClick={() => { setControlsOpen(true); setLocation(item.path); }} tooltip={item.label} className="h-10 flex-1 transition-all font-normal"><item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} /><span>{item.label}</span></SidebarMenuButton>{!isCollapsed && <button type="button" aria-label={controlsOpen ? "Fechar módulos de controlo" : "Abrir módulos de controlo"} aria-expanded={controlsOpen} onClick={() => setControlsOpen((open) => !open)} className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronDown className={`h-4 w-4 transition-transform ${controlsOpen ? "rotate-0" : "-rotate-90"}`} /></button>}</div></SidebarMenuItem>{controlsOpen && !isCollapsed && <div className="ml-5 border-l border-border/70 py-1"><SidebarMenu className="px-2 py-0">{controlPanels.map(panel => { const panelActive = location === panel.path; return <SidebarMenuItem key={panel.path}><SidebarMenuButton isActive={panelActive} onClick={() => setLocation(panel.path)} tooltip={panel.label} className="h-9 text-sm transition-all font-normal"><panel.icon className={`h-4 w-4 ${panelActive ? "text-primary" : ""}`} /><span>{panel.label}</span></SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu></div>}</React.Fragment>;
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
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
