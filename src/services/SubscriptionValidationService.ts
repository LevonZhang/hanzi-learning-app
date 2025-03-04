import axios from 'axios';
import { ENV, CONSTANTS, SUBSCRIPTION_ERRORS } from '../config/env';
import { logger } from '../utils/logger';
import { Platform } from 'react-native';

interface SubscriptionData {
  productId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  expirationDate: Date;
  isActive: boolean;
  environment: 'production' | 'sandbox';
  lastUpdated: string;
  transactionId?: string;
  jws?: string;
  isTrialPeriod?: boolean;
  isInIntroOfferPeriod?: boolean;
  webOrderLineItemId?: string;
  isInGracePeriod?: boolean;
  gracePeriodExpiresDate?: Date;
  autoRenewStatus?: boolean;
  expirationIntent?: string;
  offerType?: number;
  purchaseToken?: string;
  packageName?: string;
  paymentState?: number;
}

interface VerificationResponse {
  status: number;
  environment: string;
  receipt: {
    bundle_id: string;
    application_version: string;
    in_app: Array<{
      quantity: string;
      product_id: string;
      transaction_id: string;
      original_transaction_id: string;
      purchase_date_ms: string;
      original_purchase_date_ms: string;
      expires_date_ms: string;
      web_order_line_item_id: string;
      is_trial_period: string;
      is_in_intro_offer_period: string;
    }>;
  };
  latest_receipt_info?: Array<{
    quantity: string;
    product_id: string;
    transaction_id: string;
    original_transaction_id: string;
    purchase_date_ms: string;
    original_purchase_date_ms: string;
    expires_date_ms: string;
    web_order_line_item_id: string;
    is_trial_period: string;
    is_in_intro_offer_period: string;
  }>;
  pending_renewal_info?: Array<{
    auto_renew_status: string;
    auto_renew_product_id: string;
    expiration_intent: string;
  }>;
}

class SubscriptionValidationService {
  private static instance: SubscriptionValidationService;
  private readonly BUNDLE_ID = 'com.itlongbow.hanzilearningapp';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  
  private constructor() {}

  static getInstance(): SubscriptionValidationService {
    if (!SubscriptionValidationService.instance) {
      SubscriptionValidationService.instance = new SubscriptionValidationService();
    }
    return SubscriptionValidationService.instance;
  }

  async verifyTransaction(transactionId: string, jws: string): Promise<any> {
    const isProduction = !ENV.IS_SANDBOX;
    let retryCount = 0;
    
    try {
      logger.subscription('开始验证交易', {
        environment: isProduction ? 'production' : 'sandbox',
        transactionId,
        hasJws: !!jws,
        jwsLength: jws?.length || 0,
        timestamp: new Date().toISOString()
      });

      return await this.verifyIosTransaction(transactionId, jws, isProduction, retryCount);
    } catch (error: any) {
      logger.error('验证交易失败:', {
        error: error.message,
        stack: error.stack,
        transactionId,
        retryCount
      });
      return {
        status: -1,
        error: error.message,
        transaction: null
      };
    }
  }

  private async verifyIosTransaction(transactionId: string, jws: string, isProduction: boolean, retryCount: number): Promise<any> {
    const requestData = {
      'receipt-data': jws,
      'password': ENV.APP_SHARED_SECRET,
      'exclude-old-transactions': false
    };

    while (retryCount < this.MAX_RETRIES) {
      try {
        const verificationUrl = isProduction ? 
          CONSTANTS.PROD_VERIFICATION_URL : 
          CONSTANTS.SANDBOX_VERIFICATION_URL;

        const response = await axios.post<VerificationResponse>(verificationUrl, requestData, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        logger.subscription('收到验证响应:', {
          status: response.status,
          statusText: response.statusText,
          verificationStatus: response.data?.status,
          environment: response.data?.environment || 'unknown'
        });

        if (response.data) {
          const result = this.processVerificationResponse(response.data, transactionId);
          return result;
        } else {
          logger.error('验证响应数据为空');
          return {
            status: -1,
            error: '验证响应数据为空',
            transaction: null
          };
        }
      } catch (error: any) {
        retryCount++;
        logger.error(`iOS验证尝试 ${retryCount}/${this.MAX_RETRIES} 失败:`, {
          error: error.message,
          code: error.code,
          transactionId
        });

        if (retryCount < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        } else {
          return {
            status: -1,
            error: `验证交易失败: ${error.message}`,
            transaction: null
          };
        }
      }
    }

    return {
      status: -1,
      error: '验证交易失败: 超过最大重试次数',
      transaction: null
    };
  }

  private processVerificationResponse(response: VerificationResponse, transactionId: string): any {
    const latestReceipt = response.latest_receipt_info?.[0] || 
                         response.receipt.in_app.sort((a, b) => 
                           parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms)
                         )[0];

    if (!latestReceipt) {
      logger.error('No valid transaction found in receipt');
      return {
        status: -1,
        error: '未找到有效的交易记录',
        transaction: null
      };
    }

    const pendingRenewal = response.pending_renewal_info?.[0];
    const isAutoRenewActive = pendingRenewal?.auto_renew_status === '1';
    const expirationIntent = pendingRenewal?.expiration_intent;
    const isInBillingRetryPeriod = expirationIntent === '1';
    
    const transaction = {
      originalTransactionId: latestReceipt.original_transaction_id,
      transactionId: latestReceipt.transaction_id,
      productId: latestReceipt.product_id,
      purchaseDate: new Date(parseInt(latestReceipt.purchase_date_ms)),
      expirationDate: new Date(parseInt(latestReceipt.expires_date_ms)),
      isTrialPeriod: latestReceipt.is_trial_period === 'true',
      isInIntroOfferPeriod: latestReceipt.is_in_intro_offer_period === 'true',
      webOrderLineItemId: latestReceipt.web_order_line_item_id,
      isAutoRenewActive,
      environment: response.environment.toLowerCase(),
      expirationIntent,
      isInBillingRetryPeriod,
      gracePeriodExpiresDate: isInBillingRetryPeriod ? 
        new Date(new Date(parseInt(latestReceipt.expires_date_ms)).getTime() + 16 * 24 * 60 * 60 * 1000) : 
        undefined
    };

    logger.subscription('Processed verification response:', {
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      productId: transaction.productId,
      purchaseDate: transaction.purchaseDate.toISOString(),
      expirationDate: transaction.expirationDate.toISOString(),
      isTrialPeriod: transaction.isTrialPeriod,
      isInIntroOfferPeriod: transaction.isInIntroOfferPeriod,
      isAutoRenewActive: transaction.isAutoRenewActive,
      environment: transaction.environment,
      expirationIntent: transaction.expirationIntent,
      isInBillingRetryPeriod: transaction.isInBillingRetryPeriod,
      gracePeriodExpiresDate: transaction.gracePeriodExpiresDate?.toISOString()
    });

    return {
      status: 0,
      environment: response.environment,
      transaction
    };
  }

