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
      
      logger.subscription('Verifying receipt with Apple', {
        environment: isProduction ? 'production' : 'sandbox',
        url: verificationUrl,
        receiptLength: receiptData.length
      });
      
      // 添加超时处理
      const response = await axios.post(verificationUrl, {
        'receipt-data': receiptData,
        'password': ENV.APP_SHARED_SECRET,
        'exclude-old-transactions': false // 改为 false，确保获取所有交易记录
      }, {
        timeout: 15000 // 15秒超时
      });

      logger.subscription('Received response from Apple', {
        status: response.data?.status,
        hasReceipt: !!response.data?.receipt,
        hasLatestReceiptInfo: !!response.data?.latest_receipt_info,
        responseData: response.data // 临时添加完整响应数据用于调试
      });

      if (!response.data) {
        throw new Error('Empty response from Apple verification server');
      }

      // 处理特定的状态码
      switch (response.data.status) {
        case 0:
          logger.subscription('Receipt is valid');
          break;
        case 21002:
          logger.error('Receipt data is malformed', {
            receiptLength: receiptData.length,
            receiptStart: receiptData.substring(0, 100) // 只记录前100个字符
          });
          throw new Error(SUBSCRIPTION_ERRORS.E_RECEIPT_INVALID);
        case 21003:
          logger.error('Receipt authentication failed');
          throw new Error(SUBSCRIPTION_ERRORS.E_RECEIPT_INVALID);
        case 21004:
          logger.error('Shared secret does not match');
          throw new Error(SUBSCRIPTION_ERRORS.E_VALIDATION_FAILED);
        case 21007:
          if (isProduction) {
            logger.subscription('Retrying with sandbox environment');
            return this.verifyReceiptWithApple(receiptData);
          }
          break;
        default:
          logger.error('Unknown status code from Apple', { status: response.data.status });
          throw new Error(SUBSCRIPTION_ERRORS.E_VALIDATION_FAILED);
      }

      const validatedResponse = this.validateReceiptResponse(response.data);

      logger.subscription('Receipt validation successful', {
        status: validatedResponse.status,
        environment: isProduction ? 'production' : 'sandbox',
        hasLatestReceipt: !!validatedResponse.latest_receipt,
        hasLatestReceiptInfo: !!validatedResponse.latest_receipt_info
      });

      return validatedResponse;
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        logger.error('Receipt verification timeout', { error });
        throw new Error(SUBSCRIPTION_ERRORS.E_NETWORK);
      }
      logger.error('Receipt verification failed:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorResponse: axios.isAxiosError(error) ? error.response?.data : undefined
      });
      throw error;
    }
  }

  private validateReceiptResponse(response: any): any {
    logger.subscription('Validating receipt response', {
      hasStatus: typeof response.status === 'number',
      status: response.status,
      hasReceipt: !!response.receipt,
      hasLatestReceiptInfo: !!response.latest_receipt_info
    });

    if (!response || typeof response.status !== 'number') {
      logger.error('Invalid receipt response format', response);
      throw new Error(SUBSCRIPTION_ERRORS.E_RECEIPT_INVALID);
    }

    if (response.status === 0) {
      if (!response.receipt || !response.latest_receipt_info) {
        logger.error('Missing required receipt information', {
          hasReceipt: !!response.receipt,
          hasLatestReceiptInfo: !!response.latest_receipt_info
        });
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
    const now = new Date();
    const isActive = now < expirationDate;
    
    logger.subscription('Subscription status check', {
      expirationDate: expirationDate.toISOString(),
      currentDate: now.toISOString(),
      isActive,
      productId: latestReceipt.product_id,
      environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
      timeUntilExpiration: Math.round((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + ' days'
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