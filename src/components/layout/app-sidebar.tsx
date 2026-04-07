"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dispatch, SetStateAction, useState } from "react";
import {
  BanknoteIcon,
  CreditCard,
  FileSpreadsheet,
  FolderTree,
  HardDriveUpload,
  LayoutDashboard,
  Menu,
  Package,
  Users,
  Wallet,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const sections: {
  title: string;
  links: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    shortcut?: string;
  }[];
}[] = [
  {
    title: "Overview",
    links: [
      {
        href: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        shortcut: "Ctrl+D",
      },
    ],
  },
  {
    title: "Ledger",
    links: [
      { href: "/parties", label: "Parties", icon: Users, shortcut: "Ctrl+P" },
      {
        href: "/transactions",
        label: "Bills",
        icon: CreditCard,
        shortcut: "Ctrl+T",
      },
      {
        href: "/payments",
        label: "Payments",
        icon: BanknoteIcon,
        shortcut: "Ctrl+M",
      },
    ],
  },
  {
    title: "Sales",
    links: [
      {
        href: "/billing",
        label: "Billing",
        icon: FileSpreadsheet,
        shortcut: "Ctrl+B",
      },
      { href: "/credit", label: "Credit", icon: Wallet, shortcut: "Ctrl+E" },
    ],
  },
  {
    title: "Catalog",
    links: [
      {
        href: "/inventory",
        label: "Inventory",
        icon: Package,
        shortcut: "Ctrl+I",
      },
      {
        href: "/categories",
        label: "Categories",
        icon: FolderTree,
        shortcut: "Ctrl+K",
      },
    ],
  },
  {
    title: "Finance",
    links: [
      {
        href: "/bank-accounts",
        label: "Bank Accounts",
        icon: Landmark,
        shortcut: "Ctrl+L",
      },
    ],
  },
  {
    title: "Data",
    links: [
      {
        href: "/data",
        label: "Import / Export",
        icon: HardDriveUpload,
        shortcut: "Ctrl+X",
      },
    ],
  },
];

function NavLinks({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5 ">
      {sections.map((section) => (
        <div key={section.title}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
          )}

          <nav className="flex flex-col gap-0.5">
            {section.links.map(({ href, label, icon: Icon, shortcut }) => {
              const active =
                href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname.startsWith(`${href}/`);

              const cls = cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60",
              );

              const inner = (
                <Link
                  key={href}
                  href={href}
                  className={cls}
                  onClick={onNavigate}
                >
                  <Icon className="size-4 shrink-0 opacity-90" />
                  {!collapsed && <span className="flex-1">{label}</span>}
                  {!collapsed && shortcut && (
                    <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                      {shortcut}
                    </kbd>
                  )}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={href}>
                    <TooltipTrigger>{inner}</TooltipTrigger>
                    <TooltipContent side="right">
                      {label}
                      {shortcut && (
                        <span className="ml-2 text-muted-foreground text-xs">
                          {shortcut}
                        </span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return inner;
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}

export function AppSidebar({
  collapsed,
  setCollapsed,
  onSidebarOpen,
  onMobileOpen,
}: {
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  onSidebarOpen?: () => void;
  onMobileOpen?: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleCollapsedToggle = () => {
    const next = !collapsed;
    setCollapsed(next);

    if (!next) {
      onSidebarOpen?.();
    }
  };

  const handleMobileOpenChange = (open: boolean) => {
    setMobileOpen(open);

    if (open) {
      onMobileOpen?.();
    }
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:fixed md:left-0 md:top-0 md:flex md:h-screen md:min-h-0 md:flex-col shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 z-50 scrollbar-hide",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
          {!collapsed && (
            <div className="text-sm font-semibold tracking-tight">CashFlow</div>
          )}

          <Button variant="ghost" size="icon" onClick={handleCollapsedToggle}>
            <Menu className="size-4" />
          </Button>
        </div>

        {/* Scrollable Nav */}
        <ScrollArea className="min-h-0 flex-1 scrollbar-hide">
          <div className="flex flex-col gap-2 p-2 pb-6">
            <NavLinks collapsed={collapsed} />
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          {!collapsed && (
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
              <span className="text-xs text-muted-foreground">Appearance</span>
              <ThemeToggle />
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => handleMobileOpenChange(true)}
        >
          <Menu className="size-4" />
        </Button>

        <span className="truncate text-sm font-semibold">CashFlow</span>

        <div className="ml-auto">
          <ThemeToggle />
        </div>

        {/* Mobile Sidebar */}
        <Sheet open={mobileOpen} onOpenChange={handleMobileOpenChange}>
          <SheetContent
            side="left"
            className="flex min-h-0 w-[min(100vw-2rem,20rem)] flex-col p-0"
          >
            <div className="border-b px-4 py-3 text-sm font-semibold">Menu</div>

            <ScrollArea className="min-h-0 flex-1 scrollbar-hide">
              <div className="p-3">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </div>
            </ScrollArea>

            <div className="border-t p-3">
              <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
                <span className="text-xs text-muted-foreground">
                  Appearance
                </span>
                <ThemeToggle />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
