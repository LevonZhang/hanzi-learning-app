import React, { useEffect, useState } from 'react';
import { AppNavigator } from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeI18n } from './src/i18n/i18n';
import { View, ActivityIndicator, Platform } from 'react-native';
import { withIAPContext, setup, initConnection, endConnection } from 'react-native-iap';
import { logger } from './src/utils/logger';
import { SubscriptionService } from './src/services/SubscriptionService';
import ErrorBoundary from './src/components/ErrorBoundary';
import 'cnchar-poly';    // 多音字支持
import 'cnchar-order';   // 笔顺
import 'cnchar-draw';    // 绘制
import 'cnchar-words';   // 词组功能

// 重写console.error以拦截特定购买错误
const originalConsoleError = console.error;
console.error = function(...args) {
  // 检查是否包含购买相关错误
  const errorString = args.join(' ');
  const purchaseErrorPatterns = [
    'Invalid transaction Id',
    'StoreKit',
    'transaction',
    'Purchase',
    'IAP',
    'subscription',
    'receipt'
  ];
  
  const isPurchaseError = purchaseErrorPatterns.some(pattern => 
    errorString.includes(pattern)
  );
  
  // 对于购买相关错误，只在开发环境显示，并使用logger记录
  if (isPurchaseError) {
    logger.debug('Purchase error intercepted:', ...args);
    if (__DEV__) {
      originalConsoleError.apply(console, args);
    }
    return;
  }
  
  // 对于其他错误，正常显示
  originalConsoleError.apply(console, args);
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {

    const initialize = async () => {
      try {
        // 初始化i18n
        await initializeI18n();

        // 初始化IAP
        logger.info('初始化IAP配置');
        setup({ storekitMode: 'STOREKIT2_MODE' });
        await initConnection();
        logger.info('IAP连接初始化完成');

        // 初始化订阅服务
        const subscriptionService = SubscriptionService.getInstance();
        await subscriptionService.initialize();
        logger.info('订阅服务初始化完成');

        // 主动同步StoreKit订阅状态
        await subscriptionService.syncSubscriptionWithStoreKit();
        logger.info('已同步StoreKit订阅状态');

        setIsLoading(false);
      } catch (error) {
        logger.error('初始化应用时出错:', error);
        setIsLoading(false);
      }
    };

    initialize();

    // 添加应用从后台恢复时的监听器，以同步订阅状态
    const subscribeToAppState = async () => {
      if (Platform.OS === 'ios') {
        try {
          const { AppState } = require('react-native');
          const handleAppStateChange = async (nextAppState: string) => {
            if (nextAppState === 'active') {
              logger.info('应用恢复活跃状态，开始同步IAP状态');
              
              try {
                // 重新初始化IAP连接
                await initConnection();
                logger.info('应用恢复活跃状态后重新初始化IAP连接');
                
                // 同步订阅状态
                const subscriptionService = SubscriptionService.getInstance();
                await subscriptionService.syncSubscriptionWithStoreKit();
                logger.info('应用恢复活跃状态，已同步StoreKit订阅状态');
                
                // 刷新可用产品列表
                try {
                  const products = await subscriptionService.getAvailableSubscriptions();
                  logger.info(`应用恢复活跃状态，已刷新 ${products.length} 个订阅产品`);
                } catch (productsError) {
                  logger.warn('应用恢复活跃状态，刷新产品列表失败:', productsError);
                }
              } catch (error) {
                logger.error('应用恢复活跃状态，同步IAP状态失败:', error);
              }
            }
          };
          
          AppState.addEventListener('change', handleAppStateChange);
          return () => {
            AppState.removeEventListener('change', handleAppStateChange);
          };
        } catch (error) {
          logger.error('设置AppState监听器失败:', error);
          return undefined;
        }
      }
      return undefined;
    };
    
    let cleanupAppState: (() => void) | undefined;
    subscribeToAppState().then(unsubscribe => {
      cleanupAppState = unsubscribe;
    }).catch(error => {
      logger.error('设置AppState监听器失败:', error);
    });

    return () => {
      const cleanup = async () => {
        try {
          // 清理AppState监听器
          if (cleanupAppState) {
            cleanupAppState();
          }
          
          const subscriptionService = SubscriptionService.getInstance();
          await subscriptionService.dispose();
          await endConnection();
          logger.info('IAP连接已关闭');
        } catch (error) {
          logger.error('清理过程中出错:', error);
        }
      };
      cleanup();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const WrappedApp = withIAPContext(App);
export default WrappedApp; 