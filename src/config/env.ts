// 注意：任何被打包进客户端的值都不是秘密。APP_SHARED_SECRET 仅为兼容旧实现保留，
// 正确做法是服务端校验收据（见 README「Known limitations」）。
// 本地开发请把值写进 .env（参考 .env.example），不要提交到仓库。
export const ENV = {
  IS_PRODUCTION: false,  // 开发测试时设为 false
  IS_SANDBOX: true,     // 沙箱测试时设为 true
  CHECK_SUBSCRIPTION: true,
  APP_SHARED_SECRET: process.env.EXPO_PUBLIC_APP_SHARED_SECRET ?? '',
};
// App / Bundle 标识。发布前请替换成你自己的 Bundle ID，并与 app.json 保持一致。
// 仓库中的示例值不含任何真实的开发者团队标识。
export const APP_BUNDLE_ID = 'com.example.hanzilearning';
export const SUBSCRIPTION_SKU_PREFIX = `${APP_BUNDLE_ID}.sub`;

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