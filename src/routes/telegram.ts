// src/routes/telegram.routes.ts

import express from "express";
import telegramController from "../controller/telegramController";
import { requireAuth } from "../middleware/auth";
import { checkTelegramAccess } from "../middleware/payment";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Get Telegram connection link (requires payment)
router.get(
  "/link",
  checkTelegramAccess,
  telegramController.getTelegramLink.bind(telegramController)
);

// Get connection status (no payment required - just to check status)
router.get(
  "/status",
  telegramController.getConnectionStatus.bind(telegramController)
);

// Disconnect Telegram (requires payment to have been made before)
router.post(
  "/disconnect",
  checkTelegramAccess,
  telegramController.disconnectTelegram.bind(telegramController)
);

// Test notification (requires payment and connection)
router.post(
  "/test",
  checkTelegramAccess,
  telegramController.testNotification.bind(telegramController)
);

export default router;
