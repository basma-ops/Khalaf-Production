import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ManagerPinGate } from "./components/manager-pin-gate";
import { Layout } from "./components/layout";
import NotFound from "@/pages/not-found";

import Overview from "@/pages/overview";
import Alerts from "@/pages/alerts";
import AlertDetail from "@/pages/alert-detail";
import Tasks from "@/pages/tasks";
import TaskNew from "@/pages/task-new";
import TaskDetail from "@/pages/task-detail";
import Photos from "@/pages/photos";
import More from "@/pages/more";

import Groves from "@/pages/groves";
import GroveDetail from "@/pages/grove-detail";
import Weather from "@/pages/weather";
import Heritage from "@/pages/heritage";
import AI from "@/pages/ai";
import Flags from "@/pages/flags";
import Harvest from "@/pages/harvest";

import Trees from "@/pages/trees";
import TreeDetail from "@/pages/tree-detail";
import Oil from "@/pages/oil";
import Sensors from "@/pages/sensors";
import Treatments from "@/pages/treatments";
import Activities from "@/pages/activities";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/alerts/:id" component={AlertDetail} />
        
        <Route path="/tasks" component={Tasks} />
        <Route path="/tasks/new" component={TaskNew} />
        <Route path="/tasks/:id" component={TaskDetail} />
        
        <Route path="/photos" component={Photos} />
        <Route path="/more" component={More} />
        
        <Route path="/groves" component={Groves} />
        <Route path="/groves/:id" component={GroveDetail} />
        
        <Route path="/trees" component={Trees} />
        <Route path="/trees/:id" component={TreeDetail} />
        
        <Route path="/weather" component={Weather} />
        <Route path="/heritage" component={Heritage} />
        <Route path="/ai" component={AI} />
        <Route path="/flags" component={Flags} />
        <Route path="/harvest" component={Harvest} />
        
        <Route path="/oil" component={Oil} />
        <Route path="/sensors" component={Sensors} />
        <Route path="/treatments" component={Treatments} />
        <Route path="/activities" component={Activities} />
        
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <ManagerPinGate>
          <Router />
        </ManagerPinGate>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
