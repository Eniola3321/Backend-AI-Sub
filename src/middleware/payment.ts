// src/middlewares/payment.middleware.ts
// Middleware to check if user has paid before accessing features

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Check if user has paid for email scanning feature
 */
export const checkScanningAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
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
      select: { hasPaidForScanning: true },
    });

    if (!user?.hasPaidForScanning) {
      res.status(403).json({
        success: false,
        message:
          "Please purchase email scanning feature to access this functionality",
        requiresPayment: true,
        paymentType: "scanning",
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Check scanning access error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify access",
    });
  }
};

/**
 * Check if user has paid for Telegram notifications
 */
export const checkTelegramAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
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
      select: { hasPaidForTelegram: true },
    });

    if (!user?.hasPaidForTelegram) {
      res.status(403).json({
        success: false,
        message:
          "Please purchase Telegram notifications feature to access this functionality",
        requiresPayment: true,
        paymentType: "telegram",
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Check telegram access error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify access",
    });
  }
};
