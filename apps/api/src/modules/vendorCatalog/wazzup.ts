/**
 * Wazzup price list (wazzup24.com, September 2026), transcribed from the
 * public tariff page. Prices are per channel per month in roubles; paying
 * for half a year gives −10 %, for a year −20 %. Empty `dialogs` means
 * unlimited; `writeFirst` / `groupChats` are omitted where the page does
 * not show the row for that channel.
 */
export interface WazzupTariff {
  channel: string;
  plan: "FREE" | "START" | "INBOX" | "PRO" | "MAX" | "WABA";
  pricePerMonth: number;
  writeFirst?: boolean;
  dialogs: number | null;
  groupChats?: boolean;
  audioTranscription: boolean;
}

export const WAZZUP_DISCOUNTS = { halfYearPercent: 10, yearPercent: 20 } as const;

export const WAZZUP_TARIFFS: WazzupTariff[] = [
  // WhatsApp
  { channel: "WhatsApp", plan: "START", pricePerMonth: 1000, writeFirst: true, dialogs: 50, groupChats: false, audioTranscription: false },
  { channel: "WhatsApp", plan: "INBOX", pricePerMonth: 2000, writeFirst: false, dialogs: 500, groupChats: false, audioTranscription: false },
  { channel: "WhatsApp", plan: "PRO", pricePerMonth: 4000, writeFirst: true, dialogs: 500, groupChats: true, audioTranscription: false },
  { channel: "WhatsApp", plan: "MAX", pricePerMonth: 6000, writeFirst: true, dialogs: null, groupChats: true, audioTranscription: true },
  // WABA (WhatsApp Business API) — single plan
  { channel: "WABA", plan: "WABA", pricePerMonth: 6000, writeFirst: true, dialogs: null, groupChats: false, audioTranscription: true },
  // Telegram Personal
  { channel: "Telegram Personal", plan: "START", pricePerMonth: 1000, writeFirst: true, dialogs: 50, groupChats: true, audioTranscription: false },
  { channel: "Telegram Personal", plan: "INBOX", pricePerMonth: 2000, writeFirst: false, dialogs: 500, groupChats: true, audioTranscription: false },
  { channel: "Telegram Personal", plan: "PRO", pricePerMonth: 4000, writeFirst: true, dialogs: 500, groupChats: true, audioTranscription: false },
  { channel: "Telegram Personal", plan: "MAX", pricePerMonth: 6000, writeFirst: true, dialogs: null, groupChats: true, audioTranscription: true },
  // Telegram Bot
  { channel: "Telegram Bot", plan: "FREE", pricePerMonth: 0, writeFirst: false, dialogs: 500, audioTranscription: false },
  { channel: "Telegram Bot", plan: "MAX", pricePerMonth: 4000, writeFirst: false, dialogs: null, audioTranscription: true },
  // MAX (messenger)
  { channel: "MAX", plan: "START", pricePerMonth: 1000, dialogs: 50, groupChats: true, audioTranscription: false },
  { channel: "MAX", plan: "INBOX", pricePerMonth: 2000, dialogs: 500, groupChats: true, audioTranscription: false },
  { channel: "MAX", plan: "PRO", pricePerMonth: 4000, dialogs: 500, groupChats: true, audioTranscription: false },
  { channel: "MAX", plan: "MAX", pricePerMonth: 6000, dialogs: null, groupChats: true, audioTranscription: true },
  // ВКонтакте
  { channel: "ВКонтакте", plan: "FREE", pricePerMonth: 0, writeFirst: false, dialogs: 500, audioTranscription: false },
  { channel: "ВКонтакте", plan: "MAX", pricePerMonth: 4000, writeFirst: false, dialogs: null, audioTranscription: true },
  // Instagram
  { channel: "Instagram", plan: "INBOX", pricePerMonth: 2000, writeFirst: false, dialogs: 500, groupChats: false, audioTranscription: false },
  { channel: "Instagram", plan: "MAX", pricePerMonth: 4000, writeFirst: false, dialogs: null, groupChats: false, audioTranscription: true },
  // Авито
  { channel: "Авито", plan: "INBOX", pricePerMonth: 2000, writeFirst: false, dialogs: 500, groupChats: false, audioTranscription: false },
  { channel: "Авито", plan: "MAX", pricePerMonth: 4000, writeFirst: false, dialogs: null, groupChats: false, audioTranscription: false },
];
