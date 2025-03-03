import React, { useEffect } from 'react';
import { withIAPContext, setup, initConnection, endConnection } from 'react-native-iap';
import { ENV } from './config/env';
import { logger } from './utils/logger';
import SubscriptionService from './services/SubscriptionService';

// 导入您的主要应用组件，这可能需要根据您的项目结构调整
import MainApp from './MainApp';

const App = () => {
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 初始化IAP
        logger.subscription('初始化IAP配置');
        
        // 设置StoreKit2模式
        setup({ storekitMode: 'STOREKIT2_MODE' });
        
        // 初始化连接
        await initConnection();
        logger.subscription('IAP连接初始化完成');
        
        // 初始化订阅服务
        const subscriptionService = SubscriptionService.getInstance();
        await subscriptionService.initialize();
      } catch (error) {
        logger.error('初始化应用时出错:', error);
      }
    };
    
    initializeApp();
    
    // 清理函数
    return () => {
      const cleanup = async () => {
        try {
          // 清理订阅服务
          const subscriptionService = SubscriptionService.getInstance();
          await subscriptionService.cleanup();
          
          // 结束IAP连接
          await endConnection();
          logger.subscription('IAP连接已关闭');
        } catch (error) {
          logger.error('清理过程中出错:', error);
        }
      };
      
      cleanup();
    };
  }, []);
  
  return <MainApp />;
};

// 导出带有IAP上下文的应用组件
export default withIAPContext(App); 