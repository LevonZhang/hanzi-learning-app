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
  getSubscriptions,
  getProducts,
  setup,
  endConnection,
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
      logger.subscription('订阅服务已初始化');
      return;
    }
    
    try {
      logger.subscription('初始化订阅服务', {
        timestamp: new Date().toISOString(),
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production',
        checkSubscription: ENV.CHECK_SUBSCRIPTION
      });
      
      // 详细记录要使用的产品IDs
      const skus = Object.values(IOS_SKUS);
      logger.subscription('将要获取的产品ID列表', {
        productIds: skus,
        timestamp: new Date().toISOString()
      });
      
      // 在开发环境中清除缓存
      if (ENV.IS_SANDBOX) {
        logger.subscription('沙盒环境: 清除StoreKit缓存');
        await clearTransactionIOS();
        logger.subscription('StoreKit缓存清除完成');
      }
      
      // 设置StoreKit2模式
      logger.subscription('设置IAP配置');
      setup({ storekitMode: 'STOREKIT2_MODE' });
      
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
        logger.subscription('启动时强制检查StoreKit订阅状态');
        await this.performServerSubscriptionCheck();
      } catch (error) {
        logger.error('启动时检查StoreKit订阅失败:', error);
        // 继续初始化流程，不阻止应用启动
      }
      
      // 启动定期检查订阅状态
      this.startPeriodicSubscriptionCheck();
    } catch (err) {
      logger.error('初始化IAP失败:', {
        error: err,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        environment: ENV.IS_SANDBOX ? 'sandbox' : 'production'
      });
      // 不抛出错误，让应用继续运行
      this.isInitialized = false;
    }
  }

  private handlePurchaseError(error: PurchaseError) {
    logger.error('购买过程发生错误', error);
    
    if (error.code === 'E_DEFERRED_PAYMENT') {
      // 特殊处理家长控制延迟付款
      logger.subscription('检测到家长控制延迟付款 (Ask to Buy):', {
      code: error.code,
        message: error.message,
        timestamp: new Date().toISOString()
      });
      
      // 按照Apple指南，当交易处于deferred状态时，需要稍后检查新交易
      // 当"Ask to Buy"请求被批准后，会有一个新的交易(purchased状态)添加到队列
      
      Alert.alert(
        '购买请求已提交',
        '您的购买请求已发送，但需要家长批准。批准后将自动完成购买。',
        [{ text: '好的', style: 'default' }]
      );
      
      // 确保我们的TransactionObserver已经设置好，可以在任何时间捕获新的交易
      this.updateSubscriptionListeners();
      
      return; // 不将此视为错误，只是特殊状态
    }
    
    if (!error) return;
    
    logger.error('购买过程中出错:', {
      code: error.code,
      message: error.message,
      responseCode: error.responseCode,
      debugMessage: error.debugMessage,
      timestamp: new Date().toISOString()
    });
    
    // 如果不是用户取消，则显示错误提示
    if (error.code !== 'E_USER_CANCELLED') {
      Alert.alert(
        i18n.t('subscription.purchaseErrorTitle'),
        i18n.t('subscription.purchaseErrorMessage', { errorCode: error.code })
      );
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
        logger.error('购买凭证为空', purchase.productId);
        
        if (purchase.transactionId && purchase.productId && 
            Object.values(IOS_SKUS).includes(purchase.productId as any)) {
          logger.subscription('凭证为空但交易看起来有效，尝试基于交易信息创建订阅', {
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            transactionDate: purchase.transactionDate
          });
          
          try {
            const subscriptionData: SubscriptionDataType = {
              isActive: true,
              productId: purchase.productId,
              expirationDate: this.calculateExpirationDate(purchase.productId),
              originalTransactionId: purchase.originalTransactionDateIOS || purchase.transactionId,
              transactionId: purchase.transactionId,
              transactionDate: purchase.transactionDate,
              validatedByServer: false,
              createdAt: new Date().toISOString()
            };
            
            await this.updateSubscriptionStatus(subscriptionData);
            
            logger.subscription('已基于有效交易（无凭证）创建订阅', {
              productId: purchase.productId,
              transactionId: purchase.transactionId
            });
            
            return true;
          } catch (updateError) {
            logger.error('基于交易信息创建订阅失败', {
              error: updateError instanceof Error ? updateError.message : 'Unknown error',
              productId: purchase.productId
            });
            return false;
          }
        }
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
            const subscriptionValidator = SubscriptionValidationService.getInstance();
            const result = await subscriptionValidator.verifyTransaction(
              latestPurchase.transactionId,
              jws
            );
            
            logger.subscription('服务器验证结果', {
              success: true,
              hasTransactionData: !!result.transaction
            });
            
            // 解析交易信息
            const subscriptionData = subscriptionValidator.parseTransactionInfo(result.transaction);
            
            // 应用类型安全转换
            const typedData = subscriptionData as unknown as SubscriptionDataType;
            
            logger.subscription('解析后的订阅数据', {
              productId: typedData.productId,
              expirationDate: typedData.expirationDate,
              isActive: typedData.isActive
            });
            
            // 从StoreKit获取数据成功，清除本地缓存
            logger.subscription('从StoreKit获取订阅数据成功，准备清除本地缓存', {
              productId: typedData.productId,
              expirationDate: typedData.expirationDate,
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
            
            await this.updateSubscriptionStatus(typedData);
            
            logger.subscription('已从StoreKit更新订阅状态 - 存储过程完成', {
              productId: typedData.productId,
              expirationDate: typedData.expirationDate,
              isActive: typedData.isActive,
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
            
            // 执行一次checkSubscriptionStatus以验证状态是否正确更新
            const newStatus = await this.checkSubscriptionStatus();
            logger.subscription('✅ 订阅状态检查验证:', {
              newStatus,
              shouldBeFalse: true,
              timestamp: new Date().toISOString()
            });
            
            // 应用类型安全转换
            const typedSubscriptionData = typeof subscriptionData === 'string'
              ? JSON.parse(subscriptionData) as SubscriptionDataType
              : subscriptionData as unknown as SubscriptionDataType;
            
            return typedSubscriptionData.isActive === true;
          } else if (latestPurchase.transactionId) {
            // 处理有交易ID但没有jws的情况
            logger.subscription('交易凭证(jws)缺失，但有交易ID，尝试基于StoreKit信息创建订阅', {
              productId: latestPurchase.productId,
              transactionId: latestPurchase.transactionId,
              purchaseDate: new Date(latestPurchase.transactionDate).toISOString(),
              timestamp: new Date().toISOString()
            });
              
            // 创建基本的订阅数据对象
            const localSubscriptionData: SubscriptionDataType = {
              isActive: true,
              productId: latestPurchase.productId,
              expirationDate: this.calculateExpirationDate(latestPurchase.productId),
              originalTransactionId: latestPurchase.originalTransactionDateIOS || latestPurchase.transactionId,
              transactionId: latestPurchase.transactionId,
              transactionDate: latestPurchase.transactionDate,
              validatedByServer: false, // 标记为未经服务器验证
              createdAt: new Date().toISOString(),
              source: 'storekit-check-no-receipt'
            };
            
            // 清除旧的订阅数据缓存
            try {
              await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
              await AsyncStorage.removeItem('isPremium');
              logger.subscription('本地缓存清除成功', {
                timestamp: new Date().toISOString()
              });
            } catch (clearError) {
              logger.error('清除本地缓存失败', {
                error: clearError instanceof Error ? clearError.message : 'Unknown error',
                timestamp: new Date().toISOString()
              });
            }
            
            // 更新订阅状态
            await this.updateSubscriptionStatus(localSubscriptionData);
            
            logger.subscription('✅ 基于StoreKit信息创建了本地订阅记录', {
              productId: localSubscriptionData.productId,
              transactionId: localSubscriptionData.transactionId,
              expirationDate: localSubscriptionData.expirationDate,
              timestamp: new Date().toISOString()
            });
            
            return true;
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
      
      // 开始购买流程
      logger.subscription('开始请求购买', { fullProductId });
      try {
        const purchase = await requestSubscription({
          sku: fullProductId,
          andDangerouslyFinishTransactionAutomaticallyIOS: false
        });
      
        if (!purchase) {
          logger.error('购买请求返回空结果');
          return false;
        }
        
        // 处理购买结果
        const purchaseData = Array.isArray(purchase) ? purchase[0] : purchase;
        
        logger.subscription('购买成功，开始验证交易', {
          transactionId: purchaseData.transactionId,
          productId: purchaseData.productId,
          transactionDate: purchaseData.transactionDate 
            ? new Date(purchaseData.transactionDate).toISOString() 
            : undefined
        });
        
        // 确认交易并结束交易流程
        try {
          await finishTransaction({ purchase: purchaseData });
          logger.subscription('交易已完成标记', {
            transactionId: purchaseData.transactionId
          });
        } catch (finishError: any) {
          logger.error('完成交易标记失败', {
            error: finishError.message,
            transactionId: purchaseData.transactionId
          });
          // 继续流程，不中断
        }
        
        // 刷新可用购买记录以确认订阅
        logger.subscription('验证新购买的订阅');
        await this.checkSubscriptionStatus(true);
        
        return true;
      } catch (purchaseError: any) {
        const errorCode = purchaseError.code || '';
        const errorMessage = purchaseError.message || '未知错误';
        
        logger.error('购买过程发生错误', {
          code: errorCode,
          message: errorMessage,
          stack: purchaseError.stack
        });
        
        // 处理常见错误
        if (errorCode === 'E_USER_CANCELLED') {
          logger.subscription('用户取消了购买');
          return false;
        }
        
        if (errorCode === 'E_ALREADY_OWNED') {
          logger.subscription('用户已拥有此产品，尝试恢复购买');
          const restored = await this.restoreSubscriptions();
          return restored;
        }
        
        // 显示错误信息
        Alert.alert(
          '购买失败',
          `购买过程中发生错误: ${errorMessage}`,
          [{ text: '确定' }]
        );
        
        return false;
      }
    } catch (error: any) {
      logger.error('发起订阅购买失败', {
        error: error instanceof Error ? error.message : String(error),
        errorMessage: error instanceof Error ? error.message : String(error),
        planId,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      Alert.alert(
        '购买失败',
        '处理您的订阅请求时发生错误，请稍后再试。',
        [{ text: '确定' }]
      );
      
      return false;
    }
  }

  async cleanup() {
    try {
      logger.subscription('清理订阅服务资源');
      
      // 停止定期检查
      this.stopPeriodicSubscriptionCheck();
      
      // 移除监听器
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
        this.purchaseUpdateSubscription = null;
    }
      
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
        this.purchaseErrorSubscription = null;
      }
      
      // 关闭连接
      await endConnection();
      
      this.isInitialized = false;
      logger.subscription('订阅服务资源已清理');
    } catch (error) {
      logger.error('清理订阅服务资源时出错:', error);
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

          const subscriptionValidator = SubscriptionValidationService.getInstance();
          const result = await subscriptionValidator.verifyTransaction(
            transaction.transactionId,
            transaction.jws
          );

          const subscriptionData = subscriptionValidator.parseTransactionInfo(result.transaction);
          await this.updateSubscriptionStatus(subscriptionData);
          hasRestoredSubscription = hasRestoredSubscription || 
            (typeof subscriptionData === 'object' && subscriptionData?.isActive === true);
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

  // 清理订阅缓存（用于故障排除）
  async clearSubscriptionCache() {
    try {
      await clearTransactionIOS();
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
        timestamp: new Date().toISOString()
      });
      
      // 在沙盒环境中清除缓存以确保获取最新状态
      if (ENV.IS_SANDBOX) {
        await clearTransactionIOS();
        await this.initializeConnection();
      }
      
      // 获取可用购买记录 - 使用增强版方法，强制刷新
      const purchases = await this.getAvailablePurchasesFromStoreKit(true);
      
      if (!purchases || purchases.length === 0) {
        // 如果没有找到购买记录，即StoreKit认为没有有效订阅
        // 获取本地订阅数据以便我们可以更新它
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
          try {
            await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
            await AsyncStorage.removeItem('isPremium');
          } catch (clearError: any) {
            logger.error('清除本地缓存失败', {
              error: clearError.message
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
          
          // 执行一次checkSubscriptionStatus以验证状态是否正确更新
          const newStatus = await this.checkSubscriptionStatus();
          logger.subscription('✅ 订阅状态检查验证:', {
            newStatus,
            shouldBeFalse: true,
            timestamp: new Date().toISOString()
          });
          
          // 应用类型安全转换
          const typedSubscriptionData = typeof subscriptionData === 'string'
            ? JSON.parse(subscriptionData) as SubscriptionDataType
            : subscriptionData as unknown as SubscriptionDataType;
            
          return typedSubscriptionData.isActive === true;
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
      
      // 检查交易数据是否完整
      if (!transaction.transactionId) {
        logger.error('缺少交易ID，无法进行验证');
        return false;
      }
      
      // 检查是否有交易凭证(jws)
      if (!transaction.jws) {
        logger.subscription('交易凭证(jws)缺失，但有交易ID，尝试基于StoreKit信息创建订阅', {
          productId: transaction.productId,
          transactionId: transaction.transactionId,
          purchaseDate: new Date(transaction.purchaseDate).toISOString(),
                timestamp: new Date().toISOString()
              });
              
        // 创建基本的订阅数据对象
        const localSubscriptionData: SubscriptionDataType = {
          isActive: true,
          productId: transaction.productId,
          expirationDate: this.calculateExpirationDate(transaction.productId),
          originalTransactionId: transaction.originalTransactionId || transaction.transactionId,
          transactionId: transaction.transactionId,
          transactionDate: transaction.purchaseDate,
          validatedByServer: false, // 标记为未经服务器验证
          createdAt: new Date().toISOString(),
          source: 'storekit-server-check-no-receipt'
        };
        
        // 更新订阅状态
        await this.updateSubscriptionStatus(localSubscriptionData);
        
        logger.subscription('✅ 基于StoreKit信息创建了本地订阅记录', {
          productId: transaction.productId,
          transactionId: transaction.transactionId,
          expirationDate: localSubscriptionData.expirationDate,
          timestamp: new Date().toISOString()
        });
        
        return true;
      }
      
      logger.subscription('开始服务器验证交易', {
        transactionId: transaction.transactionId,
        timestamp: new Date().toISOString()
      });
      
      let subscriptionData;
      let needsParsingByValidator = false;
      
      try {
        const subscriptionValidator = SubscriptionValidationService.getInstance();
        const result = await subscriptionValidator.verifyTransaction(
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
        
        // 保存验证结果以供后续解析
        subscriptionData = result.transaction;
        needsParsingByValidator = true;
      } catch (verifyError) {
        // 处理验证错误，但允许继续处理
        logger.error('交易验证失败，但将继续处理', {
          error: verifyError instanceof Error ? verifyError.message : 'Unknown error',
          stack: verifyError instanceof Error ? verifyError.stack : 'No stack trace',
          transactionId: transaction.transactionId,
          productId: transaction.productId,
          timestamp: new Date().toISOString()
        });
        
        // 在验证失败时，使用StoreKit的信息构建一个基本的订阅数据
              subscriptionData = {
          productId: transaction.productId,
                isActive: true,
          expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 临时30天有效期
          originalTransactionId: transaction.originalTransactionId || transaction.transactionId,
          transactionId: transaction.transactionId,
          validatedByServer: false // 标记为服务器未验证
        };
        
        // 发送错误遥测以便后续分析，但不打扰用户
        const userVisibleError = verifyError instanceof Error && 
                               verifyError.message.includes('network') ? true : false;
        
        if (userVisibleError) {
          Alert.alert(
            '订阅验证提示',
            '您的订阅已生效，但验证过程出现网络问题。这不会影响您的使用，系统将在网络恢复后自动重试。',
            [{ text: '好的', style: 'default' }]
          );
        }
      }
      
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
      
      // 根据需要解析订阅数据
      let typedData;
      try {
        if (needsParsingByValidator) {
          // 使用验证器解析服务器返回的数据
          const subscriptionValidator = SubscriptionValidationService.getInstance();
          const parsedData = subscriptionValidator.parseTransactionInfo(subscriptionData);
          typedData = parsedData as SubscriptionDataType;
        } else {
          // 直接使用我们创建的基本订阅数据
          typedData = subscriptionData as SubscriptionDataType;
        }
      
      logger.subscription('解析的订阅数据', {
          productId: typedData.productId,
          expirationDate: typedData.expirationDate,
          isActive: typedData.isActive,
          fromValidator: needsParsingByValidator
        });
      } catch (parseError) {
        logger.error('解析订阅数据失败', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          fromValidator: needsParsingByValidator
        });
        
        // 如果解析失败，使用我们的基本备份数据
        typedData = {
          productId: transaction.productId,
          isActive: true,
          expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          lastVerified: new Date().toISOString()
        } as SubscriptionDataType;
      }
      
      logger.subscription('准备更新本地存储', {
        timestamp: new Date().toISOString()
      });
      
      await this.updateSubscriptionStatus(typedData);
      
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
      
      return typedData.isActive;
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
          skus: Object.values(IOS_SKUS)
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
  async getAvailablePurchasesFromStoreKit(forceRefresh: boolean = false): Promise<any[]> {
    logger.subscription('从StoreKit获取可用购买记录', {
      forceRefresh,
      timestamp: new Date().toISOString()
    });
    
    if (forceRefresh) {
      // 强制重置StoreKit连接
      logger.subscription('强制刷新: 清除StoreKit缓存并重新初始化连接');
      try {
        // 使用较新版本的API清除交易
        await clearTransactionIOS();
        
        // 不再使用clearProductsIOS，改为重新初始化连接
        logger.subscription('重新初始化IAP连接替代清除产品缓存');
        await this.initializeConnection();
        
        logger.subscription('StoreKit重置完成');
      } catch (error: any) {
        logger.error('StoreKit重置失败', {
          error: error.message,
          stack: error.stack
        });
      }
    }
    
      try {
      logger.subscription('尝试获取StoreKit购买记录');
        
        // 尝试获取购买记录
        const purchases = await getAvailablePurchases();
        
        logger.subscription('StoreKit购买记录查询结果', {
          success: true,
          hasPurchases: purchases && purchases.length > 0,
          purchaseCount: purchases?.length || 0,
          purchases: purchases?.map(p => ({
            productId: p.productId,
            transactionId: p.transactionId,
            transactionDate: new Date(p.transactionDate).toISOString()
          }))
        });
        
      return purchases || [];
      } catch (error: any) {
        logger.error('从StoreKit获取购买记录失败', {
          error: error.message,
        stack: error.stack
        });
        
          return [];
        }
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
      const purchases = await this.getAvailablePurchasesFromStoreKit(true);
      
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

  // 根据产品ID计算订阅过期日期
  private calculateExpirationDate(productId: string): Date {
    const now = new Date();
    let expirationDate = new Date(now);
    
    switch (productId) {
      case IOS_SKUS.monthly:
        // 月度订阅 - 添加1个月
        expirationDate.setMonth(now.getMonth() + 1);
        break;
      case IOS_SKUS.quarterly:
        // 季度订阅 - 添加3个月
        expirationDate.setMonth(now.getMonth() + 3);
        break;
      case IOS_SKUS.yearly:
        // 年度订阅 - 添加1年
        expirationDate.setFullYear(now.getFullYear() + 1);
        break;
      case IOS_SKUS.lifetime:
        // 终身订阅 - 添加100年
        expirationDate.setFullYear(now.getFullYear() + 100);
        break;
      default:
        // 默认30天
        expirationDate.setDate(now.getDate() + 30);
    }
    
    return expirationDate;
  }
}