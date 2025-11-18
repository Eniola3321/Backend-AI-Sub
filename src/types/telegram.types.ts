// src/types/telegram.types.ts

export enum NotificationType {
  SUBSCRIPTION_EXPIRING = "subscription_expiring",
  SUBSCRIPTION_EXPIRED = "subscription_expired",
  NEW_SUBSCRIPTION_FOUND = "new_subscription_found",
  PAYMENT_REMINDER = "payment_reminder",
  SCAN_COMPLETED = "scan_completed",
}

export interface TelegramNotificationConfig {
  userId: string;
  chatId: bigint;
  enabled: boolean;
  notifyExpiringSoon: boolean;
  notifyExpired: boolean;
  notifyNewSubscriptions: boolean;
  daysBeforeExpiry: number;
}

export interface SendNotificationDTO {
  userId: string;
  type: NotificationType;
  data: any;
}

export interface SubscriptionNotificationData {
  provider: string;
  product?: string;
  expiryDate?: Date;
  nextBilling?: Date;
  amount?: number;
  currency?: string;
  daysUntilExpiry?: number;
}

export interface TelegramBotCommand {
  command: string;
  description: string;
  handler: string;
}
