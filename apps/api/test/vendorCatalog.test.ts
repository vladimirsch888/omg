import { describe, expect, it } from "vitest";
import { VENDOR_CATALOG, findVendor, planProducts } from "../src/modules/vendorCatalog/catalog";

const wazzup = findVendor("wazzup")!;
const nova = findVendor("nova")!;

describe("vendor catalog — Wazzup", () => {
  it("carries all eight channels from the price page", () => {
    const groups = new Set(wazzup.items.map((i) => i.group));
    expect([...groups]).toEqual(["WhatsApp", "WABA", "Telegram Personal", "Telegram Bot", "MAX", "ВКонтакте", "Instagram", "Авито"]);
    expect(wazzup.items).toHaveLength(21);
    expect(VENDOR_CATALOG.map((v) => v.code)).toEqual(["wazzup", "nova"]);
  });

  it("prices a yearly product with the vendor's discount, rounded to the rouble", () => {
    const planned = planProducts(wazzup, ["whatsapp:max"], [1, 6, 12]);
    expect(planned.map((p) => [p.durationMonths, p.price])).toEqual([
      [1, 6000],
      [6, 32400], // 6 × 6 000 − 10 %
      [12, 57600], // 12 × 6 000 − 20 %
    ]);
    expect(planned[0].catalogKey).toBe("wazzup:whatsapp:max:1");
    expect(planned[2].name).toBe("Wazzup WhatsApp MAX, 12 мес.");
    expect(planned.every((p) => p.pricePerSeat === 6000)).toBe(true);
  });

  it("keeps free tariffs free for every term", () => {
    const free = wazzup.items.find((i) => i.key === "telegram_bot:free")!;
    expect(free.kind).toBe("free");
    expect(planProducts(wazzup, ["telegram_bot:free"], [1, 12]).map((p) => p.price)).toEqual([0, 0]);
  });

  it("reads WABA as a single-plan channel", () => {
    const waba = wazzup.items.find((i) => i.key === "waba:waba")!;
    expect(waba.name).toBe("Wazzup WABA");
    expect(waba.features).toContain("без групповых чатов");
  });
});

describe("vendor catalog — NOVA", () => {
  it("has the widgets without Kommo, split into paid, free and usage-billed", () => {
    expect(nova.items).toHaveLength(95);
    expect(nova.items.some((i) => i.name.includes("Kommo"))).toBe(false);
    const byKind = { paid: 0, free: 0, usage: 0 };
    for (const i of nova.items) byKind[i.kind]++;
    expect(byKind).toEqual({ paid: 64, free: 26, usage: 5 });
    expect(nova.periods).toEqual([6, 12, 24]);
    expect(nova.defaultMonths).toBe(12);
  });

  it("uses the fixed per-term prices from the page and no per-seat price", () => {
    const formulas = nova.items.find((i) => i.name === "NOVA Формулы 3.0")!;
    expect(formulas.prices).toEqual([
      { months: 6, price: 5994 },
      { months: 12, price: 9990 },
      { months: 24, price: 17982 },
    ]);
    expect(formulas.pricePerSeat).toBeNull();
    expect(formulas.features).toEqual(["виджет для amoCRM", "продление за отзыв"]);
    const reports = nova.items.find((i) => i.name === "NOVA Отчеты в Google таблицах")!;
    expect(reports.prices.find((p) => p.months === 24)?.price).toBe(53982);
    expect(reports.features).not.toContain("продление за отзыв");
  });

  it("skips terms the vendor does not sell", () => {
    expect(planProducts(nova, ["widget:формулы_3_0"], [1])).toHaveLength(0);
    const planned = planProducts(nova, ["widget:формулы_3_0"], [12]);
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ catalogKey: "nova:widget:формулы_3_0:12", name: "NOVA Формулы 3.0, 12 мес.", price: 9990, durationMonths: 12 });
  });

  it("has unique keys across every vendor", () => {
    for (const v of VENDOR_CATALOG) {
      const keys = v.items.map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
