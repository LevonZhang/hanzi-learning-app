import { Platform, Alert, Linking } from 'react-native';
import {
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  ProductPurchase,
  PurchaseError,
  getAvailablePurchases,
  requestSubscription,
  finishTransaction,
  clearTransactionIOS,
  clearProductsIOS,
  getSubscriptions,
} from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SubscriptionValidationService from './SubscriptionValidationService';
import { LearningManager } from './LearningManager';
import { ENV, CONSTANTS, SUBSCRIPTION_ERRORS } from '../config/env';
import { logger } from '../utils/logger';
import { i18n } from '../i18n/i18n';

// iOS 订阅产品 ID
const IOS_SKUS = {
  monthly: 'com.itlongbow.hanzilearning.monthly',
  quarterly: 'com.itlongbow.hanzilearning.quarterly',
  yearly: 'com.itlongbow.hanzilearning.yearly',
  lifetime: 'com.itlongbow.hanzilearning.lifetime',
} as const;

export const subscriptionSkus = IOS_SKUS;

class SubscriptionService {
  private static instance: SubscriptionService;
  private purchaseUpdateSubscription: any;
  private purchaseErrorSubscription: any;
  private subscriptionUpdateListeners: Set<(data: any) => void> = new Set();
  
  // 添加非会员限制常量
  private static readonly FREE_CHAR_LIMIT = 10;
  private static readonly FREE_GAME_LEVEL_LIMIT = 2;

  private constructor() {}

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async initialize() {
    try {
      logger.subscription('Initializing subscription service');
      await initConnection();
      await this.updateSubscriptionListeners();
      logger.subscription('Subscription service initialized');
    } catch (err) {
      logger.error('Failed to initialize IAP:', err);
    }
  }

  private handlePurchaseError(error: PurchaseError) {
    switch (error.code) {
      case 'E_USER_CANCELLED':
        throw new Error(SUBSCRIPTION_ERRORS.E_USER_CANCELLED);
      case 'E_ALREADY_OWNED':
        throw new Error(SUBSCRIPTION_ERRORS.E_ALREADY_OWNED);
      case 'E_NETWORK_ERROR':
        throw new Error(SUBSCRIPTION_ERRORS.E_NETWORK);
      default:
        throw new Error(`Purchase failed: ${error.message}`);
    }
  }

  async validateReceipt(purchase: ProductPurchase) {
    try {
      logger.subscription('Validating receipt', { purchaseId: purchase.transactionId });
      const result = await SubscriptionValidationService.verifyReceiptWithApple(
        purchase.transactionReceipt
      );

      if (result.status === 0 && result.latest_receipt_info?.length > 0) {
        const latestReceipt = result.latest_receipt_info[0];
        const subscriptionData = SubscriptionValidationService.parseReceiptInfo(latestReceipt);
        await this.updateSubscriptionStatus(subscriptionData);
      }
    } catch (err) {
      logger.error('Receipt validation failed:', err);
      throw err;
    }
  }

  private async updateSubscriptionStatus(subscriptionData: any) {
    try {
      const data = {
        ...subscriptionData,
        lastUpdated: new Date().toISOString(),
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
      };
      
      await AsyncStorage.setItem('subscriptionData', JSON.stringify(data));
      await AsyncStorage.setItem('isPremium', data.isActive.toString());
      
      this.notifySubscriptionUpdate(data);
      logger.subscription('Subscription status updated', data);
    } catch (err) {
      logger.error('Failed to update subscription status:', err);
      throw err;
    }
  }

  // 添加订阅状态更新监听器
  addSubscriptionUpdateListener(listener: (data: any) => void) {
    this.subscriptionUpdateListeners.add(listener);
  }

  // 移除订阅状态更新监听器
  removeSubscriptionUpdateListener(listener: (data: any) => void) {
    this.subscriptionUpdateListeners.delete(listener);
  }

