import { useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { useListTrees, useListGroves } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

function buildTreeUrl(treeId: number): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normBase = base.endsWith("/") ? base : `${base}/`;
  return `${window.location.origin}${normBase}trees/${treeId}`;
}

export default function TreesPrint() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const groveIdParam = params.get("groveId");
  const groveId = groveIdParam ? Number(groveIdParam) : undefined;

  const { data: groves } = useListGroves();
  const { data: treesData, isLoading } = useListTrees({
    ...(groveId ? { groveId } : {}),
    limit: 10000,
  });

  const groveName = useMemo(() => {
    if (!groveId) return "All groves";
    return groves?.find((g) => g.id === groveId)?.name ?? `Grove #${groveId}`;
  }, [groveId, groves]);

  const trees = treesData?.trees ?? [];

  useEffect(() => {
    document.title = `Tree QR labels — ${groveName}`;
  }, [groveName]);

  return (
    <div className="bg-white">
      <div className="px-6 py-4 flex items-center justify-between border-b print:hidden">
        <div>
          <Link href="/trees" className="text-xs text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to trees
          </Link>
          <h1 className="text-xl font-serif font-bold mt-1">
            Tree QR Labels — {groveName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${trees.length} labels ready to print`}
          </p>
        </div>
        <Button onClick={() => window.print()} data-testid="button-print-all">
          <Printer className="h-4 w-4 mr-2" /> Print all
        </Button>
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 print:grid-cols-3 print:gap-2">
        {trees.map((t) => {
          const url = buildTreeUrl(t.id);
          return (
            <div
              key={t.id}
              className="border rounded-md p-3 flex flex-col items-center text-center break-inside-avoid"
              data-testid={`print-label-${t.id}`}
            >
              <div className="bg-white p-1">
                <QRCodeSVG value={url} size={120} level="M" includeMargin={false} />
              </div>
              <div className="mt-2 font-mono font-bold text-sm">{t.treeCode}</div>
              {t.groveName && (
                <div className="text-[10px] text-muted-foreground">{t.groveName}</div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          @page { margin: 8mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
