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
        // 首先初始化IAP连接
        try {
          await initConnection();
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

        // 异步获取订阅状态和可用的订阅产品，但不阻塞初始化完成
        this.fetchAndUpdateSubscriptionStatus().catch(error => {
          logger.error('获取订阅状态失败:', error);
        });
        
        // 预先加载可用的订阅产品
        this.getAvailableSubscriptions().catch(error => {
          logger.error('获取可用订阅产品失败:', error);
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
      
      // 检查是否已有有效订阅
      await this.checkExistingSubscription();
      return false;
    }
    
    try {
      // 首先尝试使用 StoreKit 2 的 JWT 验证（iOS 15+）
      if (purchase.verificationResultIOS) {
        try {
          const jwtParts = purchase.verificationResultIOS.split('.');
          if (jwtParts.length === 3) {
            // 使用base64解码，避免使用Buffer
            const base64 = jwtParts[1].replace(/-/g, '+').replace(/_/g, '/');
            const jsonString = decodeURIComponent(
              Array.prototype.map
                .call(
                  atob(base64),
                  (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                )
                .join('')
            );
            
            // 解析JWT载荷
            const payload = JSON.parse(jsonString);
            
            const expirationDate = new Date(payload.expiresDate);
            const now = new Date();

            // 即使 JWT 验证成功，我们仍然尝试发送到服务器进行记录
            const subscriptionValidator = SubscriptionValidationService.getInstance();
            if (purchase.transactionReceipt) {
              subscriptionValidator.verifyTransaction(
                purchase.transactionId || '',
                purchase.transactionReceipt
              ).catch(error => {
                logger.error('服务器记录 JWT 验证结果失败:', error);
              });
            }

            const subscriptionData: SubscriptionDataType = {
              isActive: now < expirationDate,
              productId: purchase.productId,
              expirationDate: expirationDate.toISOString(),
              lastUpdated: new Date().toISOString(),
              environment: payload.environment,
              transactionId: purchase.transactionId || ''
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
        // 没有receipt，但我们尝试使用transaction信息创建基本订阅数据
        if (purchase.transactionDate) {
          
          // 获取产品信息来确定有效期
          const expirationDate = new Date(purchase.transactionDate);
          if (purchase.productId.includes('monthly')) {
            expirationDate.setMonth(expirationDate.getMonth() + 1);
          } else if (purchase.productId.includes('quarterly')) {
            expirationDate.setMonth(expirationDate.getMonth() + 3);
          } else if (purchase.productId.includes('yearly')) {
            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
          } else if (purchase.productId.includes('lifetime')) {
            // 终身订阅，设置为100年后
            expirationDate.setFullYear(expirationDate.getFullYear() + 100);
          }
          
          const subscriptionData: SubscriptionDataType = {
            isActive: true,
            productId: purchase.productId,
            expirationDate: expirationDate.toISOString(),
            lastUpdated: new Date().toISOString(),
            environment: 'fallback',
            transactionId: purchase.transactionId || ''
          };
          
          await this.updateSubscriptionStatus(subscriptionData);
          return true;
        }
        
        logger.error('购买凭证为空且无交易日期，无法验证', purchase.productId);
        // 在验证失败时检查现有订阅
        await this.checkExistingSubscription();
        return false;
      }
      
      // 继续尝试服务器验证
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
        // 在验证失败时检查现有订阅
        await this.checkExistingSubscription();
        return false;
      }

      if (validationResult.transaction) {
        const subscriptionData = subscriptionValidator.parseTransactionInfo(validationResult.transaction);
        await this.updateSubscriptionStatus(subscriptionData);
        return true;
      }
      
      // 在验证失败时检查现有订阅
      await this.checkExistingSubscription();
      return false;
    } catch (error) {
      logger.error('Purchase validation failed:', error);
      // 在验证失败时检查现有订阅
      await this.checkExistingSubscription();
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

  private async updateSubscriptionStatus(subscriptionData: SubscriptionDataType) {
    const updatePromise = async () => {
      try {
        const data = {
          ...subscriptionData,
          lastUpdated: new Date().toISOString(),
          environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
        };
        
        // 更新内存中的状态
        this.currentSubscriptionData = data;        
        // 更新本地存储
        await AsyncStorage.multiSet([
          [SUBSCRIPTION_KEY, JSON.stringify(data)],
          ['isPremium', data.isActive.toString()]
        ]);

        // 验证存储是否成功
        const [savedData, savedIsPremium] = await AsyncStorage.multiGet([SUBSCRIPTION_KEY, 'isPremium']);
        
        // 通知所有监听器
        this.safeNotifySubscriptionUpdate(data);
      } catch (err) {
        logger.error('更新订阅状态失败:', {
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
        logger.error(`更新订阅状态失败，剩余重试次数: ${retries}`, {
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
  public addSubscriptionUpdateListener(listener: (data: SubscriptionDataType) => void): () => void {
    this.subscriptionUpdateListeners.add(listener);
    return () => this.subscriptionUpdateListeners.delete(listener);
  }

  // 移除订阅状态更新监听器
  removeSubscriptionUpdateListener(listener: (data: any) => void) {
    this.subscriptionUpdateListeners.delete(listener);
  }

  // 通知所有订阅状态更新监听器
  private notifySubscriptionUpdate(data: any) {  
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
      // 确保IAP服务已初始化
      if (!this.isInitialized) {
        await this.initialize();
      }

      const fullProductId = IOS_SKUS[planId];
      if (!fullProductId) {
        throw new Error(`Invalid subscription plan: ${planId}`);
      }

      // 先获取可用的订阅产品
      const subscriptions = await this.getAvailableSubscriptions();
      if (subscriptions.length === 0) {
        throw new Error('No available subscriptions found');
      }
      
      // 检查产品ID是否在可用产品列表中
      const validProduct = subscriptions.find(product => product.productId === fullProductId);
      if (!validProduct) {
        logger.error('产品ID不在可用产品列表中:', { fullProductId, availableIds: subscriptions.map(s => s.productId) });
        throw new Error(`Product ID ${fullProductId} not available in store`);
      }

      // 使用动态导入确保IAP模块加载完成
      const { requestPurchase } = await import('react-native-iap');
      const result = await requestPurchase({
        sku: fullProductId,
        andDangerouslyFinishTransactionAutomaticallyIOS: false
      });
      
      return {
        success: true,
        planId,
        fullProductId,
        result
      };
    } catch (error) {
      // 检查是否为支付延迟（例如需要家长控制批准）的情况
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('payment was deferred') || 
          errorMessage.includes('awaiting approval') || 
          errorMessage.includes('parental controls')) {
                
        return { 
          success: true, 
          status: 'deferred',
          message: '订阅请求已提交，等待家长批准'
        };
      }
      
      // 其他错误情况
      logger.error('订阅购买失败:', error);
      return { 
        success: false, 
        error: errorMessage
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
      return true;
    }
    
    const isSubscribed = await this.checkSubscriptionStatus();
    return isSubscribed;
  }

  // 检查是否可以使用复习功能
  async canUseReview(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      return true;
    }
    
    const isSubscribed = await this.checkSubscriptionStatus();
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
        
        // 确保transactionId不为undefined
        const transactionId = purchase.transactionId || '';
        
        // 避免重复处理相同交易
        if (this.processedTransactions.has(transactionId)) {
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
      
      if (purchases && purchases.length > 0) {
        // Sort by transaction date to get the latest
        const latestPurchase = purchases.sort((a, b) => {
          const aDate = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
          const bDate = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
          return bDate - aDate;
        })[0];

        if (latestPurchase && latestPurchase.verificationResultIOS) {
          try {
            // Parse the JWT token
            const jwtParts = latestPurchase.verificationResultIOS.split('.');
            if (jwtParts.length === 3) {
              // 不使用Buffer，改用base64解码
              const base64 = jwtParts[1].replace(/-/g, '+').replace(/_/g, '/');
              const jsonPayload = decodeURIComponent(
                atob(base64)
                  .split('')
                  .map(c => {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                  })
                  .join('')
              );
              
              const payload = JSON.parse(jsonPayload);
              
              // Get expiration date from JWT
              const expirationDate = new Date(payload.expiresDate);
              const now = new Date();

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
              
              return;
            }
          } catch (jwtError) {
            logger.error('解析验证结果JWT失败:', jwtError);
            
            // 如果解析JWT失败，检查是否有现有有效订阅
            const savedSubscriptionData = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
            if (savedSubscriptionData) {
              try {
                const parsedData = JSON.parse(savedSubscriptionData) as SubscriptionDataType;
                
                // 检查保存的订阅是否仍然有效
                if (parsedData.isActive && parsedData.expirationDate) {
                  const expiryDate = new Date(parsedData.expirationDate);
                  const now = new Date();
                  
                  // 如果尚未过期，保留现有订阅状态
                  if (now < expiryDate) {
                    
                    // 只更新lastUpdated字段
                    const updatedData = {
                      ...parsedData,
                      lastUpdated: new Date().toISOString()
                    };
                    
                    this.currentSubscriptionData = updatedData;
                    await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(updatedData));
                    this.notifySubscriptionUpdate(updatedData);
                    return;
                  }
                }
              } catch (parseError) {
                logger.error('解析保存的订阅数据失败:', parseError);
              }
            }
          }
        }
      }

      // 如果没有找到有效订阅或者JWT解析失败且无有效订阅，检查是否有现有有效订阅
      const savedSubscriptionData = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
      if (savedSubscriptionData) {
        try {
          const parsedData = JSON.parse(savedSubscriptionData) as SubscriptionDataType;
          
          // 检查保存的订阅是否仍然有效
          if (parsedData.isActive && parsedData.expirationDate) {
            const expiryDate = new Date(parsedData.expirationDate);
            const now = new Date();
            
            // 如果尚未过期，保留现有订阅状态
            if (now < expiryDate) {
              
              // 只更新lastUpdated字段
              const updatedData = {
                ...parsedData,
                lastUpdated: new Date().toISOString()
              };
              
              this.currentSubscriptionData = updatedData;
              await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(updatedData));
              this.notifySubscriptionUpdate(updatedData);
              return;
            }
          }
        } catch (parseError) {
          logger.error('解析保存的订阅数据失败:', parseError);
        }
      }
      
      // 只有在没有找到现有有效订阅的情况下，才设置为非活跃状态
      const subscriptionData: SubscriptionDataType = {
        isActive: false,
        productId: null,
        expirationDate: null,
        lastUpdated: new Date().toISOString()
      };
      
      await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscriptionData));
      this.currentSubscriptionData = subscriptionData;
      this.notifySubscriptionUpdate(subscriptionData);
      
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
                  return;
                }

                // 验证购买并更新状态
                const isValid = await this.validatePurchase(purchase);
                
                // 如果验证成功，或环境为非正式环境，完成交易
                if (isValid || ENV.IS_SANDBOX) {
                  try {
                    // 确保状态更新完成后再完成交易
                    await this.fetchAndUpdateSubscriptionStatus();
                    await finishTransaction({ purchase });
                    
                    // 记录已处理的交易
                    if (purchase.transactionId) {
                      this.processedTransactions.add(purchase.transactionId);
                    }
                  } catch (finishError) {
                    logger.error('完成交易失败:', finishError);
                  }
                }
              } catch (error) {
                logger.error('处理交易更新失败:', error);
              }
            }
          );
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
          return true;
        }
      }
      
      // 没有找到有效订阅，但不再显示提示
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

  private async checkExistingSubscription() {
    try {
      // 从本地存储中读取订阅数据
      const savedSubscriptionData = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
      if (savedSubscriptionData) {
        const parsedData = JSON.parse(savedSubscriptionData) as SubscriptionDataType;
        
        // 检查保存的订阅是否仍然有效
        if (parsedData.isActive && parsedData.expirationDate) {
          const expiryDate = new Date(parsedData.expirationDate);
          const now = new Date();
          
          // 如果尚未过期，保留现有订阅状态
          if (now < expiryDate) {
            
            // 只更新lastUpdated字段
            const updatedData = {
              ...parsedData,
              lastUpdated: new Date().toISOString()
            };
            
            this.currentSubscriptionData = updatedData;
            await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(updatedData));
            this.notifySubscriptionUpdate(updatedData);
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      logger.error('检查现有订阅失败:', error);
      return false;
    }
  }
}