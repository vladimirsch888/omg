import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { api, errorMessage } from "../api/client";
import type { CatalogImportResult, CatalogVendor } from "../api/types";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Skeleton, useUi } from "./ui";
import { formatMoney } from "../utils/format";

/**
 * «Каталог вендоров»: the built-in price lists (Wazzup today, NOVA next)
 * with a checkbox per tariff. Import creates the products, re-import
 * refreshes prices of the ones created earlier — the owner never types a
 * vendor's price list by hand.
 */
export function VendorCatalogModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const ui = useUi();
  const [vendors, setVendors] = useState<CatalogVendor[] | null>(null);
  const [vendorCode, setVendorCode] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periods, setPeriods] = useState<number[]>([]);
  const [share, setShare] = useState("50");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVendors(null);
    api
      .get<CatalogVendor[]>("/vendor-catalog")
      .then((res) => {
        setVendors(res.data);
        const first = res.data[0];
        if (first) selectVendor(first);
      })
      .catch((err) => ui.toast(errorMessage(err, "Не удалось загрузить каталог"), "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Switching vendor resets the selection to the rows worth selling that
   * aren't in Продукты yet — free and token-billed widgets, and amoCRM
   * prices that are no longer current, stay unchecked — plus the vendor's
   * usual term.
   */
  function selectVendor(v: CatalogVendor) {
    setVendorCode(v.code);
    setSelected(new Set(v.items.filter((i) => i.recommended && i.imported.length === 0).map((i) => i.key)));
    setPeriods([v.defaultMonths]);
  }

  const vendor = vendors?.find((v) => v.code === vendorCode) ?? null;
  const groups = useMemo(() => {
    if (!vendor) return [];
    const map = new Map<string, CatalogVendor["items"]>();
    for (const item of vendor.items) map.set(item.group, [...(map.get(item.group) ?? []), item]);
    // Paid rows first: those are what gets imported; free and usage-billed
    // sections sit underneath for the rare case they're wanted.
    // What's for sale first: recommended rows, then paid-but-archived,
    // then free and token-billed sections.
    const rank = (items: CatalogVendor["items"]) =>
      items[0].recommended ? 0 : items[0].kind === "paid" ? 1 : items[0].kind === "free" ? 2 : 3;
    return [...map].sort((a, b) => rank(a[1]) - rank(b[1]));
  }, [vendor]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleGroup = (items: CatalogVendor["items"]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = items.every((i) => next.has(i.key));
      for (const i of items) {
        if (allOn) next.delete(i.key);
        else next.add(i.key);
      }
      return next;
    });
  const togglePeriod = (months: number) =>
    setPeriods((prev) => (prev.includes(months) ? prev.filter((m) => m !== months) : [...prev, months].sort((a, b) => a - b)));

  const plannedCount = vendor
    ? vendor.items.filter((i) => selected.has(i.key)).reduce((n, i) => n + i.prices.filter((p) => periods.includes(p.months)).length, 0)
    : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!vendor || plannedCount === 0) return;
    setBusy(true);
    try {
      const res = await api.post<CatalogImportResult>("/vendor-catalog/import", {
        vendor: vendor.code,
        keys: [...selected],
        periods,
        vendorSharePercent: Number(share),
      });
      ui.toast(`Каталог ${vendor.name}: создано ${res.data.created}, обновлено ${res.data.updated}`, "success");
      onImported();
      onClose();
    } catch (err) {
      ui.toast(errorMessage(err, "Не удалось импортировать каталог"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Каталог вендоров"
      description="Прайс-листы вендоров зашиты в систему. Отметьте строки — они появятся в «Продуктах» с вендором, тарифом, ценой за выбранный срок и описанием. Повторный импорт обновит цены уже созданных продуктов."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" form="vendor-catalog-form" type="submit" icon={Download} loading={busy} disabled={plannedCount === 0}>
            Импортировать{plannedCount > 0 ? ` (${plannedCount})` : ""}
          </Button>
        </>
      }
    >
      {vendors === null ? (
        <div className="flex flex-col gap-2 pb-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <form id="vendor-catalog-form" onSubmit={submit} className="flex flex-col gap-4 pb-2">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Field label="Вендор">
              <Select
                value={vendorCode}
                onChange={(e) => {
                  const v = vendors.find((x) => x.code === e.target.value);
                  if (v) selectVendor(v);
                }}
              >
                {vendors.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Доля вендора, %" hint="Только для новых продуктов">
              <Input type="number" min="0" max="100" inputMode="numeric" value={share} onChange={(e) => setShare(e.target.value)} required />
            </Field>
            {vendor && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-muted">Периоды оплаты</span>
                <div className="flex flex-col gap-1.5 pt-1">
                  {vendor.periods.map((m) => (
                    <Checkbox key={m} label={m === 1 ? "Месяц" : `${m} мес.`} checked={periods.includes(m)} onChange={() => togglePeriod(m)} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {vendor && (
            <div className="flex flex-col gap-3">
              {groups.map(([group, items]) => {
                const allOn = items.every((i) => selected.has(i.key));
                return (
                  <section key={group} className="rounded-lg border border-line">
                    <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
                      <span className="text-sm font-semibold text-ink">{group}</span>
                      <button type="button" className="cursor-pointer text-xs text-accent hover:underline" onClick={() => toggleGroup(items)}>
                        {allOn ? "снять все" : "выбрать все"}
                      </button>
                    </header>
                    <ul className="divide-y divide-line">
                      {items.map((item) => (
                        <li key={item.key} className="flex items-start gap-3 px-3 py-2">
                          <Checkbox label="" checked={selected.has(item.key)} onChange={() => toggle(item.key)} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm text-ink">{item.name}</span>
                              <Badge tone="accent">{item.tariffName}</Badge>
                              {item.imported.map((p) => (
                                <Badge key={p.months} tone={p.isActive ? "income" : "neutral"}>
                                  в продуктах{p.months > 1 ? ` (${p.months} мес.)` : ""}
                                  {p.price !== (item.prices.find((x) => x.months === p.months)?.price ?? p.price) ? ` · цена ${formatMoney(p.price)}` : ""}
                                </Badge>
                              ))}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-muted">{item.features.join(", ")}</div>
                          </div>
                          <span className="shrink-0 text-right text-xs text-ink-muted tnum">
                            {item.kind === "free" ? (
                              <span className="text-sm font-medium text-ink">бесплатно</span>
                            ) : item.kind === "usage" ? (
                              <span className="text-sm font-medium text-ink">по токенам</span>
                            ) : (
                              item.prices.map((p) => (
                                <span key={p.months} className={`block ${periods.includes(p.months) ? "font-medium text-ink" : ""}`}>
                                  {p.months === 1 ? "мес." : `${p.months} мес.`} {formatMoney(p.price)}
                                </span>
                              ))
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
