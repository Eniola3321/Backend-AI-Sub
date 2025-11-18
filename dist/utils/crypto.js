"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
// src/utils/crypto.ts
const crypto_1 = __importDefault(require("crypto"));
const ALGO = "aes-256-gcm";
const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes hex (64 hex chars)");
}
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(text, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
}
function decrypt(encrypted) {
    const data = Buffer.from(encrypted, "base64");
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const text = data.slice(28);
    const decipher = crypto_1.default.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(text), decipher.final()]);
    return decrypted.toString("utf8");
}
