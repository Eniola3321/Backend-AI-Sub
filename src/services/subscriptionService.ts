// src/services/subscriptionService.ts
import { parseISO, addDays } from "date-fns";
import subs from "../data/subs.json"; // ✅ load known subscriptions

type EmailMsg = { id: string; snippet?: string; payload?: any };

interface ParsedSub {
  provider: string;
  product?: string;
  amount?: number;
  currency?: string;
  startDate?: Date | null;
  nextBilling?: Date | null;
  rawData?: any;
}

const knownProviders = [
  "openai",
  "perplexity",
  "claude",
  "spotify",
  "youtube",
  "netflix",
  "stripe",
  "apple",
  "amazon",
];

// 🧩 Guess provider from email headers
function guessProviderFromHeaders(payload: any): string | null {
  if (!payload) return null;
  const headers = payload.headers || [];
  const from =
    headers
      .find((h: any) => h.name.toLowerCase() === "from")
      ?.value?.toLowerCase() || "";
  for (const p of knownProviders) {
    if (from.includes(p)) return p;
  }
  return null;
}

// 💰 Extract amount + currency
function extractAmount(snippet: string): {
  amount?: number;
  currency?: string;
} {
  const moneyRegex =
    /(?:USD|\$|EUR|€|NGN|₦)?\s?([0-9]+(?:[.,][0-9]{1,2})?)\s?(?:USD|EUR|NGN|₦)?/i;
  const m = snippet.match(moneyRegex);
  if (!m) return {};
  const raw = m[1].replace(",", ".");
  const num = parseFloat(raw);
  const currency = snippet.includes("$")
    ? "USD"
    : snippet.includes("€")
    ? "EUR"
    : snippet.includes("₦")
    ? "NGN"
    : "USD";
  return { amount: num, currency };
}

// 📅 Extract possible dates (start or next billing)
function extractDates(snippet: string): {
  start?: Date | null;
  next?: Date | null;
} {
  const iso = snippet.match(/\b(20\d{2}[-\/]\d{1,2}[-\/]\d{1,2})\b/);
  if (iso) {
    try {
      const d = new Date(iso[1]);
      return { start: d, next: addDays(d, 30) }; // assume monthly if only one date found
    } catch {}
  }

  const longDate = snippet.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}\b/i
  );
  if (longDate) {
    try {
      const d = new Date(longDate[0]);
      return { start: d, next: addDays(d, 30) };
    } catch {}
  }

  return { start: null, next: null };
}

export function parseSubscriptionsFromEmails(msgs: EmailMsg[]): ParsedSub[] {
  const results: ParsedSub[] = [];

  const subscriptionKeywords = [
    "subscription",
    "renewal",
    "renewed",
    "payment",
    "invoice",
    "charged",
    "billed",
    "receipt",
    "plan",
    "auto-renew",
    "membership",
  ];

  const brandKeywords = subs.map((s) => s.toLowerCase());

  for (const m of msgs) {
    const snippet = (m.snippet || "").toLowerCase();
    const providerFromHeader = guessProviderFromHeaders(m.payload);

    const hasBrand = brandKeywords.some((b) => snippet.includes(b));
    const hasPayment = subscriptionKeywords.some((k) => snippet.includes(k));
    if (!hasBrand || !hasPayment) continue;

    if (!snippet.match(/\$|₦|€|£|\d{1,5}\s?(usd|ngn|eur|gbp)/i)) continue;

    const provider =
      providerFromHeader ||
      knownProviders.find((p) => snippet.includes(p)) ||
      "unknown";

    const { amount, currency } = extractAmount(m.snippet || "");
    const { start, next } = extractDates(m.snippet || "");

    let product: string | undefined;
    const prodMatch = m.snippet?.match(
      /(plan|subscription|membership|premium|pro|plus|monthly|annual)[\s:]*([A-Za-z0-9 -]+)/i
    );
    if (prodMatch) product = prodMatch[2].trim().split("\n")[0];

    results.push({
      provider,
      product,
      amount,
      currency,
      startDate: start || null,
      nextBilling: next || (start ? addDays(start, 30) : null),
      rawData: {
        messageId: m.id,
        snippet: m.snippet,
      },
    });
  }

  // Deduplicate
  const grouped = new Map<string, ParsedSub>();
  for (const r of results) {
    const key = `${r.provider}::${r.product ?? "unknown"}`;
    if (!grouped.has(key)) grouped.set(key, r);
  }

  return Array.from(grouped.values());
}
