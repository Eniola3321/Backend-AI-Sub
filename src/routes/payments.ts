// src/routes/payment.routes.ts

import express from "express";
import paymentController from "../controller/paymentController";
import { requireAuth } from "../middleware/auth";

const router = express.Router();

// Protected routes (require authentication)
router.post(
  "/initialize",
  requireAuth,
  paymentController.initializePayment.bind(paymentController)
);
router.get(
  "/verify/paystack/:reference",
  requireAuth,
  paymentController.verifyPaystackPayment.bind(paymentController)
);
router.get(
  "/verify/stripe/:sessionId",
  requireAuth,
  paymentController.verifyStripePayment.bind(paymentController)
);
router.get(
  "/status",
  requireAuth,
  paymentController.getPaymentStatus.bind(paymentController)
);
router.get(
  "/history",
  requireAuth,
  paymentController.getPaymentHistory.bind(paymentController)
);

export default router;
