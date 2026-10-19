"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Dumbbell, LayoutDashboard, ListChecks, Menu, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOut } from "@/app/login/actions";

// La page « Analyse d'une partie » est atteinte depuis « Mes parties » (/games/[id]).
const LINKS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/games", label: "Mes parties", icon: ListChecks },
  { href: "/training", label: "Entraînement", icon: Dumbbell },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/settings", label: "Paramètres", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className={cn("flex flex-col gap-0.5", className)}>
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-[0.9375rem] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active && "bg-sidebar-accent font-semibold text-sidebar-primary",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
        aria-label="Ouvrir le menu"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar">
        <SheetHeader>
          <SheetTitle>chess-learn</SheetTitle>
        </SheetHeader>
        <AppNav className="px-2" onNavigate={() => setOpen(false)} />
        <form action={signOut} className="mt-auto space-y-2 p-4">
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Se déconnecter
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
