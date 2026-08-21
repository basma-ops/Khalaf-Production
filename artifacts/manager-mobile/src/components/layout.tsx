import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  AlertTriangle,
  CheckSquare,
  Camera,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
}

function BottomNavItem({ href, icon: Icon, label }: NavItemProps) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location === href || location.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center w-full py-2 gap-1 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </Link>
  );
}

function usePageTitle(): string {
  const [location] = useLocation();
  if (location === "/") return "Overview";
  const seg = location.replace(/^\//, "").split("/")[0] ?? "";
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
}

export function Layout({ children }: { children: React.ReactNode }) {
  const title = usePageTitle();

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background font-serif">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-center border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-top">
        <div className="absolute left-4 text-xs font-bold text-primary tracking-widest">
          زيتون خلف
        </div>
        <h1 className="text-base font-medium text-foreground tracking-wide">{title}</h1>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-y-contain pb-safe">
        {children}
      </main>

      <nav className="sticky bottom-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-safe">
        <div className="flex h-14 items-center justify-around px-2">
          <BottomNavItem href="/" icon={LayoutDashboard} label="Overview" />
          <BottomNavItem href="/alerts" icon={AlertTriangle} label="Alerts" />
          <BottomNavItem href="/tasks" icon={CheckSquare} label="Tasks" />
          <BottomNavItem href="/photos" icon={Camera} label="Photos" />
          <BottomNavItem href="/more" icon={Menu} label="More" />
        </div>
      </nav>
    </div>
  );
}
