import React, { useEffect, useState } from 'react';
import { AppNavigator } from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeI18n } from './src/i18n/i18n';
import { View, ActivityIndicator } from 'react-native';
import { withIAPContext, setup, initConnection, endConnection } from 'react-native-iap';
import { logger } from './src/utils/logger';
import SubscriptionService from './src/services/SubscriptionService';
import cnchar from 'cnchar';
import 'cnchar-poly';    // 多音字支持
import 'cnchar-order';   // 笔顺
import 'cnchar-draw';    // 绘制
import 'cnchar-words';   // 词组功能

function App() {
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {

    const initialize = async () => {
      try {
        // 初始化i18n
        await initializeI18n();

        // 初始化IAP
        logger.subscription('初始化IAP配置');
        setup({ storekitMode: 'STOREKIT2_MODE' });
        await initConnection();
        logger.subscription('IAP连接初始化完成');

        // 初始化订阅服务
        const subscriptionService = SubscriptionService.getInstance();
        await subscriptionService.initialize();
        logger.subscription('订阅服务初始化完成');

        // 检查订阅状态并显示UI提示
        await subscriptionService.checkSubscriptionStatusWithUI();

        setIsLoading(false);
      } catch (error) {
        logger.error('初始化应用时出错:', error);
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      const cleanup = async () => {
        try {
          const subscriptionService = SubscriptionService.getInstance();
          await subscriptionService.cleanup();
          await endConnection();
          logger.subscription('IAP连接已关闭');
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
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}

const WrappedApp = withIAPContext(App);
export default WrappedApp; 