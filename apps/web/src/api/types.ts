export interface DictionaryValue {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
  systemKey?: string | null;
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
  accountValueId?: string | null;
  accountValue?: DictionaryValue | null;
  /** EXPENSE that pays tax — reduces the outstanding tax reserve. */
  taxPayment?: boolean;
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
  /** Cash accumulated before the report window; the running balance starts here. */
  openingBalance: number;
  totals: { inflow: number; outflow: number; net: number; endingBalance: number };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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
  monthProgress: { day: number; daysInMonth: number };
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
  /** Vendor (amoCRM, Wazzup…) and tariff from the dictionaries — licences only. */
  vendorValueId?: string | null;
  vendorValue?: DictionaryValue | null;
  tariffValueId?: string | null;
  tariffValue?: DictionaryValue | null;
  /** Catalog price per seat; lets the portfolio spot deals priced off-list. */
  pricePerSeat?: string | number | null;
  description?: string | null;
  /** Set when the product was imported from the built-in vendor catalog. */
  catalogKey?: string | null;
}

export interface CatalogVendor {
  code: string;
  name: string;
  /** Terms the vendor sells, in months, ascending. */
  periods: number[];
  defaultMonths: number;
  items: {
    key: string;
    name: string;
    group: string;
    tariffCode: string;
    tariffName: string;
    kind: "paid" | "free" | "usage";
    prices: { months: number; price: number }[];
    pricePerSeat: number | null;
    features: string[];
    imported: { months: number; id: string; name: string; price: number; isActive: boolean }[];
  }[];
}

export interface CatalogImportResult {
  created: number;
  updated: number;
  products: { id: string; name: string; action: "created" | "updated" }[];
}

export interface Subscription {
  id: string;
  clientId: string;
  client?: { id: string; name: string };
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  licenseProductId: string;
  licenseProduct?: {
    id: string;
    name: string;
    pricePerSeat?: string | number | null;
    vendorValue?: DictionaryValue | null;
    tariffValue?: DictionaryValue | null;
  };
  price: string | number;
  durationMonths: number;
  vendorSharePercent: string | number;
  taxable: boolean;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  startDate: string;
  nextBillingDate: string;
  /** Set once the invoice for the upcoming period is sent; cleared on renewal. */
  invoiceSentAt?: string | null;
  /** Licence details: seats, the vendor-side expiry date, the vendor account id. */
  seats?: number | null;
  expiresAt?: string | null;
  accountRef?: string | null;
  notes?: string | null;
  pausedAt?: string | null;
  cancelledAt?: string | null;
  cancelReasonValueId?: string | null;
  cancelReasonValue?: DictionaryValue | null;
  cancelComment?: string | null;
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
  taxPaid: number;
  taxReserveOutstanding: number;
  spendable: number;
  taxReservePercent: number;
  /** "calendar" once a tax profile exists — the reserve is then what the calendar says is still owed. */
  taxSource: "flat" | "calendar";
  accountBalances: { accountId: string | null; name: string; isActive: boolean; balance: number }[];
}