  // 通知所有监听器
  private notifySubscriptionUpdate(data: any) {
    this.subscriptionUpdateListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error('Error in subscription update listener:', error);
      }
    });
  }

  async checkSubscriptionStatus(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      logger.debug('Subscription check disabled in development mode');
      return true;
    }

    try {
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        if (parsedData.productId.includes('lifetime')) {
          return true;
        }
        if (new Date() < new Date(parsedData.expirationDate)) {
          return true;
        }
      }

      try {
        const purchases = await getAvailablePurchases();
        if (purchases && purchases.length > 0) {
          await this.validateReceipt(purchases[0]);
          const updatedData = await AsyncStorage.getItem('subscriptionData');
          if (updatedData) {
            const parsedData = JSON.parse(updatedData);
            return parsedData.isActive;
          }
        }
      } catch (error) {
        logger.error('Failed to get available purchases:', error);
      }

      return false;
    } catch (err) {
      logger.error('Failed to check subscription status:', err);
      return false;
    }
  }

  async purchaseSubscription(planId: string) {
    try {
      const sku = subscriptionSkus[planId as keyof typeof IOS_SKUS];
      if (!sku) {
        throw new Error('Invalid subscription plan');
      }

      logger.subscription('Initiating subscription purchase', { planId, sku });
      
      await requestSubscription({
        sku: sku,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });
    } catch (err) {
      logger.error('Purchase failed:', err);
      this.handlePurchaseError(err as PurchaseError);
    }
  }

  cleanup() {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
    }
    this.subscriptionUpdateListeners.clear();
  }

  // 检查是否达到免费用户字数限制
  async checkFreeCharacterLimit(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      logger.debug('Character limit check disabled in development mode');
      return false;
    }

    try {
      const isPremium = await this.checkSubscriptionStatus();
      if (isPremium) return false;

      const learningManager = LearningManager.getInstance();
      const stats = await learningManager.getStatistics();
      return stats.totalLearned >= CONSTANTS.FREE_CHAR_LIMIT;
    } catch (err) {
      logger.error('Failed to check character limit:', err);
      return false;
    }
  }

  // 检查游戏关卡限制
  async checkGameLevelLimit(level: number): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      logger.debug('Game level limit check disabled in development mode');
      return false;
    }

    try {
      const isPremium = await this.checkSubscriptionStatus();
      if (isPremium) return false;
      return level > CONSTANTS.FREE_GAME_LEVEL_LIMIT;
    } catch (err) {
      logger.error('Failed to check game level limit:', err);
      return false;
    }
  }

  // 检查是否可以使用搜索功能
  async canUseSearch(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      logger.debug('Search feature check disabled in development mode');
      return true;
    }
    return this.checkSubscriptionStatus();
  }

  // 检查是否可以使用复习功能
  async canUseReview(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      logger.debug('Review feature check disabled in development mode');
      return true;
    }
    return this.checkSubscriptionStatus();
  }

  // 恢复订阅
  async restoreSubscriptions(): Promise<boolean> {
    try {
      logger.subscription('Attempting to restore subscriptions');
      
      const purchases = await getAvailablePurchases();
      if (!purchases || purchases.length === 0) {
        logger.subscription('No purchases found to restore');
        Alert.alert(
          i18n.t('error'),
          i18n.t('subscription.noSubscriptionToRestore')
        );
        return false;
      }

      let hasRestoredSubscription = false;
      for (const purchase of purchases) {
        try {
          await this.validateReceipt(purchase);
          hasRestoredSubscription = true;
        } catch (error) {
          logger.error('Failed to validate restored purchase:', error);
        }
      }

      if (hasRestoredSubscription) {
        Alert.alert(
          i18n.t('success'),
          i18n.t('subscription.restoreSuccess')
        );
        return true;
      } else {
        Alert.alert(
          i18n.t('error'),
          i18n.t('subscription.restoreError')
        );
        return false;
      }
    } catch (error) {
      logger.error('Restore subscriptions failed:', error);
      Alert.alert(
        i18n.t('error'),
        i18n.t('subscription.restoreError')
      );
      return false;
    }
  }

  // 打开订阅管理页面
  async openSubscriptionManagement() {
    try {
      await Linking.openURL('itms-apps://apps.apple.com/account/subscriptions');
    } catch (error) {
      logger.error('Failed to open subscription management:', error);
      Alert.alert(
        i18n.t('error'),
        i18n.t('subscription.manageInstructions')
      );
    }
  }

  // 检查订阅是否即将到期
  async checkSubscriptionExpiration() {
    try {
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        const expirationDate = new Date(parsedData.expirationDate);
        const now = new Date();
        const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiration <= 3 && daysUntilExpiration > 0) {
          Alert.alert(
            i18n.t('subscription.expiringSoon'),
            i18n.t('subscription.expiringSoonMessage', { days: daysUntilExpiration })
          );
        } else if (daysUntilExpiration <= 0) {
          Alert.alert(
            i18n.t('subscription.expired'),
            i18n.t('subscription.expiredMessage')
          );
        }
      }
    } catch (error) {
      logger.error('Failed to check subscription expiration:', error);
    }
  }

  // 清理订阅缓存（用于故障排除）
  async clearSubscriptionCache() {
    try {
      await clearTransactionIOS();
      await clearProductsIOS();
      await AsyncStorage.removeItem('subscriptionData');
      await AsyncStorage.removeItem('isPremium');
      logger.subscription('Subscription cache cleared');
    } catch (error) {
      logger.error('Failed to clear subscription cache:', error);
    }
  }

  // 获取可用的订阅产品
  async getAvailableSubscriptions() {
    try {
      const subscriptions = await getSubscriptions({
        skus: Object.values(IOS_SKUS)
      });
      return subscriptions;
    } catch (error) {
      logger.error('Failed to get available subscriptions:', error);
      return [];
    }
  }

  // 更新订阅监听器
  private async updateSubscriptionListeners() {
    // 移除旧的监听器
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
    }

    // 添加新的监听器
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: ProductPurchase) => {
        logger.subscription('Purchase updated', purchase);
        if (purchase.transactionReceipt) {
          Alert.alert(
            i18n.t('subscription.verifyingReceipt'),
            i18n.t('subscription.processingPurchase')
          );
          await this.validateReceipt(purchase);
          await finishTransaction({ purchase: purchase });
          
          // 通知用户订阅状态更新
          const subscriptionData = await AsyncStorage.getItem('subscriptionData');
          if (subscriptionData) {
            const parsedData = JSON.parse(subscriptionData);
            Alert.alert(
              i18n.t('subscription.statusChanged'),
              i18n.t('subscription.renewedUntil', {
                date: new Date(parsedData.expirationDate).toLocaleDateString()
              })
            );
          }
        }
      }
    );

    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        logger.error('Purchase error:', error);
        this.handlePurchaseError(error);
      }
    );
  }
}

export default SubscriptionService.getInstance();