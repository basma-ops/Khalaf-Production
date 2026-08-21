import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import Groves from "@/pages/groves";
import MapPage from "@/pages/map";
import Trees from "@/pages/trees/index";
import TreeDetail from "@/pages/trees/detail";
import TreesPrint from "@/pages/trees/print";
import Alerts from "@/pages/alerts";
import Tasks from "@/pages/tasks";
import Heritage from "@/pages/heritage";
import FieldVisits from "@/pages/field-visits";
import HarvestOverview from "@/pages/harvest/index";
import HarvestMap from "@/pages/harvest/map";
import HarvestEvents from "@/pages/harvest/events";
import HarvestBatches from "@/pages/harvest/batches";
import HarvestPressing from "@/pages/harvest/pressing";
import HarvestAnalytics from "@/pages/harvest/analytics";
import ImportPage from "@/pages/import";
import AIInterpreter from "@/pages/ai";
import Users from "@/pages/users";
import PhotoAnalysisPage from "@/pages/photo-analysis";
import PhotoAnalysisTestPage from "@/pages/photo-analysis-test";
import PhotosPage from "@/pages/photos";
import Activities from "@/pages/activities";
import Phenology from "@/pages/phenology";
import ManagerFlagsPage from "@/pages/manager-flags";
import Scouting from "@/pages/scouting";
import TrapsPage from "@/pages/traps";
import TreatmentsPage from "@/pages/treatments";
import IrrigationPage from "@/pages/irrigation";
import WeatherPage from "@/pages/weather";
import SoilTestsPage from "@/pages/soil-tests";
import LabResultsPage from "@/pages/lab";
import OilBatchesPage from "@/pages/oil-batches";
import HarvestReportPage from "@/pages/reports/harvest";
import BottlingPage from "@/pages/bottling";
import BottlingDetailPage from "@/pages/bottling-detail";
import LotTraceReportPage from "@/pages/reports/lot-trace";
import ReportsHubPage from "@/pages/reports/index";
import YearReportPage from "@/pages/reports/year";
import YearDashboardPage from "@/pages/year";
import CompliancePage from "@/pages/reports/compliance";
import CompliancePrintPage from "@/pages/reports/compliance-print";
import SensorsPage from "@/pages/sensors";
import SensorDetailPage from "@/pages/sensor-detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Field workers upload from a separate context (often a separate
      // tab or the canvas iframe). Refetching when the manager tab
      // regains focus is how new uploads show up here.
      refetchOnWindowFocus: true,
      // Treat data as immediately stale so refocus / remount actually
      // re-hits the API instead of serving the cached response.
      staleTime: 0,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/groves" component={Groves} />
        <Route path="/map" component={MapPage} />
        <Route path="/trees" component={Trees} />
        <Route path="/trees/print" component={TreesPrint} />
        <Route path="/trees/:id" component={TreeDetail} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/heritage" component={Heritage} />
        <Route path="/field-visits" component={FieldVisits} />
        <Route path="/harvest" component={HarvestOverview} />
        <Route path="/harvest/map" component={HarvestMap} />
        <Route path="/harvest/events" component={HarvestEvents} />
        <Route path="/harvest/batches" component={HarvestBatches} />
        <Route path="/harvest/pressing" component={HarvestPressing} />
        <Route path="/harvest/analytics" component={HarvestAnalytics} />
        <Route path="/import" component={ImportPage} />
        <Route path="/ai" component={AIInterpreter} />
        <Route path="/users" component={Users} />
        <Route path="/photo-analysis/test" component={PhotoAnalysisTestPage} />
        <Route path="/photo-analysis" component={PhotoAnalysisPage} />
        <Route path="/photos" component={PhotosPage} />
        <Route path="/activities" component={Activities} />
        <Route path="/phenology" component={Phenology} />
        <Route path="/flags" component={ManagerFlagsPage} />
        <Route path="/scouting" component={Scouting} />
        <Route path="/traps" component={TrapsPage} />
        <Route path="/treatments" component={TreatmentsPage} />
        <Route path="/irrigation" component={IrrigationPage} />
        <Route path="/weather" component={WeatherPage} />
        <Route path="/soil-tests" component={SoilTestsPage} />
        <Route path="/lab" component={LabResultsPage} />
        <Route path="/oil-batches" component={OilBatchesPage} />
        <Route path="/reports/harvest" component={HarvestReportPage} />
        <Route path="/bottling" component={BottlingPage} />
        <Route path="/bottling/:id" component={BottlingDetailPage} />
        <Route path="/reports/lot-trace/:bottlingRunId" component={LotTraceReportPage} />
        <Route path="/reports" component={ReportsHubPage} />
        <Route path="/reports/year/:year" component={YearReportPage} />
        <Route path="/year" component={YearDashboardPage} />
        <Route path="/reports/compliance" component={CompliancePage} />
        <Route path="/reports/compliance/print" component={CompliancePrintPage} />
        <Route path="/sensors/:id" component={SensorDetailPage} />
        <Route path="/sensors" component={SensorsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
