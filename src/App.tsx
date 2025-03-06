import React, { useEffect } from 'react';
import { withIAPContext, setup, initConnection, endConnection } from 'react-native-iap';
import { ENV } from './config/env';
import { logger } from './utils/logger';
import SubscriptionService from './services/SubscriptionService';
import { AppNavigator } from './navigation/AppNavigator';

logger.info('App组件加载');

const App = () => {
  logger.info('App组件渲染');
  
  useEffect(() => {
    logger.info('App useEffect 触发');
    
    const initializeApp = async () => {
      try {
        // 首先初始化IAP
        logger.subscription('初始化IAP配置');
        setup({ storekitMode: 'STOREKIT2_MODE' });
        await initConnection();
        logger.subscription('IAP连接初始化完成');

        // 然后初始化订阅服务（这会检查服务器订阅状态）
        const subscriptionService = SubscriptionService.getInstance();
        await subscriptionService.initialize();
        logger.subscription('订阅服务初始化完成');
      } catch (error) {
        logger.error('初始化应用时出错:', error);
      }
    };
    
    // 立即执行初始化
    initializeApp().catch(error => {
      logger.error('初始化过程发生错误:', error);
    });
    
    // 清理函数
    return () => {
      logger.info('App组件清理');
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
  
  return <AppNavigator />;
};

// 导出带有IAP上下文的应用组件
const WrappedApp = withIAPContext(App);
logger.info('App组件包装完成');
export default WrappedApp; 