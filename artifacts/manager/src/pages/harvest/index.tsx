import { useState } from "react";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListGroves } from "@workspace/api-client-react";
import { WithholdingWatch } from "@/components/withholding-watch";

export default function HarvestOverview() {
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [groveId, setGroveId] = useState("all");
  const { data: groves } = useListGroves();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" /> Harvest Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Plan harvest dates against active treatment withholding windows.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Target harvest date</Label>
          <Input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-48"
            data-testid="input-target-date"
          />
        </div>
        <div>
          <Label className="text-xs">Grove</Label>
          <Select value={groveId} onValueChange={setGroveId}>
            <SelectTrigger className="w-48" data-testid="select-grove"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groves</SelectItem>
              {(groves ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <WithholdingWatch
        targetDate={targetDate}
        groveId={groveId !== "all" ? parseInt(groveId, 10) : undefined}
      />
    </div>
  );
}
