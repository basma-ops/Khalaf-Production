import { useAuth } from "@/hooks/use-auth";
import { useListTasks } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { format } from "date-fns";
import { ClipboardCheck } from "lucide-react";
import { dateLocale, priorityLabel, statusLabel } from "@/lib/i18n";

export default function Tasks() {
  const { workerId } = useAuth();
  const { data: tasks, isLoading } = useListTasks({
    assignedToUserId: workerId || undefined,
  });

  const openTasks = tasks?.filter(t => t.status === 'open' || t.status === 'in_progress') || [];
  const completedTasks = tasks?.filter(t => t.status === 'completed') || [];

  const TaskList = ({ items }: { items: typeof tasks }) => {
    if (isLoading) return <div className="space-y-3"><div className="h-24 bg-muted rounded-xl animate-pulse" /></div>;
    if (!items || items.length === 0) return (
      <div className="py-12 text-center flex flex-col items-center justify-center">
        <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-foreground">لا توجد مهام</h3>
        <p className="text-muted-foreground">لقد أنجزت كل شيء!</p>
      </div>
    );

    return (
      <div className="space-y-3">
        {items.map((task) => (
          <Link key={task.id} href={`/tasks/${task.id}`}>
            <Card className="hover-elevate cursor-pointer transition-all active:scale-[0.98]">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className={
                    (task.priority as string) === 'critical' ? 'border-destructive text-destructive' :
                    task.priority === 'high' ? 'border-orange-500 text-orange-500' :
                    task.priority === 'medium' ? 'border-amber-500 text-amber-500' :
                    'border-muted-foreground text-muted-foreground'
                  }>
                    {priorityLabel(task.priority)}
                  </Badge>
                  {task.dueDate && (
                    <span className="text-xs font-medium text-muted-foreground">
                      الاستحقاق {format(new Date(task.dueDate), "d MMM", dateLocale)}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-lg leading-tight mb-2">{task.title}</h3>
                {task.groveName && (
                  <p className="text-sm font-medium text-primary mb-1">📍 {task.groveName}</p>
                )}
                <Badge variant={task.status === 'completed' ? 'secondary' : 'default'} className="mt-2">
                  {statusLabel(task.status)}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 pt-8 h-full flex flex-col">
      <h1 className="text-3xl font-bold tracking-tight mb-6">مهامي</h1>

      <Tabs defaultValue="active" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4 h-12">
          <TabsTrigger value="active" className="text-base h-10">النشطة ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="completed" className="text-base h-10">المكتملة</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="flex-1 mt-0">
          <TaskList items={openTasks} />
        </TabsContent>
        <TabsContent value="completed" className="flex-1 mt-0">
          <TaskList items={completedTasks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
