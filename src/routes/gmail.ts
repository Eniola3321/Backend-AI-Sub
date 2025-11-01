// src/routes/gmail.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  startGmailConnect,
  handleGmailCallback,
  fetchSubscriptions,
} from "../controller/gmailController";

const router = Router();

// returns URL the frontend should open to let user grant Gmail access (scoped to Gmail)
router.get("/connect/url", requireAuth, startGmailConnect);

// callback that receives `code` from Google when user grants Gmail scopes
router.get("/connect/callback", handleGmailCallback);

export default router;
