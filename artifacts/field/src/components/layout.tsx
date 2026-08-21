import { Link, useLocation } from "wouter";
import { Home, ClipboardList, MapPinned, Trees, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncIndicator } from "@/components/sync-indicator";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "الرئيسية", testId: "home", icon: Home },
    { href: "/capture/grove", label: "بستان", testId: "grove", icon: MapPinned },
    { href: "/capture/tree", label: "شجرة", testId: "tree", icon: Trees },
    { href: "/tasks", label: "المهام", testId: "tasks", icon: ClipboardList },
    { href: "/profile", label: "الملف", testId: "profile", icon: User },
  ];

  return (
    <div className="mx-auto max-w-[430px] min-h-[100dvh] bg-background flex flex-col relative shadow-xl border-x border-border">
      {/* Brand bar — mirrors the manager's wordmark + Arabic glyph so the
          field worker app reads as the same product. Sticky so it stays
          visible while scrolling long forms. */}
      <header className="sticky top-0 z-40 h-12 px-4 flex items-center justify-between bg-card border-b border-border">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-wide text-foreground">
            بساتين خلف
          </span>
          <span className="text-[10px] tracking-[0.18em] text-muted-foreground">
            الميدان
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SyncIndicator />
          <span lang="ar" className="text-base text-foreground/70" aria-hidden>
            ﷽
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-[80px]">
        {children}
      </main>

      <nav className="absolute bottom-0 left-0 right-0 h-[80px] bg-card border-t border-border flex items-stretch justify-around px-1 z-50">
        {navItems.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <span
                className={cn(
                  "relative flex flex-col items-center justify-center w-full h-full transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`nav-${item.testId}`}
              >
                {/* Olive top-bar active indicator, matching the manager
                    sidebar's left-bar treatment but rotated for a
                    bottom nav. */}
                {isActive && (
                  <span className="absolute top-0 left-3 right-3 h-[2px] bg-primary rounded-b" />
                )}
                <item.icon className="h-5 w-5 mb-1" />
                <span className="text-[10px] font-medium tracking-wide">
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
