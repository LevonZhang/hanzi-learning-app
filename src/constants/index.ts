export const CONSTANTS = {
  // Apple App Store verification URLs
  PROD_VERIFICATION_URL: 'https://buy.itunes.apple.com/verifyReceipt',
  SANDBOX_VERIFICATION_URL: 'https://sandbox.itunes.apple.com/verifyReceipt',

  // Subscription products
  SUBSCRIPTION_SKUS: {
    MONTHLY: 'com.hanzilearning.monthly',
    YEARLY: 'com.hanzilearning.yearly',
    LIFETIME: 'com.hanzilearning.lifetime'
  },

  // Storage keys
  STORAGE_KEYS: {
    SUBSCRIPTION_STATUS: '@subscription_status',
    LAST_TRANSACTION: '@last_transaction'
  },

  // Timeouts and delays
  TIMEOUT: {
    RECEIPT_VALIDATION: 10000,  // 10 seconds
    RESTORE_DELAY: 2000,        // 2 seconds
  },

  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY: 1000  // 1 second
  }
} as const; 