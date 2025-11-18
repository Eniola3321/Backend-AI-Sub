// src/services/payment.service.ts

import Stripe from "stripe";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import {
  PaymentType,
  PaymentGateway,
  PaymentStatus,
  PaymentConfig,
  InitializePaymentDTO,
  PaymentResponse,
  VerifyPaymentResponse,
} from "../types/payment.types";

const prisma = new PrismaClient();

// Initialize payment gateways
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Payment pricing configuration
const PAYMENT_CONFIG: PaymentConfig = {
  scanning: 5.0,
  telegram: 2.0,
  bundle: 7.0,
};

// African countries that should use Paystack
const AFRICAN_COUNTRIES = [
  "NG",
  "GH",
  "ZA",
  "KE",
  "EG",
  "TZ",
  "UG",
  "CI",
  "SN",
  "RW",
];

export class PaymentService {
  /**
   * Determine which payment gateway to use based on user's country
   */
  private determinePaymentGateway(userCountry?: string): PaymentGateway {
    if (userCountry && AFRICAN_COUNTRIES.includes(userCountry.toUpperCase())) {
      return PaymentGateway.PAYSTACK;
    }
    return PaymentGateway.STRIPE;
  }

  /**
   * Get payment amount based on payment type
   */
  private getPaymentAmount(paymentType: PaymentType): number {
    return PAYMENT_CONFIG[paymentType];
  }

  /**
   * Initialize payment with appropriate gateway
   */
  async initializePayment(
    data: InitializePaymentDTO
  ): Promise<PaymentResponse> {
    try {
      const { userId, email, paymentType, userCountry } = data;

      // Determine gateway and amount
      const gateway = this.determinePaymentGateway(userCountry);
      const amount = this.getPaymentAmount(paymentType);

      // Generate unique reference (keeps a short reference for DB lookups)
      const reference = `${gateway}_${paymentType}_${Date.now()}_${userId.slice(
        0,
        8
      )}`;

      console.log(`💳 Initializing payment: ${reference}`);

      // Create pending payment record
      await prisma.payment.create({
        data: {
          userId,
          amount,
          currency: gateway === PaymentGateway.PAYSTACK ? "NGN" : "USD",
          paymentType,
          paymentGateway: gateway,
          paymentStatus: PaymentStatus.PENDING,
          reference,
          metadata: { email, userCountry },
        },
      });

      console.log(`✅ Payment record created: ${reference}`);

      // Initialize payment with appropriate gateway
      if (gateway === PaymentGateway.PAYSTACK) {
        return await this.initializePaystackPayment(
          email,
          amount,
          reference,
          paymentType
        );
      } else {
        // IMPORTANT: pass userId so we can put the *full* userId into Stripe session
        return await this.initializeStripePayment(
          email,
          amount,
          reference,
          paymentType,
          userId
        );
      }
    } catch (error) {
      console.error("❌ Error initializing payment:", error);
      throw new Error("Failed to initialize payment");
    }
  }

