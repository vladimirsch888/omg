export interface DictionaryValue {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface DictionaryType {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  values: DictionaryValue[];
}

export interface Client {
  id: string;
  name: string;
  legalName?: string | null;
  inn?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: "ACTIVE" | "PAUSED" | "CHURNED";
  notes?: string | null;
  projectsCount?: number;
  createdAt: string;
}

export interface Project {
  id: string;
  clientId: string;
  parentId?: string | null;
  name: string;
  description?: string | null;
  typeValueId?: string | null;
  typeValue?: DictionaryValue | null;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
  startDate?: string | null;
  endDate?: string | null;
  hourlyRate?: string | number | null;
  budgetHours?: string | number | null;
  client?: { id: string; name: string };
  children?: Project[];
  createdAt: string;
}

export interface Operation {
  id: string;
  projectId?: string | null;
  project?: { id: string; name: string; clientId: string; client?: { name: string } } | null;
  type: "INCOME" | "EXPENSE";
  status: "PLANNED" | "ACTUAL";
  amount: string | number;
  currency: string;
  accrualDate: string;
  paymentDate?: string | null;
  categoryValueId?: string | null;
  categoryValue?: DictionaryValue | null;
  paymentMethodValueId?: string | null;
  paymentMethodValue?: DictionaryValue | null;
  counterparty?: string | null;
  description?: string | null;
  vendorSharePercent?: string | number;
  taxable?: boolean;
  subscriptionId?: string | null;
  saleId?: string | null;
}

export interface RequestTicket {
  id: string;
  projectId: string;
  project?: { id: string; name: string; clientId: string };
  title: string;
  description?: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  requestTypeValueId?: string | null;
  requestTypeValue?: DictionaryValue | null;
  totalHours?: number;
  createdAt: string;
  closedAt?: string | null;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  project?: { id: string; name: string };
  requestId?: string | null;
  request?: { id: string; title: string } | null;
  userId: string;
  user?: { id: string; name: string };
  date: string;
  hours: string | number;
  description?: string | null;
}

export interface PnLReport {
  periods: { period: string; income: number; expense: number; profit: number }[];
  byCategory: { categoryId: string; categoryName: string; income: number; expense: number; profit: number }[];
  totals: { income: number; expense: number; profit: number };
}

export interface DDSReport {
  periods: { period: string; inflow: number; outflow: number; net: number; cumulativeBalance: number }[];
  totals: { inflow: number; outflow: number; net: number; endingBalance: number };
}

export interface ClientLTV {
  clientId: string;
  clientName: string;
  status: string;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  firstOperationDate: string | null;
  monthsActive: number;
  avgMonthlyRevenue: number;
  ltv: number;
}

export interface CompanySummary {
  currentMonth: { income: number; expense: number; profit: number };
  pnlTrend: PnLReport["periods"];
  ddsTrend: DDSReport["periods"];
  topClients: ClientLTV[];
  hoursThisMonth: number;
}

export interface DemoStatus {
  hasDemoData: boolean;
  clients: number;
  projects: number;
  operations: number;
  requests: number;
  timeEntries: number;
  subscriptions: number;
  licenseProducts: number;
  sales: number;
  salesPlans: number;
}

export interface LicenseProduct {
  id: string;
  name: string;
  type: "LICENSE" | "WORK";
  categoryValueId?: string | null;
  categoryValue?: DictionaryValue | null;
  defaultPrice: string | number;
  defaultDurationMonths?: number | null;
  defaultWorkDays?: number | null;
  defaultVendorSharePercent: string | number;
  defaultTaxable: boolean;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  clientId: string;
  client?: { id: string; name: string };
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  licenseProductId: string;
  licenseProduct?: { id: string; name: string };
  price: string | number;
  durationMonths: number;
  vendorSharePercent: string | number;
  taxable: boolean;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  startDate: string;
  nextBillingDate: string;
  operations?: Operation[];
}

export interface Sale {
  id: string;
  clientId: string;
  client?: { id: string; name: string };
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  licenseProductId: string;
  licenseProduct?: { id: string; name: string };
  amount: string | number;
  saleDate: string;
  workEndDate?: string | null;
  vendorSharePercent: string | number;
  taxable: boolean;
  createdAt: string;
}

export interface CashPosition {
  cumulativeCash: number;
  taxReserveAccrued: number;
  spendable: number;
  taxReservePercent: number;
}

export interface SalesPlans {
  year: number;
  /** null when no annual target is set for the year. */
  annual: number | null;
  months: { month: number; amount: number }[];
}

export interface SalesPlanReport {
  year: number;
  annualPlan: number | null;
  monthlyPlanTotal: number;
  months: { month: number; plan: number | null; fact: number; netProfit: number }[];
  totals: { fact: number; netProfit: number; completionPercent: number | null };
  profitMix: { license: number; work: number; other: number; total: number };
}

export interface SubscriptionMonthSummary {
  totalExpected: number;
  renewedAmount: number;
  renewedNetProfit: number;
  pendingNetProfit: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  isActive?: boolean;
}
