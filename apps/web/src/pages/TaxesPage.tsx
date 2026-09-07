import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Banknote, CalendarCheck, ChevronDown, ChevronUp, Landmark, Settings2, TrendingUp, Wallet } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { DictionaryType, DictionaryValue, TaxCalendar, TaxObligation, TaxProfile } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  FilterBar,
  InlineBar,
  Input,
  Modal,
  PageHeader,
  PageSkeleton,
  Select,
  StatCard,
  StatusBadge,
  useUi,
  type BadgeTone,
} from "../components/ui";
import { dateInputToIso, formatDate, formatMoney, todayInput } from "../utils/format";

const statusLabel: Record<TaxObligation["status"], string> = {
  paid: "Уплачено",
  overdue: "Просрочено",
  due_soon: "Скоро срок",
  upcoming: "Предстоит",
  info: "Справочно",
};

const statusTone: Record<TaxObligation["status"], BadgeTone> = {
  paid: "income",
  overdue: "expense",
  due_soon: "reserve",
  upcoming: "neutral",
  info: "accent",
};

const kindLabel: Record<TaxObligation["kind"], string> = {
  usn_advance: "аванс УСН",
  usn_annual: "налог УСН за год",
  ip_fixed: "взносы ИП",
  ip_one_percent: "1 % свыше порога",
  vat_warning: "НДС",
};

const defaultProfile: TaxProfile = {
  form: "IP",
  regime: "USN_INCOME",
  ratePercent: 6,
  minimumTaxPercent: 1,
  fixedContributions: 57390,
  onePercentThreshold: 300000,
  onePercentCap: 321818,
  deductFixedWhenDue: true,
  hasEmployees: false,
  vatThreshold: null,
};

