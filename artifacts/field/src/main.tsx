import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installAutoDrain } from "@/lib/offline-drain";

createRoot(document.getElementById("root")!).render(<App />);

// PWA shell + outbox: register the service worker (cached app shell +
// safe GET read-through) and start the in-tab drainer that ships any
// queued task updates / photo uploads as soon as the network is back.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker
    .register(swUrl, { scope: import.meta.env.BASE_URL })
    .catch((err) => {
      console.warn("[field] SW registration failed", err);
    });
}
installAutoDrain();
