import React, { useEffect, useState } from 'react';
import { AppNavigator } from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeI18n } from './src/i18n/i18n';
import { View, ActivityIndicator } from 'react-native';
import cnchar from 'cnchar';
import 'cnchar-poly';    // 多音字支持
import 'cnchar-order';   // 笔顺
import 'cnchar-draw';    // 绘制
import 'cnchar-words';   // 词组功能

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      await initializeI18n();
      setIsLoading(false);
    };

    initialize();
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