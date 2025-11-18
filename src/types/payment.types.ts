// src/types/payment.types.ts

export enum PaymentType {
  SCANNING = "scanning",
  TELEGRAM = "telegram",
  BUNDLE = "bundle",
}

export enum PaymentGateway {
  STRIPE = "stripe",
  PAYSTACK = "paystack",
}

export enum PaymentStatus {
  PENDING = "pending",
  SUCCESS = "success",
  FAILED = "failed",
}

export interface PaymentConfig {
  scanning: number;
  telegram: number;
  bundle: number;
}

export interface InitializePaymentDTO {
  userId: string;
  email: string;
  paymentType: PaymentType;
  userCountry?: string;
}

export interface PaymentResponse {
  success: boolean;
  message: string;
  data?: {
    authorizationUrl?: string;
    reference: string;
    gateway: PaymentGateway;
    amount: number;
  };
}

export interface VerifyPaymentResponse {
  success: boolean;
  message: string;
  data?: {
    reference: string;
    amount: number;
    paymentType: PaymentType;
  };
}
