// src/controllers/payment.controller.ts

import { Request, Response } from "express";
import { prisma } from "../prisma";
import Stripe from "stripe";
import crypto from "crypto";
import paymentService from "../services/paymentservice";
import { PaymentType } from "../types/payment.types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export class PaymentController {
  /**
   * Initialize payment
   * POST /api/payments/initialize
   */
  async initializePayment(req: Request, res: Response): Promise<void> {
    try {
      const { paymentType } = req.body;
      const userId = req.user?.id; // Assuming you have auth middleware that adds user to req

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      // Validate payment type
      if (!Object.values(PaymentType).includes(paymentType)) {
        res.status(400).json({
          success: false,
          message: "Invalid payment type. Use: scanning, telegram, or bundle",
        });
        return;
      }

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Check if user has already paid for this feature
      if (paymentType === PaymentType.SCANNING && user.hasPaidForScanning) {
        res.status(400).json({
          success: false,
          message: "You have already paid for email scanning",
        });
        return;
      }

      if (paymentType === PaymentType.TELEGRAM && user.hasPaidForTelegram) {
        res.status(400).json({
          success: false,
          message: "You have already paid for Telegram notifications",
        });
        return;
      }

      if (
        paymentType === PaymentType.BUNDLE &&
        user.hasPaidForScanning &&
        user.hasPaidForTelegram
      ) {
        res.status(400).json({
          success: false,
          message: "You have already paid for all features",
        });
        return;
      }

      // Get user's country from IP or let them select manually
      // You can use a package like 'geoip-lite' to detect country from IP
      const userCountry =
        req.body.country || (req.headers["cf-ipcountry"] as string);

      const result = await paymentService.initializePayment({
        userId,
        email: user.email,
        paymentType,
        userCountry,
      });

      // Log Paystack reference for verification
      if (result.data?.gateway === "paystack") {
        console.log(`Paystack reference: ${result.data.reference}`);
        console.log(`Authorization URL: ${result.data.authorizationUrl}`);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Initialize payment error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to initialize payment",
      });
    }
  }

  /**
   * Verify Paystack payment
   * GET /api/payments/verify/paystack/:reference
   */
  async verifyPaystackPayment(req: Request, res: Response): Promise<void> {
    try {
      const { reference } = req.params;

      if (!reference) {
        res.status(400).json({
          success: false,
          message: "Payment reference is required",
        });
        return;
      }

      const result = await paymentService.verifyPaystackPayment(reference);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Verify Paystack payment error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to verify payment",
      });
    }
  }

  /**
   * Verify Stripe payment
   * GET /api/payments/verify/stripe/:sessionId
   */
  async verifyStripePayment(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: "Session ID is required",
        });
        return;
      }

      const result = await paymentService.verifyStripePayment(sessionId);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Verify Stripe payment error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to verify payment",
      });
    }
  }

  /**
   * Verify Stripe payment by reference
   * GET /api/payments/verify/stripe/reference/:reference
   */
  async verifyStripePaymentByReference(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { reference } = req.params;

      if (!reference) {
        res.status(400).json({
          success: false,
          message: "Payment reference is required",
        });
        return;
      }

      // Find the payment record to get the session ID
      const payment = await prisma.payment.findUnique({
        where: { reference },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Payment record not found",
        });
        return;
      }

      // For Stripe payments, we need to retrieve the session
      // But since we don't store sessionId, we can verify by checking payment status
      // Or retrieve from Stripe using the reference as client_reference_id
      const sessions = await stripe.checkout.sessions.list({
        client_reference_id: reference,
        limit: 1,
      });

      if (sessions.data.length === 0) {
        res.status(404).json({
          success: false,
          message: "Stripe session not found",
        });
        return;
      }

      const session = sessions.data[0];
      const result = await paymentService.verifyStripePayment(session.id);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Verify Stripe payment by reference error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to verify payment",
      });
    }
  }

  /**
   * Paystack webhook handler
   * POST /api/webhooks/paystack
   */
  async paystackWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify Paystack signature using raw body
      const hash = crypto
        .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
        .update(req.body)
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        res.status(400).json({
          success: false,
          message: "Invalid signature",
        });
        return;
      }

      await paymentService.handlePaystackWebhook(req.body);

      res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
      });
    } catch (error) {
      console.error("Paystack webhook error:", error);
      res.status(500).json({
        success: false,
        message: "Webhook processing failed",
      });
    }
  }

  /**
   * Stripe webhook handler
   * POST /api/webhooks/stripe
   */
  async stripeWebhook(req: any, res: Response): Promise<void> {
    const sig = req.headers["stripe-signature"] as string;

    let event: Stripe.Event;

    try {
      // Verify Stripe signature using raw body
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      await paymentService.handleStripeWebhook(event);

      res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
      });
    } catch (error: any) {
      console.error("Stripe webhook error:", error);
      res.status(400).json({
        success: false,
        message: `Webhook Error: ${error.message}`,
      });
    }
  }

  /**
   * Get user payment status
   * GET /api/payments/status
   */
  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const status = await paymentService.getUserPaymentStatus(userId);

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error("Get payment status error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get payment status",
      });
    }
  }

  /**
   * Get payment history
   * GET /api/payments/history
   */
  async getPaymentHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
        return;
      }

      const payments = await prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentType: true,
          paymentGateway: true,
          paymentStatus: true,
          reference: true,
          createdAt: true,
        },
      });

      res.status(200).json({
        success: true,
        data: payments,
      });
    } catch (error: any) {
      console.error("Get payment history error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get payment history",
      });
    }
  }
}

export default new PaymentController();