function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(y, m - 1, 1)).replace(".", "");
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export function TaxesPage() {
  const ui = useUi();
  const { isAdmin, canEdit } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<TaxCalendar | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DictionaryValue[]>([]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<TaxProfile>(defaultProfile);
  const [savingProfile, setSavingProfile] = useState(false);

  const [paying, setPaying] = useState<TaxObligation | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput());
  const [payAccount, setPayAccount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  function load() {
    api
      .get<TaxCalendar>("/taxes/calendar", { params: { year } })
      .then((res) => setData(res.data))
      .catch((err) => ui.toast(errorMessage(err, "Не удалось загрузить налоговый календарь"), "error"));
  }

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    api.get<DictionaryType[]>("/dictionaries").then((res) => {
      const accountsDict = res.data.find((d) => d.code === "account");
      setAccounts(accountsDict?.values.filter((v) => v.isActive) ?? []);
    });
  }, []);

  function openProfile() {
    setProfile(data?.profile ?? defaultProfile);
    setProfileOpen(true);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put("/taxes/profile", {
        ...profile,
        vatThreshold: profile.vatThreshold || null,
      });
      ui.toast("Налоговый профиль сохранён", "success");
      setProfileOpen(false);
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось сохранить профиль"), "error");
    } finally {
      setSavingProfile(false);
    }
  }

  function startPay(o: TaxObligation) {
    setPaying(o);
    setPayAmount(String(o.outstanding));
    setPayDate(todayInput());
    setPayAccount("");
  }

  async function submitPay(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    const amount = Number(payAmount.replace(",", "."));
    if (!amount || amount <= 0) {
      ui.toast("Некорректная сумма", "error");
      return;
    }
    setPayBusy(true);
    try {
      await api.post("/taxes/pay", {
        kind: paying.kind,
        period: paying.period,
        amount,
        date: dateInputToIso(payDate),
        accountValueId: payAccount || null,
        title: paying.title,
      });
      ui.toast(`Уплачено ${formatMoney(amount)} — расход записан в операции`, "success");
      setPaying(null);
      load();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось записать уплату"), "error");
    } finally {
      setPayBusy(false);
    }
  }

  if (!data) return <PageSkeleton stats={4} rows={6} />;

  const years = [year - 1, year, year + 1].filter((y) => y >= 2020);
  const maxMonthly = Math.max(1, ...data.monthly.map((m) => Math.max(m.income, m.taxAccrued, m.paid)));

  const yearSelect = (
    <FilterBar>
      <Field label="Год">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
    </FilterBar>
  );

  const profileModal = (
    <Modal
      open={profileOpen}
      onClose={() => setProfileOpen(false)}
      title="Налоговый профиль"
      description="Ставки и суммы, по которым система считает авансы, взносы и годовой налог. Меняйте, когда меняется закон или режим."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => setProfileOpen(false)}>
            Отмена
          </Button>
          <Button variant="primary" form="tax-profile-form" type="submit" loading={savingProfile}>
            Сохранить
          </Button>
        </>
      }
    >
      <form id="tax-profile-form" onSubmit={saveProfile} className="grid grid-cols-1 gap-3.5 pb-2 sm:grid-cols-2">
        <Field label="Форма">
          <Select value={profile.form} onChange={(e) => setProfile({ ...profile, form: e.target.value as TaxProfile["form"] })}>
            <option value="IP">ИП</option>
            <option value="OOO">ООО</option>
          </Select>
        </Field>
        <Field label="Режим">
          <Select value={profile.regime} onChange={(e) => setProfile({ ...profile, regime: e.target.value as TaxProfile["regime"] })}>
            <option value="USN_INCOME">УСН «Доходы»</option>
            <option value="USN_INCOME_EXPENSE">УСН «Доходы минус расходы»</option>
          </Select>
        </Field>
        <Field label="Ставка, %">
          <Input type="number" step="0.1" min="0" max="30" inputMode="decimal" value={profile.ratePercent} onChange={(e) => setProfile({ ...profile, ratePercent: Number(e.target.value) })} required />
        </Field>
        {profile.regime === "USN_INCOME_EXPENSE" && (
          <Field label="Минимальный налог, % от дохода">
            <Input type="number" step="0.1" min="0" max="10" inputMode="decimal" value={profile.minimumTaxPercent} onChange={(e) => setProfile({ ...profile, minimumTaxPercent: Number(e.target.value) })} />
          </Field>
        )}
        {profile.form === "IP" && (
          <>
            <Field label="Фиксированные взносы за год, ₽" hint="Срок уплаты — 28 декабря">
              <Input type="number" min="0" inputMode="numeric" value={profile.fixedContributions} onChange={(e) => setProfile({ ...profile, fixedContributions: Number(e.target.value) })} />
            </Field>
            <Field label="Порог для 1 %, ₽" hint="1 % с дохода свыше порога, срок — 1 июля следующего года">
              <Input type="number" min="0" inputMode="numeric" value={profile.onePercentThreshold} onChange={(e) => setProfile({ ...profile, onePercentThreshold: Number(e.target.value) })} />
            </Field>
            <Field label="Максимум 1 % за год, ₽" hint="0 — без ограничения">
              <Input type="number" min="0" inputMode="numeric" value={profile.onePercentCap} onChange={(e) => setProfile({ ...profile, onePercentCap: Number(e.target.value) })} />
            </Field>
          </>
        )}
        <Field label="Порог дохода для НДС на УСН, ₽" hint="Пусто — не отслеживать. При 80 % порога появится предупреждение">
          <Input type="number" min="0" inputMode="numeric" value={profile.vatThreshold ?? ""} onChange={(e) => setProfile({ ...profile, vatThreshold: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        {profile.form === "IP" && profile.regime === "USN_INCOME" && (
          <div className="flex flex-col gap-2.5 sm:col-span-2">
            <Checkbox label="Уменьшать налог на взносы сразу, не дожидаясь их уплаты (правило для ИП с 2023 года)" checked={profile.deductFixedWhenDue} onChange={(e) => setProfile({ ...profile, deductFixedWhenDue: e.target.checked })} />
            <Checkbox label="Есть сотрудники (вычет взносов ограничен половиной налога)" checked={profile.hasEmployees} onChange={(e) => setProfile({ ...profile, hasEmployees: e.target.checked })} />
          </div>
        )}
      </form>
    </Modal>
  );

  if (!data.profile) {
    return (
      <div className="flex flex-col gap-5 sm:gap-6">
        <PageHeader title="Налоговый календарь" description="Авансы по УСН, фиксированные взносы ИП и 1 % свыше порога — со сроками, суммами и отметками об уплате." />
        <Card>
          <EmptyState
            icon={Landmark}
            title="Налоговый профиль не настроен"
            description="Укажите форму, режим и ставку — календарь построится по фактическим доходам. Пока профиля нет, резерв на налог считается по фиксированному проценту из настроек."
            action={
              isAdmin ? (
                <Button variant="primary" icon={Settings2} onClick={openProfile}>
                  Настроить
                </Button>
              ) : undefined
            }
          />
        </Card>
        {profileModal}
      </div>
    );
  }

  const p = data.profile;
  const regimeLabel = p.regime === "USN_INCOME" ? "УСН «Доходы»" : "УСН «Доходы − расходы»";

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Налоговый календарь"
        description={
          <>
            {p.form === "IP" ? "ИП" : "ООО"}, {regimeLabel}, {p.ratePercent} %
            {p.form === "IP" && p.regime === "USN_INCOME" ? " — налог уменьшается на взносы" : ""}. Суммы считаются по фактически полученным облагаемым доходам; отметка «Оплачено» создаёт расход в операциях и уменьшает резерв.
          </>
        }
        actions={
          isAdmin && (
            <Button variant="secondary" icon={Settings2} onClick={openProfile}>
              Профиль
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="К уплате в этом квартале" value={formatMoney(data.totals.dueThisQuarter)} tone={data.totals.dueThisQuarter > 0 ? "reserve" : "neutral"} icon={CalendarCheck} hint="Обязательства со сроком до конца текущего квартала" />
        <StatCard label="До конца года" value={formatMoney(data.totals.dueRestOfYear)} icon={Wallet} hint="Всё, что ещё предстоит заплатить в этом календарном году" />
        <StatCard label={`Уплачено за ${data.year}`} value={formatMoney(data.totals.paidThisYear)} tone="income" icon={Banknote} hint="Операции с отметкой «уплата налога» за год" />
        <StatCard
          label="Эффективная ставка"
          value={data.totals.effectiveRatePercent != null ? `${String(data.totals.effectiveRatePercent).replace(".", ",")} %` : "—"}
          icon={TrendingUp}
          hint={`Все налоги и взносы года ÷ облагаемый доход ${formatMoney(data.totals.incomeYtd)}`}
        />
      </div>

      {yearSelect}

      <Card title={`Обязательства ${data.year} года`} bodyClassName="-m-4 sm:-m-5">
        {data.obligations.length === 0 ? (
          <EmptyState icon={Landmark} title="Обязательств нет" description="За этот год нет ни доходов, ни настроенных взносов." />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {data.obligations.map((o) => {
              const key = `${o.kind}-${o.period}`;
              const open = expanded === key;
              const days = daysUntil(o.dueDate);
              const isInfo = o.kind === "vat_warning";
              return (
                <li key={key} className={`px-4 py-3 sm:px-5 ${o.status === "overdue" ? "bg-expense-soft/40" : o.status === "due_soon" ? "bg-reserve-soft/50" : ""}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isInfo ? <AlertTriangle className="size-4 shrink-0 text-reserve" strokeWidth={1.9} /> : null}
                        <span className="text-sm font-medium text-ink">{o.title}</span>
                        <Badge>{kindLabel[o.kind]}</Badge>
                        <StatusBadge label={statusLabel[o.status]} tone={statusTone[o.status]} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                        {!isInfo && (
                          <span>
                            срок {formatDate(o.dueDate)}
                            {o.status !== "paid" && (days < 0 ? ` (просрочено на ${Math.abs(days)} дн.)` : ` (через ${days} дн.)`)}
                          </span>
                        )}
                        {o.noticeDate && <span>уведомление ЕНП до {formatDate(o.noticeDate)}</span>}
                        {o.paid > 0 && <span className="text-income">уплачено {formatMoney(o.paid)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      {!isInfo && (
                        <div className="text-right">
                          <div className={`text-base font-semibold tnum ${o.outstanding > 0 ? "text-ink" : "text-ink-subtle"}`}>{formatMoney(o.outstanding)}</div>
                          {o.paid > 0 && o.amount !== o.outstanding && <div className="text-[11px] text-ink-subtle tnum">из {formatMoney(o.amount)}</div>}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {canEdit && !isInfo && o.outstanding > 0 && (
                          <Button size="sm" variant="primary" icon={Banknote} onClick={() => startPay(o)}>
                            Оплачено
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" icon={open ? ChevronUp : ChevronDown} onClick={() => setExpanded(open ? null : key)}>
                          Расчёт
                        </Button>
                      </div>
                    </div>
                  </div>
                  {open && (
                    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-raised/60 px-3 py-2.5 text-xs sm:grid-cols-2">
                      {Object.entries(o.breakdown).map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3">
                          <dt className="text-ink-muted">{label}</dt>
                          <dd className="text-ink tnum">{typeof value === "number" ? formatMoney(value) : value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Доход и налог по месяцам">
        <ul className="flex flex-col gap-2.5">
          {data.monthly.map((m) => (
            <li key={m.month} className="grid grid-cols-[3rem_1fr] items-center gap-3 text-xs sm:grid-cols-[3rem_1fr_1fr_1fr]">
              <span className="font-medium text-ink capitalize">{shortMonth(m.month)}</span>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px] text-ink-subtle sm:hidden">
                  <span>доход {formatMoney(m.income)}</span>
                  {m.taxAccrued > 0 && <span>начислено {formatMoney(m.taxAccrued)}</span>}
                  {m.paid > 0 && <span className="text-income">уплачено {formatMoney(m.paid)}</span>}
                </div>
                <InlineBar value={m.income} max={maxMonthly} tone="accent" />
                <span className="hidden text-[11px] text-ink-subtle sm:block">доход {formatMoney(m.income)}</span>
              </div>
              <div className="hidden flex-col gap-1 sm:flex">
                <InlineBar value={m.taxAccrued} max={maxMonthly} tone="expense" />
                <span className="text-[11px] text-ink-subtle">{m.taxAccrued > 0 ? `начислено ${formatMoney(m.taxAccrued)}` : "—"}</span>
              </div>
              <div className="hidden flex-col gap-1 sm:flex">
                <InlineBar value={m.paid} max={maxMonthly} tone="income" />
                <span className="text-[11px] text-ink-subtle">{m.paid > 0 ? `уплачено ${formatMoney(m.paid)}` : "—"}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-subtle">Начисление относится к последнему месяцу периода: квартал → март, июнь, сентябрь; годовой налог → декабрь.</p>
      </Card>

      {profileModal}

      <Modal
        open={paying !== null}
        onClose={() => setPaying(null)}
        title="Отметить уплату"
        description={paying?.title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaying(null)}>
              Отмена
            </Button>
            <Button variant="primary" form="tax-pay-form" type="submit" loading={payBusy}>
              Записать расход
            </Button>
          </>
        }
      >
        <form id="tax-pay-form" onSubmit={submitPay} className="flex flex-col gap-3.5 pb-2">
          <Field label="Сумма" hint={paying ? `Осталось ${formatMoney(paying.outstanding)}` : undefined}>
            <Input type="number" step="0.01" min="0.01" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
          </Field>
          <Field label="Дата платежа">
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
          </Field>
          {accounts.length > 0 && (
            <Field label="Счёт списания">
              <Select value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                <option value="">Не указывать</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </form>
      </Modal>
    </div>
  );
}
