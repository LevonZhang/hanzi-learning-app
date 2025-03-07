import { Platform, Alert, Linking, NativeEventEmitter, NativeModules, EmitterSubscription } from 'react-native';
import {
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  ProductPurchase,
  PurchaseError,
  finishTransaction,
  getSubscriptions,
  clearTransactionIOS,
  validateReceiptIos,
  Product,
  Subscription,
  SubscriptionPurchase,
} from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionValidationService } from './SubscriptionValidationService';
import { LearningManager } from './LearningManager';
import { ENV, CONSTANTS, SUBSCRIPTION_ERRORS } from '../config/env';
import { logger } from '../utils/logger';
import { i18n } from '../i18n/i18n';
import RNIap from 'react-native-iap';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// 订阅计划类型
export type SubscriptionPlanId = 'com.itlongbow.hanzilearningapp.sub.monthly' | 'com.itlongbow.hanzilearningapp.sub.quarterly' | 'com.itlongbow.hanzilearningapp.sub.yearly' | 'com.itlongbow.hanzilearningapp.sub.lifetime';

// iOS 订阅产品 ID
export const IOS_SKUS: Record<SubscriptionPlanId, string> = {
  'com.itlongbow.hanzilearningapp.sub.monthly': 'com.itlongbow.hanzilearningapp.sub.monthly',
  'com.itlongbow.hanzilearningapp.sub.quarterly': 'com.itlongbow.hanzilearningapp.sub.quarterly',
  'com.itlongbow.hanzilearningapp.sub.yearly': 'com.itlongbow.hanzilearningapp.sub.yearly',
  'com.itlongbow.hanzilearningapp.sub.lifetime': 'com.itlongbow.hanzilearningapp.sub.lifetime',
} as const;

