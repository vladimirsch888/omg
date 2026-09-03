import { describe, expect, it } from "vitest";
import { computeWaterfall } from "../src/modules/finance/waterfall";

describe("computeWaterfall", () => {
  it("takes the vendor share first, then the tax reserve from what is left", () => {
    const r = computeWaterfall(100_000, 50, true);
    expect(r.vendorCost).toBe(50_000);
    expect(r.taxBase).toBe(50_000);
    expect(r.taxReserve).toBe(3_500); // 7 % of 50 000
    expect(r.spendable).toBe(46_500);
  });

  it("skips the tax reserve for untaxed income but still pays the vendor", () => {
    const r = computeWaterfall(6_000, 50, false);
    expect(r.vendorCost).toBe(3_000);
    expect(r.taxReserve).toBe(0);
    expect(r.spendable).toBe(3_000);
  });

  it("own services have no vendor cut", () => {
    const r = computeWaterfall(30_000, 0, true);
    expect(r.vendorCost).toBe(0);
    expect(r.taxReserve).toBe(2_100);
    expect(r.spendable).toBe(27_900);
  });
});
