import { Platform, Alert, Linking } from 'react-native';
import {
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  ProductPurchase,
  PurchaseError,
  finishTransaction,
  getSubscriptions,
} from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionValidationService } from './SubscriptionValidationService';
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

interface SubscriptionDataType {
  isActive: boolean;
  productId: string;
  expirationDate: string | Date; // 允许字符串或日期类型
  [key: string]: any; // 允许其他属性
}

export default class SubscriptionService {
  private static instance: SubscriptionService;
  private purchaseUpdateSubscription: any;
  private purchaseErrorSubscription: any;
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

  private constructor() {}

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async initialize() {
    try {
      if (this.isInitialized) return;

      logger.subscription('开始初始化订阅服务');

      // 初始化IAP连接
      try {
        await initConnection();
        logger.subscription('IAP连接初始化成功');
      } catch (error) {
        logger.error('IAP连接初始化失败:', error);
        // 连接失败不应阻止整个服务初始化，后续可以重试
      }

      // 添加购买更新监听器
      if (!this.purchaseUpdateSubscription) {
        this.purchaseUpdateSubscription = purchaseUpdatedListener(
          async (purchase: ProductPurchase) => {
            try {
              // 避免重复处理 - 检查transactionId是否存在
              if (purchase.transactionId && this.processedTransactions.has(purchase.transactionId)) {
                logger.subscription('跳过已处理的交易:', purchase.transactionId);
                return;
              }

              logger.subscription('收到购买更新:', {
                productId: purchase.productId,
                transactionId: purchase.transactionId,
                transactionDate: new Date(purchase.transactionDate).toISOString()
              });

              // 只有在transactionId存在时才记录为已处理
              if (purchase.transactionId) {
                this.processedTransactions.add(purchase.transactionId);
              }

              // 验证并处理购买
              await this.handleSuccessfulPurchase(purchase);
            } catch (error) {
              logger.error('处理购买更新时出错:', error);
            }
          },
        );
        logger.subscription('添加购买更新监听器成功');
      }

      // 添加购买错误监听器
      if (!this.purchaseErrorSubscription) {
        this.purchaseErrorSubscription = purchaseErrorListener(
          (error: PurchaseError) => {
            this.handlePurchaseError(error);
          },
        );
        logger.subscription('添加购买错误监听器成功');
      }

      // 初始化订阅数据
      await this.updateSubscriptionListeners();

      // 标记为已初始化
      this.isInitialized = true;
      logger.subscription('订阅服务初始化完成');

      // 更新订阅状态检查
      try {
        await this.checkSubscriptionStatus();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('初始化期间检查订阅状态失败', errorMessage);
      }

      // 不再启动定期检查，使用事件驱动方式
      // this.startPeriodicSubscriptionCheck();

      return true;
    } catch (error) {
      logger.error('初始化订阅服务失败:', error);
      return false;
    }
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

  async validatePurchase(purchase: ProductPurchase): Promise<boolean> {
    if (!purchase) {
      logger.error('无效的购买对象');
      return false;
    }
    
    try {
      logger.subscription('开始验证购买:', {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        transactionDate: purchase.transactionDate
      });
      
      const receipt = purchase.transactionReceipt;
      
      if (!receipt) {
        logger.error('购买凭证为空，视为订购失败', purchase.productId);
        return false;
      }
      
      const subscriptionValidator = SubscriptionValidationService.getInstance();
      const validationResult = await subscriptionValidator.verifyTransaction(
        purchase.transactionId || '',
        receipt
      );

      if (validationResult.status === -1) {
        logger.error('验证交易失败', {
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

  async purchaseSubscription(planId: string) {
    try {
      // 确保IAP已初始化
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      logger.subscription('开始购买订阅', { planId });
      
      // 这里使用react-native-iap的requestPurchase方法
      // 实际购买会由purchaseUpdatedListener处理，不需要在这里处理回调
      const { requestPurchase } = await import('react-native-iap');
      const result = await requestPurchase({
        sku: planId,
        andDangerouslyFinishTransactionAutomaticallyIOS: false
      });
      
      logger.subscription('订阅购买请求已发送', { planId, result });
      
      return { success: true };
    } catch (error) {
      logger.error('购买订阅失败', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '购买失败'
      };
    }
  }

  async restoreSubscriptions(): Promise<boolean> {
    try {
      // 确保IAP已初始化
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      logger.subscription('开始恢复订阅');
      
      // 获取可用的购买记录
      const purchases = await this.getAvailablePurchases();
      
      if (!purchases || purchases.length === 0) {
        logger.subscription('没有可恢复的订阅');
        return false;
      }
      
      // 处理找到的购买
      let hasRestoredSubscription = false;
      for (const purchase of purchases) {
        try {
          // 验证购买，确保transactionId和transactionReceipt不为undefined
          if (purchase.transactionId && purchase.transactionReceipt) {
            const validator = SubscriptionValidationService.getInstance();
            const result = await validator.verifyTransaction(
              purchase.transactionId,
              purchase.transactionReceipt
            );
            
            if (result.status === 0 && result.transaction) {
              // 解析交易信息
              const subscriptionData = validator.parseTransactionInfo(result.transaction);
              
              // 更新到本地存储
              await this.updateSubscriptionStatus(subscriptionData);
              
              // 标记已恢复
              hasRestoredSubscription = true;
            }
          } else {
            logger.error('恢复的购买记录缺少必要信息', {
              hasTransactionId: !!purchase.transactionId,
              hasTransactionReceipt: !!purchase.transactionReceipt
            });
          }
        } catch (error) {
          logger.error('验证恢复的购买失败', error);
        }
      }
      
      if (hasRestoredSubscription) {
        logger.subscription('订阅恢复成功');
        return true;
      } else {
        logger.subscription('没有有效的订阅可恢复');
        return false;
      }
    } catch (error) {
      logger.error('恢复订阅失败', error);
      return false;
    }
  }

  // 处理成功的购买
  private async handleSuccessfulPurchase(purchase: ProductPurchase) {
    try {
      // 检查购买凭证是否为空
      if (!purchase.transactionReceipt) {
        logger.error('购买凭证为空，无法处理', {
          productId: purchase.productId,
          transactionId: purchase.transactionId
        });
        return false;
      }

      const validator = SubscriptionValidationService.getInstance();
      const result = await validator.verifyTransaction(
        purchase.transactionId || '',
        purchase.transactionReceipt
      );

      if (result.status === 0 && result.transaction) {
        const subscriptionData = validator.parseTransactionInfo(result.transaction);

        // 更新内存中的状态
        this.currentSubscriptionData = subscriptionData;

        // 保存到本地存储
        await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscriptionData));
        
        // 设置isPremium标记
        await AsyncStorage.setItem('isPremium', subscriptionData.isActive.toString());

        // 通知监听器
        this.notifySubscriptionUpdate(subscriptionData);

        logger.subscription('订阅已成功处理', {
          productId: subscriptionData.productId,
          isActive: subscriptionData.isActive,
          expirationDate: subscriptionData.expirationDate
        });
        
        return true;
      } else {
        logger.error('购买验证失败', result);
        return false;
      }
    } catch (error) {
      logger.error('处理购买失败', error);
      return false;
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
}