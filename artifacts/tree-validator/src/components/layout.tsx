import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, LogOut, MapPin } from "lucide-react";
import { logout } from "@/lib/api";

type Props = {
  title: string;
  back?: string;
  right?: ReactNode;
  children: ReactNode;
};

export function MobileShell({ title, back, right, children }: Props) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-3 py-3 backdrop-blur">
        {back ? (
          <Link
            to={back}
            className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        ) : (
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
        )}
        <h1
          className="flex-1 truncate text-base font-semibold"
          style={{ fontFamily: "var(--app-font-serif)" }}
        >
          {title}
        </h1>
        {right}
        {!back && (
          <button
            onClick={async () => {
              await logout();
              window.location.reload();
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent text-muted-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </header>
      <main className="flex-1 px-3 py-3 pb-20">{children}</main>
    </div>
  );
}
