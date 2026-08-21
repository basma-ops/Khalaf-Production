import { Link } from "wouter";
import { useListTasks } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare, ChevronRight, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function Tasks() {
  const { data: tasks, isLoading } = useListTasks({ status: "open" });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Open Tasks</h2>
        <Link href="/tasks/new" className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
          <Plus className="h-3 w-3" />
          New Task
        </Link>
      </div>

      {!tasks?.length ? (
        <div className="flex h-[40vh] flex-col items-center justify-center p-8 text-center">
          <CheckSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-foreground">All clear.</p>
          <p className="text-sm text-muted-foreground">No open tasks assigned.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm hover:bg-card/80 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground line-clamp-1">
                    {task.title}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="capitalize">{task.taskType.replace(/_/g, " ")}</span>
                  <span>•</span>
                  <span className={cn(
                    task.priority === "urgent" ? "text-destructive font-medium" :
                    task.priority === "high" ? "text-orange-500 font-medium" : ""
                  )}>
                    {task.priority}
                  </span>
                  {task.dueDate && (
                    <>
                      <span>•</span>
                      <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
