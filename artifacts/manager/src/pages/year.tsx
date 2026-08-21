import { useState } from "react";
import { Calendar } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YearReportContent } from "./reports/year";

export default function YearDashboardPage() {
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now);
  const years = Array.from({ length: 6 }, (_, i) => now - i);
  return (
    <div className="p-8 space-y-6" data-testid="year-dashboard">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Year view
          </h1>
          <p className="text-muted-foreground mt-2">Full-year picture of your groves — pick a year to explore.</p>
        </div>
        <div>
          <Label className="text-xs uppercase">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32" data-testid="year-picker"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <YearReportContent year={year} />
    </div>
  );
}
