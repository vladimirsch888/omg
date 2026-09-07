import { describe, expect, it } from "vitest";
import { VENDOR_CATALOG, findVendor, planProducts } from "../src/modules/vendorCatalog/catalog";

const wazzup = findVendor("wazzup")!;

describe("vendor catalog — Wazzup", () => {
  it("carries all eight channels from the price page", () => {
    const groups = new Set(wazzup.items.map((i) => i.group));
    expect([...groups]).toEqual(["WhatsApp", "WABA", "Telegram Personal", "Telegram Bot", "MAX", "ВКонтакте", "Instagram", "Авито"]);
    expect(wazzup.items).toHaveLength(21);
    expect(VENDOR_CATALOG.map((v) => v.code)).toContain("wazzup");
  });

  it("has unique keys and a tariff code on every item", () => {
    const keys = wazzup.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of wazzup.items) expect(item.tariffCode).toMatch(/^[a-z]+$/);
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
    expect(planned[2].description).toContain("скидкой 20 %");
    expect(planned.every((p) => p.pricePerSeat === 6000)).toBe(true);
  });

  it("keeps free tariffs free for every period", () => {
    const planned = planProducts(wazzup, ["telegram_bot:free"], [1, 12]);
    expect(planned.map((p) => p.price)).toEqual([0, 0]);
  });

  it("expands the whole list when no keys are given and skips unknown keys", () => {
    expect(planProducts(wazzup, null, [1])).toHaveLength(21);
    expect(planProducts(wazzup, ["no:such"], [1])).toHaveLength(0);
  });

  it("reads WABA as a single-plan channel", () => {
    const waba = wazzup.items.find((i) => i.key === "waba:waba")!;
    expect(waba.name).toBe("Wazzup WABA");
    expect(waba.pricePerMonth).toBe(6000);
    expect(waba.features).toContain("без групповых чатов");
  });
});
