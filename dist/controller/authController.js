"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signup = signup;
exports.login = login;
exports.googleSignInUrl = googleSignInUrl;
exports.googleCallback = googleCallback;
const prisma_1 = require("../prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jwt_1 = require("../utils/jwt");
const googleapis_1 = require("googleapis");
const crypto_1 = require("../utils/crypto");
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:4000";
const oauth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, `${BACKEND_BASE_URL}/api/auth/google/callback`);
// scopes for signing in + gmail connect (we may ask for gmail scope separately when connecting)
const basicScopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];
async function signup(req, res) {
    const { email, password, name } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: "Missing email/password" });
    const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (existing)
        return res.status(400).json({ error: "User exists" });
    const hash = await bcrypt_1.default.hash(password, 10);
    const user = await prisma_1.prisma.user.create({
        data: { email, passwordHash: hash, name },
    });
    const token = (0, jwt_1.signJwt)({ id: user.id, email: user.email });
    res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
    });
}
async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: "Missing email/password" });
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash)
        return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt_1.default.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ error: "Invalid credentials" });
    const token = (0, jwt_1.signJwt)({ id: user.id, email: user.email });
    res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
    });
}
function googleSignInUrl(req, res) {
    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: basicScopes,
    });
    res.json({ url });
}
// Callback after Google OAuth sign-in
async function googleCallback(req, res) {
    const code = req.query.code;
    if (!code)
        return res.status(400).json({ error: "Missing code" });
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    // get userinfo
    const oauth2 = googleapis_1.google.oauth2({ auth: oauth2Client, version: "v2" });
    const userinfo = await oauth2.userinfo.get();
    const email = userinfo.data.email;
    const googleId = userinfo.data.id;
    const name = userinfo.data.name;
    let user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user) {
        user = await prisma_1.prisma.user.create({
            data: {
                email,
                name,
                googleId,
            },
        });
    }
    else {
        // attach googleId if not present
        if (!user.googleId) {
            user = await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { googleId },
            });
        }
    }
    // Save Google tokens (encrypted)
    if (tokens.access_token && tokens.refresh_token) {
        await prisma_1.prisma.googleToken.upsert({
            where: { userId: user.id },
            update: {
                accessToken: (0, crypto_1.encrypt)(tokens.access_token),
                refreshToken: (0, crypto_1.encrypt)(tokens.refresh_token),
                scope: tokens.scope || undefined,
                expiryDate: tokens.expiry_date
                    ? new Date(tokens.expiry_date)
                    : undefined,
            },
            create: {
                userId: user.id,
                accessToken: (0, crypto_1.encrypt)(tokens.access_token),
                refreshToken: (0, crypto_1.encrypt)(tokens.refresh_token),
                scope: tokens.scope || undefined,
                expiryDate: tokens.expiry_date
                    ? new Date(tokens.expiry_date)
                    : undefined,
            },
        });
    }
    // Issue our JWT for frontend
    const jwt = (0, jwt_1.signJwt)({ id: user.id, email: user.email });
    // Option A: redirect back to frontend with token
    const frontend = process.env.FRONTEND_REDIRECT_URI || "http://localhost:3000";
    return res.redirect(`${frontend}/oauth-success?token=${jwt}`);
}