// 订阅计划配置
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, {
  id: SubscriptionPlanId;
  price: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = {
  'com.itlongbow.hanzilearningapp.sub.monthly': {
    id: 'com.itlongbow.hanzilearningapp.sub.monthly',
    price: 4.99,
    icon: 'star',
  },
  'com.itlongbow.hanzilearningapp.sub.quarterly': {
    id: 'com.itlongbow.hanzilearningapp.sub.quarterly',
    price: 12.99,
    icon: 'star-shooting',
  },
  'com.itlongbow.hanzilearningapp.sub.yearly': {
    id: 'com.itlongbow.hanzilearningapp.sub.yearly',
    price: 39.99,
    icon: 'star-circle',
  },
  'com.itlongbow.hanzilearningapp.sub.lifetime': {
    id: 'com.itlongbow.hanzilearningapp.sub.lifetime',
    price: 99.99,
    icon: 'crown',
  },
} as const;

export const subscriptionSkus = IOS_SKUS;
export const SUBSCRIPTION_KEY = 'subscriptionData'; // 添加订阅数据存储键

interface SubscriptionDataType {
  isActive: boolean;
  productId: string | null;
  expirationDate: string | Date | null;
  lastUpdated?: string;
  [key: string]: any;
}

interface ServerSubscriptionStatus {
  isActive: boolean;
  productId: string | null;
  expirationDate?: string | Date;
}

export default class SubscriptionService {
  private static instance: SubscriptionService;
  private purchaseUpdateSubscription: any;
  private purchaseErrorSubscription: any;
  private subscriptionExpirationSubscription: any;
  private subscriptionUpdateListeners: Set<(data: any) => void> = new Set();
  
  // 添加非会员限制常量
  private static readonly FREE_CHAR_LIMIT = 10;
  private static readonly FREE_GAME_LEVEL_LIMIT = 2;

  private isInitialized = false;
  private processedTransactions: Set<string> = new Set();
  
  // 添加提醒状态跟踪变量
  private isShowingExpirationAlert = false;
  private lastAlertTime = 0;
  private readonly ALERT_COOLDOWN = 3000; // 3秒内不重复显示相同提醒

  private currentSubscriptionData: SubscriptionDataType | null = null;
  private initializationPromise: Promise<boolean> | null = null;

  private constructor() {}

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async initialize() {
    // 如果已经在初始化中，返回现有的promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // 如果已经初始化完成，直接返回
    if (this.isInitialized) {
      return true;
    }

    // 创建新的初始化promise
    this.initializationPromise = (async () => {
      try {
        logger.subscription('开始初始化订阅服务');

        // 首先初始化IAP连接
        try {
          await initConnection();
          logger.subscription('IAP连接初始化成功');
        } catch (error) {
          logger.error('IAP连接初始化失败:', error);
          // 不要抛出错误，让应用继续运行
          this.isInitialized = true;
          return false;
        }

        // 设置监听器
        this.setupTransactionListener();

        // 标记为已初始化，确保后续操作不会重复初始化
        this.isInitialized = true;

        // 异步获取订阅状态，但不阻塞初始化完成
        this.fetchAndUpdateSubscriptionStatus().catch(error => {
          logger.error('获取订阅状态失败:', error);
        });

        return true;
      } catch (error) {
        logger.error('初始化订阅服务失败:', error);
        // 即使失败也标记为已初始化，防止无限重试
        this.isInitialized = true;
        return false;
      } finally {
        // 清除初始化promise
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  private handlePurchaseError(error: PurchaseError): void {
    try {
      // 根据错误码记录不同类型的错误
      const errorCode = error.code || 'unknown';
      const errorMessage = error.message || 'No error message';
      
      logger.error('购买错误', {
        code: errorCode,
        message: errorMessage,
        responseCode: error.responseCode, // 使用responseCode而不是responseBody
        timestamp: new Date().toISOString()
      });
      
      // 处理用户取消类错误 (不显示提示)
      if (errorCode === 'E_USER_CANCELLED') {
        logger.subscription('用户取消购买');
        return;
      }
      
      // 处理网络错误
      if (errorCode === 'E_NETWORK_ERROR') {
      Alert.alert(
          '网络错误',
          '购买过程中出现网络问题，请检查您的网络连接后重试。',
          [{ text: '确定', style: 'default' }]
        );
        return;
      }
      
      // 处理其他错误
      Alert.alert(
        '购买失败',
        `订阅购买过程中出现错误: ${errorMessage}`,
        [{ text: '确定', style: 'default' }]
      );
      
      // 通知监听器订阅状态可能已发生变化
      this.updateSubscriptionListeners();
    } catch (err) {
      // 错误处理器中出现错误
      logger.error('处理购买错误时出现异常', err);
    }
  }

  private async validatePurchase(purchase: ProductPurchase): Promise<boolean> {
    if (!purchase) {
      logger.error('无效的购买对象');
      return false;
    }
    
    try {
      logger.subscription('开始验证购买:', {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        transactionDate: purchase.transactionDate,
        hasJWT: !!purchase.verificationResultIOS
      });

      // 首先尝试使用 StoreKit 2 的 JWT 验证（iOS 15+）
      if (purchase.verificationResultIOS) {
        try {
          const jwtParts = purchase.verificationResultIOS.split('.');
          if (jwtParts.length === 3) {
            const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
            const expirationDate = new Date(payload.expiresDate);
            const now = new Date();

            // 即使 JWT 验证成功，我们仍然发送到服务器进行记录
            const subscriptionValidator = SubscriptionValidationService.getInstance();
            subscriptionValidator.verifyTransaction(
              purchase.transactionId || '',
              purchase.transactionReceipt || ''
            ).catch(error => {
              logger.error('服务器记录 JWT 验证结果失败:', error);
            });

            const subscriptionData: SubscriptionDataType = {
              isActive: now < expirationDate,
              productId: purchase.productId,
              expirationDate: expirationDate.toISOString(),
              lastUpdated: new Date().toISOString(),
              environment: payload.environment
            };

            await this.updateSubscriptionStatus(subscriptionData);
            return true;
          }
        } catch (jwtError) {
          logger.error('JWT 验证失败，尝试服务器验证:', jwtError);
        }
      }
      
      // 如果 JWT 验证失败或不可用，使用服务器验证
      const receipt = purchase.transactionReceipt;
      if (!receipt) {
        logger.error('购买凭证为空，无法进行服务器验证', purchase.productId);
        return false;
      }
      
      const subscriptionValidator = SubscriptionValidationService.getInstance();
      const validationResult = await subscriptionValidator.verifyTransaction(
        purchase.transactionId || '',
        receipt
      );

      if (validationResult.status === -1) {
        logger.error('服务器验证失败', {
          error: validationResult.error,
          transactionId: purchase.transactionId
        });
        return false;
      }

      if (validationResult.transaction) {
        const subscriptionData = subscriptionValidator.parseTransactionInfo(validationResult.transaction);
        await this.updateSubscriptionStatus(subscriptionData);
        return true;
      }
      
      return false;
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
        
        await AsyncStorage.multiSet([
          ['subscriptionData', JSON.stringify(data)],
          ['isPremium', data.isActive.toString()]
        ]);

        const [savedData, savedIsPremium] = await AsyncStorage.multiGet(['subscriptionData', 'isPremium']);
        logger.subscription('Verified saved subscription data', {
          subscriptionDataSaved: !!savedData[1],
          isPremiumSaved: savedIsPremium[1],
          savedDataMatches: savedData[1] === JSON.stringify(data),
          savedIsPremiumMatches: savedIsPremium[1] === data.isActive.toString()
        });
        
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
        logger.error('Subscription update listener error:', error);
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

  // 通知所有订阅状态更新监听器
  private notifySubscriptionUpdate(data: any) {
    logger.subscription('Notifying subscription update', { 
      activeListeners: this.subscriptionUpdateListeners.size,
      isActive: data.isActive,
      productId: data.productId
    });
    
    this.subscriptionUpdateListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error('Error in subscription update listener:', error);
      }
    });
  }

  // 检查订阅状态
  async checkSubscriptionStatus() {
    try {
      // 直接从验证服务获取订阅状态
      const validator = SubscriptionValidationService.getInstance();
      return await validator.checkSubscriptionStatus();
    } catch (error) {
      logger.error('检查订阅状态失败:', error);
      return false;
    }
  }

  async purchaseSubscription(planId: SubscriptionPlanId) {
    try {
      logger.subscription('开始订阅购买流程:', { planId });

      if (!this.isInitialized) {
        logger.subscription('订阅服务未初始化，正在初始化...');
        await this.initialize();
      }
      
      const fullProductId = IOS_SKUS[planId];
      if (!fullProductId) {
        throw new Error(`Invalid subscription plan: ${planId}`);
      }

      logger.subscription('正在获取可用订阅产品...');
      // Get available subscriptions first
      const availableSubscriptions = await getSubscriptions({
        skus: Object.values(IOS_SKUS)
      });

      logger.subscription('获取到的订阅产品:', {
        count: availableSubscriptions.length,
        products: availableSubscriptions.map(sub => sub.productId)
      });

      // Verify the subscription product exists
      const subscriptionProduct = availableSubscriptions.find(
        (sub) => sub.productId === fullProductId
      );

      if (!subscriptionProduct) {
        throw new Error(`Subscription product not found: ${fullProductId}`);
      }

      logger.subscription('找到匹配的订阅产品:', {
        productId: subscriptionProduct.productId,
        title: subscriptionProduct.title,
        description: subscriptionProduct.description
      });
      
      logger.subscription('正在发起购买请求...');
      const { requestPurchase } = await import('react-native-iap');
      const result = await requestPurchase({
        sku: fullProductId,
        andDangerouslyFinishTransactionAutomaticallyIOS: false
      });

      logger.subscription('购买请求已发送，等待 StoreKit 响应...', { result });

      // Update subscription status immediately after purchase
      await this.fetchAndUpdateSubscriptionStatus();
      
      return {
        success: true,
        planId,
        fullProductId,
        result
      };
    } catch (error) {
      logger.error('订阅购买失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '购买失败'
      };
    }
  }

  async cleanup() {
    try {
      // 移除监听器
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
        this.purchaseUpdateSubscription = null;
    }
      
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
        this.purchaseErrorSubscription = null;
      }
      
      if (this.subscriptionExpirationSubscription) {
        this.subscriptionExpirationSubscription.remove();
        this.subscriptionExpirationSubscription = null;
      }

      // 不再需要停止定期检查
      // this.stopPeriodicSubscriptionCheck();

      // 清空监听器集合
      this.subscriptionUpdateListeners.clear();

      // 重置初始化状态
      this.isInitialized = false;

      logger.subscription('订阅服务清理完成');
      return true;
    } catch (error) {
      logger.error('清理订阅服务失败:', error);
      return false;
    }
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
        const currentTime = new Date();
        const daysUntilExpiration = Math.ceil((expirationDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24));

        // 只记录日志，不显示提醒
        logger.subscription('Subscription expiration check', {
          daysUntilExpiration,
          expirationDate: expirationDate.toISOString(),
          currentTime: currentTime.toISOString(),
          isExpired: daysUntilExpiration <= 0
        });
      }
    } catch (error) {
      logger.error('Failed to check subscription expiration:', error);
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
    try {
      // 移除旧的事件监听器
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
        this.purchaseUpdateSubscription = null;
    }
      
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
        this.purchaseErrorSubscription = null;
      }
      
      // 添加购买更新监听器
      this.purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: ProductPurchase) => {
        logger.subscription('收到购买更新事件:', {
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          transactionDate: purchase.transactionDate,
          timestamp: new Date().toISOString()
        });
        
        // 确保transactionId不为undefined
        const transactionId = purchase.transactionId || '';
        
        // 避免重复处理相同交易
        if (this.processedTransactions.has(transactionId)) {
          logger.subscription('跳过已处理的交易:', transactionId);
          return;
        }

        // 标记为已处理
        this.processedTransactions.add(transactionId);
        
        // 验证购买
        const isValid = await this.validatePurchaseWithAlert(purchase);
        
        // 如果验证成功，或环境为非正式环境，完成交易
        if (isValid || ENV.IS_SANDBOX) {
          try {
            // 消耗型商品设置为 true，订阅设置为 false
            await finishTransaction({
              purchase,
              isConsumable: false
            });
            logger.subscription('交易已完成:', transactionId);
          } catch (finishError) {
            logger.error('完成交易失败:', {
              error: finishError,
              transactionId
            });
          }
        } else {
          logger.error('购买验证失败，不完成交易:', {
            transactionId
          });
        }
      });
      
      // 添加购买错误监听器
      this.purchaseErrorSubscription = purchaseErrorListener(this.handlePurchaseError.bind(this));
      
      logger.subscription('订阅监听器已更新');
    } catch (error) {
      logger.error('更新订阅监听器失败:', error);
    }
  }

  // 辅助方法：获取可用的购买记录
  async getAvailablePurchases(): Promise<any[]> {
    try {
      // 确保IAP连接已初始化
      if (!this.isInitialized) {
        await this.initialize();
      }

      // 获取可用的购买记录
      const { getAvailablePurchases } = await import('react-native-iap');
      const purchases = await getAvailablePurchases();
      if (!purchases || purchases.length === 0) {
        return [];
      }

      // 根据交易日期排序，最新的在前
      const sortedPurchases = purchases.sort((a, b) => {
        const aDate = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
        const bDate = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
        return bDate - aDate;
      });

      return sortedPurchases;
    } catch (error) {
      logger.error('获取购买记录失败', error);
      return [];
    }
  }

  private async handleSubscriptionStatusChange(event: any) {
    logger.info('订阅状态变更:', event);
    
    const { productId, expirationDate, purchaseToken } = event;
    
    if (expirationDate) {
      const now = new Date();
      const expiration = new Date(expirationDate);
      const isExpired = now > expiration;

      if (isExpired) {
        // 更新本地存储的订阅状态
        await AsyncStorage.setItem('subscriptionData', JSON.stringify({
          isActive: false,
          productId: null,
          expirationDate: null
        }));

        // 发送订阅过期通知
        this.notifySubscriptionExpired();
      }
    }
  }

  private notifySubscriptionExpired() {
    // 这里可以实现通知其他组件订阅已过期的逻辑
    // 例如使用 EventEmitter 或其他状态管理方案
  }

  private async fetchAndUpdateSubscriptionStatus() {
    try {
      // Get available purchases
      const purchases = await this.getAvailablePurchases();
      logger.subscription('获取到购买记录:', {
        purchaseCount: purchases?.length || 0,
        hasRecords: !!purchases && purchases.length > 0
      });
      
      if (purchases && purchases.length > 0) {
        // Sort by transaction date to get the latest
        const latestPurchase = purchases.sort((a, b) => {
          const aDate = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
          const bDate = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
          return bDate - aDate;
        })[0];

        logger.subscription('最新的购买记录:', {
          transactionId: latestPurchase.transactionId,
          productId: latestPurchase.productId,
          transactionDate: new Date(latestPurchase.transactionDate).toISOString(),
          hasVerificationResult: !!latestPurchase.verificationResultIOS
        });

        if (latestPurchase && latestPurchase.verificationResultIOS) {
          try {
            // Parse the JWT token
            const jwtParts = latestPurchase.verificationResultIOS.split('.');
            if (jwtParts.length === 3) {
              const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
              
              // Get expiration date from JWT
              const expirationDate = new Date(payload.expiresDate);
              const now = new Date();
              
              logger.subscription('解析到的订阅信息:', {
                expirationDate: expirationDate.toISOString(),
                currentTime: now.toISOString(),
                isActive: now < expirationDate,
                environment: payload.environment,
                transactionReason: payload.transactionReason
              });

              const subscriptionData: SubscriptionDataType = {
                isActive: now < expirationDate,
                productId: latestPurchase.productId,
                expirationDate: expirationDate.toISOString(),
                lastUpdated: new Date().toISOString(),
                environment: payload.environment
              };

              await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscriptionData));
              this.currentSubscriptionData = subscriptionData;
              this.notifySubscriptionUpdate(subscriptionData);
              
              logger.subscription('订阅状态已更新', subscriptionData);
              return;
            }
          } catch (jwtError) {
            logger.error('解析验证结果JWT失败:', jwtError);
          }
        }
      }

      // If no valid subscription found, set inactive status
      const subscriptionData: SubscriptionDataType = {
        isActive: false,
        productId: null,
        expirationDate: null,
        lastUpdated: new Date().toISOString()
      };
      
      await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscriptionData));
      this.currentSubscriptionData = subscriptionData;
      this.notifySubscriptionUpdate(subscriptionData);
      
      logger.subscription('未找到有效订阅');
    } catch (error) {
      logger.error('获取订阅状态失败:', error);
      throw error;
    }
  }

  // 设置 Transaction.updates 监听器
  private setupTransactionListener() {
    if (Platform.OS === 'ios') {
      try {
        // 使用 StoreKit 2 的购买更新监听器
        if (!this.purchaseUpdateSubscription) {
          this.purchaseUpdateSubscription = purchaseUpdatedListener(
            async (purchase: ProductPurchase) => {
              try {
                // 避免重复处理 - 检查transactionId是否存在
                if (purchase.transactionId && this.processedTransactions.has(purchase.transactionId)) {
                  logger.subscription('跳过已处理的交易:', purchase.transactionId);
                  return;
                }

                logger.subscription('检测到交易更新:', {
                  productId: purchase.productId,
                  transactionId: purchase.transactionId,
                  transactionDate: new Date(purchase.transactionDate).toISOString(),
                  hasJWT: !!purchase.verificationResultIOS
                });

                // 验证购买
                const isValid = await this.validatePurchase(purchase);
                
                // 如果验证成功，或环境为非正式环境，完成交易
                if (isValid || ENV.IS_SANDBOX) {
                  try {
                    await finishTransaction({ purchase });
                    logger.subscription('交易已完成:', purchase.transactionId);
                    
                    // 记录已处理的交易
                    if (purchase.transactionId) {
                      this.processedTransactions.add(purchase.transactionId);
                    }
                  } catch (finishError) {
                    logger.error('完成交易失败:', {
                      error: finishError,
                      transactionId: purchase.transactionId
                    });
                  }
                } else {
                  logger.error('购买验证失败，不完成交易:', {
                    transactionId: purchase.transactionId
                  });
                }
              } catch (error) {
                logger.error('处理交易更新失败:', error);
              }
            }
          );
          logger.subscription('购买更新监听器设置成功');
        }
      } catch (error) {
        logger.error('设置购买更新监听器失败:', error);
      }
    }
  }

  // 检查订阅状态并显示UI提示
  async checkSubscriptionStatusWithUI() {
    try {
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        if (parsedData.isActive) {
          logger.subscription('找到有效订阅:', parsedData);
          return true;
        }
      }
      
      // 没有找到有效订阅，但不再显示提示
      logger.subscription('没有找到有效订阅');
      return false;
    } catch (error) {
      logger.error('检查订阅状态失败:', error);
      return false;
    }
  }
  
  // 显示没有订阅的提示 - 只在用户主动操作时调用
  private showNoSubscriptionAlert() {
    Alert.alert(
      '订阅状态',
      '没有找到有效的订阅。您可以在商店中购买订阅以解锁所有功能。',
      [
        { text: '稍后再说', style: 'cancel' },
        { 
          text: '查看订阅选项', 
          onPress: () => {
            // 这里可以导航到订阅页面
            this.notifySubscriptionUpdate({ showSubscriptionScreen: true });
          } 
        }
      ]
    );
  }
}