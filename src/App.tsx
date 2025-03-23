import React, { useEffect } from 'react';
import { withIAPContext, setup, initConnection, endConnection } from 'react-native-iap';
import { logger } from './utils/logger';
import { SubscriptionService } from './services/SubscriptionService';
import { AppNavigator } from './navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

logger.info('App组件加载');

const App = () => {
  logger.info('App组件渲染');
  
  useEffect(() => {
    logger.info('App useEffect 触发');
    
    // 记录上一个AppState状态
    let appStateRef = AppState.currentState;
    let lastCheckTime = 0; // 上次检查时间戳
    const DEBOUNCE_TIME = 2000; // 防抖动时间（毫秒）
    
    // 监听应用前台/后台状态
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      // 记录详细的状态转换日志
      logger.subscription(`AppState状态变化: ${appStateRef} -> ${nextAppState}`);
      
      // 只处理从后台返回前台的情况
      if (
        (appStateRef === 'background' || appStateRef === 'inactive') && 
        nextAppState === 'active'
      ) {
        const now = Date.now();
        
        // 防抖动处理：如果短时间内多次触发，只执行最后一次
        if (now - lastCheckTime > DEBOUNCE_TIME) {
          lastCheckTime = now;
          logger.subscription('应用从后台返回前台，重新检查订阅状态');
          
          // 延迟一小段时间再检查，确保应用已完全激活
          setTimeout(() => {
            const subscriptionService = SubscriptionService.getInstance();
            subscriptionService.fetchAndUpdateSubscriptionStatus().then(() => {
              logger.subscription('从后台返回前台后订阅状态检查完成');
            }).catch(error => {
              logger.error('前台检查订阅状态失败', error);
            });
          }, 500);
        } else {
          logger.subscription('忽略频繁的状态检查请求');
        }
      }
      
      // 更新状态引用
      appStateRef = nextAppState;
    });
    
    const initializeApp = async () => {
      try {
        // 记录当前时间
        const startTime = new Date();        
        // 检查现有的订阅状态
        const subscriptionData = await AsyncStorage.getItem('subscriptionData');
        if (subscriptionData) {
          try {
            const parsedData = JSON.parse(subscriptionData);
            
            if (parsedData.expirationDate) {
              const expiryDate = new Date(parsedData.expirationDate);
              const now = new Date();
              const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            } else {
              logger.subscription('启动时存在订阅数据，但没有到期日期', parsedData);
            }
          } catch (error) {
            logger.error('解析启动时的订阅数据失败', error);
          }
        } else {
          logger.subscription('启动时没有找到订阅数据');
        }

        // 首先初始化IAP
        setup({ storekitMode: 'STOREKIT2_MODE' });
        await initConnection();

        // 然后初始化订阅服务（这会检查服务器订阅状态）
        const subscriptionService = SubscriptionService.getInstance();
        await subscriptionService.initialize();
        
        // 强制同步一次订阅状态
        try {
          await subscriptionService.fetchAndUpdateSubscriptionStatus();          
          // 再次检查订阅状态
          const updatedData = await AsyncStorage.getItem('subscriptionData');
          if (updatedData) {
            const parsedData = JSON.parse(updatedData);
            if (parsedData.expirationDate) {
              const expiryDate = new Date(parsedData.expirationDate);
              const now = new Date();
              const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            }
          }
        } catch (syncError) {
          logger.error('同步订阅状态失败', syncError);
        }
        
        // 设置定期检查订阅状态
        setInterval(() => {
          subscriptionService.checkSubscriptionExpiration().catch(error => {
            logger.error('定期检查订阅状态失败', error);
          });
        }, 3600000); // 每小时检查一次
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
      // 移除AppState监听器
      appStateSubscription.remove();
      
      const cleanup = async () => {
        try {
          // 清理订阅服务
          const subscriptionService = SubscriptionService.getInstance();
          await subscriptionService.dispose();
          
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
export default WrappedApp; 