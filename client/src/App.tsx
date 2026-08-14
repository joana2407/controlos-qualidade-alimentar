import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import React from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Controls from "./pages/Controls";
import ModuleControl from "./pages/ModuleControl";
import Nonconformities from "./pages/Nonconformities";
import QualityDashboard from "./pages/QualityDashboard";
import Reports from "./pages/Reports";
import Configuration from "./pages/Configuration";
import PlatformOverview from "./pages/PlatformOverview";
import HelpCenter from "./pages/HelpCenter";
import OccurrencesDashboard from "./pages/OccurrencesDashboard";
import OccurrenceEditor from "./pages/OccurrenceEditor";
import OccurrencesList from "./pages/OccurrencesList";
import SupplierComplaints from "./pages/SupplierComplaints";
import SupplierComplaintsList from "./pages/SupplierComplaintsList";
import SupplierComplaintEditor from "./pages/SupplierComplaintEditor";
import SupplierComplaintDetail from "./pages/SupplierComplaintDetail";
import OccurrenceDetail from "./pages/OccurrenceDetail";
import WorkspaceSelector from "./pages/WorkspaceSelector";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={() => <DashboardLayout workspace="selector"><WorkspaceSelector /></DashboardLayout>} />
      <Route path={"/qualicontrol"} component={() => <DashboardLayout workspace="quality"><QualityDashboard /></DashboardLayout>} />
      <Route path={"/plataforma"} component={() => <DashboardLayout><PlatformOverview /></DashboardLayout>} />
      <Route path={"/ajuda"} component={() => <DashboardLayout><HelpCenter /></DashboardLayout>} />
      <Route path={"/controlos"} component={() => <DashboardLayout><Controls /></DashboardLayout>} />
      <Route path={"/controlos/:module"} component={() => <DashboardLayout><ModuleControl /></DashboardLayout>} />
      <Route path={"/nao-conformidades"} component={() => <DashboardLayout><Nonconformities /></DashboardLayout>} />
      <Route path={"/ocorrencias/lista"} component={() => <DashboardLayout workspace="occurrences"><OccurrencesList /></DashboardLayout>} />
      <Route path={"/ocorrencias/nova"} component={() => <DashboardLayout workspace="occurrences"><OccurrenceEditor /></DashboardLayout>} />
      <Route path={"/ocorrencias/:id/editar"} component={() => <DashboardLayout workspace="occurrences"><OccurrenceEditor /></DashboardLayout>} />
      <Route path={"/ocorrencias/:id"} component={() => <DashboardLayout workspace="occurrences"><OccurrenceDetail /></DashboardLayout>} />
      <Route path={"/ocorrencias"} component={() => <DashboardLayout workspace="occurrences"><OccurrencesDashboard /></DashboardLayout>} />
      <Route path={"/reclamacoes/lista"} component={() => <DashboardLayout workspace="occurrences"><SupplierComplaintsList /></DashboardLayout>} />
      <Route path={"/reclamacoes/nova"} component={() => <DashboardLayout workspace="occurrences"><SupplierComplaintEditor /></DashboardLayout>} />
      <Route path={"/reclamacoes/:id/editar"} component={() => <DashboardLayout workspace="occurrences"><SupplierComplaintEditor /></DashboardLayout>} />
      <Route path={"/reclamacoes/:id"} component={() => <DashboardLayout workspace="occurrences"><SupplierComplaintDetail /></DashboardLayout>} />
      <Route path={"/reclamacoes"} component={() => <DashboardLayout workspace="occurrences"><SupplierComplaints /></DashboardLayout>} />
      <Route path={"/relatorios"} component={() => <DashboardLayout><Reports /></DashboardLayout>} />
      <Route path={"/configuracao"} component={() => <DashboardLayout><Configuration /></DashboardLayout>} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
