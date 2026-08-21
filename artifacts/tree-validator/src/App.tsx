import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerPinGate } from "@/components/manager-pin-gate";
import { NearbyPage } from "@/pages/nearby";
import { TreeDetailPage } from "@/pages/tree-detail";
import { NewTreePage } from "@/pages/new-tree";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={NearbyPage} />
      <Route path="/new" component={NewTreePage} />
      <Route path="/tree/:id" component={TreeDetailPage} />
      <Route component={NotFound} />
    </Switch>
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
    </QueryClientProvider>
  );
}

export default App;