export interface Reminder {
  kind: "overdue" | "due_soon" | "invoice_stale" | "work_deadline" | "request_high" | "tax_due" | "tax_overdue";
  title: string;
  detail: string;
  days: number;
  entity: "subscription" | "sale" | "request" | "tax";
  entityId: string;
  clientName?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

export interface ProjectEffort {
  hours: number;
  budgetHours: number | null;
  hourlyRate: number | null;
  laborCost: number | null;
  budgetUsedPercent: number | null;
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
  months: {
    month: number;
    plan: number | null;
    fact: number;
    netProfit: number;
    /** Still expected this month from active subscriptions. */
    subscriptionForecast: number;
  }[];
  totals: {
    fact: number;
    netProfit: number;
    completionPercent: number | null;
    subscriptionForecast: number;
    /** fact + subscriptionForecast — where the year lands with no new sales. */
    forecast: number;
    forecastPercent: number | null;
  };
  profitMix: { license: number; work: number; other: number; total: number };
}

export interface SubscriptionMonthSummary {
  totalExpected: number;
  renewedAmount: number;
  renewedNetProfit: number;
  pendingNetProfit: number;
  /** Invoices sent but not yet paid — a subset of what's still expected. */
  invoicedAmount: number;
  invoicedCount: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  isActive?: boolean;
}

export interface LicenseRow {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  vendor: string | null;
  tariff: string | null;
  seats: number | null;
  price: number;
  pricePerSeat: number | null;
  effectivePerSeat: number | null;
  durationMonths: number;
  monthlyValue: number;
  status: Subscription["status"];
  startDate: string;
  nextBillingDate: string;
  expiresAt: string;
  daysLeft: number;
  invoiceSentAt: string | null;
  accountRef: string | null;
  upsellHints: string[];
  priceMismatch: boolean;
}

export interface LicensePortfolio {
  summary: {
    activeLicenses: number;
    totalSeats: number;
    monthlyRecurring: number;
    expiringThisMonth: number;
    expiringThisMonthValue: number;
    upsellCandidates: number;
    averagePerSeat: number | null;
  };
  byVendor: { vendor: string; licenses: number; seats: number; monthlyRecurring: number }[];
  byTariff: { tariff: string; licenses: number; seats: number }[];
  expirations: { month: string; licenses: number; value: number; byVendor: Record<string, number> }[];
  rows: LicenseRow[];
}

export interface CohortRow {
  cohort: string;
  size: number;
  mrr: number;
  clients: number;
  bySubscriptions: (number | null)[];
  byMrr: (number | null)[];
  byClients: (number | null)[];
}

export interface RetentionReport {
  months: number;
  cohorts: CohortRow[];
  monthly: {
    month: string;
    activeStart: number;
    started: number;
    cancelled: number;
    churnRate: number | null;
    mrrStart: number;
    mrrLost: number;
    mrrChurnRate: number | null;
    renewalsDue: number;
    renewedOnTime: number;
    renewedLate: number;
    notRenewed: number;
    averageDelayDays: number | null;
  }[];
  summary: {
    activeNow: number;
    cancelledLast12m: number;
    churnRate12m: number | null;
    averageLifetimeMonths: number | null;
    onTimeRenewalShare: number | null;
    lateRenewals30: number;
  };
  reasons: { reason: string; count: number; mrrLost: number }[];
  churned: {
    subscriptionId: string;
    clientName: string;
    productName: string;
    cancelledAt: string;
    lifetimeMonths: number;
    mrr: number;
    reason: string | null;
    comment: string | null;
  }[];
}

export type TaxKind = "usn_advance" | "usn_annual" | "ip_fixed" | "ip_one_percent" | "vat_warning";

export interface TaxObligation {
  kind: TaxKind;
  period: string;
  title: string;
  dueDate: string;
  noticeDate: string | null;
  amount: number;
  paid: number;
  outstanding: number;
  status: "paid" | "overdue" | "due_soon" | "upcoming" | "info";
  breakdown: Record<string, number | string>;
}

export interface TaxProfile {
  form: "IP" | "OOO";
  regime: "USN_INCOME" | "USN_INCOME_EXPENSE";
  ratePercent: number;
  minimumTaxPercent: number;
  fixedContributions: number;
  onePercentThreshold: number;
  onePercentCap: number;
  deductFixedWhenDue: boolean;
  hasEmployees: boolean;
  vatThreshold: number | null;
}

export interface TaxCalendar {
  year: number;
  profile: TaxProfile | null;
  obligations: TaxObligation[];
  totals: {
    dueThisQuarter: number;
    dueRestOfYear: number;
    paidThisYear: number;
    outstandingTotal: number;
    incomeYtd: number;
    effectiveRatePercent: number | null;
  };
  monthly: { month: string; income: number; taxAccrued: number; paid: number }[];
}