  /**
   * Initialize Paystack payment
   */
  private async initializePaystackPayment(
    email: string,
    amountUSD: number,
    reference: string,
    paymentType: PaymentType
  ): Promise<PaymentResponse> {
    try {
      // Convert USD to NGN (Paystack uses kobo, multiply by 100)
      const amountInKobo = Math.round(amountUSD * 1600 * 100); // 1 USD ≈ 1600 NGN

      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email,
          amount: amountInKobo,
          reference,
          currency: "NGN",
          metadata: {
            paymentType,
            custom_fields: [
              {
                display_name: "Payment Type",
                variable_name: "payment_type",
                value: paymentType,
              },
            ],
          },
          callback_url: `${process.env.FRONTEND_URL}/payment/verify?reference=${reference}`,
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        message: "Payment initialized successfully",
        data: {
          authorizationUrl: response.data.data.authorization_url,
          reference,
          gateway: PaymentGateway.PAYSTACK,
          amount: amountUSD,
        },
      };
    } catch (error: any) {
      console.error(
        "Paystack initialization error:",
        error.response?.data || error
      );
      throw new Error("Failed to initialize Paystack payment");
    }
  }

  /**
   * Initialize Stripe payment with proper client_reference_id and metadata
   */
  private async initializeStripePayment(
    email: string,
    amount: number,
    reference: string,
    paymentType: PaymentType,
    userId: string
  ): Promise<PaymentResponse> {
    try {
      console.log(`🔵 Creating Stripe session for: ${reference}`);
      console.log(`   Email: ${email}`);
      console.log(`   UserId: ${userId}`);
      console.log(`   Amount: $${amount}`);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: this.getPaymentDescription(paymentType),
                description: `Payment for ${paymentType} feature`,
              },
              unit_amount: Math.round(amount * 100), // Stripe uses cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/payment/success?reference=${reference}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel?reference=${reference}`,
        customer_email: email,

        // CRITICAL: Set client_reference_id to the payment reference
        // This is what webhooks use to find the payment
        client_reference_id: reference,

        // CRITICAL: Also store userId and paymentType in metadata as backup
        metadata: {
          reference,
          userId, // Full userId - NO TRUNCATION
          paymentType,
          email,
        },
      });

      console.log(`✅ Stripe session created successfully`);
      console.log(`   Session ID: ${session.id}`);
      console.log(`   client_reference_id: ${session.client_reference_id}`);
      console.log(`   Metadata: ${JSON.stringify(session.metadata)}`);

      return {
        success: true,
        message: "Payment initialized successfully",
        data: {
          authorizationUrl: session.url!,
          reference,
          gateway: PaymentGateway.STRIPE,
          amount,
        },
      };
    } catch (error) {
      console.error("❌ Stripe initialization error:", error);
      throw new Error("Failed to initialize Stripe payment");
    }
  }

  /**
   * Verify Paystack payment
   */
  async verifyPaystackPayment(
    reference: string
  ): Promise<VerifyPaymentResponse> {
    try {
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          },
        }
      );

      const { status, amount, metadata } = response.data.data;

      if (status === "success") {
        // Update payment record
        const payment = await prisma.payment.findUnique({
          where: { reference },
        });

        if (!payment) {
          throw new Error("Payment record not found");
        }

        await this.updateUserAccess(
          payment.userId,
          payment.paymentType as PaymentType
        );

        await prisma.payment.update({
          where: { reference },
          data: { paymentStatus: PaymentStatus.SUCCESS },
        });

        return {
          success: true,
          message: "Payment verified successfully",
          data: {
            reference,
            amount: amount / 100 / 1600, // Convert kobo to USD
            paymentType: payment.paymentType as PaymentType,
          },
        };
      }

      return {
        success: false,
        message: "Payment verification failed",
      };
    } catch (error) {
      console.error("Paystack verification error:", error);
      throw new Error("Failed to verify Paystack payment");
    }
  }

  /**
   * Verify Stripe payment
   */
  async verifyStripePayment(sessionId: string): Promise<VerifyPaymentResponse> {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        const reference =
          session.metadata?.reference ?? session.client_reference_id!;

        const payment = await prisma.payment.findUnique({
          where: { reference },
        });

        if (!payment) {
          throw new Error("Payment record not found");
        }

        await this.updateUserAccess(
          payment.userId,
          payment.paymentType as PaymentType
        );

        await prisma.payment.update({
          where: { reference },
          data: { paymentStatus: PaymentStatus.SUCCESS },
        });

        return {
          success: true,
          message: "Payment verified successfully",
          data: {
            reference,
            amount: session.amount_total! / 100,
            paymentType: payment.paymentType as PaymentType,
          },
        };
      }

      return {
        success: false,
        message: "Payment not completed",
      };
    } catch (error) {
      console.error("Stripe verification error:", error);
      throw new Error("Failed to verify Stripe payment");
    }
  }

  /**
   * Update user access based on payment type
   */
  private async updateUserAccess(
    userId: string,
    paymentType: PaymentType
  ): Promise<void> {
    console.log(
      `🔄 Updating user access for ${userId}, payment type: ${paymentType}`
    );

    const updateData: any = {};

    switch (paymentType) {
      case PaymentType.SCANNING:
        updateData.hasPaidForScanning = true;
        console.log("  ✅ Setting hasPaidForScanning = true");
        break;
      case PaymentType.TELEGRAM:
        updateData.hasPaidForTelegram = true;
        console.log("  ✅ Setting hasPaidForTelegram = true");
        break;
      case PaymentType.BUNDLE:
        updateData.hasPaidForScanning = true;
        updateData.hasPaidForTelegram = true;
        console.log(
          "  ✅ Setting both hasPaidForScanning and hasPaidForTelegram = true"
        );
        break;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    console.log(`✅ User access updated successfully for ${userId}`);
  }

  /**
   * Get payment description
   */
  private getPaymentDescription(paymentType: PaymentType): string {
    const descriptions = {
      [PaymentType.SCANNING]: "Email Subscription Scanning",
      [PaymentType.TELEGRAM]: "Telegram Notifications",
      [PaymentType.BUNDLE]: "Complete Package (Scanning + Telegram)",
    };
    return descriptions[paymentType];
  }

  /**
   * Handle Paystack webhook
   */
  async handlePaystackWebhook(event: any): Promise<void> {
    console.log("📥 Paystack webhook received");
    console.log("Event type:", event.event);

    try {
      if (event.event === "charge.success") {
        const { reference, status } = event.data;
        console.log(`Reference: ${reference}, Status: ${status}`);

        if (status === "success") {
          const payment = await prisma.payment.findUnique({
            where: { reference },
          });

          if (!payment) {
            console.error(`❌ Payment not found for reference: ${reference}`);
            throw new Error("Payment record not found");
          }

          console.log(
            `Payment found: ${payment.id}, Status: ${payment.paymentStatus}`
          );

          if (payment.paymentStatus === PaymentStatus.PENDING) {
            console.log("🔄 Processing payment...");

            await this.updateUserAccess(
              payment.userId,
              payment.paymentType as PaymentType
            );

            await prisma.payment.update({
              where: { reference },
              data: { paymentStatus: PaymentStatus.SUCCESS },
            });

            console.log("✅ Paystack webhook processed successfully");
          } else {
            console.log("⏭️  Payment already processed, skipping");
          }
        }
      }
    } catch (error) {
      console.error("❌ Paystack webhook error:", error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook with robust payment lookup
   */
  async handleStripeWebhook(event: Stripe.Event): Promise<void> {
    console.log("📥 Stripe webhook received");
    console.log(`   Event type: ${event.type}`);
    console.log(`   Event ID: ${event.id}`);

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log(`   Session ID: ${session.id}`);
        console.log(`   Payment status: ${session.payment_status}`);
        console.log(
          `   client_reference_id: ${session.client_reference_id || "NULL"}`
        );
        console.log(`   Metadata:`, JSON.stringify(session.metadata, null, 2));

        // Try to find payment using multiple strategies
        let payment = null;
        let lookupMethod = "";

        // Strategy 1: Use client_reference_id (primary method)
        if (session.client_reference_id) {
          console.log(
            `   🔍 Looking up payment by client_reference_id: ${session.client_reference_id}`
          );
          payment = await prisma.payment.findUnique({
            where: { reference: session.client_reference_id },
          });
          if (payment) {
            lookupMethod = "client_reference_id";
            console.log(`   ✅ Payment found via client_reference_id`);
          }
        }

        // Strategy 2: Use metadata.reference (backup)
        if (!payment && session.metadata?.reference) {
          console.log(
            `   🔍 Looking up payment by metadata.reference: ${session.metadata.reference}`
          );
          payment = await prisma.payment.findUnique({
            where: { reference: session.metadata.reference },
          });
          if (payment) {
            lookupMethod = "metadata.reference";
            console.log(`   ✅ Payment found via metadata.reference`);
          }
        }

        // Strategy 3: Use metadata.userId + timestamp matching (last resort)
        if (!payment && session.metadata?.userId) {
          console.log(
            `   🔍 Looking up payment by userId and session creation time`
          );
          const sessionCreatedAt = new Date(session.created * 1000);
          const timeWindow = 10 * 60 * 1000; // 10 minutes

          payment = await prisma.payment.findFirst({
            where: {
              userId: session.metadata.userId,
              paymentStatus: PaymentStatus.PENDING,
              createdAt: {
                gte: new Date(sessionCreatedAt.getTime() - timeWindow),
                lte: new Date(sessionCreatedAt.getTime() + timeWindow),
              },
            },
            orderBy: { createdAt: "desc" },
          });

          if (payment) {
            lookupMethod = "userId + timestamp";
            console.log(`   ✅ Payment found via userId + timestamp matching`);
          }
        }

        // If we still can't find the payment, log detailed error
        if (!payment) {
          console.error("❌ Payment not found using any lookup method");
          console.error(`   Tried:`);
          console.error(
            `   - client_reference_id: ${session.client_reference_id || "NULL"}`
          );
          console.error(
            `   - metadata.reference: ${session.metadata?.reference || "NULL"}`
          );
          console.error(
            `   - metadata.userId: ${session.metadata?.userId || "NULL"}`
          );
          throw new Error("Payment record not found");
        }

        console.log(`   ✅ Payment found: ${payment.id} (via ${lookupMethod})`);
        console.log(`   User ID: ${payment.userId}`);
        console.log(`   Payment Type: ${payment.paymentType}`);
        console.log(`   Current Status: ${payment.paymentStatus}`);

        // Process the payment if it's still pending and paid
        if (
          payment.paymentStatus === PaymentStatus.PENDING &&
          session.payment_status === "paid"
        ) {
          console.log("   🔄 Processing payment...");

          await this.updateUserAccess(
            payment.userId,
            payment.paymentType as PaymentType
          );

          await prisma.payment.update({
            where: { id: payment.id },
            data: { paymentStatus: PaymentStatus.SUCCESS },
          });

          console.log("✅ Stripe webhook processed successfully");
        } else if (payment.paymentStatus !== PaymentStatus.PENDING) {
          console.log(
            `   ⏭️  Payment already in ${payment.paymentStatus} status, skipping`
          );
        } else if (session.payment_status !== "paid") {
          console.log(
            `   ⏭️  Payment status is ${session.payment_status}, not processing`
          );
        }
      } else {
        console.log(`   ⏭️  Ignoring event type: ${event.type}`);
      }
    } catch (error) {
      console.error("❌ Stripe webhook error:", error);
      throw error;
    }
  }

  /**
   * Get user payment status
   */
  async getUserPaymentStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPaidForScanning: true,
        hasPaidForTelegram: true,
      },
    });

    return user;
  }
}

export default new PaymentService();
