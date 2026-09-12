"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalSearch from "@/components/GlobalSearch";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";

type NavItem = { href: string; label: string };
type NavGroup = { label: string | null; items: NavItem[]; collapsible?: boolean };

export default function AppShell({
  groups,
  userName,
  userRole,
  children,
}: {
  groups: NavGroup[];
  userName: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setSidebarHidden(localStorage.getItem("sidebar-hidden") === "1");
    } catch {
      // localStorage unavailable — just keep the sidebar shown.
    }
  }, []);

  function toggleSidebar() {
    setSidebarHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-hidden", next ? "1" : "0");
      } catch {
        // ignore — this is just a remembered preference, not critical data.
      }
      return next;
    });
  }

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="min-h-screen md:flex print:block">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <div>
          <div className="font-serif text-lg text-ink leading-none">Shoe Shop</div>
          <div className="text-[10px] text-ink/50">POS &amp; ERP</div>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="border border-line rounded-md px-3 py-1.5 text-sm text-ink"
        >
          Menu
        </button>
      </div>

      {/* Overlay drawer on mobile */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-surface border-r border-line flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent groups={groups} userName={userName} userRole={userRole} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Fixed sidebar on desktop */}
      {!sidebarHidden && (
        <aside className="hidden md:flex md:w-60 md:shrink-0 border-r border-line bg-surface flex-col print:hidden">
          <SidebarContent groups={groups} userName={userName} userRole={userRole} pathname={pathname} />
        </aside>
      )}

      <main className="flex-1 min-w-0 print:w-full">
        <div className="hidden md:flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3 print:hidden">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarHidden ? "Show menu" : "Hide menu"}
            title={sidebarHidden ? "Show menu" : "Hide menu"}
            className="border border-line rounded-md px-2.5 py-1.5 text-sm text-ink/70 hover:text-ink shrink-0"
          >
            {sidebarHidden ? "☰" : "«"}
          </button>
          <GlobalSearch />
          <ThemeToggle />
        </div>
        <div className="md:hidden px-4 pt-3 print:hidden">
          <GlobalSearch />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 print:p-0 print:max-w-none">{children}</div>
      </main>
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}

function SidebarContent({
  groups,
  userName,
  userRole,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  userName: string;
  userRole: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  // Collapsible groups start open only if the current page is inside them,
  // so the sidebar isn't a huge list by default but never hides where you
  // already are.
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    groups.forEach((group, gi) => {
      if (group.collapsible) {
        initial[gi] = group.items.some((item) => item.href === pathname);
      }
    });
    return initial;
  });

  function toggleGroup(gi: number) {
    setOpenGroups((prev) => ({ ...prev, [gi]: !prev[gi] }));
  }

  useEffect(() => {
    const activeIdx = groups.findIndex((g) => g.collapsible && g.items.some((item) => item.href === pathname));
    if (activeIdx >= 0) {
      setOpenGroups((prev) => (prev[activeIdx] ? prev : { ...prev, [activeIdx]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      <div className="px-5 py-5 border-b border-line hidden md:block">
        <div className="font-serif text-lg text-ink">Shoe Shop</div>
        <div className="text-xs text-ink/50">POS &amp; ERP</div>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto">
        {groups.map((group, gi) => {
          const isOpen = !group.collapsible || !!openGroups[gi];
          return (
            <div key={gi} className={gi > 0 ? "mt-3 pt-3 border-t border-line/70" : ""}>
              {group.label && group.collapsible ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(gi)}
                  className="w-full flex items-center justify-between px-5 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink/40 hover:text-ink/70"
                >
                  {group.label}
                  <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                </button>
              ) : (
                group.label && (
                  <div className="px-5 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink/40">
                    {group.label}
                  </div>
                )
              )}
              {isOpen &&
                group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={`block px-5 py-2 text-sm ${
                        active ? "text-moss bg-moss/10 font-medium" : "text-ink/80 hover:bg-paper hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-line">
        <div className="text-sm text-ink">{userName}</div>
        <div className="text-xs text-ink/50 mb-3">{userRole}</div>
        <LogoutButton />
      </div>
    </>
  );
}
