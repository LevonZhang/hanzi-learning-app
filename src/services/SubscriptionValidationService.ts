import axios from 'axios';

const SANDBOX_VERIFICATION_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
const PROD_VERIFICATION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
// 从 App Store Connect 获取的 App-Specific Shared Secret
const APP_SHARED_SECRET = ''; // TODO: 替换为你的 Shared Secret

interface SubscriptionData {
  productId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  expirationDate: Date;
  isActive: boolean;
}

class SubscriptionValidationService {
  private static instance: SubscriptionValidationService;
  
  private constructor() {}

  static getInstance(): SubscriptionValidationService {
    if (!SubscriptionValidationService.instance) {
      SubscriptionValidationService.instance = new SubscriptionValidationService();
    }
    return SubscriptionValidationService.instance;
  }

  async verifyReceiptWithApple(receiptData: string, isProduction: boolean = true): Promise<any> {
    try {
      const verificationUrl = isProduction ? PROD_VERIFICATION_URL : SANDBOX_VERIFICATION_URL;
      const response = await axios.post(verificationUrl, {
        'receipt-data': receiptData,
        'password': APP_SHARED_SECRET,
        'exclude-old-transactions': true
      });

      if (response.data.status === 21007) {
        // 如果是沙盒收据，重试沙盒环境
        return this.verifyReceiptWithApple(receiptData, false);
      }

      return response.data;
    } catch (error) {
      console.error('Apple receipt verification failed:', error);
      throw error;
    }
  }

  // 检查订阅是否有效
  isSubscriptionActive(latestReceipt: any): boolean {
    if (!latestReceipt) return false;

    // 检查是否是永久会员
    if (latestReceipt.product_id.includes('lifetime')) {
      return true;
    }

    // 检查订阅是否过期
    const expirationDate = new Date(parseInt(latestReceipt.expires_date_ms));
    return new Date() < expirationDate;
  }

  // 解析收据信息
  parseReceiptInfo(receiptInfo: any): SubscriptionData {
    return {
      productId: receiptInfo.product_id,
      originalTransactionId: receiptInfo.original_transaction_id,
      purchaseDate: new Date(parseInt(receiptInfo.purchase_date_ms)),
      expirationDate: new Date(parseInt(receiptInfo.expires_date_ms)),
      isActive: this.isSubscriptionActive(receiptInfo),
    };
  }
}

export default SubscriptionValidationService.getInstance(); 