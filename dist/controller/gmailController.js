"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGmailConnect = startGmailConnect;
exports.handleGmailCallback = handleGmailCallback;
exports.fetchSubscriptions = fetchSubscriptions;
const prisma_1 = require("../prisma");
const googleapis_1 = require("googleapis");
const crypto_1 = require("../utils/crypto");
const gmailServices_1 = require("../services/gmailServices");
const jwt_1 = require("../utils/jwt");
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:4000";
const redirectUri = `${BACKEND_BASE_URL}/api/gmail/connect/callback`;
const oauth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
// Gmail scopes for reading user inbox
const gmailScopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
];
async function startGmailConnect(req, res) {
    const user = req.user;
    const authToken = (0, jwt_1.signJwt)({ id: user.id, email: user.email });
    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: gmailScopes,
        state: JSON.stringify({ token: authToken }),
    });
    res.json({ url });
}
async function handleGmailCallback(req, res) {
    const code = req.query.code;
    const stateRaw = req.query.state;
    if (!code)
        return res.status(400).json({ error: "Missing code" });
    if (!stateRaw)
        return res.status(400).json({ error: "Missing state" });
    let state;
    try {
        state = JSON.parse(stateRaw);
    }
    catch {
        return res.status(400).json({ error: "Invalid state param" });
    }
    const authToken = state.token;
    if (!authToken)
        return res.status(400).json({ error: "Missing token in state" });
    const { verifyJwt } = require("../utils/jwt");
    const payload = verifyJwt(authToken);
    if (!payload)
        return res.status(401).json({ error: "Invalid token" });
    const userId = payload.id;
    // get tokens from Google
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token)
        return res.status(400).json({ error: "Missing access token from Google" });
    // store tokens in DB
    await prisma_1.prisma.googleToken.upsert({
        where: { userId },
        update: {
            accessToken: (0, crypto_1.encrypt)(tokens.access_token),
            refreshToken: tokens.refresh_token ? (0, crypto_1.encrypt)(tokens.refresh_token) : "",
            scope: tokens.scope || undefined,
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
        create: {
            userId,
            accessToken: (0, crypto_1.encrypt)(tokens.access_token),
            refreshToken: tokens.refresh_token ? (0, crypto_1.encrypt)(tokens.refresh_token) : "",
            scope: tokens.scope || undefined,
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
    });
    // optional: immediately scan Gmail
    const results = await (0, gmailServices_1.scanUserGmailForSubscriptions)(userId);
    // redirect to frontend
    const frontend = process.env.FRONTEND_REDIRECT_URI || "http://localhost:3000";
    return res.redirect(`${frontend}/gmail-connected?scan=true`);
}
async function fetchSubscriptions(req, res) {
    const user = req.user;
    const subs = await prisma_1.prisma.subscription.findMany({
        where: { userId: user.id },
        orderBy: { nextBilling: "asc" },
    });
    res.json({ subscriptions: subs });
}