  private getMockResponse(transactionId: string): any {
    const now = Date.now();
    return {
      status: 0,
      environment: 'sandbox',
      transaction: {
        originalTransactionId: transactionId,
        transactionId: transactionId,
        productId: 'com.itlongbow.hanzilearningapp.sub.monthly',
        purchaseDate: new Date(now),
        expirationDate: new Date(now + 30 * 24 * 60 * 60 * 1000),
        isTrialPeriod: false,
        isInIntroOfferPeriod: false,
        webOrderLineItemId: 'mock_order_id',
        isAutoRenewActive: true,
        environment: 'sandbox'
      }
    };
  }

  isSubscriptionActive(transaction: any): boolean {
    if (!transaction) {
      logger.warn('No transaction provided for subscription check');
      return false;
    }

    // 检查是否是永久会员
    if (transaction.productId?.includes('lifetime')) {
      logger.subscription('Lifetime subscription detected');
      return true;
    }

    // 检查是否在宽限期内
    const now = new Date();
    if (transaction.isInBillingRetryPeriod && transaction.gracePeriodExpiresDate) {
      const gracePeriodExpiry = new Date(transaction.gracePeriodExpiresDate);
      if (now < gracePeriodExpiry) {
        logger.subscription('Subscription in grace period', {
          gracePeriodExpiresDate: gracePeriodExpiry.toISOString(),
          currentDate: now.toISOString(),
          timeUntilGraceExpiration: Math.round((gracePeriodExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + ' days'
        });
        return true;
      }
    }

    // 检查订阅是否过期
    const expirationDate = new Date(transaction.expirationDate);
    const isActive = now < expirationDate;
    
    logger.subscription('Subscription status check', {
      expirationDate: expirationDate.toISOString(),
      currentDate: now.toISOString(),
      isActive,
      productId: transaction.productId,
      environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
      timeUntilExpiration: Math.round((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + ' days',
      isAutoRenewActive: transaction.isAutoRenewActive,
      expirationIntent: transaction.expirationIntent,
      isInBillingRetryPeriod: transaction.isInBillingRetryPeriod
    });
    
    return isActive;
  }

  parseTransactionInfo(transactionInfo: any): SubscriptionData {
    const now = new Date();
    return {
      productId: transactionInfo.productId,
      originalTransactionId: transactionInfo.originalTransactionId,
      purchaseDate: new Date(parseInt(transactionInfo.purchaseDate)),
      expirationDate: new Date(parseInt(transactionInfo.expirationDate)),
      isActive: transactionInfo.isActive,
      environment: transactionInfo.environment,
      lastUpdated: new Date().toISOString(),
      transactionId: transactionInfo.transactionId,
      jws: transactionInfo.jws,
      isTrialPeriod: transactionInfo.isTrialPeriod,
      isInIntroOfferPeriod: transactionInfo.isInIntroOfferPeriod,
      webOrderLineItemId: transactionInfo.webOrderLineItemId,
      isInGracePeriod: transactionInfo.isInGracePeriod,
      gracePeriodExpiresDate: transactionInfo.gracePeriodExpiresDate,
      autoRenewStatus: transactionInfo.isAutoRenewActive,
      expirationIntent: transactionInfo.expirationIntent,
      offerType: transactionInfo.offerType,
      purchaseToken: transactionInfo.purchaseToken,
      packageName: transactionInfo.packageName,
      paymentState: transactionInfo.paymentState
    };
  }
}

// 导出单例实例和类型
export { SubscriptionValidationService };
export type { SubscriptionData };
export default SubscriptionValidationService; 