import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Дашборд" },
  { to: "/clients", label: "Клиенты" },
  { to: "/projects", label: "Проекты" },
  { to: "/operations", label: "Операции" },
  { to: "/products", label: "Продукты" },
  { to: "/sales", label: "Продажи" },
  { to: "/subscriptions", label: "Подписки" },
  { to: "/requests", label: "Заявки" },
  { to: "/time-tracking", label: "Учёт часов" },
  { to: "/reports/pnl", label: "PnL" },
  { to: "/reports/dds", label: "ДДС" },
];

const adminItems = [
  { to: "/admin/dictionaries", label: "Справочники" },
  { to: "/admin/users", label: "Пользователи" },
  { to: "/admin/settings", label: "Настройки" },
];

export function Layout() {
  const { user, organization, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2.5 text-base font-medium sm:py-2 sm:text-sm ${
      isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
    }`;

  const sidebarContent = (
    <>
      <div className="mb-6">
        <div className="text-lg font-semibold">{organization?.name ?? "Компания"}</div>
        <div className="text-sm text-slate-500">{user?.name}</div>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass} onClick={() => setMenuOpen(false)}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      {(user?.role === "OWNER" || user?.role === "ADMIN") && (
        <>
          <div className="mt-6 mb-2 text-xs font-semibold uppercase text-slate-400">Админка</div>
          <nav className="flex flex-col gap-1">
            {adminItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setMenuOpen(false)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </>
      )}
      <button
        onClick={logout}
        className="mt-auto rounded-md px-3 py-2.5 text-left text-base font-medium text-red-600 hover:bg-red-50 sm:py-2 sm:text-sm"
      >
        Выйти
      </button>
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden [padding-top:max(0.75rem,env(safe-area-inset-top))]">
        <div className="text-base font-semibold">{organization?.name ?? "Компания"}</div>
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Открыть меню"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Mobile off-canvas drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-xl [padding-top:max(1rem,env(safe-area-inset-top))] [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Закрыть меню"
              className="mb-4 ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700"
            >
              ✕
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 lg:flex lg:flex-col">
        {sidebarContent}
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  );
}
