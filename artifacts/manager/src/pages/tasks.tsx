import { useListTasks, useUpdateTask } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Calendar, Target, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Tasks() {
  const { data: tasks, isLoading, refetch } = useListTasks();
  const updateTask = useUpdateTask();
  const { toast } = useToast();

  const handleStatusChange = (id: number, newStatus: any) => {
    updateTask.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Task updated", description: `Status changed to ${newStatus}` });
          refetch();
        },
        onError: () => {
          toast({ title: "Error", description: "Could not update task status", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-6" /><div className="grid grid-cols-4 gap-4"><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" /></div></div>;
  }

  const columns = [
    { id: "open", title: "Open" },
    { id: "assigned", title: "Assigned" },
    { id: "in_progress", title: "In Progress" },
    { id: "completed", title: "Completed" },
  ];

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-foreground">Task Board</h1>
        <p className="text-muted-foreground mt-2">Manage field operations and verify satellite alerts.</p>
      </div>

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {columns.map(column => (
          <div key={column.id} className="w-80 flex-shrink-0 flex flex-col bg-muted/30 rounded-lg p-3">
            <h3 className="font-semibold text-sm uppercase tracking-wider mb-3 text-muted-foreground flex items-center justify-between">
              {column.title}
              <Badge variant="secondary" className="font-mono">{tasks?.filter(t => t.status === column.id).length || 0}</Badge>
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {tasks?.filter(t => t.status === column.id).map(task => (
                <Card key={task.id} className="cursor-grab hover:border-primary/50 transition-colors">
                  <CardHeader className="p-3 pb-2">
                    <div className="flex justify-between items-start mb-1">
                      <Badge variant="outline" className="text-xs uppercase tracking-wider">
                        {task.taskType.replace(/_/g, ' ')}
                      </Badge>
                      {task.priority === 'urgent' && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Urgent</Badge>}
                    </div>
                    <CardTitle className="text-sm">{task.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="text-xs text-muted-foreground space-y-1 mb-3">
                      {task.groveName && (
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          <span>{task.groveName} {task.treeCode ? `> ${task.treeCode}` : ''}</span>
                        </div>
                      )}
                      {task.dueDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{format(new Date(task.dueDate), "MMM d, yyyy")}</span>
                        </div>
                      )}
                      {task.assignedToUserName && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{task.assignedToUserName}</span>
                        </div>
                      )}
                    </div>
                    
                    <Select 
                      defaultValue={task.status} 
                      onValueChange={(val) => handleStatusChange(task.id, val)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
