import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, MoreHorizontal, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { mobileTabs, navGroups, pageTitle, type NavItem } from "./nav";

const roleLabel: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  VIEWER: "Наблюдатель",
};

export function Layout() {
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";

  // Any navigation closes the "Ещё" sheet — otherwise it stays over the page
  // the user just picked.
  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [moreOpen]);

  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.admin || isAdmin) }))
    .filter((g) => g.items.length > 0);

  const initials = (user?.name ?? "")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Phone: sticky title bar. No branding — just where you are. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur-md lg:hidden [padding-top:max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="truncate text-base font-semibold tracking-tight">{pageTitle(location.pathname)}</h1>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-ink-muted">
          {initials || "—"}
        </span>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {visibleGroups.map((group, i) => (
            <div key={group.title ?? i} className="flex flex-col gap-0.5">
              {group.title && (
                <div className="mb-1 px-3 text-[10px] font-semibold tracking-[0.08em] text-ink-subtle uppercase">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-semibold text-ink-muted">
            {initials || "—"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{user?.name}</div>
            <div className="truncate text-xs text-ink-subtle">{roleLabel[user?.role ?? ""] ?? user?.role}</div>
          </div>
          <button
            onClick={logout}
            aria-label="Выйти"
            title="Выйти"
            className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-raised hover:text-expense"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      <main className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] sm:px-6 sm:pt-6 lg:pb-8">
        <Outlet />
      </main>

      {/* Phone: bottom tab bar — the iOS-native way round, instead of a hamburger */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-canvas/90 backdrop-blur-md lg:hidden [padding-bottom:env(safe-area-inset-bottom)]">
        {mobileTabs.map((item) => (
          <TabLink key={item.to} item={item} />
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
            moreOpen ? "text-accent" : "text-ink-subtle"
          }`}
        >
          <MoreHorizontal className="size-5" strokeWidth={1.9} />
          Ещё
        </button>
      </nav>

      {/* Phone: full navigation sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} />
          <div className="relative max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex justify-center">
                <span className="h-1 w-9 rounded-full bg-line-strong" />
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Закрыть"
                className="rounded-lg p-1.5 text-ink-subtle hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {visibleGroups.map((group, i) => (
                <div key={group.title ?? i}>
                  {group.title && (
                    <div className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-ink-subtle uppercase">
                      {group.title}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <SheetLink key={item.to} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={logout}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-3 text-sm font-medium text-expense"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Выйти
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const { icon: Icon, to, label } = item;
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
          isActive
            ? "bg-accent-soft font-medium text-accent"
            : "text-ink-muted hover:bg-raised hover:text-ink"
        }`
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      {label}
    </NavLink>
  );
}

function TabLink({ item }: { item: NavItem }) {
  const { icon: Icon, to, label } = item;
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
          isActive ? "text-accent" : "text-ink-subtle"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="size-5" strokeWidth={isActive ? 2.1 : 1.9} />
          {label}
        </>
      )}
    </NavLink>
  );
}

function SheetLink({ item }: { item: NavItem }) {
  const { icon: Icon, to, label } = item;
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm transition-colors ${
          isActive
            ? "border-accent/30 bg-accent-soft font-medium text-accent"
            : "border-line bg-raised text-ink"
        }`
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
