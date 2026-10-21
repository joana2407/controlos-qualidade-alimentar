import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import React from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
const Controls = React.lazy(() => import("./pages/Controls"));
const ModuleControl = React.lazy(() => import("./pages/ModuleControl"));
const Nonconformities = React.lazy(() => import("./pages/Nonconformities"));
const QualityDashboard = React.lazy(() => import("./pages/QualityDashboard"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Configuration = React.lazy(() => import("./pages/Configuration"));
import PlatformOverview from "./pages/PlatformOverview";
const DailyBackups = React.lazy(() => import("./pages/DailyBackups"));
const OperationalAnalytics = React.lazy(() => import("./pages/OperationalAnalytics"));
const ProcessChecklist = React.lazy(() => import("./pages/ProcessChecklist"));

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          A carregar o painel…
        </div>
      }
    >
      <Switch>
      <Route path={"/"} component={QualityDashboard} />
      <Route path={"/qualicontrol"} component={QualityDashboard} />
      <Route path={"/plataforma"} component={PlatformOverview} />
      <Route path={"/ajuda"} component={() => <Redirect to="/plataforma" />} />
      <Route path={"/controlos"} component={Controls} />
      <Route path={"/checklist-processos"} component={ProcessChecklist} />
      <Route path={"/controlos/:module"} component={ModuleControl} />
      <Route path={"/incidencias"} component={Nonconformities} />
      <Route path={"/nao-conformidades"} component={Nonconformities} />
      <Route path={"/relatorios"} component={Reports} />
      <Route path={"/analise-operacional"} component={OperationalAnalytics} />
      <Route path={"/backups-diarios"} component={DailyBackups} />
      <Route path={"/configuracao"} component={Configuration} />
      <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </React.Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <DashboardLayout workspace="quality"><Router /></DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
