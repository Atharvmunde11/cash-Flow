"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dispatch, SetStateAction, useState } from "react";
import {
  BanknoteIcon,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Settings,
  Users,
  UserCog,
  Wallet,
  Landmark,
  FolderTree,
  History,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  shortcut?: string;
  rememberPath?: "inventory" | "billing";
};

const sections: { title: string; links: NavItem[] }[] = [
  {
    title: "Overview",
    links: [
      { href: "/", label: "Home", icon: LayoutDashboard, shortcut: "Ctrl+D" },
      { href: "/daybook", label: "Daybook", icon: BookOpen },
    ],
  },
  {
    title: "Invoices",
    links: [
      {
        href: "/billing",
        label: "New Invoice",
        icon: FileSpreadsheet,
        shortcut: "Ctrl+B",
        rememberPath: "billing",
      },
      {
        href: "/transactions",
        label: "Invoice History",
        icon: History,
        shortcut: "Ctrl+H",
      },
      {
        href: "/sale-returns",
        label: "Sale Return History",
        icon: History,
      },
      {
        href: "/credit",
        label: "Money Owed",
        icon: Wallet,
        shortcut: "Ctrl+E",
      },
    ],
  },
  {
    title: "Purchases",
    links: [
      {
        href: "/purchases",
        label: "Purchase History",
        icon: Receipt,
      },
      {
        href: "/purchase-returns",
        label: "Purchase Return History",
        icon: Receipt,
      },
    ],
  },
  {
    title: "Ledger",
    links: [
      { href: "/parties", label: "Ledger", icon: Users, shortcut: "Ctrl+P" },
      {
        href: "/receipts",
        label: "Receipts",
        icon: Receipt,
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
    title: "Stock",
    links: [
      {
        href: "/inventory",
        label: "Stock",
        icon: Package,
        shortcut: "Ctrl+I",
        rememberPath: "inventory",
      },
      {
        href: "/categories",
        label: "Categories",
        icon: FolderTree,
        shortcut: "Ctrl+K",
      },
      {
        href: "/sundries",
        label: "Sundries",
        icon: Receipt,
      },
    ],
  },
  {
    title: "Employee",
    links: [
      {
        href: "/employees",
        label: "Employees",
        icon: UserCog,
      },
      {
        href: "/attendance",
        label: "Attendance",
        icon: CalendarDays,
      },
      {
        href: "/payrolls",
        label: "Payrolls",
        icon: BanknoteIcon,
      },
    ],
  },
  {
    title: "Finance",
    links: [
      {
        href: "/reports",
        label: "Financial Reports",
        icon: PieChart,
      },
      {
        href: "/bank-accounts",
        label: "Bank Accounts",
        icon: Landmark,
        shortcut: "Ctrl+L",
      },
      {
        href: "/settings",
        label: "FY Settings",
        icon: CalendarDays,
      },
    ],
  },
  {
    title: "App",
    links: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  router,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { href, label, icon: Icon, shortcut, rememberPath } = item;
  const active = isActive(pathname, href);

  const cls = cn(
    "flex min-h-10 min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60",
  );

  const inner = (
    <Link
      href={href}
      className={cls}
      title={collapsed ? label : undefined}
      onClick={(e) => {
        let targetHref = href;
        try {
          if (rememberPath === "inventory") {
            targetHref =
              sessionStorage.getItem("cf_last_inventory_path") ?? "/inventory";
          }
          if (rememberPath === "billing") {
            targetHref =
              sessionStorage.getItem("cf_last_billing_path") ?? "/billing";
          }
        } catch {
          // ignore
        }

        if (targetHref !== href) {
          e.preventDefault();
          router.push(targetHref);
        }
        onNavigate?.();
      }}
    >
      <Icon className="size-4 shrink-0 opacity-90" />
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}
      {!collapsed && shortcut && (
        <kbd className="hidden shrink-0 rounded border bg-muted px-1 py-0.5 font-mono text-[9px] leading-none text-muted-foreground xl:inline-flex">
          {shortcut}
        </kbd>
      )}
    </Link>
  );

  return inner;
}

function NavLinks({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          {!collapsed && (
            <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
          )}
          {collapsed && section.title !== "Overview" && (
            <div className="mx-auto mb-2 h-px w-8 bg-sidebar-border" />
          )}
          <nav className="flex flex-col gap-0.5">
            {section.links.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                router={router}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
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
    if (!next) onSidebarOpen?.();
  };

  const handleMobileOpenChange = (open: boolean) => {
    setMobileOpen(open);
    if (open) onMobileOpen?.();
  };

  return (
    <>
      <aside
        className={cn(
          "hidden md:fixed md:left-0 md:top-0 md:flex md:h-screen md:min-h-0 md:flex-col shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 z-50 scrollbar-hide",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
          {!collapsed ? <BrandLogo /> : null}
          <Button variant="ghost" size="icon" onClick={handleCollapsedToggle}>
            <Menu className="size-4" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 scrollbar-hide">
          <div className="flex flex-col gap-2 p-2 pb-6">
            <NavLinks collapsed={collapsed} />
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-sidebar-border p-3">
          {!collapsed && (
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          )}
        </div>
      </aside>

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

        <BrandLogo />

        <div className="ml-auto">
          <ThemeToggle />
        </div>

        <Sheet open={mobileOpen} onOpenChange={handleMobileOpenChange}>
          <SheetContent
            side="left"
            className="flex min-h-0 w-[min(100vw-2rem,18rem)] flex-col p-0"
          >
            <div className="border-b px-4 py-3">
              <BrandLogo />
            </div>

            <ScrollArea className="min-h-0 flex-1 scrollbar-hide">
              <div className="p-3">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
