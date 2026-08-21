import { useListHeritageRules } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Heritage() {
  const { data: rules, isLoading } = useListHeritageRules();

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  if (!rules?.length) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center">
        <Shield className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-foreground">No heritage rules.</p>
        <p className="text-sm text-muted-foreground">Traditional knowledge will be tracked here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Traditional Knowledge</h2>
        <span className="text-xs text-muted-foreground">{rules.length} rules</span>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-semibold text-foreground">
                {rule.name}
              </span>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                rule.status === "confirmed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {rule.status}
              </span>
            </div>
            {rule.traditionalRule && (
              <p className="text-sm text-muted-foreground mb-3">"{rule.traditionalRule}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
