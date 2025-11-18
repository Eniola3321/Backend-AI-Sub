// src/routes/webhook.routes.ts

import express from "express";
import paymentController from "../controller/paymentController";
const router = express.Router();

// Middleware to capture raw body for webhook signature verification
const rawBodyMiddleware = (req: any, res: any, next: any) => {
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk: string) => {
    data += chunk;
  });
  req.on("end", () => {
    req.rawBody = data;
    next();
  });
};

// Webhook routes (no auth required, verified by signature)
// IMPORTANT: These routes need raw body, not JSON parsed body
router.post(
  "/paystack",
  rawBodyMiddleware,
  paymentController.paystackWebhook.bind(paymentController)
);

router.post(
  "/stripe",
  rawBodyMiddleware,
  paymentController.stripeWebhook.bind(paymentController)
);

export default router;
