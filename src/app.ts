// src/app.ts
import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import gmailRoutes from "./routes/gmail";
import subscriptionRoutes from "./routes/subscription";
import paymentRoutes from "./routes/payments";
import webhookRoutes from "./routes/webhooks";
import telegramRoutes from "./routes/telegram";

const app = express();

// ❌ REMOVE express.raw() from here
// ❌ Do NOT wrap the webhook router with raw
app.use("/api/webhooks", webhookRoutes);

// Now normal JSON parser for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Register all other routes
app.use("/api/auth", authRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/subscriptions", subscriptionRoutes);

app.get("/", (req, res) =>
  res.json({ ok: true, message: "Server is running" })
);

// ... 404 + error handler

export default app;
