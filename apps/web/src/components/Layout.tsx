import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Дашборд" },
  { to: "/clients", label: "Клиенты" },
  { to: "/projects", label: "Проекты" },
  { to: "/operations", label: "Операции" },
  { to: "/requests", label: "Заявки" },
  { to: "/time-tracking", label: "Учёт часов" },
  { to: "/reports/pnl", label: "PnL" },
  { to: "/reports/dds", label: "ДДС" },
];

const adminItems = [
  { to: "/admin/dictionaries", label: "Справочники" },
  { to: "/admin/users", label: "Пользователи" },
];

export function Layout() {
  const { user, organization, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col">
        <div className="mb-6">
          <div className="text-lg font-semibold">{organization?.name ?? "Компания"}</div>
          <div className="text-sm text-slate-500">{user?.name}</div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {(user?.role === "OWNER" || user?.role === "ADMIN") && (
          <>
            <div className="mt-6 mb-2 text-xs font-semibold uppercase text-slate-400">Админка</div>
            <nav className="flex flex-col gap-1">
              {adminItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2 text-sm font-medium ${
                      isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </>
        )}
        <button
          onClick={logout}
          className="mt-auto rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Выйти
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
