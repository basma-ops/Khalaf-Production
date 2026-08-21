import { useListTrees, useListGroves } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Search,
  Camera,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  QrCode,
} from "lucide-react";
import { Link } from "wouter";

type SortKey =
  | "treeCode"
  | "groveName"
  | "currentHealthIndex"
  | "currentAlertStatus"
  | "photoCount"
  | "lastPhotoAt"
  | "pendingPhotoReviewCount";
type SortDir = "asc" | "desc";

const ALERT_RANK: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
  unknown: -1,
};
const ALL_GROVES = "__all__";

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const day = 86400_000;
  if (diffMs < day) return "today";
  if (diffMs < 2 * day) return "yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / (7 * day))}w ago`;
  if (diffMs < 365 * day) return `${Math.floor(diffMs / (30 * day))}mo ago`;
  return d.toLocaleDateString();
}

export default function Trees() {
  const [search, setSearch] = useState("");
  const [groveFilter, setGroveFilter] = useState<string>(ALL_GROVES);
  const [sortKey, setSortKey] = useState<SortKey>("treeCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [, setLocation] = useLocation();

  const { data: groves } = useListGroves();
  const groveIdNum =
    groveFilter === ALL_GROVES ? undefined : Number(groveFilter);
  const { data: treesData, isLoading } = useListTrees({
    search: search || undefined,
    ...(groveIdNum ? { groveId: groveIdNum } : {}),
    // Registry view shows the full inventory; the underlying table holds
    // ~1,300 trees and the per-tree photo aggregates already cap the
    // payload size, so a single page is preferable to artificial
    // pagination that hides trees from the manager.
    limit: 10000,
  });

  const summary = useMemo(() => {
    const list = treesData?.trees ?? [];
    let withPhotos = 0;
    let totalPhotos = 0;
    let pendingReview = 0;
    let needsVerify = 0;
    for (const t of list) {
      const c = t.photoCount ?? 0;
      if (c > 0) withPhotos++;
      totalPhotos += c;
      pendingReview += t.pendingPhotoReviewCount ?? 0;
      needsVerify += t.needsFieldVerificationCount ?? 0;
    }
    return { withPhotos, totalPhotos, pendingReview, needsVerify, total: list.length };
  }, [treesData]);

  const sortedTrees = useMemo(() => {
    const list = [...(treesData?.trees ?? [])];
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: unknown, b: unknown): number => {
      const aNull = a == null;
      const bNull = b == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1; // nulls always go to the bottom
      if (bNull) return -1;
      if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
      return String(a).localeCompare(String(b)) * dir;
    };
    list.sort((a, b) => {
      switch (sortKey) {
        case "treeCode":
          return cmp(a.treeCode, b.treeCode);
        case "groveName":
          return cmp(a.groveName, b.groveName);
        case "currentHealthIndex":
          return cmp(a.currentHealthIndex, b.currentHealthIndex);
        case "currentAlertStatus":
          return (
            ((ALERT_RANK[a.currentAlertStatus] ?? -1) -
              (ALERT_RANK[b.currentAlertStatus] ?? -1)) *
            dir
          );
        case "photoCount":
          return cmp(a.photoCount ?? 0, b.photoCount ?? 0);
        case "lastPhotoAt":
          return cmp(
            a.lastPhotoAt ? new Date(a.lastPhotoAt).getTime() : null,
            b.lastPhotoAt ? new Date(b.lastPhotoAt).getTime() : null,
          );
        case "pendingPhotoReviewCount":
          return cmp(
            (a.pendingPhotoReviewCount ?? 0) +
              (a.needsFieldVerificationCount ?? 0),
            (b.pendingPhotoReviewCount ?? 0) +
              (b.needsFieldVerificationCount ?? 0),
          );
        default:
          return 0;
      }
    });
    return list;
  }, [treesData, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Photo/health/alert columns are typically most useful descending first.
      setSortDir(
        key === "photoCount" ||
          key === "lastPhotoAt" ||
          key === "currentHealthIndex" ||
          key === "currentAlertStatus" ||
          key === "pendingPhotoReviewCount"
          ? "desc"
          : "asc",
      );
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 inline" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 inline" />
    );
  };

  const SortHeader = ({
    k,
    label,
    align = "left",
  }: {
    k: SortKey;
    label: string;
    align?: "left" | "center";
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`inline-flex items-center font-medium hover:text-foreground ${
        sortKey === k ? "text-foreground" : "text-muted-foreground"
      } ${align === "center" ? "justify-center w-full" : ""}`}
      data-testid={`sort-${k}`}
    >
      {label}
      <SortIcon k={k} />
    </button>
  );

  const getAlertBadge = (status: string) => {
    switch (status) {
      case "urgent":
        return <Badge variant="destructive">Urgent</Badge>;
      case "high":
        return <Badge className="bg-orange-500 hover:bg-orange-600">High</Badge>;
      case "medium":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>;
      case "low":
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">None</Badge>;
    }
  };

  const getAncientBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Verified
          </Badge>
        );
      case "candidate":
        return <Badge variant="secondary">Candidate</Badge>;
      default:
        return null;
    }
  };

  const filtersActive = groveFilter !== ALL_GROVES || search.length > 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">
            Tree Registry
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and track individual ancient and productive trees.
          </p>
        </div>
        <Link
          href={
            groveIdNum
              ? `/trees/print?groveId=${groveIdNum}`
              : "/trees/print"
          }
          data-testid="link-print-tree-qrs"
        >
          <Button variant="outline">
            <QrCode className="h-4 w-4 mr-2" />
            Print QR labels
          </Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tree code..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-trees"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select value={groveFilter} onValueChange={setGroveFilter}>
            <SelectTrigger data-testid="select-grove-filter">
              <SelectValue placeholder="Filter by grove" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROVES}>All groves</SelectItem>
              {(groves ?? []).map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.name}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {g.groveCode}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setGroveFilter(ALL_GROVES);
            }}
            data-testid="button-clear-filters"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
        <div className="text-xs text-muted-foreground sm:ml-auto">
          {isLoading ? "Loading…" : `${sortedTrees.length} trees`}
        </div>
      </div>

      {/* Photo coverage summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Trees with photos</div>
            <div className="text-2xl font-bold" data-testid="stat-trees-with-photos">
              {summary.withPhotos}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {summary.total}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total photos</div>
            <div className="text-2xl font-bold" data-testid="stat-total-photos">
              {summary.totalPhotos}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Pending review</div>
            <div
              className="text-2xl font-bold text-amber-700"
              data-testid="stat-pending-review"
            >
              {summary.pendingReview}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Needs field verify</div>
            <div
              className="text-2xl font-bold text-orange-700"
              data-testid="stat-needs-verify"
            >
              {summary.needsVerify}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">
                <SortHeader k="treeCode" label="Code" />
              </TableHead>
              <TableHead>
                <SortHeader k="groveName" label="Grove" />
              </TableHead>
              <TableHead>Type/Variety</TableHead>
              <TableHead>Ancient</TableHead>
              <TableHead>
                <SortHeader k="currentHealthIndex" label="Health" />
              </TableHead>
              <TableHead>
                <SortHeader k="currentAlertStatus" label="Alert" />
              </TableHead>
              <TableHead className="text-center">
                <SortHeader k="photoCount" label="Photos" align="center" />
              </TableHead>
              <TableHead>
                <SortHeader k="lastPhotoAt" label="Last photo" />
              </TableHead>
              <TableHead className="text-center">
                <SortHeader
                  k="pendingPhotoReviewCount"
                  label="Review"
                  align="center"
                />
              </TableHead>
              <TableHead>Verification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : sortedTrees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center py-8 text-muted-foreground"
                >
                  No trees found.
                </TableCell>
              </TableRow>
            ) : (
              sortedTrees.map((tree) => {
                const photoCount = tree.photoCount ?? 0;
                const pendingReview = tree.pendingPhotoReviewCount ?? 0;
                const needsVerify = tree.needsFieldVerificationCount ?? 0;
                return (
                  <TableRow
                    key={tree.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLocation(`/trees/${tree.id}`)}
                    data-testid={`row-tree-${tree.id}`}
                  >
                    <TableCell className="font-mono font-medium">
                      {tree.treeCode}
                    </TableCell>
                    <TableCell>{tree.groveName || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="capitalize">{tree.treeType}</span>
                        <span className="text-xs text-muted-foreground">
                          {tree.variety}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getAncientBadge(tree.ancientStatus)}</TableCell>
                    <TableCell>
                      {tree.currentHealthIndex?.toFixed(2) || "—"}
                    </TableCell>
                    <TableCell>{getAlertBadge(tree.currentAlertStatus)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {tree.lastPhotoThumbnailUrl ? (
                          <img
                            src={tree.lastPhotoThumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="h-8 w-8 rounded object-cover border"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted/40 border flex items-center justify-center">
                            <Camera className="h-4 w-4 text-muted-foreground/60" />
                          </div>
                        )}
                        <span
                          className={
                            photoCount > 0
                              ? "font-semibold"
                              : "text-muted-foreground"
                          }
                          data-testid={`tree-${tree.id}-photo-count`}
                        >
                          {photoCount}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(tree.lastPhotoAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {pendingReview > 0 && (
                          <Badge
                            className="bg-amber-100 text-amber-800 border-amber-300 border"
                            variant="outline"
                          >
                            {pendingReview} pending
                          </Badge>
                        )}
                        {needsVerify > 0 && (
                          <Badge
                            className="bg-orange-100 text-orange-800 border-orange-300 border"
                            variant="outline"
                          >
                            <AlertTriangle className="h-3 w-3 mr-0.5" />
                            {needsVerify}
                          </Badge>
                        )}
                        {pendingReview === 0 && needsVerify === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">
                        {tree.verificationStatus.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
