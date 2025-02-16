import { Platform } from 'react-native';
import {
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  ProductPurchase,
  PurchaseError,
  getAvailablePurchases,
  requestSubscription,
  finishTransaction,
} from 'react-native-iap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SubscriptionValidationService from './SubscriptionValidationService';
import { LearningManager } from './LearningManager';

// 订阅产品 ID
const IOS_SKUS = {
  monthly: 'com.itlongbow.hanzilearning.monthly',
  quarterly: 'com.itlongbow.hanzilearning.quarterly',
  yearly: 'com.itlongbow.hanzilearning.yearly',
  lifetime: 'com.itlongbow.hanzilearning.lifetime',
} as const;

// 开发环境变量：是否检查真实会员状态
const CHECK_REAL_SUBSCRIPTION = false; // 设置为 true 时检查真实会员状态，false 时直接返回会员状态为 true

export const subscriptionSkus = Platform.OS === 'ios' ? IOS_SKUS : null;

class SubscriptionService {
  private static instance: SubscriptionService;
  private purchaseUpdateSubscription: any;
  private purchaseErrorSubscription: any;
  
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
      if (Platform.OS === 'ios') {  // 只在 iOS 平台初始化
        await initConnection();
        // 监听购买更新
        this.purchaseUpdateSubscription = purchaseUpdatedListener(
          async (purchase: ProductPurchase) => {
            if (purchase.transactionReceipt) {
              // 验证收据
              await this.validateReceipt(purchase);
              // 完成交易
              await finishTransaction({ purchase: purchase });
            }
          }
        );

        // 监听购买错误
        this.purchaseErrorSubscription = purchaseErrorListener(
          (error: PurchaseError) => {
            console.error('Purchase error:', error);
          }
        );
      }
    } catch (err) {
      console.error('Failed to initialize IAP:', err);
      // 即使初始化失败也不抛出错误，让应用可以继续运行
    }
  }

  async validateReceipt(purchase: ProductPurchase) {
    try {
      if (Platform.OS === 'ios') {
        // 使用验证服务验证收据
        const result = await SubscriptionValidationService.verifyReceiptWithApple(
          purchase.transactionReceipt
        );

        if (result.status === 0 && result.latest_receipt_info?.length > 0) {
          const latestReceipt = result.latest_receipt_info[0];
          const subscriptionData = SubscriptionValidationService.parseReceiptInfo(latestReceipt);

          // 更新本地状态
          await this.updateSubscriptionStatus(subscriptionData);
        }
      }
    } catch (err) {
      console.error('Receipt validation failed:', err);
      throw err;
    }
  }

  private async updateSubscriptionStatus(subscriptionData: any) {
    try {
      await AsyncStorage.setItem('subscriptionData', JSON.stringify(subscriptionData));
      await AsyncStorage.setItem('isPremium', subscriptionData.isActive.toString());
    } catch (err) {
      console.error('Failed to update subscription status:', err);
      throw err;
    }
  }

  async checkSubscriptionStatus(): Promise<boolean> {
    // 如果不检查真实会员状态，直接返回 true
    if (!CHECK_REAL_SUBSCRIPTION) {
      return true;
    }

    try {
      if (Platform.OS !== 'ios') {
        return false;  // 非 iOS 平台暂时返回 false
      }

      // 首先检查本地存储的状态
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        // 检查是否是永久会员
        if (parsedData.productId.includes('lifetime')) {
          return true;
        }
        // 检查订阅是否过期
        if (new Date() < new Date(parsedData.expirationDate)) {
          return true;
        }
      }

      try {
        // 如果本地状态过期或不存在，检查 Apple 的收据
        const purchases = await getAvailablePurchases();
        if (purchases && purchases.length > 0) {
          // 验证最新的收据
          await this.validateReceipt(purchases[0]);
          // 重新检查本地状态
          const updatedData = await AsyncStorage.getItem('subscriptionData');
          if (updatedData) {
            const parsedData = JSON.parse(updatedData);
            return parsedData.isActive;
          }
        }
      } catch (error) {
        console.error('Failed to get available purchases:', error);
        // 如果获取购买记录失败，继续使用本地状态
      }

      return false;
    } catch (err) {
      console.error('Failed to check subscription status:', err);
      return false;
    }
  }

  async purchaseSubscription(planId: string) {
    try {
      const sku = subscriptionSkus?.[planId as keyof typeof IOS_SKUS];
      if (!sku) {
        throw new Error('Invalid subscription plan');
      }

      // 请求订阅
      await requestSubscription({
        sku: sku,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });
    } catch (err) {
      console.error('Purchase failed:', err);
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
  }

  // 检查是否达到免费用户字数限制
  async checkFreeCharacterLimit(): Promise<boolean> {
    // 如果不检查真实会员状态，直接返回 false（表示未达到限制）
    if (!CHECK_REAL_SUBSCRIPTION) {
      return false;
    }

    try {
      const isPremium = await this.checkSubscriptionStatus();
      if (isPremium) return false;

      const learningManager = LearningManager.getInstance();
      const stats = await learningManager.getStatistics();
      return stats.totalLearned >= SubscriptionService.FREE_CHAR_LIMIT;
    } catch (err) {
      console.error('Failed to check character limit:', err);
      return false;
    }
  }

  // 检查游戏关卡限制
  async checkGameLevelLimit(level: number): Promise<boolean> {
    // 如果不检查真实会员状态，直接返回 false（表示未达到限制）
    if (!CHECK_REAL_SUBSCRIPTION) {
      return false;
    }

    try {
      const isPremium = await this.checkSubscriptionStatus();
      if (isPremium) return false;
      return level > SubscriptionService.FREE_GAME_LEVEL_LIMIT;
    } catch (err) {
      console.error('Failed to check game level limit:', err);
      return false;
    }
  }

  // 检查是否可以使用搜索功能
  async canUseSearch(): Promise<boolean> {
    // 如果不检查真实会员状态，直接返回 true
    if (!CHECK_REAL_SUBSCRIPTION) {
      return true;
    }
    return this.checkSubscriptionStatus();
  }

  // 检查是否可以使用复习功能
  async canUseReview(): Promise<boolean> {
    // 如果不检查真实会员状态，直接返回 true
    if (!CHECK_REAL_SUBSCRIPTION) {
      return true;
    }
    return this.checkSubscriptionStatus();
  }
}

export default SubscriptionService.getInstance();