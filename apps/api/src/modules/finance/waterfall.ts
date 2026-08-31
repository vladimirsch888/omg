import { config } from "../../config";

/**
 * The income "waterfall" for a single operation, e.g. a license sale:
 *
 *   amount received from client
 *     -> vendorCost   (vendorSharePercent % paid out to the licensing vendor;
 *                      0 for services/support income)
 *     -> taxBase      (what's left after the vendor cut)
 *     -> taxReserve   (taxReservePercent % of taxBase, set aside for the next
 *                      tax payment — skipped entirely when `taxable` is
 *                      false, e.g. an untaxed direct "card" transfer)
 *     -> spendable    (what's actually free to use right now)
 *
 * This mirrors how the business owner actually thinks about incoming money,
 * not a general ledger — it's a planning/cash-visibility layer on top of the
 * existing PnL/DDS reports, not a replacement for them.
 */
export interface WaterfallResult {
  amount: number;
  vendorCost: number;
  taxBase: number;
  taxReserve: number;
  spendable: number;
}

export function computeWaterfall(
  amount: number,
  vendorSharePercent: number,
  taxable: boolean
): WaterfallResult {
  const vendorCost = Math.round((amount * vendorSharePercent) / 100);
  const taxBase = amount - vendorCost;
  const taxReserve = taxable ? Math.round((taxBase * config.taxReservePercent) / 100) : 0;
  const spendable = taxBase - taxReserve;
  return { amount, vendorCost, taxBase, taxReserve, spendable };
}
