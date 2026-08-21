import { useState } from "react";
import { useAiGroveQuery, useGenerateMonitoringPlan, useGenerateHarvestPlan } from "@workspace/api-client-react";
import { Bot, Send, Calendar, Sprout, Loader2 } from "lucide-react";

export default function AI() {
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  
  const aiQuery = useAiGroveQuery();
  const monitoringPlan = useGenerateMonitoringPlan();
  const harvestPlan = useGenerateHarvestPlan();

  const handleSend = async () => {
    if (!query.trim()) return;
    const userMsg = query;
    setChat((prev) => [...prev, { role: "user", content: userMsg }]);
    setQuery("");

    try {
      const res = await aiQuery.mutateAsync({ data: { question: userMsg } });
      setChat((prev) => [...prev, { role: "ai", content: res.answer }]);
    } catch (err) {
      setChat((prev) => [...prev, { role: "ai", content: "Error connecting to Grove AI." }]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] font-serif bg-background">
      <div className="p-4 border-b border-border space-y-3 shrink-0 bg-card/50">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Quick Actions</h2>
        <div className="flex gap-2">
          <button 
            onClick={async () => {
              try {
                const res = await monitoringPlan.mutateAsync({ data: {} });
                setChat((prev) => [...prev, { role: "ai", content: res.answer }]);
              } catch (e) {}
            }}
            disabled={monitoringPlan.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-secondary text-secondary-foreground p-2 text-xs font-medium"
          >
            {monitoringPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
            Monitoring
          </button>
          <button 
            onClick={async () => {
              try {
                const res = await harvestPlan.mutateAsync({ data: { groveId: 1, date: new Date().toISOString().slice(0, 10) } });
                setChat((prev) => [...prev, { role: "ai", content: res.answer }]);
              } catch (e) {}
            }}
            disabled={harvestPlan.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-secondary text-secondary-foreground p-2 text-xs font-medium"
          >
            {harvestPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            Harvest
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chat.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-3">
            <Bot className="h-12 w-12 opacity-20" />
            <p className="text-sm">Ask the Grove AI about rules, alerts, or history.</p>
          </div>
        ) : (
          chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground'}`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {aiQuery.isPending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg p-3 text-sm bg-card border border-border text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border shrink-0 bg-background">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask Grove AI..."
            className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button 
            type="submit"
            disabled={aiQuery.isPending || !query.trim()}
            className="rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
