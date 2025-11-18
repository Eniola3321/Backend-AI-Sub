"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanUserGmailForSubscriptions = scanUserGmailForSubscriptions;
// src/services/gmailService.ts
const googleapis_1 = require("googleapis");
const prisma_1 = require("../prisma");
const crypto_1 = require("../utils/crypto");
const subscriptionService_1 = require("./subscriptionService");
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const oauth2ClientFactory = (redirectUri) => new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
// fetch messages and run parser; save subscriptions into DB
async function scanUserGmailForSubscriptions(userId) {
    // locate token
    const token = await prisma_1.prisma.googleToken.findUnique({ where: { userId } });
    if (!token)
        throw new Error("No google token for user");
    const accessToken = (0, crypto_1.decrypt)(token.accessToken);
    const refreshToken = (0, crypto_1.decrypt)(token.refreshToken);
    const oauth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });
    const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
    // 1) list messages — we'll search for common subscription keywords and known senders
    // Note: Gmail API allows `q` parameter similar to search box (helps narrow down).
    const searchQueries = [
        'subject:(subscription OR receipt OR invoice OR "payment" OR "renewal" OR "FirstBank")',
        'from:billing OR from:receipt OR from:invoice OR "donotreply" OR "no-reply"',
        'subject:(welcome OR "your subscription")',
    ];
    const collectedEmails = [];
    for (const q of searchQueries) {
        try {
            const list = await gmail.users.messages.list({
                userId: "me",
                q,
                maxResults: 200,
            });
            const msgs = list.data.messages || [];
            for (const m of msgs) {
                collectedEmails.push({ id: m.id });
            }
        }
        catch (err) {
            console.error("Gmail list error", err);
        }
    }
    // Deduplicate ids
    const uniqueIds = Array.from(new Set(collectedEmails.map((x) => x.id))).slice(0, 500); // limit
    // Fetch message details in batches
    const detailed = [];
    for (const id of uniqueIds) {
        try {
            const resp = await gmail.users.messages.get({
                userId: "me",
                id,
                format: "full",
            });
            detailed.push({
                id,
                snippet: resp.data.snippet ?? undefined, // <-- turns null → undefined,
                payload: resp.data.payload,
            });
        }
        catch (err) {
            console.warn("Failed to get message", id, err);
        }
    }
    // 2) Parse subscriptions from messages
    const parsed = (0, subscriptionService_1.parseSubscriptionsFromEmails)(detailed);
    // 3) Upsert subscriptions into DB for user
    const saved = [];
    for (const p of parsed) {
        // crude matching: provider + product + user
        const existing = await prisma_1.prisma.subscription.findFirst({
            where: { userId, provider: p.provider, product: p.product },
        });
        if (existing) {
            const updated = await prisma_1.prisma.subscription.update({
                where: { id: existing.id },
                data: {
                    amount: p.amount ?? existing.amount,
                    currency: p.currency ?? existing.currency,
                    startDate: p.startDate ?? existing.startDate,
                    nextBilling: p.nextBilling ?? existing.nextBilling,
                    rawData: p.rawData ?? existing.rawData,
                },
            });
            saved.push(updated);
        }
        else {
            const created = await prisma_1.prisma.subscription.create({
                data: {
                    userId,
                    provider: p.provider,
                    product: p.product,
                    amount: p.amount,
                    currency: p.currency,
                    startDate: p.startDate,
                    nextBilling: p.nextBilling,
                    rawData: p.rawData,
                },
            });
            saved.push(created);
        }
    }
    return saved;
}
