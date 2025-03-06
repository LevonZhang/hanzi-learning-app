import { logger } from '../utils/logger';
import SubscriptionService from './SubscriptionService';

class AppInitializer {
  private static instance: AppInitializer;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): AppInitializer {
    if (!AppInitializer.instance) {
      AppInitializer.instance = new AppInitializer();
    }
    return AppInitializer.instance;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      logger.info('开始初始化应用服务...');
      
      // 初始化订阅服务
      const subscriptionService = SubscriptionService.getInstance();
      await subscriptionService.initialize();
      
      this.isInitialized = true;
      logger.info('应用服务初始化完成');
    } catch (error) {
      logger.error('应用服务初始化失败:', error);
      throw error;
    }
  }
}

export default AppInitializer; 