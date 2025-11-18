// src/controllers/telegram.controller.ts

import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import telegramService from "../services/telegramService";
import { NotificationType } from "../types/telegram.types";

const prisma = new PrismaClient();

export class TelegramController {
  /**
   * Get Telegram connection link
   * GET /api/telegram/link
   */
  async getTelegramLink(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      // Check if user has paid for Telegram feature
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          hasPaidForTelegram: true,
          telegramChatId: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (!user.hasPaidForTelegram) {
        res.status(403).json({
          success: false,
          message: "Please purchase the Telegram notification feature first",
          requiresPayment: true,
          paymentType: "telegram",
        });
        return;
      }

      const link = telegramService.generateTelegramLink(userId);
      const isConnected = user.telegramChatId !== null;

      res.status(200).json({
        success: true,
        data: {
          link,
          isConnected,
          instructions: [
            "Click the link below to open Telegram",
            'Press "Start" or send /start',
            "Your account will be linked automatically",
          ],
        },
      });
    } catch (error: any) {
      console.error("Get Telegram link error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to generate Telegram link",
      });
    }
  }

  /**
   * Get Telegram connection status
   * GET /api/telegram/status
   */
  async getConnectionStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          telegramChatId: true,
          hasPaidForTelegram: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          isConnected: user.telegramChatId !== null,
          hasPaidForFeature: user.hasPaidForTelegram,
          chatId: user.telegramChatId ? String(user.telegramChatId) : null,
        },
      });
    } catch (error: any) {
      console.error("Get connection status error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get connection status",
      });
    }
  }

  /**
   * Disconnect Telegram
   * POST /api/telegram/disconnect
   */
  async disconnectTelegram(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      await prisma.user.update({
        where: { id: userId },
        data: { telegramChatId: null },
      });

      res.status(200).json({
        success: true,
        message: "Telegram disconnected successfully",
      });
    } catch (error: any) {
      console.error("Disconnect Telegram error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to disconnect Telegram",
      });
    }
  }

  /**
   * Test notification (for development)
   * POST /api/telegram/test
   */
  async testNotification(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          telegramChatId: true,
          hasPaidForTelegram: true,
        },
      });

      if (!user?.telegramChatId || !user.hasPaidForTelegram) {
        res.status(400).json({
          success: false,
          message: "Telegram not connected or feature not purchased",
        });
        return;
      }

      // Send test notification
      const sent = await telegramService.sendNotification({
        userId,
        type: NotificationType.NEW_SUBSCRIPTION_FOUND,
        data: {
          provider: "Test Service",
          product: "Premium Plan",
          amount: 9.99,
          currency: "USD",
          nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      if (sent) {
        res.status(200).json({
          success: true,
          message: "Test notification sent successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to send test notification",
        });
      }
    } catch (error: any) {
      console.error("Test notification error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to send test notification",
      });
    }
  }

  /**
   * Send notification about subscription expiring
   * (Called by subscription scanning service)
   */
  async notifySubscriptionExpiring(
    userId: string,
    subscriptionData: any
  ): Promise<boolean> {
    try {
      return await telegramService.sendNotification({
        userId,
        type: NotificationType.SUBSCRIPTION_EXPIRING,
        data: {
          provider: subscriptionData.provider,
          product: subscriptionData.product,
          amount: subscriptionData.amount,
          currency: subscriptionData.currency,
          nextBilling: subscriptionData.nextBilling,
          daysUntilExpiry: Math.ceil(
            (new Date(subscriptionData.nextBilling).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          ),
        },
      });
    } catch (error) {
      console.error("Error sending expiring notification:", error);
      return false;
    }
  }

  /**
   * Send notification about new subscription found
   * (Called by email scanning service)
   */
  async notifyNewSubscriptionFound(
    userId: string,
    subscriptionData: any
  ): Promise<boolean> {
    try {
      return await telegramService.sendNotification({
        userId,
        type: NotificationType.NEW_SUBSCRIPTION_FOUND,
        data: {
          provider: subscriptionData.provider,
          product: subscriptionData.product,
          amount: subscriptionData.amount,
          currency: subscriptionData.currency,
          nextBilling: subscriptionData.nextBilling,
        },
      });
    } catch (error) {
      console.error("Error sending new subscription notification:", error);
      return false;
    }
  }

  /**
   * Send notification about scan completion
   * (Called by email scanning service)
   */
  async notifyScanCompleted(
    userId: string,
    subscriptionsCount: number
  ): Promise<boolean> {
    try {
      return await telegramService.sendNotification({
        userId,
        type: NotificationType.SCAN_COMPLETED,
        data: {
          provider: String(subscriptionsCount),
        },
      });
    } catch (error) {
      console.error("Error sending scan completed notification:", error);
      return false;
    }
  }
}

export default new TelegramController();
