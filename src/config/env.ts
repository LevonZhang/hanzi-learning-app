export const ENV = {
  IS_PRODUCTION: false,  // 开发测试时设为 false
  IS_SANDBOX: true,     // 沙箱测试时设为 true
  CHECK_SUBSCRIPTION: true,
  APP_SHARED_SECRET: process.env.APP_SHARED_SECRET || '', // 从 App Store Connect 获取
};

// 订阅相关的错误消息
export const SUBSCRIPTION_ERRORS = {
  E_USER_CANCELLED: 'User cancelled the purchase',
  E_ALREADY_OWNED: 'User already owns this item',
  E_NETWORK: 'Network error occurred',
  E_RECEIPT_INVALID: 'Invalid receipt',
  E_VALIDATION_FAILED: 'Receipt validation failed',
  E_SANDBOX_TEST: 'This is a sandbox test environment',
  E_TIMEOUT: 'Verification request timed out',
} as const;

// 环境相关的常量
export const CONSTANTS = {
  SANDBOX_VERIFICATION_URL: 'https://sandbox.itunes.apple.com/verifyReceipt',
  PROD_VERIFICATION_URL: 'https://buy.itunes.apple.com/verifyReceipt',
  FREE_CHAR_LIMIT: 10,
  FREE_GAME_LEVEL_LIMIT: 2,
}; 