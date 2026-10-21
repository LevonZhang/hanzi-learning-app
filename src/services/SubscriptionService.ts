import { Platform, Alert, Linking, NativeEventEmitter, NativeModules, EmitterSubscription } from 'react-native';
import {
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  ProductPurchase,
  PurchaseError,
  finishTransaction,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
} from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LearningManager } from './LearningManager';
import { ENV, CONSTANTS, SUBSCRIPTION_ERRORS, SUBSCRIPTION_SKU_PREFIX } from '../config/env';
import { logger } from '../utils/logger';
import { i18n } from '../i18n/i18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReceiptValidationService } from './ReceiptValidationService';
import { TransactionProcessor } from './TransactionProcessor';
import { SubscriptionStateManager } from './SubscriptionStateManager';
import { SubscriptionValidator } from './SubscriptionValidator';
import { SubscriptionStatus } from '../types/subscription';

// 订阅计划类型
export type SubscriptionPlanId = string;

// iOS 订阅产品 ID（示例值，发布前替换 src/config/env.ts 中的 APP_BUNDLE_ID）
export const IOS_SKUS: Record<string, string> = {
  'monthly': `${SUBSCRIPTION_SKU_PREFIX}.monthly`,
  'quarterly': `${SUBSCRIPTION_SKU_PREFIX}.quarterly`,
  'yearly': `${SUBSCRIPTION_SKU_PREFIX}.yearly`,
  'lifetime': `${SUBSCRIPTION_SKU_PREFIX}.lifetime`,
};

const SKU = {
  monthly: `${SUBSCRIPTION_SKU_PREFIX}.monthly`,
  quarterly: `${SUBSCRIPTION_SKU_PREFIX}.quarterly`,
  yearly: `${SUBSCRIPTION_SKU_PREFIX}.yearly`,
  lifetime: `${SUBSCRIPTION_SKU_PREFIX}.lifetime`,
};

