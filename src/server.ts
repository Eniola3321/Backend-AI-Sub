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

// import { sendWeeklyNotification } from "./services/telegram.service";

// // TEMPORARY: Run it once on startup for testing
// // (async () => {
// //   console.log("🚀 Testing Telegram notifications...");
// //   await sendWeeklyNotification();
// // })();

// cron.schedule("0 9 * * 1", async () => {
//   console.log("🕓 Running weekly subscription check...");
//   await sendWeeklyNotification();
// });
