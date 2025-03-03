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
  getProducts,
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
export const SUBSCRIPTION_KEY = 'subscriptionData'; // 添加订阅数据存储键

export default class SubscriptionService {
  private static instance: SubscriptionService;
  private purchaseUpdateSubscription: any;
  private purchaseErrorSubscription: any;
  private subscriptionUpdateListeners: Set<(data: any) => void> = new Set();
  
  // 添加非会员限制常量
  private static readonly FREE_CHAR_LIMIT = 10;
  private static readonly FREE_GAME_LEVEL_LIMIT = 2;

  private isInitialized = false;
  private subscriptionCheckTimer: NodeJS.Timeout | null = null;
  private processedTransactions: Set<string> = new Set();
  
  // 添加提醒状态跟踪变量
  private isShowingExpirationAlert = false;
  private lastAlertTime = 0;
  private readonly ALERT_COOLDOWN = 3000; // 3秒内不重复显示相同提醒

  private constructor() {}

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async initialize() {
    if (this.isInitialized) {
      logger.subscription('Subscription service already initialized');
      return;
    }
    
    try {
      logger.subscription('Initializing subscription service', {
        timestamp: new Date().toISOString(),
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
        checkSubscription: ENV.CHECK_SUBSCRIPTION
      });
      
      // 详细记录要使用的产品IDs
      logger.subscription('将要获取的产品ID列表', {
        productIds: Object.values(IOS_SKUS),
        timestamp: new Date().toISOString()
      });
      
      // 在开发环境中清除缓存
      if (ENV.IS_SANDBOX) {
        logger.subscription('沙盒环境: 清除StoreKit缓存');
        await clearTransactionIOS();
        await clearProductsIOS();
        logger.subscription('StoreKit缓存清除完成');
      }
      
      logger.subscription('初始化StoreKit连接');
      await initConnection();
      logger.subscription('StoreKit连接初始化完成');
      
      // 获取可用产品
      logger.subscription('开始获取可用订阅产品');
      const products = await getSubscriptions({
        skus: Object.values(IOS_SKUS)
      });
      
      logger.subscription('获取到的可用产品:', {
        count: products.length,
        products: products.map(p => ({
          productId: p.productId,
          title: p.title,
          description: p.description
        })),
        timestamp: new Date().toISOString()
      });
      
      await this.updateSubscriptionListeners();
      this.isInitialized = true;
      logger.subscription('订阅服务初始化完成', {
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
        isInitialized: this.isInitialized,
        productsCount: products.length,
        timestamp: new Date().toISOString()
      });
      
      // 启动前强制从StoreKit获取最新订阅状态
      try {
        logger.subscription('Force checking StoreKit subscription status on startup');
        await this.performServerSubscriptionCheck();
      } catch (error) {
        logger.error('Failed to check StoreKit subscription on startup:', error);
        // 继续初始化流程，不阻止应用启动
      }
      
      // 启动定期检查订阅状态
      this.startPeriodicSubscriptionCheck();
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

      // 成功从服务器验证后，清除本地缓存
      logger.subscription('服务器验证成功，清除本地缓存并更新订阅数据', {
        productId: transaction.productId,
        transactionId: transaction.transactionId
      });
      
      // 清除旧的订阅数据缓存
      await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
      await AsyncStorage.removeItem('isPremium');
      
      // 解析并保存新的订阅数据
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
    
    // 如果订阅状态不活跃，显示过期提醒
    // 添加防止重复显示的安全检查
    if (data.isActive === false && 
        !this.isShowingExpirationAlert && 
        (Date.now() - this.lastAlertTime > this.ALERT_COOLDOWN)) {
      
      this.isShowingExpirationAlert = true;
      this.lastAlertTime = Date.now();
      
      Alert.alert(
        i18n.t('subscription.expired'),
        i18n.t('subscription.expiredMessage'),
        [{ text: i18n.t('ok'), onPress: () => this.isShowingExpirationAlert = false }]
      );
    }
  }

  // 检查订阅状态
  async checkSubscriptionStatus(forceRefresh: boolean = false) {
    try {
      logger.subscription('检查订阅状态 - 开始流程', {
        forceRefresh,
        timestamp: new Date().toISOString()
      });
      
      // 添加标志，确定是否从StoreKit获取的最新数据
      let isFromStoreKit = false;
      
      // 首先尝试从StoreKit获取最新状态
      try {
        logger.subscription('尝试从StoreKit获取最新订阅状态', {
          forceRefresh,
          timestamp: new Date().toISOString()
        });
        
        // 获取可用购买记录 - 使用增强版方法
        const purchases = await this.getAvailablePurchasesFromStoreKit(forceRefresh);
        
        if (purchases && purchases.length > 0) {
          isFromStoreKit = true;
          logger.subscription('从StoreKit获取到有效购买记录', {
            count: purchases.length,
            latestProduct: purchases[0].productId
          });
          
          // 获取最新的购买记录（按交易日期排序）
          const latestPurchase = purchases.sort((a, b) => 
            b.transactionDate - a.transactionDate
          )[0];
          
          logger.subscription('最新购买记录详情', {
            productId: latestPurchase.productId,
            transactionDate: new Date(latestPurchase.transactionDate).toISOString(),
            hasReceipt: !!latestPurchase.transactionReceipt,
            hasTransactionId: !!latestPurchase.transactionId
          });
          
          const jws = latestPurchase.transactionReceipt;
          if (jws && latestPurchase.transactionId) {
            logger.subscription('即将开始验证StoreKit交易 - 调用服务器验证');
            
            // 验证交易
            const result = await SubscriptionValidationService.verifyTransaction(
              latestPurchase.transactionId,
              jws
            );
            
            logger.subscription('服务器验证结果', {
              success: true,
              hasTransactionData: !!result.transaction
            });
            
            // 解析交易信息
            const subscriptionData = SubscriptionValidationService.parseTransactionInfo(result.transaction);
            
            logger.subscription('解析后的订阅数据', {
              productId: subscriptionData.productId,
              expirationDate: subscriptionData.expirationDate,
              isActive: subscriptionData.isActive
            });
            
            // 从StoreKit获取数据成功，清除本地缓存
            logger.subscription('从StoreKit获取订阅数据成功，准备清除本地缓存', {
              productId: subscriptionData.productId,
              expirationDate: subscriptionData.expirationDate,
              timestamp: new Date().toISOString()
            });
            
            // 清除旧的订阅数据缓存
            const removedKeys = [];
            try {
              await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
              removedKeys.push(SUBSCRIPTION_KEY);
              await AsyncStorage.removeItem('isPremium');
              removedKeys.push('isPremium');
              
              logger.subscription('本地缓存清除成功', {
                removedKeys,
                timestamp: new Date().toISOString()
              });
            } catch (clearError) {
              logger.error('清除本地缓存失败', {
                error: clearError instanceof Error ? clearError.message : 'Unknown error',
                timestamp: new Date().toISOString()
              });
            }
            
            // 实时更新本地存储
            logger.subscription('开始更新本地存储', {
              timestamp: new Date().toISOString()
            });
            
            await this.updateSubscriptionStatus(subscriptionData);
            
            logger.subscription('已从StoreKit更新订阅状态 - 存储过程完成', {
              productId: subscriptionData.productId,
              expirationDate: subscriptionData.expirationDate,
              isActive: subscriptionData.isActive,
              timestamp: new Date().toISOString()
            });
            
            // 验证存储是否成功
            try {
              const verifyData = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
              logger.subscription('验证存储结果', {
                success: !!verifyData,
                dataLength: verifyData ? verifyData.length : 0,
                timestamp: new Date().toISOString()
              });
            } catch (verifyError) {
              logger.error('验证存储失败', {
                error: verifyError instanceof Error ? verifyError.message : 'Unknown error'
              });
            }
            
            return subscriptionData.isActive;
          } else {
            logger.subscription('StoreKit购买记录缺少关键信息', {
              hasJws: !!jws,
              hasTransactionId: !!latestPurchase.transactionId
            });
          }
        } else {
          logger.subscription('StoreKit未返回购买记录');
        }
      } catch (storeKitError: any) {
        logger.subscription('从StoreKit获取订阅状态失败，将使用本地存储', {
          errorType: storeKitError.constructor.name,
          error: storeKitError instanceof Error ? storeKitError.message : 'Unknown error',
          stack: storeKitError instanceof Error ? storeKitError.stack : null
        });
      }
      
      // 如果无法从StoreKit获取数据，回退到本地存储
      logger.subscription('准备从本地存储获取订阅数据');
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      
      if (!subscriptionData) {
        logger.subscription('本地存储中无订阅数据 - 订阅不活跃');
        return false;
      }
      
      const parsedData = JSON.parse(subscriptionData);
      const currentDate = new Date();
      const expirationDate = new Date(parsedData.expirationDate);
      
      // 打印所有相关信息以便诊断
      logger.subscription('订阅状态详细信息:', {
        dataSource: isFromStoreKit ? 'StoreKit' : '本地存储',
        savedIsActive: parsedData.isActive,
        productId: parsedData.productId,
        currentDate: currentDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
        isExpired: currentDate > expirationDate,
        lastUpdated: parsedData.lastUpdated,
        gracePeriod: parsedData.isInGracePeriod ? {
          isInGracePeriod: true,
          gracePeriodExpiresDate: parsedData.gracePeriodExpiresDate
        } : 'notInGracePeriod'
      });
      
      // 优先使用已保存的isActive状态（如果存在）
      if (parsedData.isActive !== undefined) {
        logger.subscription(`使用已保存的状态：isActive = ${parsedData.isActive}`);
        
        // 额外的安全检查：如果isActive为true但已过期，则更新状态
        if (parsedData.isActive === true && currentDate > expirationDate) {
          logger.subscription('⚠️ 异常情况：已保存状态为活跃但已过期 - 更新为不活跃');
          
          const updatedData = {
            ...parsedData,
            isActive: false,
            lastUpdated: currentDate.toISOString(),
            actualExpirationReason: '手动状态检查检测到过期'
          };
          
          await this.updateSubscriptionStatus(updatedData);
          return false;
        }
        
        // 反之，如果显示为不活跃但未过期，确认是否有覆盖标记
        if (parsedData.isActive === false && currentDate < expirationDate) {
          if (parsedData.actualExpirationReason) {
            logger.subscription(`⚠️ 未过期但标记为不活跃，原因: ${parsedData.actualExpirationReason}`);
          } else {
            logger.subscription('⚠️ 异常情况：未过期但标记为不活跃，无原因');
          }
        }
        
        return parsedData.isActive;
      }
      
      // 如果未明确设置isActive，则通过日期比较确定
      logger.subscription('无已保存isActive状态，通过过期日期计算');
      const isActive = currentDate < expirationDate;
      
      // 优先使用宽限期（如果适用）
      if (!isActive && parsedData.isInGracePeriod) {
        const gracePeriodExpiresDate = new Date(parsedData.gracePeriodExpiresDate);
        const isGracePeriodActive = currentDate < gracePeriodExpiresDate;
        
        logger.subscription('检查宽限期状态:', {
          isInGracePeriod: parsedData.isInGracePeriod,
          gracePeriodExpiresDate: parsedData.gracePeriodExpiresDate,
          isGracePeriodActive
        });
        
        return isGracePeriodActive;
      }
      
      logger.subscription('订阅状态检查结果:', {
        currentDate: currentDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
        isActive: isActive
      });
      
      return isActive;
    } catch (error: any) {
      logger.error('检查订阅状态时出错', { 
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  async purchaseSubscription(planId: string) {
    if (!planId) {
      logger.error('No plan ID provided for purchase');
      return false;
    }
    
    try {
      // 获取完整的产品ID
      const fullProductId = IOS_SKUS[planId as keyof typeof IOS_SKUS] || planId;
      
      logger.subscription('开始购买订阅流程', {
        planType: planId,
        fullProductId,
        timestamp: new Date().toISOString(),
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
      });
      
      // 确保连接已初始化
      if (!this.isInitialized) {
        logger.subscription('订阅服务未初始化，正在初始化');
        await this.initialize();
      }
      
      // 清除StoreKit缓存，确保获取最新状态
      logger.subscription('清除StoreKit缓存以确保最新状态');
      await clearTransactionIOS();
      await clearProductsIOS();
      
      // 确认产品ID是否有效
      let isValidProduct = false;
      let availablePlans: string[] = [];
      
      try {
        logger.subscription('获取可用产品以验证产品ID有效性');
        const products = await getSubscriptions({
          skus: Object.values(IOS_SKUS)
        });
        
        availablePlans = products.map(p => p.productId);
        isValidProduct = availablePlans.includes(fullProductId);
        
        logger.subscription('产品ID验证结果', {
          planType: planId,
          fullProductId,
          isValidProduct,
          availablePlans,
          productsCount: products.length,
          timestamp: new Date().toISOString()
        });
      } catch (productError: any) {
        logger.error('验证产品ID时出错', {
          error: productError.message,
          stack: productError.stack,
          timestamp: new Date().toISOString()
        });
      }
      
      if (!isValidProduct) {
        logger.error('尝试购买无效的产品ID', {
          planType: planId,
          invalidProductId: fullProductId,
          availablePlans,
          timestamp: new Date().toISOString()
        });
        if (ENV.IS_SANDBOX) {
          // 沙盒环境下尝试继续购买，可能是缓存问题
          logger.subscription('沙盒环境: 尽管产品似乎无效，但仍尝试继续');
        } else {
          return false;
        }
      }
      
      // 尝试购买订阅
      logger.subscription('开始请求购买', {
        fullProductId,
        timestamp: new Date().toISOString()
      });
      
      const purchaseResult = await requestSubscription({
        sku: fullProductId,
        andDangerouslyFinishTransactionAutomaticallyIOS: false
      });
      
      // 检查购买结果
      if (purchaseResult) {
        // 如果是数组，取第一个元素
        const purchase = Array.isArray(purchaseResult) ? purchaseResult[0] : purchaseResult;
        
        logger.subscription('购买请求结果', {
          success: true,
          purchaseDetails: purchase ? {
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            transactionDate: purchase.transactionDate ? new Date(purchase.transactionDate).toISOString() : null,
            hasReceipt: !!purchase.transactionReceipt
          } : 'No purchase details available',
          timestamp: new Date().toISOString()
        });
        
        return true;
      } else {
        logger.subscription('购买请求没有返回结果', {
          timestamp: new Date().toISOString()
        });
        return false;
      }
    } catch (error) {
      const err = this.handlePurchaseError(error as PurchaseError);
      
      // 只有在不是用户取消操作时才显示错误消息
      if (err.message !== i18n.t('subscription.errors.userCancelled')) {
        Alert.alert(
          i18n.t('error'),
          err.message,
          [{ text: i18n.t('ok') }]
        );
      }
      
      throw err;
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
    
    // 清除订阅检查定时器
    this.stopPeriodicSubscriptionCheck();
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
      // 如果当前正在显示提醒，或者距离上次显示不到冷却时间，则不再显示
      const now = Date.now();
      if (this.isShowingExpirationAlert || (now - this.lastAlertTime < this.ALERT_COOLDOWN)) {
        logger.subscription('跳过订阅过期提醒: 冷却中或已在显示', {
          isShowingAlert: this.isShowingExpirationAlert,
          timeSinceLastAlert: now - this.lastAlertTime
        });
        return;
      }

      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        const expirationDate = new Date(parsedData.expirationDate);
        const currentTime = new Date();
        const daysUntilExpiration = Math.ceil((expirationDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiration <= 3 && daysUntilExpiration > 0) {
          this.isShowingExpirationAlert = true;
          this.lastAlertTime = now;
          
          Alert.alert(
            i18n.t('subscription.expiringSoon'),
            i18n.t('subscription.expiringSoonMessage', { days: daysUntilExpiration }),
            [{ text: i18n.t('ok'), onPress: () => this.isShowingExpirationAlert = false }]
          );
        } else if (daysUntilExpiration <= 0) {
          this.isShowingExpirationAlert = true;
          this.lastAlertTime = now;
          
          Alert.alert(
            i18n.t('subscription.expired'),
            i18n.t('subscription.expiredMessage'),
            [{ text: i18n.t('ok'), onPress: () => this.isShowingExpirationAlert = false }]
          );
        }
      }
    } catch (error) {
      this.isShowingExpirationAlert = false;
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
        logger.subscription('购买更新', {
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          transactionDate: purchase.transactionDate
            ? new Date(purchase.transactionDate).toISOString()
            : 'undefined'
        });

        // 检查是否为已跟踪的交易ID，避免重复处理
        if (this.processedTransactions.has(purchase.transactionId || '')) {
          logger.subscription('跳过已处理的交易', { transactionId: purchase.transactionId });
          return;
        }
        
        // 添加到已处理交易列表
        this.processedTransactions.add(purchase.transactionId || '');

        // 验证交易，提取验证令牌（JWS）
        const jws = purchase.transactionReceipt;
        if (!jws) {
          logger.error('缺少交易收据 (JWS)', { productId: purchase.productId });
          return;
        }

        // 处理订阅激活
        const subscriptionData = {
          productId: purchase.productId,
          expirationDate: '', // 将通过验证设置
          isActive: true,     // 初始值，将通过验证确认
          transactionId: purchase.transactionId || '',
          originalTransactionId: purchase.originalTransactionIdentifierIOS || '',
          environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
        };

        // 调用服务器验证
        try {
          // 检查是否为订阅升级或变更
          const currentSubscriptionData = await AsyncStorage.getItem('subscriptionData');
          let isUpgrade = false;
          let previousProductId = null;
          
          if (currentSubscriptionData) {
            const parsedCurrentData = JSON.parse(currentSubscriptionData);
            
            // 如果是相同的订阅但产品ID不同，可能是升级/降级
            if (parsedCurrentData.originalTransactionId === 
                (purchase.originalTransactionIdentifierIOS || '') && 
                parsedCurrentData.productId !== purchase.productId) {
                
              isUpgrade = true;
              previousProductId = parsedCurrentData.productId;
              
              logger.subscription('检测到订阅变更/升级', {
                from: previousProductId,
                to: purchase.productId,
                originalTransactionId: purchase.originalTransactionIdentifierIOS
              });
            }
          }

          // 验证交易
          const result = await SubscriptionValidationService.verifyTransaction(
            purchase.transactionId || '',
            jws
          );

          // 成功从服务器验证后，清除本地缓存
          logger.subscription('交易监听器: 服务器验证成功，清除本地缓存并更新订阅数据', {
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            isUpgrade: isUpgrade,
            previousProductId: previousProductId
          });
          
          // 清除旧的订阅数据缓存
          await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
          await AsyncStorage.removeItem('isPremium');
          
          // 解析交易信息
          const validatedData = SubscriptionValidationService.parseTransactionInfo(result.transaction);
          
          // 合并并保存经过验证的订阅数据
          const mergedData = {
            ...subscriptionData,
            ...validatedData,
            isUpgrade: isUpgrade,
            previousProductId: previousProductId
          };

          logger.subscription('订阅交易验证成功', {
            productId: mergedData.productId,
            expirationDate: mergedData.expirationDate,
            isActive: mergedData.isActive,
            isUpgrade: isUpgrade,
            previousProductId: previousProductId
          });

          // 更新状态并通知
          await this.updateSubscriptionStatus(mergedData);
          this.notifySubscriptionUpdate(mergedData);
          
          // 完成交易
          await finishTransaction({ purchase });
          
          // 执行诊断以确保数据一致性
          await this.debugSubscriptionStatus();
        } catch (error: any) {
          logger.error('订阅交易验证失败', { 
            error: error.message,
            productId: purchase.productId,
            transactionId: purchase.transactionId 
          });
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

  // 启动定期检查订阅状态
  startPeriodicSubscriptionCheck() {
    // 清除可能存在的旧定时器
    if (this.subscriptionCheckTimer) {
      clearInterval(this.subscriptionCheckTimer);
    }
    
    // 在真实环境中每6小时检查一次，在沙盒环境中每1分钟检查一次
    const checkInterval = ENV.IS_SANDBOX ? 1 * 60 * 1000 : 6 * 60 * 60 * 1000;
    
    this.subscriptionCheckTimer = setInterval(async () => {
      logger.subscription('Performing periodic subscription check');
      try {
        // 强制进行服务器验证 
        await this.performServerSubscriptionCheck();
      } catch (error) {
        logger.error('Periodic subscription check failed:', error);
      }
    }, checkInterval);
    
    logger.subscription('Periodic subscription check started', { 
      intervalMs: checkInterval,
      environment: ENV.IS_SANDBOX ? 'sandbox' : 'production' 
    });
  }
  
  // 停止定期检查
  stopPeriodicSubscriptionCheck() {
    if (this.subscriptionCheckTimer) {
      clearInterval(this.subscriptionCheckTimer);
      this.subscriptionCheckTimer = null;
      logger.subscription('Periodic subscription check stopped');
    }
  }
  
  // 强制进行服务器验证
  async performServerSubscriptionCheck() {
    try {
      logger.subscription('开始强制订阅状态检查', {
        timestamp: new Date().toISOString(),
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
      });
      
      // 在沙盒环境中清除缓存以确保获取最新状态
      if (ENV.IS_SANDBOX) {
        logger.subscription('沙盒环境：清除StoreKit缓存');
        await clearTransactionIOS();
        await clearProductsIOS();
        logger.subscription('StoreKit缓存清除完成');
      }
      
      // 获取可用购买记录 - 使用增强版方法，强制刷新
      logger.subscription('使用增强方法从StoreKit获取购买记录');
      const purchases = await this.getAvailablePurchasesFromStoreKit(true, 3);
      
      if (!purchases || purchases.length === 0) {
        // 如果没有找到购买记录，即StoreKit认为没有有效订阅
        // 获取本地订阅数据以便我们可以更新它
        logger.subscription('StoreKit未返回购买记录，检查本地数据');
        const subscriptionData = await AsyncStorage.getItem('subscriptionData');
        if (subscriptionData) {
          const parsedData = JSON.parse(subscriptionData);
          logger.subscription('❌ 无StoreKit购买记录但存在本地订阅数据 - 将强制失效本地订阅:', {
            localExpirationDate: parsedData.expirationDate,
            currentIsActive: parsedData.isActive,
            isInGracePeriod: parsedData.isInGracePeriod,
            gracePeriodExpiresDate: parsedData.gracePeriodExpiresDate,
            willInvalidate: true,
            timestamp: new Date().toISOString()
          });
          
          // 清除旧的订阅数据缓存
          logger.subscription('准备清除本地缓存');
          
          try {
            await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
            await AsyncStorage.removeItem('isPremium');
            logger.subscription('本地缓存清除成功', {
              timestamp: new Date().toISOString()
            });
          } catch (clearError: any) {
            logger.error('清除本地缓存失败', {
              error: clearError.message,
              timestamp: new Date().toISOString()
            });
          }
          
          // 创建更新的订阅数据 - 设置为已过期
          const now = new Date();
          const updatedData = {
            ...parsedData,
            isActive: false,
            lastUpdated: now.toISOString(),
            // 保留原有过期日期以便于记录，但状态已设为不活跃
            actualExpirationReason: 'StoreKit报告无有效订阅'
          };
          
          // 更新订阅状态为无效
          logger.subscription('更新订阅状态为无效', {
            timestamp: new Date().toISOString()
          });
          await this.updateSubscriptionStatus(updatedData);
          logger.subscription('⚠️ 订阅已失效 - StoreKit无购买记录', {
            originalExpirationDate: parsedData.expirationDate,
            currentDate: now.toISOString(),
            newStatus: 'inactive',
            timestamp: new Date().toISOString()
          });
          
          // 通知应用其他部分订阅已过期 - 防止多次通知导致多个提醒
          // 增加安全检查，避免过于频繁地显示过期提醒
          if (!this.isShowingExpirationAlert && (Date.now() - this.lastAlertTime > this.ALERT_COOLDOWN)) {
            this.notifySubscriptionUpdate(updatedData);
          }
          
          // 执行一次checkSubscriptionStatus以验证状态是否正确更新
          const newStatus = await this.checkSubscriptionStatus();
          logger.subscription('✅ 订阅状态检查验证:', {
            newStatus,
            shouldBeFalse: true,
            timestamp: new Date().toISOString()
          });
          
          return false;
        } else {
          logger.subscription('无StoreKit购买记录且无本地订阅数据');
          return false;
        }
      }
      
      // 处理最新的购买记录
      const latestPurchase = purchases[0];
      logger.subscription('处理最新购买记录:', {
        productId: latestPurchase.productId,
        transactionId: latestPurchase.transactionId,
        transactionDate: new Date(latestPurchase.transactionDate).toISOString(),
        hasReceipt: !!latestPurchase.transactionReceipt,
        timestamp: new Date().toISOString()
      });
      
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
      
      logger.subscription('开始服务器验证交易', {
        transactionId: transaction.transactionId,
        timestamp: new Date().toISOString()
      });
      
      const result = await SubscriptionValidationService.verifyTransaction(
        transaction.transactionId,
        transaction.jws
      );
      
      logger.subscription('服务器验证成功', {
        hasTransactionData: !!result.transaction,
        timestamp: new Date().toISOString()
      });
      
      // 成功从服务器验证后，清除本地缓存
      logger.subscription('服务器验证成功，准备清除本地缓存', {
        productId: transaction.productId,
        transactionId: transaction.transactionId,
        timestamp: new Date().toISOString()
      });
      
      // 清除旧的订阅数据缓存
      try {
        await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
        await AsyncStorage.removeItem('isPremium');
        logger.subscription('本地缓存清除成功', {
          timestamp: new Date().toISOString()
        });
      } catch (clearError: any) {
        logger.error('清除本地缓存失败', {
          error: clearError.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // 解析并保存新的订阅数据
      const subscriptionData = SubscriptionValidationService.parseTransactionInfo(result.transaction);
      
      logger.subscription('解析的订阅数据', {
        productId: subscriptionData.productId,
        expirationDate: subscriptionData.expirationDate,
        isActive: subscriptionData.isActive,
        timestamp: new Date().toISOString()
      });
      
      logger.subscription('准备更新本地存储', {
        timestamp: new Date().toISOString()
      });
      
      await this.updateSubscriptionStatus(subscriptionData);
      
      logger.subscription('本地存储更新完成', {
        timestamp: new Date().toISOString()
      });
      
      // 完成交易，确保不会重复处理
      await finishTransaction({ purchase: latestPurchase });
      
      logger.subscription('交易完成标记', {
        transactionId: latestPurchase.transactionId,
        timestamp: new Date().toISOString()
      });
      
      // 验证存储是否成功
      try {
        const verifyData = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
        logger.subscription('验证存储结果', {
          success: !!verifyData,
          dataLength: verifyData ? verifyData.length : 0,
          timestamp: new Date().toISOString()
        });
      } catch (verifyError: any) {
        logger.error('验证存储失败', {
          error: verifyError.message
        });
      }
      
      return subscriptionData.isActive;
    } catch (error: any) {
      logger.error('Server subscription check failed:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  // 辅助函数：诊断订阅状态不一致问题
  async debugSubscriptionStatus() {
    try {
      logger.subscription('===== 订阅状态诊断开始 =====');
      
      // 获取本地存储的订阅数据
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (!subscriptionData) {
        logger.subscription('🔍 诊断: 本地无订阅数据');
        return { status: 'no-data', isActive: false };
      }
      
      const parsedData = JSON.parse(subscriptionData);
      const now = new Date();
      const expirationDate = new Date(parsedData.expirationDate);
      
      // 检查数据完整性
      logger.subscription('🔍 诊断: 订阅数据完整性检查', {
        hasProductId: !!parsedData.productId,
        hasExpirationDate: !!parsedData.expirationDate,
        hasIsActive: parsedData.isActive !== undefined,
        hasLastUpdated: !!parsedData.lastUpdated
      });
      
      // 检查日期有效性
      const isDateValid = !isNaN(expirationDate.getTime());
      logger.subscription('🔍 诊断: 过期日期有效性', {
        expirationDate: parsedData.expirationDate,
        parsedDate: isDateValid ? expirationDate.toISOString() : 'INVALID',
        currentDate: now.toISOString()
      });
      
      if (!isDateValid) {
        return { status: 'invalid-date', isActive: false };
      }
      
      // 基于日期的状态计算
      const isExpiredByDate = now > expirationDate;
      
      // 直接状态与日期计算的一致性
      const isConsistent = (parsedData.isActive === !isExpiredByDate);
      
      logger.subscription('🔍 诊断: 状态一致性检查', {
        savedIsActive: parsedData.isActive,
        calculatedByDate: !isExpiredByDate,
        isConsistent,
        timeDiff: expirationDate.getTime() - now.getTime(),
        timeRemaining: isExpiredByDate ? '已过期' : `${Math.round((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))}天`
      });
      
      // 检查宽限期
      if (parsedData.isInGracePeriod) {
        const gracePeriodDate = new Date(parsedData.gracePeriodExpiresDate);
        const isGracePeriodValid = !isNaN(gracePeriodDate.getTime());
        const isGracePeriodActive = isGracePeriodValid && now < gracePeriodDate;
        
        logger.subscription('🔍 诊断: 宽限期状态', {
          isInGracePeriod: true,
          gracePeriodExpiresDate: parsedData.gracePeriodExpiresDate,
          isGracePeriodValid,
          isGracePeriodActive,
          gracePeriodTimeRemaining: isGracePeriodValid 
            ? (now < gracePeriodDate 
                ? `${Math.round((gracePeriodDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))}天`
                : '已过期')
            : 'INVALID'
        });
      }
      
      // 检查StoreKit状态
      try {
        const purchases = await getAvailablePurchases();
        logger.subscription('🔍 诊断: StoreKit购买记录检查', {
          hasPurchases: purchases && purchases.length > 0,
          purchaseCount: purchases?.length || 0
        });
        
        if (purchases && purchases.length > 0) {
          // 找到与我们产品ID匹配的购买
          const matchingPurchase = purchases.find(p => p.productId === parsedData.productId);
          
          logger.subscription('🔍 诊断: 匹配的购买记录', {
            hasMatchingPurchase: !!matchingPurchase,
            details: matchingPurchase ? {
              productId: matchingPurchase.productId,
              transactionDate: new Date(matchingPurchase.transactionDate).toISOString(),
              purchaseTimestamp: matchingPurchase.transactionDate
            } : 'none'
          });
        }
      } catch (error: any) {
        logger.subscription('🔍 诊断: 获取StoreKit购买记录失败', {
          error: error.message
        });
      }
      
      logger.subscription('===== 订阅状态诊断完成 =====');
      
      return {
        status: isConsistent ? 'consistent' : 'inconsistent',
        isActive: parsedData.isActive,
        calculatedIsActive: !isExpiredByDate,
        expirationDate: parsedData.expirationDate,
        productId: parsedData.productId,
        lastUpdated: parsedData.lastUpdated
      };
    } catch (error: any) {
      logger.error('订阅状态诊断失败', { error: error.message });
      return { status: 'error', error: error.message };
    }
  }

  // 公共诊断方法，可以从应用中调用
  public async runSubscriptionDiagnostics(): Promise<any> {
    try {
      logger.subscription('开始订阅状态诊断（用户请求）');
      
      // 执行StoreKit连接刷新
      if (ENV.IS_SANDBOX) {
        await clearTransactionIOS();
        try {
          // 获取并完成所有挂起的交易
          const purchases = await getAvailablePurchases();
          if (purchases && purchases.length > 0) {
            for (const purchase of purchases) {
              await finishTransaction({ purchase, isConsumable: false })
                .then(() => logger.subscription('完成交易成功', { transactionId: purchase.transactionId }))
                .catch(e => logger.error('完成单个交易失败', { error: e.message, transactionId: purchase.transactionId }));
            }
          }
          logger.subscription('已清理StoreKit缓存和挂起交易');
        } catch (error: any) {
          logger.error('清理交易过程中出错', { error: error.message });
        }
      }
      
      // 获取当前订阅状态
      const currentStatus = await this.checkSubscriptionStatus();
      
      // 强制服务器验证
      const serverCheck = await this.performServerSubscriptionCheck();
      
      // 运行详细诊断
      const diagnostics = await this.debugSubscriptionStatus();
      
      // 获取可用产品信息
      let products = [];
      try {
        products = await getProducts({
          skus: [
            'com.itlongbow.hanzilearningapp.sub.monthly',
            'com.itlongbow.hanzilearningapp.sub.quarterly',
            'com.itlongbow.hanzilearningapp.sub.yearly',
            'com.itlongbow.hanzilearningapp.sub.lifetime'
          ]
        });
        logger.subscription('Available products:', products);
      } catch (error: any) {
        logger.error('获取产品信息失败', { error: error.message });
      }
      
      const result = {
        currentStatus,
        serverCheckResult: serverCheck,
        diagnostics,
        productsAvailable: products.length > 0,
        productCount: products.length,
        isStoreConnected: this.isInitialized,
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
        timestamp: new Date().toISOString()
      };
      
      logger.subscription('订阅诊断结果', result);
      return result;
    } catch (error: any) {
      logger.error('订阅诊断失败', { error: error.message });
      return { 
        status: 'error', 
        error: error.message,
        isStoreConnected: this.isInitialized,
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
      };
    }
  }

  // 完全清除所有订阅相关数据和缓存
  async completelyCleanSubscriptionData() {
    try {
      logger.subscription('开始全面清理订阅数据');
      
      // 停止任何定期检查
      this.stopPeriodicSubscriptionCheck();
      
      // 移除已存储的处理过的交易记录
      this.processedTransactions.clear();
      
      // 清除 StoreKit 缓存
      await clearTransactionIOS();
      await clearProductsIOS();
      
      // 清除所有本地存储的订阅相关数据
      await AsyncStorage.multiRemove([
        'subscriptionData',
        'isPremium',
        'transactionHistory',
        'lastSubscriptionCheck'
      ]);
      
      // 重新初始化连接
      try {
        await initConnection();
        logger.subscription('重新初始化 IAP 连接成功');
      } catch (initError) {
        logger.error('重新初始化 IAP 连接失败:', initError);
      }
      
      // 更新订阅监听器
      await this.updateSubscriptionListeners();
      
      // 重启定期检查
      this.startPeriodicSubscriptionCheck();
      
      logger.subscription('订阅数据完全清理完成');
      return true;
    } catch (error) {
      logger.error('完全清理订阅数据失败:', error);
      return false;
    }
  }
  
  // 检查并修复StoreKit和本地存储订阅信息的不一致
  async syncSubscriptionWithStoreKit(forceRefresh: boolean = false): Promise<{
    success: boolean;
    hasStoreKitPurchases?: boolean;
    action?: string;
    oldExpirationDate?: string | Date;
    newExpirationDate?: string | Date;
    error?: string;
  }> {
    try {
      logger.subscription(`开始与StoreKit同步订阅信息${forceRefresh ? '（强制刷新模式）' : ''}`);
      
      // 如果是强制刷新模式，先清除缓存并重新初始化连接
      if (forceRefresh) {
        logger.subscription('强制刷新模式：清除缓存并重新初始化连接');
        await clearTransactionIOS();
        await clearProductsIOS();
        this.initializeConnection(); // 重新初始化连接
      }
      
      // 获取StoreKit可用的购买记录
      const availablePurchases = await this.getAvailablePurchasesFromStoreKit(forceRefresh);
      
      logger.subscription(`StoreKit查询结果: 找到${availablePurchases?.length || 0}个购买记录`);
      
      // 检查是否有可用购买
      if (availablePurchases && availablePurchases.length > 0) {
        logger.subscription('StoreKit中找到购买记录');
        
        // 使用从StoreKit获取的最新购买记录
        const latestPurchase = this.getLatestPurchase(availablePurchases);
        
        if (latestPurchase) {
          logger.subscription(`最新StoreKit购买: ${JSON.stringify({
            productId: latestPurchase.productId,
            purchaseDate: latestPurchase.purchaseDate,
            expirationDate: latestPurchase.expirationDate
          })}`);
          
          // 获取当前存储的订阅数据
          const storedSubscriptionStr = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
          let storedSubscription = null;
          
          try {
            if (storedSubscriptionStr) {
              storedSubscription = JSON.parse(storedSubscriptionStr);
              logger.subscription(`本地订阅数据: ${JSON.stringify({
                productId: storedSubscription?.productId,
                expirationDate: storedSubscription?.expirationDate,
                isActive: storedSubscription?.isActive
              })}`);
            }
          } catch (e) {
            logger.error('解析本地订阅数据失败', e);
          }
          
          // 检查是否需要更新本地存储的订阅信息
          if (!storedSubscription || 
              storedSubscription.productId !== latestPurchase.productId || 
              (storedSubscription.expirationDate && latestPurchase.expirationDate && 
              new Date(storedSubscription.expirationDate).getTime() !== new Date(latestPurchase.expirationDate).getTime())) {
            
            // 确定需要采取的行动
            let action = '';
            let oldExpirationDate = storedSubscription?.expirationDate;
            let newExpirationDate = latestPurchase.expirationDate;
            
            if (!storedSubscription) {
              action = '新增本地订阅信息';
            } else if (storedSubscription.productId !== latestPurchase.productId) {
              action = '更新订阅产品ID';
              logger.subscription(`订阅产品ID不匹配: 本地(${storedSubscription.productId}) vs StoreKit(${latestPurchase.productId})`);
            } else if (storedSubscription.expirationDate && latestPurchase.expirationDate && 
                      new Date(storedSubscription.expirationDate).getTime() !== new Date(latestPurchase.expirationDate).getTime()) {
              action = '更新订阅过期日期';
              logger.subscription(`订阅过期日期不匹配: 本地(${storedSubscription.expirationDate}) vs StoreKit(${latestPurchase.expirationDate})`);
            } else if (forceRefresh) {
              action = '强制刷新本地订阅信息';
            }
            
            logger.subscription(`执行操作: ${action}`);
            
            // 清除旧的订阅数据缓存
            await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
            await AsyncStorage.removeItem('isPremium');
            
            // 创建新的订阅数据
            const newSubscriptionData = {
              ...latestPurchase,
              isActive: true,
              verifiedByServer: true,
              lastVerified: new Date().toISOString()
            };
            
            // 保存到本地存储
            await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(newSubscriptionData));
            logger.subscription('已更新本地订阅信息');
            
            // 通知订阅状态变化
            this.updateSubscriptionStatus({
              ...newSubscriptionData,
              isFromSync: true
            });
            
            return {
              success: true,
              hasStoreKitPurchases: true,
              action,
              oldExpirationDate,
              newExpirationDate
            };
          } else if (forceRefresh) {
            // 即使数据没有变化，在强制刷新模式下也更新lastVerified时间戳
            // 清除旧的订阅数据缓存
            await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
            await AsyncStorage.removeItem('isPremium');
            
            const updatedSubscriptionData = {
              ...storedSubscription,
              verifiedByServer: true,
              lastVerified: new Date().toISOString()
            };
            
            await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(updatedSubscriptionData));
            logger.subscription('强制刷新：已更新本地订阅的验证时间');
            
            this.updateSubscriptionStatus({
              ...updatedSubscriptionData,
              isFromSync: true
            });
            
            return {
              success: true,
              hasStoreKitPurchases: true,
              action: '更新本地订阅验证时间'
            };
          } else {
            logger.subscription('本地订阅信息与StoreKit一致，无需更新');
            return {
              success: true,
              hasStoreKitPurchases: true,
              action: '无需操作'
            };
          }
        }
      } else {
        logger.subscription('StoreKit中未找到购买记录');
        
        // 检查本地是否有订阅信息
        const storedSubscriptionStr = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
        
        if (storedSubscriptionStr) {
          try {
            const storedSubscription = JSON.parse(storedSubscriptionStr);
            
            // 如果本地显示订阅是活跃的，但StoreKit查不到，可能是过期或被取消
            if (storedSubscription.isActive) {
              logger.subscription('本地订阅为活跃状态，但StoreKit中未找到购买记录，可能已过期或取消');
              
              // 更新本地订阅状态为非活跃
              const updatedSubscription = {
                ...storedSubscription,
                isActive: false,
                expirationReason: 'StoreKit未找到活跃订阅',
                lastVerified: new Date().toISOString()
              };
              
              await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(updatedSubscription));
              logger.subscription('已将本地订阅状态更新为非活跃');
              
              // 通知订阅状态变化
              this.updateSubscriptionStatus({
                ...updatedSubscription,
                isFromSync: true
              });
              
              return {
                success: true,
                hasStoreKitPurchases: false,
                action: '将过期订阅标记为非活跃'
              };
            }
          } catch (e) {
            logger.error('解析本地订阅数据失败', e);
          }
        }
        
        return {
          success: true,
          hasStoreKitPurchases: false,
          action: '无需操作'
        };
      }
    } catch (error) {
      logger.error('同步StoreKit订阅信息失败', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
    
    return {
      success: true
    };
  }

  // 手动触发StoreKit同步（可以从设置页面等位置调用）
  async manualSyncWithStoreKit(): Promise<any> {
    logger.subscription('手动触发StoreKit同步', {
      timestamp: new Date().toISOString()
    });
    
    // 显示同步进度
    Alert.alert(
      '正在同步',
      '正在与App Store同步订阅信息，请稍候...'
    );
    
    try {
      // 使用新的强制查询方法
      const result = await this.forceQueryStoreKitStatus();
      
      if (result.success) {
        return {
          success: true,
          diagnostics: result
        };
      } else {
        // 查询失败，但通知已在forceQueryStoreKitStatus中处理
        return {
          success: false,
          error: result.message || '未找到有效订阅'
        };
      }
    } catch (error: any) {
      logger.error('手动同步失败', {
        error: error.message,
        stack: error.stack
      });
      
      Alert.alert(
        '同步失败',
        `同步订阅信息时出错: ${error.message}`,
        [{ text: '确定' }]
      );
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 辅助方法：初始化连接
  async initializeConnection() {
    try {
      logger.subscription('重新初始化 IAP 连接');
      await initConnection();
      return true;
    } catch (error) {
      logger.error('初始化 IAP 连接失败', error);
      return false;
    }
  }
  
  // 辅助方法：从StoreKit获取可用购买记录 - 增强版
  async getAvailablePurchasesFromStoreKit(forceRefresh: boolean = false, maxRetries: number = 3): Promise<any[]> {
    let retryCount = 0;
    const retryDelay = 1000; // 1秒延迟
    
    logger.subscription('从StoreKit获取可用购买记录 - 增强版', {
      forceRefresh,
      maxRetries,
      timestamp: new Date().toISOString()
    });
    
    if (forceRefresh) {
      // 强制重置StoreKit连接
      logger.subscription('强制刷新: 清除StoreKit缓存并重新初始化连接');
      try {
        await clearTransactionIOS();
        await clearProductsIOS();
        await this.initializeConnection();
        logger.subscription('StoreKit重置完成');
      } catch (error: any) {
        logger.error('StoreKit重置失败', {
          error: error.message,
          stack: error.stack
        });
      }
    }
    
    while (retryCount <= maxRetries) {
      try {
        logger.subscription(`尝试获取StoreKit购买记录 (尝试 ${retryCount + 1}/${maxRetries + 1})`);
        
        // 尝试获取购买记录
        const purchases = await getAvailablePurchases();
        
        logger.subscription('StoreKit购买记录查询结果', {
          success: true,
          attemptNumber: retryCount + 1,
          hasPurchases: purchases && purchases.length > 0,
          purchaseCount: purchases?.length || 0,
          purchases: purchases?.map(p => ({
            productId: p.productId,
            transactionId: p.transactionId,
            transactionDate: new Date(p.transactionDate).toISOString()
          }))
        });
        
        if (purchases && purchases.length > 0) {
          return purchases;
        }
        
        // 如果是最后一次尝试且没有找到购买记录
        if (retryCount === maxRetries) {
          logger.subscription('所有尝试均未找到StoreKit购买记录');
          return [];
        }
        
        // 否则等待后重试
        logger.subscription(`未找到购买记录，${retryDelay}ms后重试`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryCount++;
        
      } catch (error: any) {
        logger.error('从StoreKit获取购买记录失败', {
          error: error.message,
          stack: error.stack,
          attemptNumber: retryCount + 1
        });
        
        // 如果是最后一次尝试
        if (retryCount === maxRetries) {
          logger.subscription('所有尝试均失败，无法从StoreKit获取购买记录');
          return [];
        }
        
        // 否则等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryCount++;
      }
    }
    
    return [];
  }
  
  // 辅助方法：获取最新的购买记录
  getLatestPurchase(purchases: any[]) {
    if (!purchases || purchases.length === 0) return null;
    
    // 按交易日期排序，获取最新的记录
    return purchases.sort((a, b) => b.transactionDate - a.transactionDate)[0];
  }

  // 特殊的调试方法：强制从StoreKit查询订阅状态
  async forceQueryStoreKitStatus(): Promise<any> {
    logger.subscription('🔍 开始强制查询StoreKit订阅状态', {
      timestamp: new Date().toISOString()
    });
    
    try {
      // 强制重置StoreKit连接
      logger.subscription('重置StoreKit连接');
      await clearTransactionIOS();
      await clearProductsIOS();
      await this.initializeConnection();
      
      // 预热连接
      logger.subscription('预热StoreKit连接');
      await getSubscriptions({
        skus: Object.values(IOS_SKUS)
      });
      
      // 等待一秒钟以确保连接稳定
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 使用增强版方法查询，强制刷新，多次尝试
      logger.subscription('开始查询StoreKit购买记录');
      const purchases = await this.getAvailablePurchasesFromStoreKit(true, 5);
      
      if (purchases && purchases.length > 0) {
        logger.subscription('✅ 从StoreKit成功获取到购买记录', {
          count: purchases.length,
          firstPurchase: {
            productId: purchases[0].productId,
            transactionDate: new Date(purchases[0].transactionDate).toISOString()
          }
        });
        
        // 通知用户
        Alert.alert(
          '查询成功',
          `StoreKit报告您有 ${purchases.length} 个有效订阅:\n\n产品ID: ${purchases[0].productId}\n购买日期: ${new Date(purchases[0].transactionDate).toLocaleDateString()}`,
          [{ text: '确定' }]
        );
        
        // 立即使用此数据更新订阅状态
        logger.subscription('使用StoreKit数据更新订阅状态');
        await this.checkSubscriptionStatus(true);
        
        return {
          success: true,
          purchases: purchases.map(p => ({
            productId: p.productId,
            transactionDate: new Date(p.transactionDate).toISOString(),
            hasReceipt: !!p.transactionReceipt
          }))
        };
      } else {
        logger.subscription('❌ StoreKit未返回任何购买记录');
        
        // 通知用户
        Alert.alert(
          '查询结果',
          'StoreKit报告您没有有效的订阅。如果您认为这是错误的，请尝试重启应用或联系客服。',
          [{ text: '确定' }]
        );
        
        return {
          success: false,
          message: 'StoreKit报告没有有效订阅'
        };
      }
    } catch (error: any) {
      logger.error('强制查询StoreKit失败', {
        error: error.message,
        stack: error.stack
      });
      
      // 通知用户
      Alert.alert(
        '查询失败',
        `无法连接到StoreKit查询订阅状态: ${error.message}`,
        [{ text: '确定' }]
      );
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}