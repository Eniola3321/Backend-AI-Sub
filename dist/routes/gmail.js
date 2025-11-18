"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/gmail.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const gmailController_1 = require("../controller/gmailController");
const router = (0, express_1.Router)();
// returns URL the frontend should open to let user grant Gmail access (scoped to Gmail)
router.get("/connect/url", auth_1.requireAuth, gmailController_1.startGmailConnect);
// callback that receives `code` from Google when user grants Gmail scopes
router.get("/connect/callback", gmailController_1.handleGmailCallback);
// fetch parsed subscriptions for authenticated user
router.get("/subscriptions", auth_1.requireAuth, gmailController_1.fetchSubscriptions);
exports.default = router;
