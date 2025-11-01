// src/app.ts
import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import gmailRoutes from "./routes/gmail";
import subscriptionRoutes from "./routes/subscriptions";

const app = express();
app.use(bodyParser.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/subscriptions", subscriptionRoutes);

app.get("/", (req, res) => res.json({ ok: true }));

export default app;
