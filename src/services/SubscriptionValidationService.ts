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
      // 暂时注释掉，强制使用真实验证
      // if (ENV.IS_SANDBOX) {
      //   logger.subscription('Development mode: returning mock response');
      //   return this.getMockResponse(transactionId);
      // }

      // 添加调试日志
      logger.subscription('开始验证交易，不使用模拟数据', {
        environment: isProduction ? 'production' : 'sandbox',
        transactionId,
        timestamp: new Date().toISOString()
      });

      // 构建验证请求数据
      const requestData = {
        'receipt-data': jws,
        'password': ENV.APP_SHARED_SECRET,
        'exclude-old-transactions': false // 包含所有历史交易
      };

      // 记录验证请求详情
      logger.subscription('Starting transaction verification:', {
        environment: isProduction ? 'production' : 'sandbox',
        transactionId,
        hasJws: !!jws,
        jwsLength: jws?.length || 0
      });

      while (retryCount < this.MAX_RETRIES) {
        try {
          const verificationUrl = isProduction ? 
            CONSTANTS.PROD_VERIFICATION_URL : 
            CONSTANTS.SANDBOX_VERIFICATION_URL;

          const response = await axios.post<VerificationResponse>(verificationUrl, requestData, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 30000
          });

          // 检查响应状态
          if (response.data.status === 21007) {
            // 生产环境收据被发送到沙箱环境，重试沙箱验证
            logger.subscription('Production receipt sent to sandbox, retrying with sandbox URL');
            const sandboxResponse = await axios.post<VerificationResponse>(
              CONSTANTS.SANDBOX_VERIFICATION_URL,
              requestData,
              {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
              }
            );
            return this.processVerificationResponse(sandboxResponse.data, transactionId);
          }

          if (response.data.status === 21008) {
            // 沙箱收据被发送到生产环境，重试生产验证
            logger.subscription('Sandbox receipt sent to production, retrying with production URL');
            const prodResponse = await axios.post<VerificationResponse>(
              CONSTANTS.PROD_VERIFICATION_URL,
              requestData,
              {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
              }
            );
            return this.processVerificationResponse(prodResponse.data, transactionId);
          }

          // 处理其他状态码
          if (response.data.status !== 0) {
            throw new Error(`Receipt validation failed with status ${response.data.status}`);
          }

          // 验证 bundle ID
          if (response.data.receipt.bundle_id !== this.BUNDLE_ID) {
            throw new Error('Bundle ID mismatch');
          }

          return this.processVerificationResponse(response.data, transactionId);

        } catch (error) {
          retryCount++;
          if (retryCount === this.MAX_RETRIES) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        }
      }

    } catch (error) {
      logger.error('Transaction verification failed:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        environment: isProduction ? 'production' : 'sandbox',
        retryCount,
        transactionId
      });
      
      if (ENV.IS_SANDBOX) {
        logger.subscription('Development mode: returning mock response after error');
        return this.getMockResponse(transactionId);
      }
      
      throw error;
    }
  }

  private processVerificationResponse(response: VerificationResponse, transactionId: string): any {
    // 获取最新的交易信息
    const latestReceipt = response.latest_receipt_info?.[0] || 
                         response.receipt.in_app.sort((a, b) => 
                           parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms)
                         )[0];

    if (!latestReceipt) {
      throw new Error('No valid transaction found in receipt');
    }

    // 检查是否是自动续订订阅
    const pendingRenewal = response.pending_renewal_info?.[0];
    const isAutoRenewActive = pendingRenewal?.auto_renew_status === '1';
    
    // 处理宽限期信息
    const expirationIntent = pendingRenewal?.expiration_intent;
    const isInBillingRetryPeriod = expirationIntent === '1'; // 1表示由于支付问题无法续期
    
    // 构建交易信息
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
      // 在宽限期中，设置默认宽限期为到期后16天
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
      transactionId: transactionInfo.transactionId,
      purchaseDate: new Date(transactionInfo.purchaseDate),
      expirationDate: new Date(transactionInfo.expirationDate),
      isActive: this.isSubscriptionActive(transactionInfo),
      environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
      lastUpdated: now.toISOString(),
      isTrialPeriod: transactionInfo.isTrialPeriod,
      isInIntroOfferPeriod: transactionInfo.isInIntroOfferPeriod,
      webOrderLineItemId: transactionInfo.webOrderLineItemId,
      jws: transactionInfo.jws,
      isInGracePeriod: transactionInfo.isInBillingRetryPeriod,
      gracePeriodExpiresDate: transactionInfo.gracePeriodExpiresDate,
      autoRenewStatus: transactionInfo.isAutoRenewActive,
      expirationIntent: transactionInfo.expirationIntent
    };
  }
}

export default SubscriptionValidationService.getInstance(); 