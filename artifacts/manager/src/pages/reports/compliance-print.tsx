import { useEffect } from "react";
import { useListComplianceTreatments } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

function useSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export default function CompliancePrintPage() {
  const sp = useSearchParams();
  const params: Record<string, string | number> = {};
  if (sp.get("from")) params["from"] = sp.get("from")!;
  if (sp.get("to")) params["to"] = sp.get("to")!;
  if (sp.get("groveId")) params["groveId"] = Number(sp.get("groveId"));
  if (sp.get("product")) params["product"] = sp.get("product")!;
  if (sp.get("activeIngredient")) params["activeIngredient"] = sp.get("activeIngredient")!;
  const { data, isLoading } = useListComplianceTreatments(Object.keys(params).length ? params : undefined);

  useEffect(() => {
    if (!isLoading && data) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isLoading, data]);

  return (
    <div className="p-6 max-w-[210mm] mx-auto print:p-0" data-testid="compliance-print">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .no-print { display: none !important; }
          body { background: white; }
        }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
        th { background: #f7f7f5; }
      `}</style>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Khalaf Olive Groves — Treatment compliance log</h1>
        <p className="text-xs text-muted-foreground">
          Generated {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC.
          {sp.get("from") || sp.get("to") ? <> · Date range: {sp.get("from") ?? "—"} → {sp.get("to") ?? "—"}</> : null}
          {sp.get("groveId") ? <> · Grove #{sp.get("groveId")}</> : null}
          {sp.get("product") ? <> · Product: {sp.get("product")}</> : null}
          {sp.get("activeIngredient") ? <> · AI: {sp.get("activeIngredient")}</> : null}
        </p>
      </div>
      {isLoading || !data ? <Skeleton className="h-96" /> : data.length === 0 ? (
        <p className="italic">No treatments match the filters.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Applied</th>
              <th>Grove</th>
              <th>Kind</th>
              <th>Product</th>
              <th>Active ingredient</th>
              <th>Method</th>
              <th>Rate</th>
              <th>Area (ha)</th>
              <th>Trees</th>
              <th>Withhold (days)</th>
              <th>Weather</th>
              <th>Applicator</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.appliedAt).toISOString().replace("T", " ").slice(0, 16)}</td>
                <td>{r.groveName ?? `#${r.groveId}`}</td>
                <td>{r.treatmentKind ?? "—"}</td>
                <td>{r.product}</td>
                <td>{r.activeIngredient ?? "—"}</td>
                <td>{r.method}</td>
                <td>{r.rate != null ? `${r.rate} ${r.rateUnit ?? ""}` : "—"}</td>
                <td>{r.areaHectares ?? "—"}</td>
                <td>{r.treesAffectedCount ?? "—"}</td>
                <td>{r.withholdingDays}</td>
                <td>{r.weatherConditions ?? "—"}</td>
                <td>{r.applicatorName ?? `#${r.applicatorWorkerId ?? "?"}`}</td>
                <td>{r.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-6 text-xs no-print">
        <button onClick={() => window.print()} className="px-3 py-1 border rounded">Print / Save as PDF</button>
      </div>
    </div>
  );
}
