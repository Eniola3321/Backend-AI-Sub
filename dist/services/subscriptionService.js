"use strict";
// src/services/subscriptionService.ts
// Parses messages returned from Gmail API into subscription-like objects.
// This file contains heuristics — NOT perfect but practical. You can extend the provider list.
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSubscriptionsFromEmails = parseSubscriptionsFromEmails;
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
function guessProviderFromHeaders(payload) {
    if (!payload)
        return null;
    const headers = payload.headers || [];
    const from = headers
        .find((h) => h.name.toLowerCase() === "from")
        ?.value?.toLowerCase() || "";
    for (const p of knownProviders) {
        if (from.includes(p))
            return p;
    }
    return null;
}
function extractAmount(snippet) {
    // naive regex for amounts $12.99, USD 12.99, 12.99 USD
    const moneyRegex = /(?:USD|\$|EUR|€|NGN|₦)?\s?([0-9]+(?:[.,][0-9]{1,2})?)\s?(?:USD|EUR|NGN|NGN|₦)?/i;
    const m = snippet.match(moneyRegex);
    if (!m)
        return {};
    const raw = m[1].replace(",", ".");
    const num = parseFloat(raw);
    // currency detection
    const currency = snippet.includes("$")
        ? "USD"
        : snippet.includes("€")
            ? "EUR"
            : snippet.includes("₦")
                ? "NGN"
                : "USD";
    return { amount: num, currency };
}
function extractDates(snippet) {
    // Look for common date patterns YYYY-MM-DD, DD MMM YYYY, Month DD, YYYY, etc.
    // We'll try a few regexes:
    const iso = snippet.match(/\b(20\d{2}[-\/]\d{1,2}[-\/]\d{1,2})\b/);
    if (iso) {
        try {
            const d = new Date(iso[1]);
            return { start: d };
        }
        catch { }
    }
    // Match Month name patterns e.g. "August 12, 2025"
    const longDate = snippet.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}\b/i);
    if (longDate) {
        try {
            return { start: new Date(longDate[0]) };
        }
        catch { }
    }
    // fallback: none
    return { start: null, next: null };
}
function parseSubscriptionsFromEmails(msgs) {
    const results = [];
    for (const m of msgs) {
        const snippet = (m.snippet || "").toLowerCase();
        const providerFromHeader = guessProviderFromHeaders(m.payload);
        const provider = providerFromHeader ||
            knownProviders.find((p) => snippet.includes(p)) ||
            "unknown";
        // crude heuristics: if snippet contains "subscription" or "renew" or "receipt" or "invoice" treat as candidate
        if (!/(subscription|renew|renewal|invoice|receipt|charged|payment)/i.test(m.snippet || ""))
            continue;
        const { amount, currency } = extractAmount(m.snippet || "");
        const { start, next } = extractDates(m.snippet || "");
        // product name guess
        let product;
        const prodMatch = m.snippet?.match(/(plan|subscription|membership|premium|pro|plus|monthly|annual)[\s:]*([A-Za-z0-9 -]+)/i);
        if (prodMatch)
            product = prodMatch[2].trim().split("\n")[0];
        results.push({
            provider,
            product,
            amount,
            currency,
            startDate: start || null,
            nextBilling: next || null,
            rawData: {
                messageId: m.id,
                snippet: m.snippet,
            },
        });
    }
    // optionally dedupe by provider+product
    const grouped = new Map();
    for (const r of results) {
        const key = `${r.provider}::${r.product ?? "unknown"}`;
        if (!grouped.has(key))
            grouped.set(key, r);
    }
    return Array.from(grouped.values());
}
