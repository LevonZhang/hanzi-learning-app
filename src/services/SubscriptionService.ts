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
  monthly: 'com.itlongbow.hanzilearningapp.sub.monthly',
  quarterly: 'com.itlongbow.hanzilearningapp.sub.quarterly',
  yearly: 'com.itlongbow.hanzilearningapp.sub.yearly',
  lifetime: 'com.itlongbow.hanzilearningapp.sub.lifetime',
} as const;

export const subscriptionSkus = IOS_SKUS;

export default class SubscriptionService {
  private static instance: SubscriptionService;
  private purchaseUpdateSubscription: any;
  private purchaseErrorSubscription: any;
  private subscriptionUpdateListeners: Set<(data: any) => void> = new Set();
  
  // 添加非会员限制常量
  private static readonly FREE_CHAR_LIMIT = 10;
  private static readonly FREE_GAME_LEVEL_LIMIT = 2;

  private isInitialized = false;

  private constructor() {}

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      logger.subscription('Initializing subscription service', {
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
        checkSubscription: ENV.CHECK_SUBSCRIPTION
      });
      
      // 在开发环境中清除缓存
      if (ENV.IS_SANDBOX) {
        await clearTransactionIOS();
        await clearProductsIOS();
      }
      
      await initConnection();
      
      // 获取可用产品
      const products = await getSubscriptions({
        skus: Object.values(IOS_SKUS)
      });
      logger.subscription('Available products:', products);
      
