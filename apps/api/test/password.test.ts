import { describe, expect, it } from "vitest";
import { passwordSchema } from "../src/utils/password";
import { toCsv } from "../src/modules/export/csv";

describe("passwordSchema", () => {
  it("rejects short, repeated and all-digit passwords", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("11111111").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
  });

  it("accepts an ordinary password", () => {
    expect(passwordSchema.safeParse("viewer-pass-1").success).toBe(true);
  });
});

describe("toCsv", () => {
  it("writes Excel-friendly CSV: BOM, semicolons, decimal comma, quoted text", () => {
    const csv = toCsv(["Название", "Сумма"], [['ООО "Ромашка"; клиент', 1234.5]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"ООО ""Ромашка""; клиент";1234,5');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
