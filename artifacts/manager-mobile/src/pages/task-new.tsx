import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateTask } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TaskNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTask = useCreateTask();

  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<"tree_inspection" | "grove_inspection" | "terrace_check" | "other">("other");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    try {
      const res = await createTask.mutateAsync({
        data: {
          title,
          taskType,
          priority,
          notes,
        }
      });
      toast({ title: "Task created" });
      setLocation(`/tasks/${res.id}`);
    } catch (err) {
      toast({ variant: "destructive", title: "Error creating task" });
    }
  };

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Task Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none"
            placeholder="e.g. Check irrigation line in North Grove"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Type</label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as any)}
            className="w-full rounded-md border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="tree_inspection">Tree Inspection</option>
            <option value="grove_inspection">Grove Inspection</option>
            <option value="terrace_check">Terrace Check</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Priority</label>
          <div className="grid grid-cols-4 gap-2">
            {(["low", "medium", "high", "urgent"] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`py-2 text-xs font-medium rounded-md border capitalize ${
                  priority === p 
                    ? "border-primary bg-primary/10 text-primary" 
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none"
            placeholder="Any extra details..."
          />
        </div>

        <button 
          type="submit"
          disabled={createTask.isPending || !title}
          className="w-full rounded-lg bg-primary p-3 text-sm font-medium text-primary-foreground disabled:opacity-50 flex justify-center items-center gap-2"
        >
          {createTask.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Task
        </button>
      </form>
    </div>
  );
}