// 订阅计划配置
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, {
  id: SubscriptionPlanId;
  price: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = {
  [SKU.monthly]: {
    id: SKU.monthly,
    price: 4.99,
    icon: 'star',
  },
  [SKU.quarterly]: {
    id: SKU.quarterly,
    price: 12.99,
    icon: 'star-shooting',
  },
  [SKU.yearly]: {
    id: SKU.yearly,
    price: 39.99,
    icon: 'star-circle',
  },
  [SKU.lifetime]: {
    id: SKU.lifetime,
    price: 99.99,
    icon: 'crown',
  },
};

export const subscriptionSkus = IOS_SKUS;
export const SUBSCRIPTION_KEY = 'subscriptionData'; // 添加订阅数据存储键

interface SubscriptionDataType {
  isActive: boolean;
  productId: string | null;
  expirationDate: string | Date | null;
  lastUpdated?: string;
  wasRefunded?: boolean;
  [key: string]: any;
}

export class SubscriptionService {
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

  private validator: SubscriptionValidator;
  private stateManager: SubscriptionStateManager;

  private isInitializing = false;
  private initializationAttempts = 0;
  private initPromises: Array<(value: boolean) => void> = [];

  private constructor() {
    const receiptValidator = new ReceiptValidationService();
    const transactionProcessor = new TransactionProcessor();
    this.stateManager = new SubscriptionStateManager();
    this.validator = new SubscriptionValidator(
      receiptValidator,
      transactionProcessor,
      this.stateManager
    );
  }

  /**
   * 获取SubscriptionService单例
   */
  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * 初始化订阅服务
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitializing) {
        logger.info('Subscription service already initializing, waiting...');
        await this.waitForInitialization();
        return this.isInitialized;
      }

    if (this.isInitialized) {
        logger.info('Subscription service already initialized');
      return true;
    }

      this.isInitializing = true;
      logger.info('Initializing subscription service');

        try {
          await initConnection();
        logger.info('IAP connection initialized');

        // 设置购买监听器
        this.setupListeners();
        logger.info('Purchase listeners set up');
        
        // 预加载订阅产品列表，避免后续"Invalid product ID"错误
        try {
          logger.info('预加载订阅产品列表...');
          const subscriptions = await getSubscriptions({
            skus: Object.values(IOS_SKUS)
          });
          logger.info(`成功预加载 ${subscriptions.length} 个订阅产品`);
          
          // 记录可用产品的ID，便于调试
          if (subscriptions.length > 0) {
            const productIds = subscriptions.map(s => s.productId);
            logger.info('可用的订阅产品IDs:', productIds);
          } else {
            logger.warn('没有获取到可用的订阅产品，可能会影响购买流程');
          }
        } catch (productsError) {
          // 获取产品失败不会阻止初始化流程
          logger.warn('预加载订阅产品失败，但将继续初始化流程:', productsError);
        }

        // 尝试加载订阅状态
        await this.checkSubscriptionStatus();

        this.isInitialized = true;
        logger.info('Subscription service initialized successfully');
        return true;
      } catch (error) {
        if (ENV.IS_SANDBOX) {
          // 在测试环境中，如果初始化失败但不是致命错误，仍可继续
          logger.warn('Initialization failed in sandbox environment, but continuing:', error);
        this.isInitialized = true;
          return true;
        }
        
        logger.error('Failed to initialize subscription service:', error);
        
        // 最多重试3次
        if (this.initializationAttempts < 3) {
          this.initializationAttempts++;
          this.isInitializing = false;
          logger.info(`Retrying initialization (attempt ${this.initializationAttempts})`);
          return await this.initialize();
        }
        
        return false;
      } finally {
        this.isInitializing = false;
        this.initPromises.forEach(resolve => resolve(this.isInitialized));
        this.initPromises = [];
      }
    } catch (error) {
      logger.error('Unexpected error during initialization:', error);
      this.isInitializing = false;
      return false;
    }
  }

  /**
   * 设置购买更新和错误监听器
   */
  private setupListeners(): void {
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: ProductPurchase) => {
        try {
          logger.subscription('收到购买更新事件:', {
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            hasReceipt: !!purchase.transactionReceipt,
            hasVerification: !!purchase.verificationResultIOS,
            isInSandbox: ENV.IS_SANDBOX
          });
          
          // 处理退款或无效交易ID的情况
          if (purchase.transactionId === null || purchase.transactionId === undefined || 
              purchase.transactionId === '' || purchase.transactionId === 'invalid_transaction_id') {
            logger.warn('沙盒环境处理购买出错: Error: Invalid transaction Id');
            
            // 尝试完成交易，避免无限循环
            try {
              await finishTransaction({ purchase, isConsumable: false });
            } catch (finishError) {
              logger.error('完成无效交易ID的交易时出错:', finishError);
            }
            
            // 检查是否是退款导致的
            const isRefund = this.checkForPossibleRefund(purchase);
            if (isRefund) {
              // 更新为非会员状态
              await this.updateSubscriptionStatus({
                isActive: false,
                productId: null,
                expirationDate: null,
                lastUpdated: new Date().toISOString(),
                wasRefunded: true
              });
              logger.info('检测到可能的退款，已更新为非会员状态');
            }
            
            return;
          }
          
          // 在沙盒环境下，特殊处理无收据的情况
          if (!purchase.transactionReceipt) {
            // 如果有验证结果，可以使用验证结果处理
            if (purchase.verificationResultIOS) {
              logger.info('购买没有收据但有验证结果，尝试处理', {
                productId: purchase.productId,
                hasVerification: true
              });
              
              try {
                // 完成交易以防止重复购买提示
                await finishTransaction({ purchase, isConsumable: false });
                
                // 更新订阅状态
                const productId = purchase.productId;
                const expirationDate = new Date();
                
                // 根据产品ID设置过期时间
                if (productId.includes('monthly')) {
                  expirationDate.setMonth(expirationDate.getMonth() + 1);
                } else if (productId.includes('quarterly')) {
                  expirationDate.setMonth(expirationDate.getMonth() + 3);
                } else if (productId.includes('yearly')) {
                  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
                } else if (productId.includes('lifetime')) {
                  expirationDate.setFullYear(expirationDate.getFullYear() + 100);
                }
                
                // 更新订阅状态
                await this.updateSubscriptionStatus({
                  isActive: true,
                  productId: productId,
                  expirationDate: expirationDate.toISOString(),
                  lastUpdated: new Date().toISOString(),
                  isPendingReceipt: true // 标记为等待收据
                });
                
                logger.info('无收据购买已处理成功:', productId);
                return;
              } catch (processError) {
                logger.error('处理无收据购买出错:', processError);
                // 继续执行，尝试其他方式
              }
            }
            
            // 在沙盒环境中，没有收据可能是正常的，我们可以尝试延迟再次检查
            if (ENV.IS_SANDBOX) {
              logger.info('沙盒环境下没有收据，尝试完成交易并更新状态', {
                productId: purchase.productId,
                transactionId: purchase.transactionId || 'unknown'
              });
              
              try {
                // 完成交易
                await finishTransaction({ purchase, isConsumable: false });
                
                // 更新订阅状态
                const productId = purchase.productId;
                if (Object.values(IOS_SKUS).includes(productId)) {
                  const expirationDate = new Date();
                  
                  // 根据产品ID设置过期时间
                  if (productId.includes('monthly')) {
                    expirationDate.setMonth(expirationDate.getMonth() + 1);
                  } else if (productId.includes('quarterly')) {
                    expirationDate.setMonth(expirationDate.getMonth() + 3);
                  } else if (productId.includes('yearly')) {
                    expirationDate.setFullYear(expirationDate.getFullYear() + 1);
                  } else if (productId.includes('lifetime')) {
                    expirationDate.setFullYear(expirationDate.getFullYear() + 100);
                  }
                  
                  // 更新订阅状态
                  await this.updateSubscriptionStatus({
                    isActive: true,
                    productId: productId,
                    expirationDate: expirationDate.toISOString(),
                    lastUpdated: new Date().toISOString(),
                    isSandboxPurchase: true
                  });
                  
                  logger.info('沙盒环境购买处理成功:', productId);
                  return;
                } else {
                  logger.warn('未知的产品ID:', productId);
                }
              } catch (sandboxError) {
                logger.error('沙盒环境处理购买出错:', sandboxError);
              }
              // 即使出错也返回，避免显示错误
              return;
            } else {
              // 非沙盒环境但没有收据，记录错误但不中断流程
              logger.warn('购买中没有找到收据，但尝试继续处理:', {
                productId: purchase.productId,
                transactionId: purchase.transactionId || 'unknown'
              });
            }
          }

          // 如果有收据则正常处理
          if (purchase.transactionReceipt) {
            const environment = __DEV__ ? 'sandbox' : 'production';
            try {
              const validationResult = await this.validator.validateSubscription(
                purchase.transactionReceipt,
                environment
              );

              if (validationResult.isValid) {
                await finishTransaction({ purchase, isConsumable: false });
                logger.info('购买成功完成:', purchase.productId);
              } else {
                logger.error('购买验证失败:', validationResult.error);
                // 尝试完成交易，避免重复提示
                await finishTransaction({ purchase, isConsumable: false });
                return;
              }
            } catch (validationError) {
              logger.error('验证收据时出错:', validationError);
              // 尝试完成交易，避免重复提示
              await finishTransaction({ purchase, isConsumable: false });
              return;
            }
          } else {
            // 走到这里说明既没有收据也不是沙盒环境中可以特殊处理的情况
            // 我们尝试完成交易并返回，避免用户一直看到购买提示
            try {
              await finishTransaction({ purchase, isConsumable: false });
              logger.warn('完成了没有收据的交易:', purchase.productId);
            } catch (finishError) {
              logger.error('完成无收据交易出错:', finishError);
            }
          }
        } catch (error) {
          logger.error('处理购买时出错:', error);
          // 尝试完成交易，无论结果如何
          try {
            await finishTransaction({ purchase, isConsumable: false });
          } catch (finishError) {
            // 忽略完成交易时的错误
          }
          return;
        }
      }
    );

    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        logger.error('购买错误:', error);
        this.handlePurchaseError(error);
      }
    );
  }

  /**
   * 检查是否是退款导致的无效交易
   */
  private checkForPossibleRefund(purchase: ProductPurchase): boolean {
    // 检查当前的订阅状态
    if (!this.currentSubscriptionData?.isActive) {
      return false; // 如果当前不是订阅状态，可能不是退款
    }
    
    // 如果当前产品ID与购买的产品ID相同，可能是退款
    if (this.currentSubscriptionData.productId === purchase.productId) {
      logger.info('检测到可能是退款:', {
        currentProductId: this.currentSubscriptionData.productId,
        purchaseProductId: purchase.productId
      });
      return true;
    }
    
    return false;
  }

  /**
   * 订阅产品
   */
  async subscribe(productId: string): Promise<boolean> {
    try {
      await this.initialize();
      
      // 先尝试获取可用产品，确保IAP系统已正常初始化
      logger.subscription(`准备订阅产品前获取可用产品信息: ${productId}`);
      
      try {
        // 确保先获取产品列表，以避免"Invalid product ID"错误
        await getSubscriptions({
          skus: Object.values(IOS_SKUS)
        });
        logger.subscription('成功获取产品列表，继续订阅流程');
      } catch (productError) {
        logger.error('获取产品列表失败，但仍将尝试订阅:', productError);
        // 即使获取产品失败，我们仍然尝试订阅
      }
      
      // 直接请求订阅
      logger.subscription(`发起订阅请求: ${productId}`);
      
      await requestSubscription({
        sku: productId,
        andDangerouslyFinishTransactionAutomaticallyIOS: false
      });
      
      logger.subscription(`订阅请求已发送: ${productId}`);
      return true;
    } catch (error) {
      // 错误处理
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('订阅请求失败:', {
        error: errorMessage,
        productId,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // 将错误抛出，而不是返回false
      throw error;
    }
  }

  /**
   * 恢复购买
   */
  async restorePurchases(): Promise<{ success: boolean; error?: string }> {
    try {
      logger.subscription('开始恢复购买过程');
      
      // 先检查当前设备的会员状态
      const isCurrentDeviceSubscribed = this.currentSubscriptionData?.isActive || false;
      const currentExpirationDate = this.currentSubscriptionData?.expirationDate 
        ? new Date(this.currentSubscriptionData.expirationDate) 
        : null;
      
      logger.subscription('当前设备会员状态:', {
        isActive: isCurrentDeviceSubscribed,
        expirationDate: currentExpirationDate?.toISOString() || 'null',
        productId: this.currentSubscriptionData?.productId || 'null'
      });
      
      // 快速检查 - 如果当前设备已经是会员且有效期足够长，直接返回已订阅信息
      if (isCurrentDeviceSubscribed && currentExpirationDate) {
        const now = new Date();
        // 检查有效期是否至少还有30天
        if (currentExpirationDate > now && 
            (currentExpirationDate.getTime() - now.getTime()) > 30 * 24 * 60 * 60 * 1000) {
          logger.subscription('当前设备已是有效会员且剩余时间足够，无需恢复');
          return { 
            success: true, 
            error: i18n.t('subscription.alreadySubscribedDesc')
          };
        }
      }
      
      await this.initialize();
      
      // 重新连接以确保获取最新状态
      await initConnection();
      logger.subscription('IAP连接已初始化');
      
      // 获取所有历史购买记录
      logger.subscription('获取可用的购买记录...');
      const availablePurchases = await getAvailablePurchases();
      
      // 记录找到的购买记录
      logger.subscription(`恢复购买: 获取到 ${availablePurchases.length} 个购买记录`, {
        purchaseCount: availablePurchases.length,
        purchases: availablePurchases.map(p => ({
          productId: p.productId,
          transactionId: p.transactionId,
          transactionDate: p.transactionDate
        }))
      });
      
      // 如果没有找到购买记录，也需要与远程同步
      // 这可能意味着用户已退订或订阅已过期
      if (!availablePurchases || availablePurchases.length === 0) {
        // 如果当前设备显示为激活状态，但远程没有记录，则需要更新本地状态
        if (isCurrentDeviceSubscribed) {
          logger.subscription('无可恢复购买记录，但当前设备显示为会员状态，更新为非会员');
          await this.updateSubscriptionStatus({
            isActive: false,
            productId: this.currentSubscriptionData?.productId || null,
            expirationDate: new Date().toISOString(), // 设置为当前时间表示已过期
            lastUpdated: new Date().toISOString(),
            wasRefunded: false,
            isCancelled: true
          });
          return { success: false, error: i18n.t('subscription.noValidSubscriptionFound') };
        }
        // 如果当前设备本来就是非会员状态，则简单返回无记录
        logger.subscription('没有找到可恢复的购买记录');
        return { success: false, error: i18n.t('subscription.noPurchasesToRestore') };
      }
      
      // 按购买日期排序，获取最新的订阅
      const sortedPurchases = this.sortPurchasesByDate(availablePurchases);
      
      // 筛选出订阅类型的购买记录
      const subscriptionPurchases = sortedPurchases.filter(
        purchase => Object.values(IOS_SKUS).includes(purchase.productId)
      );
      
      logger.subscription(`找到 ${subscriptionPurchases.length} 个订阅类型的购买记录`);
      
      if (subscriptionPurchases.length === 0) {
        // 如果没有订阅记录但设备显示为会员，需要同步状态
        if (isCurrentDeviceSubscribed) {
          logger.subscription('没有找到订阅类型的购买记录，但当前设备显示为会员状态，更新为非会员');
          await this.updateSubscriptionStatus({
            isActive: false,
            productId: this.currentSubscriptionData?.productId || null,
            expirationDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            wasRefunded: false,
            isCancelled: true
          });
        }
        logger.subscription('没有找到订阅类型的购买记录');
        return { success: false, error: i18n.t('subscription.noValidSubscriptionFound') };
      }
      
      // 处理最新的订阅购买记录
      const latestSubscription = subscriptionPurchases[0];
      logger.subscription('处理最新的订阅记录', {
        productId: latestSubscription.productId,
        transactionDate: latestSubscription.transactionDate,
        originalTransactionId: latestSubscription.originalTransactionIdentifierIOS || '未知',
        transactionId: latestSubscription.transactionId || '未知'
      });
      
      try {
        // 验证订阅是否真的有效
        let isSubscriptionActive = false;
        let expiryDate: Date | null = null;
        let isLifetime = latestSubscription.productId.includes('lifetime');
        
        // 尝试完成交易，但不因为失败而中断恢复流程
        try {
          await finishTransaction({ purchase: latestSubscription, isConsumable: false });
          
          // 如果交易ID存在，添加到已处理列表
          if (latestSubscription.transactionId) {
            this.processedTransactions.add(latestSubscription.transactionId);
          }
        } catch (finishError) {
          // 记录错误但继续恢复流程
          // "invalid transaction id" 通常意味着交易已被处理
          if (String(finishError).indexOf('invalid transaction id') !== -1) {
            logger.subscription('交易已被处理过，继续恢复流程');
          } else {
            logger.error('完成交易失败:', finishError);
            // 不要因为完成交易失败而中断整个恢复流程
          }
        }
        
        // 如果有验证数据，解析并检查
        if (latestSubscription.verificationResultIOS) {
          try {
            const jwtParts = latestSubscription.verificationResultIOS.split('.');
            if (jwtParts.length === 3) {
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
              logger.subscription('订阅JWT信息', {
                hasExpiresDate: !!payload.expiresDate,
                environment: payload.environment
              });
              
              // 检查是否有到期日期并且是否已过期
              if (payload.expiresDate) {
                expiryDate = new Date(payload.expiresDate);
                const now = new Date();
                
                if (expiryDate > now) {
                  isSubscriptionActive = true;
                  logger.subscription('远程订阅仍然有效，到期日期:', expiryDate.toISOString());
                  
                  // 如果当前设备已经是会员，且到期时间相同或更晚，则无需恢复
                  if (isCurrentDeviceSubscribed && currentExpirationDate && 
                      (Math.abs(currentExpirationDate.getTime() - expiryDate.getTime()) < 1000 * 60 * 60 * 24 || // 相差不超过1天
                       currentExpirationDate > expiryDate)) {
                    logger.subscription('当前设备已有相同或更长的会员期限，无需恢复');
                    return { 
                      success: true, 
                      error: i18n.t('subscription.alreadySubscribedDesc')
                    };
                  }
                  
                  // 更新订阅状态为有效
                  await this.updateSubscriptionStatus({
                    isActive: true,
                    productId: latestSubscription.productId,
                    expirationDate: expiryDate.toISOString(),
                    lastUpdated: new Date().toISOString(),
                    originalTransactionId: latestSubscription.originalTransactionIdentifierIOS,
                    restoredFromPurchase: true
                  });
                  
                  return { success: true };
                } else {
                  logger.subscription('订阅已过期，过期日期:', expiryDate.toISOString());
                  
                  // 如果远程显示已过期，但本地显示有效，需要同步状态
                  if (isCurrentDeviceSubscribed && (!currentExpirationDate || currentExpirationDate > now)) {
                    logger.subscription('远程订阅已过期，但本地显示有效，更新为非会员');
                    await this.updateSubscriptionStatus({
                      isActive: false,
                      productId: latestSubscription.productId,
                      expirationDate: expiryDate.toISOString(),
                      lastUpdated: new Date().toISOString(),
                      originalTransactionId: latestSubscription.originalTransactionIdentifierIOS,
                      restoredFromPurchase: true,
                      isExpired: true
                    });
                  }
                }
              }
            }
          } catch (jwtError) {
            logger.error('解析验证数据失败:', jwtError);
          }
        }
        
        // 如果无法确认订阅状态，尝试通过其他方式验证
        if (!isSubscriptionActive) {
          // 如果是终身会员产品，则认为是有效的
          if (isLifetime) {
            // 如果当前设备已经是终身会员，则无需恢复
            if (isCurrentDeviceSubscribed && this.currentSubscriptionData?.productId?.includes('lifetime')) {
              logger.subscription('当前设备已是终身会员，无需恢复');
              return { 
                success: true, 
                error: i18n.t('subscription.alreadySubscribedDesc')
              };
            }
            
            const expirationDate = new Date();
            expirationDate.setFullYear(expirationDate.getFullYear() + 100);
            
            await this.updateSubscriptionStatus({
              isActive: true,
              productId: latestSubscription.productId,
              expirationDate: expirationDate.toISOString(),
              lastUpdated: new Date().toISOString(),
              originalTransactionId: latestSubscription.originalTransactionIdentifierIOS,
              restoredFromPurchase: true,
              isLifetime: true
            });
            
            logger.subscription('恢复终身会员权限');
            return { success: true };
          }
          
          // 对于非终身会员，检查现有本地数据是否比新数据更新
          if (isCurrentDeviceSubscribed && currentExpirationDate) {
            const now = new Date();
            
            // 如果本地数据显示订阅仍然有效，检查是否需要恢复
            if (currentExpirationDate > now) {
              logger.subscription('当前设备已有有效订阅', {
                expirationDate: currentExpirationDate.toISOString()
              });
              
              // 如果当前设备的订阅是终身会员，则明显优于其他任何订阅
              if (this.currentSubscriptionData?.productId?.includes('lifetime')) {
                logger.subscription('当前设备已是终身会员，无需恢复');
                return { 
                  success: true, 
                  error: i18n.t('subscription.alreadySubscribedDesc')
                };
              }
              
              // 如果没有从远程获取到到期日期，使用当前设备的数据
              if (!expiryDate) {
                logger.subscription('未从远程获取到到期日期，使用当前设备数据');
                return { success: true };
              }
              
              // 如果当前设备的到期时间晚于远程到期时间，则无需恢复
              if (currentExpirationDate > expiryDate) {
                logger.subscription('当前设备订阅到期时间晚于远程到期时间，无需恢复');
                return { 
                  success: true, 
                  error: i18n.t('subscription.alreadySubscribedDesc')
                };
              }
            }
          }
          
          // 对于非终身会员，还需要进一步验证
          // 使用validator来验证收据
          if (latestSubscription.transactionReceipt) {
            const environment = __DEV__ ? 'sandbox' : 'production';
            try {
              const validationResult = await this.validator.validateSubscription(
                latestSubscription.transactionReceipt,
                environment
              );
              
              if (validationResult.isValid) {
                logger.subscription('通过验证器确认订阅有效');
                
                // 如果验证器确认订阅有效，但未获取到到期日期，则使用默认到期日期
                if (!expiryDate) {
                  const defaultExpiryDate = new Date();
                  defaultExpiryDate.setMonth(defaultExpiryDate.getMonth() + 1); // 默认假设是一个月的订阅
                  expiryDate = defaultExpiryDate;
                }
                
                // 检查当前设备是否已有更好的订阅状态
                if (isCurrentDeviceSubscribed && currentExpirationDate && currentExpirationDate > expiryDate) {
                  logger.subscription('当前设备订阅到期时间晚于远程到期时间，无需恢复');
                  return { 
                    success: true, 
                    error: i18n.t('subscription.alreadySubscribedDesc')
                  };
                }
                
                // 更新订阅状态
                await this.updateSubscriptionStatus({
                  isActive: true,
                  productId: latestSubscription.productId,
                  expirationDate: expiryDate.toISOString(),
                  lastUpdated: new Date().toISOString(),
                  originalTransactionId: latestSubscription.originalTransactionIdentifierIOS,
                  restoredFromPurchase: true
                });
                
                return { success: true };
              } else {
                logger.subscription('验证器确认订阅无效:', validationResult.error);
                
                // 如果验证器确认订阅无效，但本地显示有效，需要同步状态
                if (isCurrentDeviceSubscribed) {
                  logger.subscription('验证器确认订阅无效，但本地显示有效，更新为非会员');
                  await this.updateSubscriptionStatus({
                    isActive: false,
                    productId: latestSubscription.productId,
                    expirationDate: expiryDate ? expiryDate.toISOString() : new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    restoredFromPurchase: true,
                    isExpired: true
                  });
                }
                
                return { success: false, error: i18n.t('subscription.validationError') };
              }
            } catch (validationError) {
              logger.error('验证订阅时出错:', validationError);
              
              // 验证出错时，检查是否应该保留本地状态
              if (isCurrentDeviceSubscribed && currentExpirationDate && currentExpirationDate > new Date()) {
                logger.subscription('验证出错，但本地订阅仍然有效，保留当前状态');
                return { 
                  success: true, 
                  error: i18n.t('subscription.validationErrorButLocalValid')
                };
              }
              
              // 如果没有有效的本地状态，或者已过期，则报告错误
              return { success: false, error: i18n.t('subscription.validationError') };
            }
          }
          
          // 如果到这里还未确认订阅状态，检查是否有过期日期
          if (expiryDate) {
            // 检查过期时间是否在可接受的范围内（例如30天内）
            const now = new Date();
            const daysSinceExpiration = Math.floor((now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysSinceExpiration <= 30) {
              // 已过期但在30天内，提示用户续订
              return { 
                success: false, 
                error: i18n.t('subscription.recentlyExpired', { days: daysSinceExpiration }) 
              };
            }
          }
          
          // 如果到这里还未确认订阅状态，则可能是已取消的订阅
          logger.subscription('订阅已取消或已过期，不能恢复');
          
          // 更新为非活跃状态
          await this.updateSubscriptionStatus({
            isActive: false,
            productId: latestSubscription.productId,
            expirationDate: expiryDate ? expiryDate.toISOString() : new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            originalTransactionId: latestSubscription.originalTransactionIdentifierIOS,
            restoredFromPurchase: true,
            isExpired: true
          });
          
          return { 
            success: false, 
            error: i18n.t('subscription.subscriptionExpiredOrCancelled') 
          };
        }
        
        return { success: isSubscriptionActive };
      } catch (error) {
        logger.error('处理购买记录时出错:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('恢复购买失败:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取并记录过期的订阅
   */
  private async getExpiredPurchases(purchases: ProductPurchase[]): Promise<void> {
    try {
      // 筛选可能过期的购买记录 (非终身会员)
      const nonLifetimePurchases = purchases.filter(p => !p.productId.includes('lifetime'));
      const now = new Date();
      
      // 尝试解析verificationResultIOS判断是否过期
      const expiredPurchases = [];
      
      for (const purchase of nonLifetimePurchases) {
        // 解析验证结果判断过期时间
        if (purchase.verificationResultIOS) {
          try {
            const jwtParts = purchase.verificationResultIOS.split('.');
            if (jwtParts.length === 3) {
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
              if (payload.expiresDate) {
                const expiryDate = new Date(payload.expiresDate);
                if (expiryDate < now) {
                  expiredPurchases.push({
                    productId: purchase.productId,
                    transactionId: purchase.transactionId,
                    transactionDate: purchase.transactionDate,
                    expiryDate: payload.expiresDate
                  });
                }
              }
            }
          } catch (e) {
            // 解析失败，记录但继续处理
            logger.error('解析验证结果失败:', e);
          }
        }
      }
      
      // 记录过期的订阅
      if (expiredPurchases.length > 0) {
        logger.subscription(`找到 ${expiredPurchases.length} 个过期的订阅:`, expiredPurchases);
      } else {
        logger.subscription('没有找到过期的订阅');
      }
    } catch (error) {
      logger.error('获取过期订阅失败:', error);
    }
  }

  /**
   * 按交易日期排序购买记录，最新的在前
   */
  private sortPurchasesByDate(purchases: ProductPurchase[]): ProductPurchase[] {
    return purchases.sort((a: ProductPurchase, b: ProductPurchase) => {
      const aDate = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
      const bDate = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
      return bDate - aDate;
    });
  }

  /**
   * 检查订阅状态
   */
  async checkSubscriptionStatus(): Promise<boolean> {
    try {
      return await this.validator.validateExistingSubscription();
    } catch (error) {
      logger.error('Error checking subscription status:', error);
      return false;
    }
  }

  /**
   * 获取订阅状态详情
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus | null> {
    return this.stateManager.getSubscriptionStatus();
  }

  /**
   * 添加订阅状态监听器
   */
  addListener(listener: (status: SubscriptionStatus) => void): void {
    this.stateManager.addListener(listener);
  }

  /**
   * 移除订阅状态监听器
   */
  removeListener(listener: (status: SubscriptionStatus) => void): void {
    this.stateManager.removeListener(listener);
  }

  /**
   * 获取可用的订阅产品
   */
  async getAvailableSubscriptions() {
    try {
      await this.initialize();
      return await getSubscriptions({
        skus: Object.values(IOS_SKUS)
      });
    } catch (error) {
      logger.error('Failed to get available subscriptions:', error);
      return [];
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
    }
      this.isInitialized = false;
  }

  /**
   * 检查是否达到免费用户字数限制
   */
  async checkFreeCharacterLimit(): Promise<boolean> {
    try {
      // 如果是会员用户，直接返回 false（未达到限制）
      const isSubscribed = await this.checkSubscriptionStatus();
      if (isSubscribed) {
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

  /**
   * 检查游戏关卡限制
   */
  async checkGameLevelLimit(level: number): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      return false;
    }

    try {
      // 直接从AsyncStorage检查会员状态，同时尝试不同的键
      const [subscriptionData1, subscriptionData2, isPremium] = 
        await AsyncStorage.multiGet([SUBSCRIPTION_KEY, 'subscriptionData', 'isPremium']);
      
      // 检查是否有任何地方显示会员状态为活跃
      let isSubscribed = false;
      
      // 检查SUBSCRIPTION_KEY中的数据
      if (subscriptionData1 && subscriptionData1[1]) {
        const data = JSON.parse(subscriptionData1[1]);
        if (data.isActive) {
          isSubscribed = true;
        }
      }
      
      // 检查'subscriptionData'中的数据
      if (!isSubscribed && subscriptionData2 && subscriptionData2[1]) {
        const data = JSON.parse(subscriptionData2[1]);
        if (data.isActive) {
          isSubscribed = true;
          
          // 修复数据同步问题
          if (subscriptionData1[1] !== subscriptionData2[1]) {
            await AsyncStorage.setItem(SUBSCRIPTION_KEY, subscriptionData2[1]);
          }
        }
      }
      
      // 检查isPremium标记
      if (!isSubscribed && isPremium && isPremium[1] === 'true') {
        isSubscribed = true;
      }
      
      // 如果是会员，确保isPremium标记为true
      if (isSubscribed && (!isPremium || isPremium[1] !== 'true')) {
        await AsyncStorage.setItem('isPremium', 'true');
      }
      
      return !isSubscribed && level > CONSTANTS.FREE_GAME_LEVEL_LIMIT;
    } catch (error) {
      logger.error('Failed to check game level limit:', error);
      return false;
    }
  }

  /**
   * 检查是否可以使用搜索功能
   */
  async canUseSearch(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      return true;
    }
    
    return await this.checkSubscriptionStatus();
  }

  /**
   * 检查是否可以使用复习功能
   */
  async canUseReview(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      return true;
    }
    
    return await this.checkSubscriptionStatus();
  }

  /**
   * 打开订阅管理页面
   */
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

  /**
   * 购买订阅
   */
  async purchaseSubscription(planId: SubscriptionPlanId) {
    try {
      await this.initialize();
      
      const fullProductId = IOS_SKUS[planId] || planId;
      logger.subscription(`开始订阅购买, planId: ${planId}, fullProductId: ${fullProductId}`);
      
      // 检查产品ID是否存在于IOS_SKUS中
      logger.subscription('可用的产品ID:', {
        SUBSCRIPTION_IDS: Object.keys(IOS_SKUS),
        availableSkus: IOS_SKUS,
        requestedPlanId: planId,
        mappedProductId: fullProductId
      });
      
      if (!planId.includes('com.') && !IOS_SKUS[planId]) {
        logger.error(`无效的订阅ID: ${planId}, 没有找到对应的产品ID`);
        return {
          success: false,
          error: `无效的订阅ID: ${planId}`
        };
      }
      
      // 先获取可用的订阅产品，这是修复"Invalid product ID"错误的关键步骤
      logger.subscription('获取可用订阅产品...');
      const availableProducts = await this.getAvailableSubscriptions();
      logger.subscription(`获取到 ${availableProducts.length} 个可用订阅产品`);
      
      if (availableProducts.length === 0) {
        logger.error('没有获取到可用的订阅产品，请检查App Store连接');
        return {
          success: false,
          error: '无法获取订阅产品列表，请稍后再试'
        };
      }
      
      // 检查请求的产品ID是否在可用产品中
      const productExists = availableProducts.some(product => product.productId === fullProductId);
      
      if (!productExists) {
        logger.error(`请求的产品ID ${fullProductId} 不在可用产品列表中`);
        
        // 记录可用的产品ID，以便调试
        const availableProductIds = availableProducts.map(p => p.productId);
        logger.subscription('可用的产品列表:', availableProductIds);
        
        return {
          success: false,
          error: '无效的产品ID，该产品可能不再可用'
        };
      }
      
      // 尝试订阅，这里subscribe方法会抛出原始错误
      logger.subscription(`开始请求订阅，产品ID: ${fullProductId}`);
      await this.subscribe(fullProductId);
      
      // 如果订阅成功，返回成功状态
      return {
        success: true,
        planId,
        fullProductId
      };
    } catch (error) {
      // 记录错误详情
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('订阅购买失败:', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : '无堆栈信息',
        planId
      });
      
      // 检查是否为支付延迟（例如需要家长控制批准）的情况
      // 确保只匹配真正的延迟支付情况
      const isDeferredPayment = 
        typeof errorMessage === 'string' && (
          errorMessage.toLowerCase().includes('payment was deferred') || 
          errorMessage.toLowerCase().includes('awaiting approval') || 
          errorMessage.toLowerCase().includes('parental controls')
        );
      
      if (isDeferredPayment) {
        logger.info('支付已延迟，等待批准:', errorMessage);
        return { 
          success: true, 
          status: 'deferred',
          message: '订阅请求已提交，等待家长批准'
        };
      }
      
      // 其他错误情况，明确返回失败
      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  async checkSubscriptionExpiration() {
    try {
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        if (parsedData.expirationDate) {
          const expirationDate = new Date(parsedData.expirationDate);
          const currentTime = new Date();
          const daysUntilExpiration = Math.ceil((expirationDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24));
          
          logger.subscription('检查订阅到期状态', {
            now: currentTime.toISOString(),
            expirationDate: expirationDate.toISOString(),
            daysUntilExpiration,
            isActive: parsedData.isActive,
            productId: parsedData.productId
          });
          
          // 如果已过期但状态还是活跃，更新状态
          if (daysUntilExpiration <= 0 && parsedData.isActive) {
            logger.subscription('订阅已过期但状态仍为活跃，正在更新状态');
            const updatedData = {
              ...parsedData,
              isActive: false,
              lastUpdated: new Date().toISOString()
            };
            await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(updatedData));
            this.currentSubscriptionData = updatedData;
            this.notifySubscriptionUpdate(updatedData);
          }
          
          // 如果距离到期不到一天，触发同步
          if (daysUntilExpiration < 1 && parsedData.isActive) {
            logger.subscription('订阅即将过期，触发同步检查');
            await this.fetchAndUpdateSubscriptionStatus();
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check subscription expiration:', error);
    }
  }

  async fetchAndUpdateSubscriptionStatus() {
    try {
      logger.subscription('开始获取并更新订阅状态');
      
      // 先记录当前状态，供后面比较
      const oldSubscriptionData = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
      let oldStatus = null;
      if (oldSubscriptionData) {
        try {
          oldStatus = JSON.parse(oldSubscriptionData);
          logger.subscription('当前订阅状态', {
            isActive: oldStatus.isActive,
            productId: oldStatus.productId,
            expirationDate: oldStatus.expirationDate
          });
        } catch (e) {
          logger.error('解析当前订阅状态失败', e);
        }
      }
      
      // Get available purchases
      const purchases = await this.getAvailablePurchases();
      logger.subscription(`获取到 ${purchases.length} 个可用购买记录`);
      
      let hasValidSubscription = false;
      
      // 特别检查：如果之前有活跃订阅但现在没有任何购买记录，可能是退款
      if (oldStatus?.isActive && purchases.length === 0) {
        logger.subscription('检测到可能的退款情况：之前有活跃订阅但现在没有购买记录');
        
        // 将状态设置为非活跃
        const updatedData: SubscriptionDataType = {
          isActive: false,
          productId: null,
          expirationDate: null,
          lastUpdated: new Date().toISOString(),
          wasRefunded: true // 标记可能是退款
        };
        
        // 使用统一的 updateSubscriptionStatus 方法更新状态
        await this.updateSubscriptionStatus(updatedData);
        
        return;
      }
      
      // 正常处理有购买记录的情况
      if (purchases && purchases.length > 0) {
        // Sort by transaction date to get the latest
        const sortedPurchases = this.sortPurchasesByDate(purchases);
        const latestPurchase = sortedPurchases[0];
        
        logger.subscription('最新购买记录', {
          productId: latestPurchase.productId,
          transactionDate: latestPurchase.transactionDate,
          hasVerificationResult: !!latestPurchase.verificationResultIOS
        });

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
              logger.subscription('解析JWT成功', { 
                environment: payload.environment,
                expiresDate: payload.expiresDate,
                productId: latestPurchase.productId
              });
              
              // Get expiration date from JWT
              let expirationDate;
              if (latestPurchase.productId?.includes('lifetime')) {
                // 对终身会员使用固定的未来日期
                expirationDate = new Date(2150, 0, 1);
                logger.subscription('终身会员设置固定到期日期', { expirationDate: expirationDate.toISOString() });
              } else {
                try {
                  expirationDate = new Date(payload.expiresDate);
                  
                  // 在沙盒环境中，如果是续订的订阅，使用原始订阅的到期时间
                  if (ENV.IS_SANDBOX && oldStatus?.expirationDate) {
                    const originalExpirationDate = new Date(oldStatus.expirationDate);
                    const now = new Date();
                    
                    // 如果新的到期时间比原始到期时间晚，说明是续订
                    if (expirationDate > originalExpirationDate) {
                      // 使用原始到期时间
                      expirationDate = originalExpirationDate;
                      logger.subscription('沙盒环境：使用原始到期时间', {
                        originalExpirationDate: originalExpirationDate.toISOString(),
                        newExpirationDate: expirationDate.toISOString()
                      });
                    }
                  }
                  
                  logger.subscription('从JWT获取到期日期', { 
                    rawExpiresDate: payload.expiresDate,
                    parsedDate: expirationDate.toISOString()
                  });
                } catch (dateError) {
                  // 如果日期格式错误，使用合理的默认值
                  logger.error('解析JWT到期日期出错:', dateError);
                  // 默认设置为当前日期加一年
                  expirationDate = new Date();
                  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
                  logger.subscription('使用默认到期日期（当前日期+1年）', { expirationDate: expirationDate.toISOString() });
                }
              }
              
              const now = new Date();
              const isActive = now < expirationDate;
              const daysRemaining = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              
              logger.subscription('订阅状态计算', {
                now: now.toISOString(),
                expirationDate: expirationDate.toISOString(),
                isActive,
                daysRemaining
              });

              // 更新订阅状态
              const subscriptionData: SubscriptionDataType = {
                isActive: isActive,
                productId: latestPurchase.productId,
                expirationDate: expirationDate.toISOString(),
                lastUpdated: new Date().toISOString(),
                environment: payload.environment
              };

              await this.updateSubscriptionStatus(subscriptionData);
              logger.subscription('订阅状态已更新（JWT成功解析）', subscriptionData);
              
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
                    
                    await this.updateSubscriptionStatus(updatedData);
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
              
              await this.updateSubscriptionStatus(updatedData);
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
      
      await this.updateSubscriptionStatus(subscriptionData);
      
    } catch (error) {
      logger.error('获取订阅状态失败:', error);
      throw error;
    }
  }

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

  /**
   * 强制验证订阅状态，用于需要确保订阅状态最新的场景
   * 例如在进入需要会员权限的功能前调用
   */
  async forceVerifySubscription(): Promise<boolean> {
    try {
      logger.subscription('强制验证订阅状态');
      
      // 获取当前状态
      const oldData = this.currentSubscriptionData;
      
      // 强制获取并验证最新购买记录
      await this.fetchAndUpdateSubscriptionStatus();
      
      // 检查状态是否变化
      if (oldData?.isActive !== this.currentSubscriptionData?.isActive) {
        logger.subscription('订阅状态已变化', {
          oldStatus: oldData?.isActive,
          newStatus: this.currentSubscriptionData?.isActive
        });
      }
      
      return this.currentSubscriptionData?.isActive || false;
    } catch (error) {
      logger.error('强制验证订阅状态失败', error);
      // 出错时，使用当前状态
      return this.currentSubscriptionData?.isActive || false;
    }
  }
  
  /**
   * 检查是否可以使用需要会员权限的功能
   * 此方法会先验证订阅状态，然后返回是否可用
   */
  async canUsePremiumFeature(): Promise<boolean> {
    if (!ENV.CHECK_SUBSCRIPTION) {
      return true;
    }

    try {
      // 直接从AsyncStorage检查会员状态，同时尝试不同的键
      const [subscriptionData1, subscriptionData2, isPremium] = 
        await AsyncStorage.multiGet([SUBSCRIPTION_KEY, 'subscriptionData', 'isPremium']);
      
      // 检查是否有任何地方显示会员状态为活跃
      let isSubscribed = false;
      
      // 检查SUBSCRIPTION_KEY中的数据
      if (subscriptionData1 && subscriptionData1[1]) {
        try {
          const data = JSON.parse(subscriptionData1[1]);
          if (data.isActive) {
            isSubscribed = true;
          }
        } catch (e) {
          logger.error('解析SUBSCRIPTION_KEY数据失败:', e);
        }
      }
      
      // 检查'subscriptionData'中的数据
      if (!isSubscribed && subscriptionData2 && subscriptionData2[1]) {
        try {
          const data = JSON.parse(subscriptionData2[1]);
          if (data.isActive) {
            isSubscribed = true;
            
            // 修复数据同步问题
            if (subscriptionData1[1] !== subscriptionData2[1]) {
              await AsyncStorage.setItem(SUBSCRIPTION_KEY, subscriptionData2[1]);
            }
          }
        } catch (e) {
          logger.error('解析subscriptionData数据失败:', e);
        }
      }
      
      // 检查isPremium标记
      if (!isSubscribed && isPremium && isPremium[1] === 'true') {
        isSubscribed = true;
        
        // 如果isPremium为true但其他标记不正确，尝试修复
        const subscriptionData: SubscriptionDataType = {
          isActive: true,
          productId: 'isPremiumFlag',  // 使用标记值作为产品ID
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 默认一年
          lastUpdated: new Date().toISOString()
        };
        
        await this.updateSubscriptionStatus(subscriptionData);
      }
      
      // 如果当前检查到非活跃状态，但我们曾经验证过订阅，再次尝试验证
      if (!isSubscribed && this.currentSubscriptionData?.isActive) {
        logger.info('存储状态不一致，重新验证订阅');
        const revalidated = await this.validator.validateExistingSubscription();
        if (revalidated) {
          logger.info('重新验证成功，订阅有效');
          return true;
        }
      }
      
      return isSubscribed;
    } catch (error) {
      logger.error('检查会员功能权限失败:', error);
      // 出错时，如果内存中有当前订阅数据且为活跃状态，则允许使用
      return this.currentSubscriptionData?.isActive === true;
    }
  }

  private async handlePurchaseError(error: any): Promise<void> {
    try {
      // 检查是否包含特定错误关键词
      const errorMessage = error?.message || JSON.stringify(error);
      const isInvalidTransactionId = errorMessage.includes('Invalid transaction Id');
      const isUserCancelled = errorMessage.includes('E_USER_CANCELLED');
      const isNetworkError = errorMessage.includes('E_NETWORK_ERROR');

      // 记录错误信息
      logger.error('购买过程中发生错误:', {
        message: errorMessage,
        isInvalidTransactionId,
        isUserCancelled,
        isNetworkError
      });

      // 对于无效交易ID的错误，不显示给用户，而是尝试处理可能的退款
      if (isInvalidTransactionId) {
        logger.debug('检测到无效交易ID错误，尝试处理潜在的退款情况');
        
        // 如果当前有活跃订阅，可能是退款导致的
        if (this.currentSubscriptionData?.isActive) {
          // 将订阅状态更新为非活跃并标记为退款
          const updatedStatus: SubscriptionDataType = {
            ...this.currentSubscriptionData,
            isActive: false,
            expirationDate: null,
            wasRefunded: true,
            lastUpdated: new Date().toISOString()
          };
          
          await this.updateSubscriptionStatus(updatedStatus);
          logger.info('检测到无效交易ID后，订阅状态已更新为退款状态');
        }
        return;
      }

      // 用户取消和网络错误不显示警告
      if (isUserCancelled || isNetworkError) {
        return;
      }

      // 其他错误显示提示
      Alert.alert(
        i18n.t('subscription.errorTitle'),
        i18n.t('subscription.purchaseError'),
        [{ text: i18n.t('common.ok') }]
      );
    } catch (innerError) {
      logger.error('处理购买错误时出现异常:', innerError);
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
        
        // 检查是否为退款情况（wasRefunded字段为true）
        if (subscriptionData.wasRefunded) {
          logger.info('由于退款，更新订阅状态为非活跃');
          data.isActive = false;
          data.expirationDate = null;
        }
        
        // 更新内存中的状态
        this.currentSubscriptionData = data;        
        // 更新本地存储，同时更新两个键
        await AsyncStorage.multiSet([
          [SUBSCRIPTION_KEY, JSON.stringify(data)],
          ['subscriptionData', JSON.stringify(data)],
          ['isPremium', data.isActive.toString()]
        ]);

        // 验证存储是否成功
        const [savedData, directSavedData, savedIsPremium] = await AsyncStorage.multiGet([
          SUBSCRIPTION_KEY, 
          'subscriptionData', 
          'isPremium'
        ]);
        
        // 通知所有监听器
        this.safeNotifySubscriptionUpdate(data);
        
        // 记录更新结果
        logger.info('订阅状态更新完成', {
          isActive: data.isActive,
          productId: data.productId,
          expirationDate: data.expirationDate,
          wasRefunded: data.wasRefunded,
          statusSetSuccessfully: Boolean(savedData && savedData[1]),
          directStatusSetSuccessfully: Boolean(directSavedData && directSavedData[1]),
          isPremiumSetSuccessfully: savedIsPremium && savedIsPremium[1] === data.isActive.toString()
        });
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

  /**
   * 更新订阅监听器
   */
  private updateSubscriptionListeners(): void {
    // 获取当前订阅状态
    this.getSubscriptionStatus().then(status => {
      if (status) {
        // 通知所有监听器
        this.subscriptionUpdateListeners.forEach(listener => {
          try {
            listener(status);
          } catch (error) {
            logger.error('Error in subscription update listener:', error);
          }
        });
      }
    }).catch(error => {
      logger.error('Failed to update subscription listeners:', error);
    });
  }

  /**
   * 获取可用的购买记录，包括已过期的
   */
  async getAvailablePurchases(): Promise<ProductPurchase[]> {
    try {
      logger.subscription('获取所有购买记录，包括过期的');
      // 同时获取历史和有效的购买记录
      const purchases = await getAvailablePurchases();
      
      // 记录详细信息
      logger.subscription(`获取到 ${purchases.length} 个购买记录`);
      
      return purchases;
    } catch (error) {
      logger.error('获取购买记录失败:', error);
      return [];
    }
  }

  /**
   * 等待初始化完成
   */
  private waitForInitialization(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.initPromises.push(resolve);
    });
  }

  /**
   * 手动刷新订阅状态，用于确保与StoreKit状态同步
   * 应在启动时和从后台恢复时调用
   */
  async syncSubscriptionWithStoreKit(): Promise<void> {
    try {
      logger.info('开始同步StoreKit订阅状态');
      
      // 重新初始化IAP连接以确保获取最新状态
      await initConnection();
      
      // 获取最新购买记录并更新状态
      await this.fetchAndUpdateSubscriptionStatus();
      
      // 检查订阅是否过期
      await this.checkSubscriptionExpiration();
      
      logger.info('StoreKit订阅状态同步完成');
    } catch (error) {
      logger.error('同步StoreKit订阅状态失败:', error);
    }
  }
}