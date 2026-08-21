import { Route, Router, Switch } from "wouter";
import Home from "@/pages/home";
import BottlePage from "@/pages/bottle";
import PublicTreePage from "@/pages/tree";
import NotFound from "@/pages/not-found";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");

function App() {
  return (
    <Router base={BASE}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/bottle/:token" component={BottlePage} />
        <Route path="/tree/:id" component={PublicTreePage} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

export default App;
