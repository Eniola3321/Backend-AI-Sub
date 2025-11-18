// src/services/telegram.service.ts

import TelegramBot from "node-telegram-bot-api";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import {
  NotificationType,
  SendNotificationDTO,
  SubscriptionNotificationData,
} from "../types/telegram.types";
dotenv.config();
const prisma = new PrismaClient();

export class TelegramService {
  private bot: TelegramBot;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    this.bot = new TelegramBot(token, { polling: true });
    this.setupCommands();
  }

  /**
   * Setup bot commands and handlers
   */
  private setupCommands(): void {
    // Start command - Link Telegram account
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.text?.split(" ")[1]; // Format: /start USER_ID

      if (!userId) {
        await this.bot.sendMessage(
          chatId,
          "👋 Welcome to Subscription Tracker Bot!\n\n" +
            "To connect your account:\n" +
            "1. Go to your dashboard\n" +
            '2. Click "Connect Telegram"\n' +
            "3. Follow the instructions\n\n" +
            "⚠️ Note: You need to purchase the Telegram notification feature first!"
        );
        return;
      }

      await this.linkTelegramAccount(userId, BigInt(chatId));
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(
        chatId,
        "📚 *Available Commands:*\n\n" +
          "/start - Link your account\n" +
          "/status - Check notification status\n" +
          "/subscriptions - View your subscriptions\n" +
          "/settings - Notification settings\n" +
          "/unlink - Disconnect Telegram\n" +
          "/help - Show this message",
        { parse_mode: "Markdown" }
      );
    });

    // Status command
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      await this.checkUserStatus(BigInt(chatId));
    });

    // Subscriptions command
    this.bot.onText(/\/subscriptions/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showSubscriptions(BigInt(chatId));
    });

    // Settings command
    this.bot.onText(/\/settings/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showSettings(BigInt(chatId));
    });

    // Unlink command
    this.bot.onText(/\/unlink/, async (msg) => {
      const chatId = msg.chat.id;
      await this.unlinkTelegramAccount(BigInt(chatId));
    });
  }

  /**
   * Link Telegram account to user
   */
  async linkTelegramAccount(userId: string, chatId: bigint): Promise<void> {
    try {
      // Check if user exists and has paid for Telegram feature
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          hasPaidForTelegram: true,
          telegramChatId: true,
        },
      });

      if (!user) {
        await this.bot.sendMessage(
          Number(chatId),
          "❌ User not found. Please check your link."
        );
        return;
      }

      if (!user.hasPaidForTelegram) {
        await this.bot.sendMessage(
          Number(chatId),
          "⚠️ *Payment Required*\n\n" +
            "You need to purchase the Telegram notification feature first.\n\n" +
            "Go to your dashboard and complete the payment to enable notifications.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (user.telegramChatId && user.telegramChatId !== chatId) {
        await this.bot.sendMessage(
          Number(chatId),
          "⚠️ This account is already linked to another Telegram account.\n\n" +
            "Please unlink the previous account first."
        );
        return;
      }

      // Link the account
      await prisma.user.update({
        where: { id: userId },
        data: { telegramChatId: chatId },
      });

      await this.bot.sendMessage(
        Number(chatId),
        `✅ *Account Linked Successfully!*\n\n` +
          `👤 Name: ${user.name || "Not set"}\n` +
          `📧 Email: ${user.email}\n\n` +
          `You will now receive notifications about your subscriptions.\n\n` +
          `Use /help to see available commands.`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error linking Telegram account:", error);
      await this.bot.sendMessage(
        Number(chatId),
        "❌ Failed to link account. Please try again later."
      );
    }
  }

  /**
   * Unlink Telegram account
   */
  async unlinkTelegramAccount(chatId: bigint): Promise<void> {
    try {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
      });

      if (!user) {
        await this.bot.sendMessage(
          Number(chatId),
          "⚠️ No linked account found."
        );
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: null },
      });

      await this.bot.sendMessage(
        Number(chatId),
        "✅ Account unlinked successfully!\n\n" +
          "You can link again anytime using the dashboard."
      );
    } catch (error) {
      console.error("Error unlinking Telegram account:", error);
      await this.bot.sendMessage(
        Number(chatId),
        "❌ Failed to unlink account. Please try again later."
      );
    }
  }

  /**
   * Check user status
   */
  async checkUserStatus(chatId: bigint): Promise<void> {
    try {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        include: {
          subscriptions: {
            where: { status: "active" },
            orderBy: { nextBilling: "asc" },
          },
        },
      });

      if (!user) {
        await this.bot.sendMessage(
          Number(chatId),
          "⚠️ No linked account found.\n\nUse /start to link your account."
        );
        return;
      }

      const activeSubscriptions = user.subscriptions.length;
      const upcomingRenewals = user.subscriptions.filter((sub) => {
        if (!sub.nextBilling) return false;
        const daysUntil = Math.ceil(
          (new Date(sub.nextBilling).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        );
        return daysUntil <= 7;
      }).length;

      await this.bot.sendMessage(
        Number(chatId),
        `📊 *Your Status*\n\n` +
          `👤 Name: ${user.name || "Not set"}\n` +
          `📧 Email: ${user.email}\n` +
          `📱 Telegram: Connected ✅\n\n` +
          `📦 Active Subscriptions: ${activeSubscriptions}\n` +
          `⏰ Renewals in 7 days: ${upcomingRenewals}\n\n` +
          `Use /subscriptions to view details.`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error checking user status:", error);
      await this.bot.sendMessage(
        Number(chatId),
        "❌ Failed to fetch status. Please try again later."
      );
    }
  }

  /**
   * Show user subscriptions
   */
  async showSubscriptions(chatId: bigint): Promise<void> {
    try {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        include: {
          subscriptions: {
            where: { status: "active" },
            orderBy: { nextBilling: "asc" },
          },
        },
      });

      if (!user) {
        await this.bot.sendMessage(
          Number(chatId),
          "⚠️ No linked account found."
        );
        return;
      }

      if (user.subscriptions.length === 0) {
        await this.bot.sendMessage(
          Number(chatId),
          "📭 *No Active Subscriptions*\n\n" +
            "Run an email scan from your dashboard to find your subscriptions.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      let message = "📦 *Your Active Subscriptions:*\n\n";

      user.subscriptions.forEach((sub, index) => {
        const nextBilling = sub.nextBilling
          ? new Date(sub.nextBilling).toLocaleDateString()
          : "Unknown";

        const amount =
          sub.amount && sub.currency
            ? `${sub.currency} ${sub.amount.toFixed(2)}`
            : "Unknown";

        const daysUntil = sub.nextBilling
          ? Math.ceil(
              (new Date(sub.nextBilling).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24)
            )
          : null;

        let urgency = "";
        if (daysUntil !== null) {
          if (daysUntil <= 3) urgency = "🔴";
          else if (daysUntil <= 7) urgency = "🟡";
          else urgency = "🟢";
        }

        message += `${urgency} *${index + 1}. ${sub.provider}*\n`;
        if (sub.product) message += `   Product: ${sub.product}\n`;
        message += `   Amount: ${amount}\n`;
        message += `   Next Billing: ${nextBilling}\n`;
        if (daysUntil !== null) {
          message += `   Days until renewal: ${daysUntil}\n`;
        }
        message += "\n";
      });

      await this.bot.sendMessage(Number(chatId), message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Error showing subscriptions:", error);
      await this.bot.sendMessage(
        Number(chatId),
        "❌ Failed to fetch subscriptions. Please try again later."
      );
    }
  }

  /**
   * Show notification settings
   */
  async showSettings(chatId: bigint): Promise<void> {
    await this.bot.sendMessage(
      Number(chatId),
      "⚙️ *Notification Settings*\n\n" +
        "Current notifications:\n" +
        "✅ Expiring subscriptions (7 days)\n" +
        "✅ Expired subscriptions\n" +
        "✅ New subscriptions found\n" +
        "✅ Scan completion\n\n" +
        "Settings can be customized in your dashboard.",
      { parse_mode: "Markdown" }
    );
  }

  /**
   * Send notification to user
   */
  async sendNotification(data: SendNotificationDTO): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: {
          telegramChatId: true,
          hasPaidForTelegram: true,
        },
      });

      if (!user || !user.telegramChatId || !user.hasPaidForTelegram) {
        console.log(
          `User ${data.userId} not eligible for Telegram notifications`
        );
        return false;
      }

      const message = this.formatNotificationMessage(data.type, data.data);

      await this.bot.sendMessage(Number(user.telegramChatId), message, {
        parse_mode: "Markdown",
      });

      return true;
    } catch (error) {
      console.error("Error sending Telegram notification:", error);
      return false;
    }
  }

  /**
   * Format notification message based on type
   */
  private formatNotificationMessage(
    type: NotificationType,
    data: SubscriptionNotificationData
  ): string {
    switch (type) {
      case NotificationType.SUBSCRIPTION_EXPIRING:
        return (
          `⏰ *Subscription Expiring Soon!*\n\n` +
          `Provider: ${data.provider}\n` +
          `${data.product ? `Product: ${data.product}\n` : ""}` +
          `Expires in: ${data.daysUntilExpiry} days\n` +
          `Next Billing: ${
            data.nextBilling
              ? new Date(data.nextBilling).toLocaleDateString()
              : "N/A"
          }\n` +
          `Amount: ${data.currency} ${data.amount?.toFixed(2)}\n\n` +
          `Don't forget to renew or cancel if not needed!`
        );

      case NotificationType.SUBSCRIPTION_EXPIRED:
        return (
          `❌ *Subscription Expired*\n\n` +
          `Provider: ${data.provider}\n` +
          `${data.product ? `Product: ${data.product}\n` : ""}` +
          `Expired on: ${
            data.expiryDate
              ? new Date(data.expiryDate).toLocaleDateString()
              : "Recently"
          }\n\n` +
          `Your subscription has expired. Renew to continue using the service.`
        );

      case NotificationType.NEW_SUBSCRIPTION_FOUND:
        return (
          `🆕 *New Subscription Found!*\n\n` +
          `Provider: ${data.provider}\n` +
          `${data.product ? `Product: ${data.product}\n` : ""}` +
          `${
            data.amount && data.currency
              ? `Amount: ${data.currency} ${data.amount.toFixed(2)}\n`
              : ""
          }` +
          `${
            data.nextBilling
              ? `Next Billing: ${new Date(
                  data.nextBilling
                ).toLocaleDateString()}\n`
              : ""
          }` +
          `\nWe found this subscription in your emails!`
        );

      case NotificationType.SCAN_COMPLETED:
        return (
          `✅ *Email Scan Completed!*\n\n` +
          `Found ${data.provider} subscription(s).\n\n` +
          `Check your dashboard for details or use /subscriptions command.`
        );

      case NotificationType.PAYMENT_REMINDER:
        return (
          `💳 *Payment Reminder*\n\n` +
          `Provider: ${data.provider}\n` +
          `${data.product ? `Product: ${data.product}\n` : ""}` +
          `Amount: ${data.currency} ${data.amount?.toFixed(2)}\n` +
          `Due Date: ${
            data.nextBilling
              ? new Date(data.nextBilling).toLocaleDateString()
              : "Soon"
          }\n\n` +
          `Make sure you have sufficient funds for the upcoming payment.`
        );

      default:
        return "You have a new notification!";
    }
  }

  /**
   * Send bulk notifications (for scheduled jobs)
   */
  async sendBulkNotifications(
    userIds: string[],
    type: NotificationType,
    getData: (userId: string) => Promise<SubscriptionNotificationData | null>
  ): Promise<void> {
    for (const userId of userIds) {
      try {
        const data = await getData(userId);
        if (data) {
          await this.sendNotification({ userId, type, data });
        }
      } catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error);
      }
    }
  }

  /**
   * Generate Telegram link for user (used in dashboard)
   */
  generateTelegramLink(userId: string): string {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME!;
    return `https://t.me/${botUsername}?start=${userId}`;
  }
}

export default new TelegramService();
