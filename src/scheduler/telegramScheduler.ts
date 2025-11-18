// src/schedulers/telegram.scheduler.ts
// This file handles scheduled notifications (cron jobs)

import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import telegramService from "../services/telegramService";
import { NotificationType } from "../types/telegram.types";

const prisma = new PrismaClient();

export class TelegramScheduler {
  /**
   * Start all scheduled jobs
   */
  start(): void {
    // Check for expiring subscriptions every day at 9 AM
    cron.schedule("0 9 * * *", async () => {
      console.log("Running daily expiring subscriptions check...");
      await this.checkExpiringSubscriptions();
    });

    // Check for expired subscriptions every day at 10 AM
    cron.schedule("0 10 * * *", async () => {
      console.log("Running daily expired subscriptions check...");
      await this.checkExpiredSubscriptions();
    });

    // Weekly reminder on Sundays at 8 AM
    cron.schedule("0 8 * * 0", async () => {
      console.log("Running weekly subscription summary...");
      await this.sendWeeklySummary();
    });

    console.log("✅ Telegram notification scheduler started");
  }

  /**
   * Check for subscriptions expiring in 7, 3, and 1 day(s)
   */
  private async checkExpiringSubscriptions(): Promise<void> {
    try {
      const now = new Date();
      const dayRanges = [
        { days: 7, start: 7, end: 8 },
        { days: 3, start: 3, end: 4 },
        { days: 1, start: 1, end: 2 },
      ];

      for (const range of dayRanges) {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() + range.start);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + range.end);
        endDate.setHours(23, 59, 59, 999);

        const subscriptions = await prisma.subscription.findMany({
          where: {
            status: "active",
            nextBilling: {
              gte: startDate,
              lte: endDate,
            },
            user: {
              hasPaidForTelegram: true,
              telegramChatId: { not: null },
            },
          },
          include: {
            user: {
              select: {
                id: true,
                telegramChatId: true,
              },
            },
          },
        });

        console.log(
          `Found ${subscriptions.length} subscriptions expiring in ${range.days} day(s)`
        );

        for (const subscription of subscriptions) {
          await telegramService.sendNotification({
            userId: subscription.user.id,
            type: NotificationType.SUBSCRIPTION_EXPIRING,
            data: {
              provider: subscription.provider,
              product: subscription.product,
              amount: subscription.amount,
              currency: subscription.currency,
              nextBilling: subscription.nextBilling,
              daysUntilExpiry: range.days,
            },
          });
        }
      }
    } catch (error) {
      console.error("Error checking expiring subscriptions:", error);
    }
  }

  /**
   * Check for expired subscriptions
   */
  private async checkExpiredSubscriptions(): Promise<void> {
    try {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const subscriptions = await prisma.subscription.findMany({
        where: {
          status: "active",
          OR: [
            {
              expiryDate: {
                gte: yesterday,
                lte: now,
              },
            },
            {
              nextBilling: {
                gte: yesterday,
                lte: now,
              },
            },
          ],
          user: {
            hasPaidForTelegram: true,
            telegramChatId: { not: null },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              telegramChatId: true,
            },
          },
        },
      });

      console.log(`Found ${subscriptions.length} expired subscriptions`);

      for (const subscription of subscriptions) {
        await telegramService.sendNotification({
          userId: subscription.user.id,
          type: NotificationType.SUBSCRIPTION_EXPIRED,
          data: {
            provider: subscription.provider,
            product: subscription.product,
            expiryDate: subscription.expiryDate || subscription.nextBilling,
          },
        });

        // Update subscription status
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: "expired" },
        });
      }
    } catch (error) {
      console.error("Error checking expired subscriptions:", error);
    }
  }

  /**
   * Send weekly summary
   */
  private async sendWeeklySummary(): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        where: {
          hasPaidForTelegram: true,
          telegramChatId: { not: null },
        },
        include: {
          subscriptions: {
            where: { status: "active" },
          },
        },
      });

      console.log(`Sending weekly summary to ${users.length} users`);

      for (const user of users) {
        if (user.subscriptions.length === 0) continue;

        // Calculate total monthly spending
        const totalSpending = user.subscriptions.reduce((sum, sub) => {
          return sum + (sub.amount || 0);
        }, 0);

        // Count upcoming renewals (next 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const upcomingRenewals = user.subscriptions.filter((sub) => {
          return (
            sub.nextBilling && new Date(sub.nextBilling) <= thirtyDaysFromNow
          );
        }).length;

        const message =
          `📊 *Weekly Subscription Summary*\n\n` +
          `Active Subscriptions: ${user.subscriptions.length}\n` +
          `Monthly Spending: ${
            user.subscriptions[0]?.currency || "USD"
          } ${totalSpending.toFixed(2)}\n` +
          `Renewals in 30 days: ${upcomingRenewals}\n\n` +
          `Use /subscriptions to view details.`;

        if (user.telegramChatId) {
          await telegramService["bot"].sendMessage(
            Number(user.telegramChatId),
            message,
            { parse_mode: "Markdown" }
          );
        }
      }
    } catch (error) {
      console.error("Error sending weekly summary:", error);
    }
  }
}

export default new TelegramScheduler();
