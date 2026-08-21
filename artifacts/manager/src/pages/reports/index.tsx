import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Calendar, FileText, Leaf, Shield, Wine, Beaker, Activity, TreePine } from "lucide-react";

const REPORTS = [
  {
    href: "/",
    title: "Registry health",
    description: "Live overview of the registry — open flags, recent visits, alerts, and grove-level health signals from the manager dashboard.",
    icon: Activity,
    cta: "Open dashboard",
  },
  {
    href: "/trees",
    title: "Tree report",
    description: "Per-tree registry with variety, age, condition flags, and full history. Pick a tree to drill into its visits, harvests, treatments, and lab results.",
    icon: TreePine,
    cta: "Open tree registry",
  },
  {
    href: "/year",
    title: "Year report",
    description: "One-page summary for a calendar year — rainfall, phenology shifts, pest pressure, harvest, oil quality, bottling, and heritage rule deltas.",
    icon: Calendar,
    cta: "Open year view",
  },
  {
    href: "/reports/harvest",
    title: "Harvest report",
    description: "End-of-season totals: kg per grove and per tree, mean Jaén maturity, pressing delay, oil yield, and lab quality flags.",
    icon: Leaf,
    cta: "Open harvest report",
  },
  {
    href: "/bottling",
    title: "Lot trace",
    description: "Pick a bottling run to see its full traceability — sources, contributing trees, grove breakdown, and heritage evidence.",
    icon: Wine,
    cta: "Choose a run",
  },
  {
    href: "/reports/compliance",
    title: "Compliance export",
    description: "Filter treatments by date range, grove, product, or active ingredient and export a compliance-ready CSV plus printable PDF.",
    icon: FileText,
    cta: "Open compliance export",
  },
  {
    href: "/heritage",
    title: "Heritage rule registry",
    description: "Status of each heritage rule and the evidence supporting it. Each rule shows an evidence rollup by source kind and month.",
    icon: Shield,
    cta: "Open heritage rules",
  },
  {
    href: "/lab",
    title: "Lab results",
    description: "All oil chemistry results with extra-virgin and health-claim flags, filterable by season, batch, and tree.",
    icon: Beaker,
    cta: "Open lab results",
  },
];

export default function ReportsHubPage() {
  return (
    <div className="p-8 space-y-6" data-testid="reports-hub">
      <div>
        <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Reports
        </h1>
        <p className="text-muted-foreground mt-2">Cross-cutting views built on the data the team has collected.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.href} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon className="h-5 w-5 text-primary" /> {r.title}
                </CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Link href={r.href}>
                  <Button variant="outline" className="w-full">{r.cta}</Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
