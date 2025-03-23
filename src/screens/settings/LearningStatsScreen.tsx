import React, { useState, useEffect } from 'react';
import { SettingsLayout } from './SettingsLayout';
import { LearningStatsSection } from './components/LearningStatsSection';
import { useNavigation } from '@react-navigation/native';
import { SubscriptionService } from '../../services/SubscriptionService';

export const LearningStatsScreen = () => {
  const navigation = useNavigation();
  const [subscriptionStatus, setSubscriptionStatus] = useState({ isActive: false });
  
  useEffect(() => {
    // 获取当前的订阅状态
    const checkSubscription = async () => {
      try {
        const subscriptionService = SubscriptionService.getInstance();
        const isActive = await subscriptionService.canUsePremiumFeature();
        setSubscriptionStatus({ isActive });
      } catch (error) {
        console.error('获取订阅状态失败:', error);
      }
    };
    
    checkSubscription();
    
    // 添加订阅状态变化监听器
    const subscriptionService = SubscriptionService.getInstance();
    const unsubscribe = subscriptionService.addSubscriptionUpdateListener((data) => {
      if (data && typeof data.isActive === 'boolean') {
        setSubscriptionStatus({ isActive: data.isActive });
      }
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);
  
  return (
    <SettingsLayout>
      <LearningStatsSection 
        navigation={navigation} 
        subscriptionStatus={subscriptionStatus}
      />
    </SettingsLayout>
  );
}; 