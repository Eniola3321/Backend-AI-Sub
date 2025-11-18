"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jwt_1 = require("../utils/jwt");
function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = auth.slice("Bearer ".length);
    const payload = (0, jwt_1.verifyJwt)(token);
    if (!payload)
        return res.status(401).json({ error: "Invalid token" });
    // attach minimal user info
    req.user = { id: payload.id, email: payload.email };
    next();
}
