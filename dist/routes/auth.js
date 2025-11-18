"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.ts
const express_1 = require("express");
const authController_1 = require("../controller/authController");
const router = (0, express_1.Router)();
router.post("/signup", authController_1.signup);
router.post("/login", authController_1.login);
// return URL the frontend should open to start Google OAuth sign-in
router.get("/google/url", authController_1.googleSignInUrl);
// Callback endpoint that Google will redirect to with `code`.
// You may choose to do code exchange on server and create user + issue JWT
router.get("/google/callback", authController_1.googleCallback);
exports.default = router;
