import { useListGroves } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Trees, ChevronRight } from "lucide-react";
import { Link } from "wouter";

export default function Groves() {
  const { data: groves, isLoading } = useListGroves();

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg bg-primary/5" />
        ))}
      </div>
    );
  }

  if (!groves?.length) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-8 text-center">
        <Trees className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-foreground">No groves found.</p>
        <p className="text-sm text-muted-foreground">Groves will appear here once added.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4 font-serif">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Olive Groves</h2>
        <span className="text-xs text-muted-foreground">{groves.length} total</span>
      </div>

      <div className="space-y-3">
        {groves.map((grove) => (
          <Link
            key={grove.id}
            href={`/groves/${grove.id}`}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm hover:bg-card/80 transition-colors"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {grove.name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Code: {grove.groveCode}</span>
                {grove.areaHa && (
                  <>
                    <span>•</span>
                    <span>{grove.areaHa} ha</span>
                  </>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
