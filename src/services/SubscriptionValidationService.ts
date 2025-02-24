import axios from 'axios';
import { ENV, CONSTANTS, SUBSCRIPTION_ERRORS } from '../config/env';
import { logger } from '../utils/logger';

interface SubscriptionData {
  productId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  expirationDate: Date;
  isActive: boolean;
  environment: 'production' | 'sandbox';
  lastUpdated: string;
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

  async verifyReceiptWithApple(receiptData: string): Promise<any> {
    try {
      const isProduction = !ENV.IS_SANDBOX;
      const verificationUrl = isProduction ? 
        CONSTANTS.PROD_VERIFICATION_URL : 
        CONSTANTS.SANDBOX_VERIFICATION_URL;
      
      // 添加超时处理
      const response = await axios.post(verificationUrl, {
        'receipt-data': receiptData,
        'password': ENV.APP_SHARED_SECRET,
        'exclude-old-transactions': true
      }, {
        timeout: 15000 // 15秒超时
      });

      if (!response.data) {
        throw new Error('Empty response from Apple verification server');
      }

      const validatedResponse = this.validateReceiptResponse(response.data);

      if (validatedResponse.status === 21007 && isProduction) {
        logger.subscription('Retrying with sandbox environment');
        return this.verifyReceiptWithApple(receiptData);
      }

      return validatedResponse;
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new Error(SUBSCRIPTION_ERRORS.E_NETWORK);
      }
      logger.error('Receipt verification failed:', error);
      throw new Error(SUBSCRIPTION_ERRORS.E_VALIDATION_FAILED);
    }
  }

  private validateReceiptResponse(response: any): any {
    if (!response || typeof response.status !== 'number') {
      logger.error('Invalid receipt response format', response);
      throw new Error(SUBSCRIPTION_ERRORS.E_RECEIPT_INVALID);
    }

    if (response.status === 0) {
      if (!response.receipt || !response.latest_receipt_info) {
        logger.error('Missing required receipt information', response);
        throw new Error(SUBSCRIPTION_ERRORS.E_RECEIPT_INVALID);
      }
    }

    return response;
  }

  isSubscriptionActive(latestReceipt: any): boolean {
    if (!latestReceipt) {
      logger.warn('No receipt provided for subscription check');
      return false;
    }

    // 检查是否是永久会员
    if (latestReceipt.product_id.includes('lifetime')) {
      logger.subscription('Lifetime subscription detected');
      return true;
    }

    // 检查订阅是否过期
    const expirationDate = new Date(parseInt(latestReceipt.expires_date_ms));
    const isActive = new Date() < expirationDate;
    
    logger.subscription('Subscription status check', {
      expirationDate,
      isActive,
      productId: latestReceipt.product_id,
      environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
    });
    
    return isActive;
  }

  parseReceiptInfo(receiptInfo: any): SubscriptionData {
    const now = new Date();
    return {
      productId: receiptInfo.product_id,
      originalTransactionId: receiptInfo.original_transaction_id,
      purchaseDate: new Date(parseInt(receiptInfo.purchase_date_ms)),
      expirationDate: new Date(parseInt(receiptInfo.expires_date_ms)),
      isActive: this.isSubscriptionActive(receiptInfo),
      environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
      lastUpdated: now.toISOString()
    };
  }
}

export default SubscriptionValidationService.getInstance(); 