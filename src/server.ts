import dotenv from "dotenv";
dotenv.config();
import app from "./app";
import { TelegramScheduler } from "./scheduler/telegramScheduler";

console.log("🤖 Starting Telegram bot...");
TelegramScheduler.prototype.start();
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅Server listening on http://localhost:${PORT}`);
  console.log(`✅ Telegram bot is active`);
});
