import React from "react";
import { Link, useLocation } from "wouter";
import {
  Leaf, Map as MapIcon, Trees as TreesIcon, AlertTriangle,
  CheckSquare, ClipboardList, MapPin, List,
  Users as UsersIcon, Upload, Bot, Shield, Droplets, BarChart3,
  Eye, Camera, Activity as ActivityIcon, Sprout, Flag, Bug, Crosshair, Beaker, CloudRain, FlaskConical, Wine, FileText, Calendar as CalendarIcon, Radio,
  Sparkles, Search, Bell, Download,
} from "lucide-react";
import brandMark from "@assets/image_1777788550793.png";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useGetDashboardOverview,
  useListHeritageRules,
} from "@workspace/api-client-react";

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  count?: number | null;
}

function NavItem({ href, icon: Icon, label, count }: NavItemProps) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location === href || location.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center justify-between gap-3 pl-4 pr-3 py-1.5 text-[13px] transition-colors",
        isActive
          ? "bg-sidebar-accent text-foreground font-semibold"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
      data-testid={`nav-${href.replace(/\//g, "-") || "home"}`}
    >
      {isActive && (
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] bg-primary" />
      )}
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        <span className="truncate">{label}</span>
      </span>
      {count != null && (
        <span className="text-[11px] tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
      )}
    </Link>
  );
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="px-4 mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
        {title}
      </h4>
      <div>{children}</div>
    </div>
  );
}

function useBreadcrumb(): string {
  const [location] = useLocation();
  if (location === "/") return "Overview";
  const seg = location.replace(/^\//, "").split("/")[0] ?? "";
  return seg.replace(/-/g, " ");
}

function TopBar() {
  const crumb = useBreadcrumb();
  return (
    <header className="h-14 flex-shrink-0 border-b border-border bg-background flex items-center px-6 gap-6">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Khalaf Groves <span className="mx-2 text-foreground/40">›</span>
        <span className="text-foreground">{crumb}</span>
      </div>
      <div className="flex-1" />
      <div className="relative w-80 max-w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search trees, groves, photos"
          placeholder="Search trees, groves, photos…"
          className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          data-testid="topbar-search"
        />
      </div>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Notifications"
        data-testid="topbar-notifications"
      >
        <Bell className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Export"
        data-testid="topbar-export"
      >
        <Download className="h-4 w-4" />
      </button>
    </header>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: overview } = useGetDashboardOverview();
  const { data: heritageRules } = useListHeritageRules();

  const grovesCount = overview?.totalGroves ?? null;
  const treesCount = overview?.totalActiveTrees ?? null;
  const heritageCount = heritageRules?.length ?? null;
  const alertsCount = overview?.openSatelliteAlerts ?? null;
  const tasksCount = overview?.openFieldTasks ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 text-foreground" data-testid="brand-link">
            <img src={brandMark} alt="" className="h-6 w-6 object-contain" />
            <span className="font-serif text-[17px] font-semibold tracking-tight">Khalaf Groves</span>
            <span className="font-serif text-[13px] text-muted-foreground" lang="ar" dir="rtl">زيتون خلف</span>
          </Link>
        </div>
        <ScrollArea className="flex-1 py-4">
          <NavGroup title="Intelligence">
            <NavItem href="/" icon={Sparkles} label="Overview" />
            <NavItem href="/groves" icon={TreesIcon} label="Groves" count={grovesCount} />
            <NavItem href="/map" icon={MapIcon} label="Grove Map" />
            <NavItem href="/trees" icon={Leaf} label="Tree Registry" count={treesCount} />
            <NavItem href="/weather" icon={CloudRain} label="Climate History" />
            <NavItem href="/heritage" icon={Shield} label="Heritage Rules" count={heritageCount} />
            <NavItem href="/alerts" icon={AlertTriangle} label="Satellite Alerts" count={alertsCount} />
          </NavGroup>

          <NavGroup title="Operations">
            <NavItem href="/tasks" icon={CheckSquare} label="Task Board" count={tasksCount} />
            <NavItem href="/field-visits" icon={MapPin} label="Field Visits" />
            <NavItem href="/activities" icon={ActivityIcon} label="Activities" />
            <NavItem href="/phenology" icon={Sprout} label="Phenology (BBCH)" />
            <NavItem href="/scouting" icon={Bug} label="Pest & Disease" />
            <NavItem href="/traps" icon={Crosshair} label="Traps" />
            <NavItem href="/treatments" icon={Beaker} label="Treatments" />
            <NavItem href="/irrigation" icon={Droplets} label="Irrigation" />
            <NavItem href="/soil-tests" icon={FlaskConical} label="Soil Tests" />
            <NavItem href="/flags" icon={Flag} label="Manager Flags" />
            <NavItem href="/sensors" icon={Radio} label="Sensors" />
          </NavGroup>

          <NavGroup title="Records">
            <NavItem href="/photo-analysis" icon={Eye} label="Photo Review" />
            <NavItem href="/photos" icon={Camera} label="Photo Library" />
            <NavItem href="/import" icon={Upload} label="Import Center" />
          </NavGroup>

          <NavGroup title="Harvest">
            <NavItem href="/harvest" icon={CalendarIcon} label="Harvest Overview" />
            <NavItem href="/harvest/events" icon={List} label="Harvest Events" />
            <NavItem href="/harvest/batches" icon={ClipboardList} label="Batches" />
            <NavItem href="/harvest/pressing" icon={Droplets} label="Pressing & Lab" />
            <NavItem href="/lab" icon={Beaker} label="Lab Results" />
            <NavItem href="/oil-batches" icon={Droplets} label="Oil Batches" />
            <NavItem href="/bottling" icon={Wine} label="Bottling Runs" />
            <NavItem href="/reports/harvest" icon={BarChart3} label="Harvest Report" />
          </NavGroup>

          <NavGroup title="Reports">
            <NavItem href="/reports" icon={BarChart3} label="Reports Hub" />
            <NavItem href="/year" icon={CalendarIcon} label="Year View" />
            <NavItem href="/reports/compliance" icon={FileText} label="Compliance Export" />
          </NavGroup>

          <NavGroup title="Tools">
            <NavItem href="/ai" icon={Bot} label="AI Interpreter" />
            <NavItem href="/users" icon={UsersIcon} label="Users" />
          </NavGroup>
        </ScrollArea>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