      await this.updateSubscriptionListeners();
      this.isInitialized = true;
      logger.subscription('Subscription service initialized', {
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
        isInitialized: this.isInitialized,
        productsCount: products.length
      });
    } catch (err) {
      logger.error('Failed to initialize IAP:', {
        error: err,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
      });
      // 不抛出错误，让应用继续运行
      this.isInitialized = false;
    }
  }

  private handlePurchaseError(error: PurchaseError) {
    logger.error('Purchase error occurred:', {
      code: error.code,
      message: error.message
    });

    // 防止重复抛出错误
    if (error instanceof Error) {
      return error;
    }

    let errorMessage: string;
    switch (error.code) {
      case 'E_USER_CANCELLED':
        errorMessage = i18n.t('subscription.errors.userCancelled');
        break;
      case 'E_ALREADY_OWNED':
        errorMessage = i18n.t('subscription.errors.alreadyOwned');
        break;
      case 'E_NETWORK_ERROR':
        errorMessage = i18n.t('subscription.errors.network');
        break;
      default:
        errorMessage = i18n.t('subscription.errors.unknown');
    }

    return new Error(errorMessage);
  }

  async validatePurchase(purchase: ProductPurchase): Promise<boolean> {
    try {
      const transaction = {
        transactionId: purchase.transactionId || '',
        originalTransactionId: purchase.originalTransactionDateIOS || '',
        productId: purchase.productId,
        purchaseDate: purchase.transactionDate,
        jws: purchase.transactionReceipt || ''
      };

      if (!transaction.transactionId || !transaction.jws) {
        throw new Error('Missing transaction data');
      }

      const result = await SubscriptionValidationService.verifyTransaction(
        transaction.transactionId,
        transaction.jws
      );

      const subscriptionData = SubscriptionValidationService.parseTransactionInfo(result.transaction);
      await this.updateSubscriptionStatus(subscriptionData);
      return subscriptionData.isActive;
    } catch (error) {
      logger.error('Purchase validation failed:', error);
      return false;
    }
  }

  async validatePurchaseWithAlert(purchase: ProductPurchase): Promise<boolean> {
    try {
      const isValid = await this.validatePurchase(purchase);
      if (!isValid) {
        Alert.alert(
          i18n.t('error'),
          i18n.t('subscription.errors.validation')
        );
      }
      return isValid;
    } catch (error) {
      logger.error('Purchase validation with alert failed:', error);
      Alert.alert(
        i18n.t('error'),
        i18n.t('subscription.errors.validation')
      );
      return false;
    }
  }

  private async updateSubscriptionStatus(subscriptionData: any) {
    const updatePromise = async () => {
      try {
        const data = {
          ...subscriptionData,
          lastUpdated: new Date().toISOString(),
          environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
        };
        
        logger.subscription('Updating subscription status', {
          isActive: data.isActive,
          productId: data.productId,
          expirationDate: data.expirationDate,
          environment: data.environment
        });
        
        // 使用事务性更新
        await AsyncStorage.multiSet([
          ['subscriptionData', JSON.stringify(data)],
          ['isPremium', data.isActive.toString()]
        ]);

        // 读取回来验证是否正确保存
        const [savedData, savedIsPremium] = await AsyncStorage.multiGet(['subscriptionData', 'isPremium']);
        logger.subscription('Verified saved subscription data', {
          subscriptionDataSaved: !!savedData[1],
          isPremiumSaved: savedIsPremium[1],
          savedDataMatches: savedData[1] === JSON.stringify(data),
          savedIsPremiumMatches: savedIsPremium[1] === data.isActive.toString()
        });
        
        // 安全地通知监听器
        this.safeNotifySubscriptionUpdate(data);
        
        logger.subscription('Subscription status updated successfully', data);
      } catch (err) {
        logger.error('Failed to update subscription status:', {
          error: err,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
          subscriptionData: {
            isActive: subscriptionData.isActive,
            productId: subscriptionData.productId,
            expirationDate: subscriptionData.expirationDate
          }
        });
        throw err;
      }
    };

    // 添加重试机制
    let retries = 3;
    while (retries > 0) {
      try {
        await updatePromise();
        return;
      } catch (err) {
        retries--;
        logger.error(`Failed to update subscription status, retries left: ${retries}`, {
          error: err,
          errorMessage: err instanceof Error ? err.message : 'Unknown error'
        });
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private safeNotifySubscriptionUpdate(data: any) {
    const listeners = Array.from(this.subscriptionUpdateListeners);
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error('Error in subscription listener:', error);
        // 移除有问题的监听器
        this.subscriptionUpdateListeners.delete(listener);
      }
    });
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
        
        logger.subscription('Current subscription status:', {
          isActive: parsedData.isActive,
          productId: parsedData.productId,
          expirationDate: parsedData.expirationDate
        });

        if (parsedData.productId?.includes('lifetime')) {
          return true;
        }
        
        if (parsedData.expirationDate) {
          const expirationDate = new Date(parsedData.expirationDate);
          const now = new Date();
          const isActive = now < expirationDate;
          
          logger.subscription('Subscription expiration check:', {
            expirationDate: expirationDate.toISOString(),
            currentDate: now.toISOString(),
            isActive
          });
          
          return isActive;
        }
      }

      try {
        const purchases = await getAvailablePurchases();
        if (purchases && purchases.length > 0) {
          logger.subscription('Found available purchases:', { count: purchases.length });
          
          // 使用最新的交易进行验证
          const latestPurchase = purchases[0];
          const transaction = {
            transactionId: latestPurchase.transactionId || '',
            originalTransactionId: latestPurchase.originalTransactionDateIOS || '',
            productId: latestPurchase.productId,
            purchaseDate: latestPurchase.transactionDate,
            jws: latestPurchase.transactionReceipt || ''
          };

          if (!transaction.transactionId || !transaction.jws) {
            throw new Error('Missing transaction data');
          }

          const result = await SubscriptionValidationService.verifyTransaction(
            transaction.transactionId,
            transaction.jws
          );

          const subscriptionData = SubscriptionValidationService.parseTransactionInfo(result.transaction);
          await this.updateSubscriptionStatus(subscriptionData);
          return subscriptionData.isActive;
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
        throw new Error(i18n.t('subscription.errors.invalidPlan'));
      }

      logger.subscription('Starting subscription purchase', { planId, sku });

      // 确保 IAP 连接已初始化
      try {
        await initConnection();
        logger.subscription('IAP connection initialized');
      } catch (error) {
        logger.error('Failed to initialize IAP connection:', error);
        throw new Error(i18n.t('subscription.errors.initFailed'));
      }

      // 检查是否已有活跃订阅 - 移到初始化成功后检查
      try {
        const subscriptionStatus = await this.checkSubscriptionStatus();
        if (subscriptionStatus) {
          Alert.alert(
            i18n.t('subscription.alreadySubscribed'),
            i18n.t('subscription.alreadySubscribedDesc'),
            [
              { 
                text: i18n.t('subscription.cancel'),
                style: 'cancel'
              },
              {
                text: i18n.t('subscription.manage'),
                onPress: () => this.openSubscriptionManagement()
              }
            ]
          );
          return;
        }
      } catch (error) {
        logger.error('Failed to check subscription status:', error);
        // 即使检查失败也继续订阅流程
      }

      // 开始订阅流程
      return await requestSubscription({
        sku: sku,
        andDangerouslyFinishTransactionAutomaticallyIOS: false
      });
      
    } catch (err: any) {
      const error = this.handlePurchaseError(err);
      
      // 只有在不是用户取消操作时才显示错误消息
      if (error.message !== i18n.t('subscription.errors.userCancelled')) {
        Alert.alert(
          i18n.t('error'),
          error.message,
          [{ text: i18n.t('ok') }]
        );
      }
      
      throw error;
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
    try {
      // 如果是会员用户，直接返回 false（未达到限制）
      const subscriptionData = await this.checkSubscriptionStatus();
      if (subscriptionData) {
        return false;
      }

      // 获取今天已学习的字数
      const learningManager = LearningManager.getInstance();
      const todayLearned = await learningManager.getTodayLearnedCount();
      
      // 检查是否达到免费用户限制
      return todayLearned >= CONSTANTS.FREE_CHAR_LIMIT;
    } catch (error) {
      logger.error('Error checking free character limit:', error);
      return false; // 出错时默认不限制
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
    
    const isSubscribed = await this.checkSubscriptionStatus();
    logger.subscription('Search permission check:', { isSubscribed });
    return isSubscribed;
  }

  // 检查是否可以使用复习功能
  async canUseReview(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      logger.debug('Review feature check disabled in development mode');
      return true;
    }
    
    const isSubscribed = await this.checkSubscriptionStatus();
    logger.subscription('Review permission check:', { isSubscribed });
    return isSubscribed;
  }

  // 恢复订阅
  async restoreSubscriptions(): Promise<boolean> {
    try {
      logger.subscription('Attempting to restore subscriptions');
      
      const purchases = await getAvailablePurchases();
      
      if (!purchases || purchases.length === 0) {
        logger.subscription('No purchases found to restore');
        Alert.alert(
          i18n.t('subscription.noSubscriptionFound'),
          i18n.t('subscription.subscribeNow'),
          [
            { text: i18n.t('cancel'), style: 'cancel' },
            {
              text: i18n.t('getPremium'),
              onPress: () => {
                // 用户已经在订阅页面
              }
            }
          ]
        );
        return false;
      }

      let hasRestoredSubscription = false;
      for (const purchase of purchases) {
        try {
          const transaction = {
            transactionId: purchase.transactionId || '',
            originalTransactionId: purchase.originalTransactionDateIOS || '',
            productId: purchase.productId,
            purchaseDate: purchase.transactionDate,
            jws: purchase.transactionReceipt || ''
          };

          if (!transaction.transactionId || !transaction.jws) {
            continue;
          }

          const result = await SubscriptionValidationService.verifyTransaction(
            transaction.transactionId,
            transaction.jws
          );

          const subscriptionData = SubscriptionValidationService.parseTransactionInfo(result.transaction);
          await this.updateSubscriptionStatus(subscriptionData);
          hasRestoredSubscription = hasRestoredSubscription || subscriptionData.isActive;
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
          i18n.t('subscription.noActiveSubscription'),
          i18n.t('subscription.subscribeNow'),
          [
            { text: i18n.t('cancel'), style: 'cancel' },
            {
              text: i18n.t('getPremium'),
              onPress: () => {
                // 用户已经在订阅页面
              }
            }
          ]
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

          try {
            // 获取交易信息
            const transaction = {
              transactionId: purchase.transactionId || '',
              originalTransactionId: purchase.originalTransactionDateIOS || '',
              productId: purchase.productId,
              purchaseDate: purchase.transactionDate,
              jws: purchase.transactionReceipt
            };

            if (!transaction.transactionId) {
              throw new Error('Missing transaction ID');
            }

            // 使用新的验证方法
            const result = await SubscriptionValidationService.verifyTransaction(
              transaction.transactionId,
              transaction.jws
            );

            // 解析验证结果
            const subscriptionData = SubscriptionValidationService.parseTransactionInfo(result.transaction);
            await this.updateSubscriptionStatus(subscriptionData);

            // 完成交易
            await finishTransaction({ purchase });

            // 通知用户订阅状态更新
            if (subscriptionData.isActive) {
              Alert.alert(
                i18n.t('subscription.statusChanged'),
                i18n.t('subscription.renewedUntil', {
                  date: subscriptionData.expirationDate.toLocaleDateString()
                })
              );
            }
          } catch (error) {
            logger.error('Transaction verification failed:', error);
            Alert.alert(
              i18n.t('error'),
              i18n.t('subscription.errors.validation')
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