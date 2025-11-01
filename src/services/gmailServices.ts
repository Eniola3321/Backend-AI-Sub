// src/services/gmailService.ts
import { google } from "googleapis";
import { prisma } from "../prisma";
import { decrypt } from "../utils/crypto";
import { parseSubscriptionsFromEmails } from "./subscriptionService";
import { addDays } from "date-fns";
import subs from "../data/subs.json";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

/**
 * 🔍 Decode Gmail message body safely
 */
function getMessageBody(payload: any): string {
  if (!payload) return "";

  // Check direct body data
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64").toString("utf8");
    return decoded;
  }

  // If multipart, search for text/plain or text/html
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" || part.mimeType === "text/html") {
        if (part.body?.data) {
          const decoded = Buffer.from(part.body.data, "base64").toString(
            "utf8"
          );
          return decoded;
        }
      }
      // recursive search for nested multipart/alternative sections
      const nested = getMessageBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

// fetch messages and run parser; save subscriptions into DB
export async function scanUserGmailForSubscriptions(userId: string) {
  const token = await prisma.googleToken.findUnique({ where: { userId } });
  if (!token) throw new Error("No google token for user");

  const accessToken = decrypt(token.accessToken);
  const refreshToken = decrypt(token.refreshToken);
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // ⚡ Only fetch emails from the past year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const afterTimestamp = Math.floor(oneYearAgo.getTime() / 1000);

  // ⚡ Smart search using subs.json names
  const keywordQueries = subs.map(
    (name) =>
      `after:${afterTimestamp} (subject:${name} OR from:${name} OR "${name}")`
  );

  if (keywordQueries.length === 0) {
    keywordQueries.push(
      `after:${afterTimestamp} subject:(subscription OR invoice OR payment)`
    );
  }

  const collectedEmails: { id: string }[] = [];

  for (const q of keywordQueries) {
    try {
      const list = await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults: 100,
      });
      const msgs = list.data.messages || [];
      for (const m of msgs) collectedEmails.push({ id: m.id! });
    } catch (err) {
      console.error("⚠️ Gmail list error:", err);
    }
  }

  // 🧩 Remove duplicates
  const uniqueIds = Array.from(new Set(collectedEmails.map((x) => x.id))).slice(
    0,
    400
  );

  // 🧠 Fetch message details with HTML decoding
  const detailed: { id: string; snippet?: string; payload?: any }[] = [];

  for (const id of uniqueIds) {
    try {
      const resp = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });

      // Decode body content
      const decodedBody = getMessageBody(resp.data.payload);
      const combinedSnippet = [resp.data.snippet ?? "", decodedBody ?? ""].join(
        "\n"
      );

      detailed.push({
        id,
        snippet: combinedSnippet,
        payload: resp.data.payload,
      });
    } catch (err) {
      console.warn("⚠️ Failed to get message", id, err);
    }
  }

  // 🔍 Parse using improved snippet content
  const parsed = parseSubscriptionsFromEmails(detailed);

  // 💾 Save or update
  const saved: any[] = [];
  for (const p of parsed) {
    const existing = await prisma.subscription.findFirst({
      where: { userId, provider: p.provider, product: p.product },
    });

    const nextBilling =
      p.nextBilling ?? (p.startDate ? addDays(p.startDate, 30) : null);

    if (existing) {
      const updated = await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          amount: p.amount ?? existing.amount,
          currency: p.currency ?? existing.currency,
          startDate: p.startDate ?? existing.startDate,
          nextBilling,
          rawData: p.rawData ?? existing.rawData,
        },
      });
      saved.push(updated);
    } else {
      const created = await prisma.subscription.create({
        data: {
          userId,
          provider: p.provider,
          product: p.product,
          amount: p.amount,
          currency: p.currency,
          startDate: p.startDate,
          nextBilling,
          rawData: p.rawData,
        },
      });
      saved.push(created);
    }
  }

  return saved;
}
