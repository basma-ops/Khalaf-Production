import { useParams, useLocation } from "wouter";
import { 
  useGetTask, 
  useUpdateTask,
  useDeleteTask,
  getGetTaskQueryKey,
  getListTasksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare, Trash2, Clock, MapPin, Leaf } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function TaskDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: task, isLoading } = useGetTask(id, {
    query: { enabled: !!id, queryKey: getGetTaskQueryKey(id) }
  });

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const handleStatusUpdate = async (status: "in_progress" | "completed" | "cancelled") => {
    if (!task) return;
    try {
      await updateTask.mutateAsync({ 
        id, 
        data: { status, completedAt: status === "completed" ? new Date().toISOString() : undefined } 
      });
      queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      if (status === "completed" || status === "cancelled") {
        setLocation("/tasks");
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to update task" });
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteTask.mutateAsync({ id });
      toast({ title: "Task deleted" });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      setLocation("/tasks");
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to delete task" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg bg-primary/5" />
        <Skeleton className="h-24 w-full rounded-lg bg-primary/5" />
      </div>
    );
  }

  if (!task) {
    return <div className="p-8 text-center text-muted-foreground font-serif">Task not found.</div>;
  }

  return (
    <div className="p-4 pb-20 space-y-6 font-serif">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-4">
        <div>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground pr-2">{task.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-medium px-2 py-0.5 bg-muted rounded-full">
              {task.status.replace(/_/g, " ")}
            </span>
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              task.priority === "urgent" ? "bg-destructive/10 text-destructive" :
              task.priority === "high" ? "bg-orange-500/10 text-orange-500" :
              "bg-muted text-muted-foreground"
            )}>
              {task.priority}
            </span>
          </div>
          
          <div className="text-sm text-muted-foreground space-y-2">
            {task.groveName && (
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {task.groveName}
              </p>
            )}
            {task.treeCode && (
              <p className="flex items-center gap-2">
                <Leaf className="h-4 w-4" /> Tree {task.treeCode}
              </p>
            )}
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Created {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        {task.notes && (
          <div className="pt-4 border-t border-border">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{task.notes}</p>
          </div>
        )}
      </section>

      {task.status !== "completed" && task.status !== "cancelled" && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {task.status === "open" && (
              <button 
                onClick={() => handleStatusUpdate("in_progress")}
                disabled={updateTask.isPending}
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-card/80 disabled:opacity-50"
              >
                Start Task
              </button>
            )}
            <button 
              onClick={() => handleStatusUpdate("completed")}
              disabled={updateTask.isPending}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary p-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Complete
            </button>
          </div>
          
          <button 
            onClick={handleDelete}
            disabled={deleteTask.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 mt-4"
          >
            <Trash2 className="h-4 w-4" /> Delete Task
          </button>
        </section>
      )}
    </div>
  );
}
