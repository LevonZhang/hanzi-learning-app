export interface ValidationResult {
  isValid: boolean;
  transaction: SubscriptionTransaction | null;
  environment: 'production' | 'sandbox';
  error?: string;
}

export interface SubscriptionTransaction {
  productId: string;
  originalTransactionId: string;
  transactionId?: string;
  purchaseDate: Date;
  expirationDate: Date;
  isTrialPeriod: boolean;
  isInIntroOfferPeriod: boolean;
  isInGracePeriod?: boolean;
  gracePeriodExpiresDate?: Date;
  autoRenewStatus?: boolean;
  environment: 'production' | 'sandbox';
  webOrderLineItemId?: string;
  expirationIntent?: string;
}

export interface SubscriptionStatus {
  isActive: boolean;
  productId: string;
  expirationDate: Date;
  isTrialPeriod?: boolean;
  isInGracePeriod?: boolean;
  autoRenewStatus?: boolean;
  lastUpdated: string;
}

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptValidationError';
  }
} 