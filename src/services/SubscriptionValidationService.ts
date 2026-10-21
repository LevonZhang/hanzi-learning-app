import axios from 'axios';
import { ENV, CONSTANTS } from '../config/env';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SubscriptionData {
  productId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  expirationDate: Date;
  isActive: boolean;
  environment: 'production' | 'sandbox';
  lastUpdated: string;
  transactionId?: string;
  isTrialPeriod?: boolean;
  isInIntroOfferPeriod?: boolean;
  webOrderLineItemId?: string;
  isInGracePeriod?: boolean;
  gracePeriodExpiresDate?: Date;
  autoRenewStatus?: boolean;
  expirationIntent?: string;
}

class SubscriptionValidationService {
  private static instance: SubscriptionValidationService;
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
    if (!ENV.APP_SHARED_SECRET) {
      throw new Error(
        'APP_SHARED_SECRET is not configured. Set EXPO_PUBLIC_APP_SHARED_SECRET in .env, ' +
        'or move receipt validation to a server (recommended, see README).'
      );
    }
    let retryCount = 0;
    
    try {
      logger.subscription('开始验证交易', {
        environment: isProduction ? 'production' : 'sandbox',
        transactionId,
        hasJws: !!jws,
        jwsLength: jws?.length || 0
      });

      const requestData = {
        'receipt-data': jws,
        'password': ENV.APP_SHARED_SECRET,
        'exclude-old-transactions': true
      };

      while (retryCount < this.MAX_RETRIES) {
        try {
          const verificationUrl = isProduction ? 
            CONSTANTS.PROD_VERIFICATION_URL : 
            CONSTANTS.SANDBOX_VERIFICATION_URL;

          const response = await axios.post(verificationUrl, requestData, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });

          if (response.data) {
            const result = this.processVerificationResponse(response.data, transactionId);
            return result;
          }
        } catch (error) {
          retryCount++;
          if (retryCount < this.MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          }
        }
      }

      throw new Error('验证交易失败: 超过最大重试次数');
    } catch (error: any) {
      logger.error('验证交易失败:', {
        error: error.message,
        stack: error.stack,
        transactionId
      });
      return {
        status: -1,
        error: error.message,
        transaction: null
      };
    }
  }

  private processVerificationResponse(response: any, transactionId: string): any {
    const latestReceipt = response.latest_receipt_info?.[0] || 
                         response.receipt.in_app.sort((a: { purchase_date_ms: string }, b: { purchase_date_ms: string }) => 
                           parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms)
                         )[0];

    if (!latestReceipt) {
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

    return {
      status: 0,
      environment: response.environment,
      transaction
    };
  }

  isSubscriptionActive(transaction: any): boolean {
    if (!transaction) return false;

    // 检查是否是永久会员
    if (transaction.productId?.includes('lifetime')) {
      return true;
    }

    // 检查是否在宽限期内
    const now = new Date();
    if (transaction.isInBillingRetryPeriod && transaction.gracePeriodExpiresDate) {
      const gracePeriodExpiry = new Date(transaction.gracePeriodExpiresDate);
      if (now < gracePeriodExpiry) {
        return true;
      }
    }

    // 检查订阅是否过期
    const expirationDate = new Date(transaction.expirationDate);
    return now < expirationDate;
  }

  // 解析交易信息为订阅数据
  parseTransactionInfo(transactionInfo: any): SubscriptionData {
    const now = new Date();
    
    // 为lifetime会员设置特殊到期日期
    let expirationDate;
    if (transactionInfo.productId?.includes('lifetime')) {
      // 使用2050年作为终身会员的到期日期，避免Date范围错误
      expirationDate = new Date(2050, 0, 1);
    } else {
      expirationDate = new Date(transactionInfo.expirationDate);
    }
    
    return {
      productId: transactionInfo.productId,
      originalTransactionId: transactionInfo.originalTransactionId,
      purchaseDate: new Date(transactionInfo.purchaseDate),
      expirationDate: expirationDate,
      isActive: this.isSubscriptionActive(transactionInfo),
      environment: transactionInfo.environment || 'production',
      lastUpdated: now.toISOString(),
      transactionId: transactionInfo.transactionId,
      isTrialPeriod: transactionInfo.isTrialPeriod,
      isInIntroOfferPeriod: transactionInfo.isInIntroOfferPeriod,
      webOrderLineItemId: transactionInfo.webOrderLineItemId,
      isInGracePeriod: transactionInfo.isInBillingRetryPeriod,
      gracePeriodExpiresDate: transactionInfo.gracePeriodExpiresDate,
      autoRenewStatus: transactionInfo.isAutoRenewActive,
      expirationIntent: transactionInfo.expirationIntent
    };
  }

  // 订阅更新监听器集合
  private subscriptionListeners: Set<(data: SubscriptionData) => void> = new Set();

  // 添加订阅更新监听器
  addSubscriptionUpdateListener(listener: (data: SubscriptionData) => void): void {
    this.subscriptionListeners.add(listener);
  }

  // 移除订阅更新监听器
  removeSubscriptionUpdateListener(listener: (data: SubscriptionData) => void): void {
    this.subscriptionListeners.delete(listener);
  }

  // 通知所有监听器
  private notifyListeners(data: SubscriptionData): void {
    this.subscriptionListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error('Error in subscription listener:', error);
      }
    });
  }

  // 检查订阅状态
  async checkSubscriptionStatus(): Promise<boolean> {
    try {
      // 从AsyncStorage获取当前存储的订阅信息
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (!subscriptionData) return false;

      const parsedData = JSON.parse(subscriptionData);
      return this.isSubscriptionActive(parsedData);
    } catch (error) {
      logger.error('Error checking subscription status:', error);
      return false;
    }
  }
}

export { SubscriptionValidationService };
export type { SubscriptionData }; 