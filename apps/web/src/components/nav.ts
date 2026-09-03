import {
  ArrowLeftRight,
  BookOpen,
  Clock,
  History,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Package,
  Receipt,
  RefreshCw,
  Settings,
  Target,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only rendered for OWNER/ADMIN. */
  admin?: boolean;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/**
 * Grouped so the sidebar reads as four short lists instead of one wall of
 * fourteen links: what happened today (деньги), what it adds up to (отчёты),
 * who it's for (клиенты и работа), and setup.
 */
export const navGroups: NavGroup[] = [
  {
    items: [{ to: "/", label: "Дашборд", icon: LayoutDashboard }],
  },
  {
    title: "Продажи и деньги",
    items: [
      { to: "/sales", label: "Продажи", icon: Receipt },
      { to: "/sales-plan", label: "План продаж", icon: Target },
      { to: "/subscriptions", label: "Подписки", icon: RefreshCw },
      { to: "/products", label: "Продукты", icon: Package },
      { to: "/operations", label: "Операции", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Отчёты",
    items: [
      { to: "/reports/pnl", label: "PnL", icon: TrendingUp },
      { to: "/reports/dds", label: "ДДС", icon: Wallet },
    ],
  },
  {
    title: "Клиенты и работа",
    items: [
      { to: "/clients", label: "Клиенты", icon: Users },
      { to: "/projects", label: "Проекты", icon: FolderKanban },
      { to: "/requests", label: "Заявки", icon: Inbox },
      { to: "/time-tracking", label: "Учёт часов", icon: Clock },
    ],
  },
  {
    title: "Администрирование",
    items: [
      { to: "/admin/dictionaries", label: "Справочники", icon: BookOpen, admin: true },
      { to: "/admin/users", label: "Пользователи", icon: UserCog, admin: true },
      { to: "/admin/audit", label: "Журнал", icon: History, admin: true },
      // Not admin-gated: the page carries the personal theme setting, and the
      // demo-data controls inside it are hidden from non-admins instead.
      { to: "/admin/settings", label: "Настройки", icon: Settings },
    ],
  },
];

/** The four destinations that get a permanent slot in the phone tab bar. */
export const mobileTabs: NavItem[] = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/subscriptions", label: "Подписки", icon: RefreshCw },
  { to: "/sales", label: "Продажи", icon: Receipt },
  { to: "/clients", label: "Клиенты", icon: Users },
];

const titles: Record<string, string> = {
  "/": "Дашборд",
  "/clients": "Клиенты",
  "/projects": "Проекты",
  "/operations": "Операции",
  "/products": "Продукты",
  "/sales": "Продажи",
  "/sales-plan": "План продаж",
  "/subscriptions": "Подписки",
  "/requests": "Заявки",
  "/time-tracking": "Учёт часов",
  "/reports/pnl": "PnL",
  "/reports/dds": "ДДС",
  "/admin/dictionaries": "Справочники",
  "/admin/users": "Пользователи",
  "/admin/settings": "Настройки",
  "/admin/audit": "Журнал изменений",
};

/** Page name for the phone's sticky top bar (detail routes fall back to the parent). */
export function pageTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/clients/")) return "Клиент";
  if (pathname.startsWith("/projects/")) return "Проект";
  return "Учёт выручки";
}
