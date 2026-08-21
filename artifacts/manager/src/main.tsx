import { createRoot } from "react-dom/client";
import App from "./App";
import { ManagerPinGate } from "./components/manager-pin-gate";
import "./index.css";

// MANAGER_PIN gate funnels into the signed-cookie session flow.
createRoot(document.getElementById("root")!).render(
  <ManagerPinGate>
    <App />
  </ManagerPinGate>,
);
