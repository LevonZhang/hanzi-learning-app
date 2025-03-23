import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../../../i18n/i18n';
import { useResponsive } from '../../../hooks/useResponsive';
import { SubscriptionService, SUBSCRIPTION_PLANS, SubscriptionPlanId } from '../../../services/SubscriptionService';

interface SubscriptionPlan {
  id: SubscriptionPlanId;
  title: string;
  price: number;
  period: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  name: string;
  duration: string;
}

interface SubscriptionStatus {
  isActive: boolean;
  isLifetime: boolean;
  expirationDate?: Date;
  productId?: string;
}

interface Props {
  navigation: any;
}

export const PremiumSection: React.FC<Props> = ({ navigation }) => {
  const { theme } = useResponsive();
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    isActive: false,
    isLifetime: false,
  });
  const [subscriptionPlansState, setSubscriptionPlansState] = useState<SubscriptionPlan[]>([]);
  const [lastSubscriptionAlertTime, setLastSubscriptionAlertTime] = useState<number>(0);
  const ALERT_COOLDOWN = 5000;
  const [refreshKey, setRefreshKey] = useState(0);

  const forceUpdate = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') {
      initializeSubscription();
    }

    let unsubscribeListener: (() => void) | null = null;
    const setupListener = async () => {
      try {
        const subscriptionService = SubscriptionService.getInstance();
        unsubscribeListener = subscriptionService.addSubscriptionUpdateListener((status) => {
          if (status) {
            const newStatus = {
              isActive: status.isActive,
              isLifetime: status.productId?.includes('lifetime') || false,
              expirationDate: status.expirationDate ? new Date(status.expirationDate) : undefined,
              productId: status.productId || undefined,
            };
            
            const statusChanged = 
              newStatus.isActive !== subscriptionStatus.isActive ||
              newStatus.isLifetime !== subscriptionStatus.isLifetime ||
              newStatus.productId !== subscriptionStatus.productId ||
              (newStatus.expirationDate?.getTime() !== subscriptionStatus.expirationDate?.getTime());
              
            if (statusChanged) {
              setSubscriptionStatus(newStatus);
              updateSubscriptionPlans();
            }
          }
        });
      } catch (error) {
        console.error('设置订阅监听器失败:', error);
      }
    };

    setupListener();

    return () => {
      if (unsubscribeListener) {
        unsubscribeListener();
      }
    };
  }, []);

  const initializeSubscription = async () => {
    try {
      setIsLoading(true);
      const subscriptionService = SubscriptionService.getInstance();
      await subscriptionService.initialize();
      
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        const newStatus = {
          isActive: parsedData.isActive,
          isLifetime: parsedData.productId?.includes('lifetime') || false,
          expirationDate: parsedData.expirationDate ? new Date(parsedData.expirationDate) : undefined,
          productId: parsedData.productId || undefined,
        };
        
        const statusChanged = 
          newStatus.isActive !== subscriptionStatus.isActive ||
          newStatus.isLifetime !== subscriptionStatus.isLifetime ||
          newStatus.productId !== subscriptionStatus.productId ||
          (newStatus.expirationDate?.getTime() !== subscriptionStatus.expirationDate?.getTime());
          
        if (statusChanged) {
          setSubscriptionStatus(newStatus);
        }
      } else {
        console.log('未找到本地存储的会员信息');
      }

      updateSubscriptionPlans();
    } catch (error) {
      console.error('初始化订阅服务失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSubscriptionPlans = () => {
    const plans: SubscriptionPlan[] = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => {
      const shortId = id.split('.').pop()?.replace('sub.', '') || '';
      
      let periodKey = 'oneTime';
      if (shortId === 'monthly') {
        periodKey = 'perMonth';
      } else if (shortId === 'quarterly') {
        periodKey = 'perQuarter';
      } else if (shortId === 'yearly') {
        periodKey = 'perYear';
      }
      
      return {
        id: id as SubscriptionPlanId,
        title: i18n.t(`${shortId}Plan`),
        price: plan.price,
        period: i18n.t(periodKey),
        description: i18n.t(`${shortId}Desc`),
        icon: plan.icon,
        name: i18n.t(`${shortId}Name`),
        duration: i18n.t(`${shortId}Duration`),
      };
    });
    setSubscriptionPlansState(plans);
  };

  const handleSubscription = async (plan: SubscriptionPlan) => {
    try {
      if (subscriptionStatus.isActive) {
        Alert.alert(
          i18n.t('subscription.alreadySubscribed'),
          i18n.t('subscription.alreadySubscribedDesc'),
          [{ text: i18n.t('ok'), style: 'cancel' }]
        );
        return;
      }

      // 记录选择的计划信息
      console.log('选择的订阅计划:', {
        id: plan.id,
        nameKey: plan.name,
        durationKey: plan.duration,
        price: plan.price
      });

      let periodKey = 'oneTime';
      if (plan.id.includes('monthly')) {
        periodKey = 'perMonth';
      } else if (plan.id.includes('quarterly')) {
        periodKey = 'perQuarter';
      } else if (plan.id.includes('yearly')) {
        periodKey = 'perYear';
      }
      
      const periodText = i18n.t(periodKey);

      Alert.alert(
        i18n.t('subscriptionConfirm'),
        i18n.t('subscriptionConfirmDesc', { price: plan.price, period: periodText }),
        [
          {
            text: i18n.t('cancelButton'),
            style: 'cancel',
          },
          {
            text: i18n.t('subscribeButton'),
            onPress: async () => {
              try {
                setIsLoading(true);
                console.log(`开始订阅: ${plan.id}`);
                
                const subscriptionService = SubscriptionService.getInstance();
                const result = await subscriptionService.purchaseSubscription(plan.id);
                console.log('订阅结果:', result);
                
                if (result.success) {
                  const subscriptionData = await AsyncStorage.getItem('subscriptionData');
                  if (subscriptionData) {
                    const parsedData = JSON.parse(subscriptionData);
                    console.log('订阅成功后的数据:', parsedData);
                    
                    setSubscriptionStatus({
                      isActive: parsedData.isActive,
                      isLifetime: parsedData.productId?.includes('lifetime') || false,
                      expirationDate: parsedData.expirationDate ? new Date(parsedData.expirationDate) : undefined,
                      productId: parsedData.productId || undefined,
                    });
                  } else {
                    console.log('订阅成功但未找到本地订阅数据');
                  }
                  
                  if (result.status === 'deferred') {
                    Alert.alert(
                      i18n.t('subscription.deferred'),
                      i18n.t('subscription.deferredMessage'),
                      [{ text: i18n.t('ok') }]
                    );
                  } else {
                    Alert.alert(
                      i18n.t('subscription.purchaseSuccess'),
                      i18n.t('subscription.purchaseSuccessDesc'),
                      [{ text: i18n.t('ok') }]
                    );
                  }
                } else {
                  console.error('订阅失败:', result.error);
                  Alert.alert(i18n.t('errorTitle'), result.error || i18n.t('purchaseError'));
                }
              } catch (error: any) {
                console.error('订阅过程中发生异常:', error);
                
                let errorMessage = i18n.t('purchaseError');
                if (error.code) {
                  console.log(`错误代码: ${error.code}, 消息: ${error.message}`);
                  
                  if (error.code === 'E_USER_CANCELLED') {
                    // 用户取消，不显示错误
                    console.log('用户取消了购买');
                    setIsLoading(false);
                    return;
                  } else if (error.code === 'E_NOT_PREPARED') {
                    errorMessage = '购买系统未准备好，请重试';
                  } else if (error.code === 'E_ALREADY_OWNED') {
                    errorMessage = '您已拥有此项目';
                    // 尝试恢复购买
                    const subscriptionService = SubscriptionService.getInstance();
                    await subscriptionService.syncSubscriptionWithStoreKit();
                  } else {
                    errorMessage = `购买错误: ${error.message}`;
                  }
                }
                
                Alert.alert(i18n.t('errorTitle'), errorMessage);
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('处理订阅失败:', error);
      Alert.alert(i18n.t('errorTitle'), i18n.t('purchaseError'));
    }
  };

  const formatRemainingDays = (expirationDate: Date): { days: number; hours: number; minutes: number } => {
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    
    if (diffTime <= 0) {
      return { days: 0, hours: 0, minutes: 0 };
    }
    
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes };
  };

  const handleRestorePurchases = async () => {
    try {
      setIsLoading(true);
      const subscriptionService = SubscriptionService.getInstance();
      
      console.log('开始恢复购买流程');
      
      // 先强制同步StoreKit最新状态
      await subscriptionService.syncSubscriptionWithStoreKit();
      console.log('已同步StoreKit状态');
      
      // 然后再恢复购买
      const result = await subscriptionService.restorePurchases();
      console.log('恢复购买结果:', result);
      
      if (result.success) {
        const subscriptionData = await AsyncStorage.getItem('subscriptionData');
        if (subscriptionData) {
          const parsedData = JSON.parse(subscriptionData);
          console.log('恢复后的订阅数据:', parsedData);
          
          setSubscriptionStatus({
            isActive: parsedData.isActive,
            isLifetime: parsedData.productId?.includes('lifetime') || false,
            expirationDate: parsedData.expirationDate ? new Date(parsedData.expirationDate) : undefined,
            productId: parsedData.productId || undefined,
          });
        } else {
          console.log('恢复后未找到本地订阅数据');
        }
        
        Alert.alert(
          i18n.t('subscription.restoreSuccess'),
          i18n.t('subscription.restoreSuccessDesc'),
          [{ text: i18n.t('ok') }]
        );
      } else {
        console.log('恢复购买失败:', result.error);
        
        Alert.alert(
          i18n.t('subscription.restoreFailed'),
          i18n.t('subscription.restoreFailedDesc'),
          [{ text: i18n.t('ok') }]
        );
      }
    } catch (error) {
      console.error('恢复购买失败:', error);
      Alert.alert(i18n.t('errorTitle'), i18n.t('subscription.restoreError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.sectionContent}>
      <View style={styles.premiumStatusContainer}>
        <View style={styles.premiumStatusHeader}>
          <MaterialCommunityIcons 
            name={subscriptionStatus.isLifetime ? "crown" : "star"} 
            size={24} 
            color="#FFD700" 
          />
          <Text style={styles.premiumStatusText}>
            {subscriptionStatus.isLifetime 
              ? i18n.t('lifetimeName')
              : subscriptionStatus.isActive 
                ? subscriptionStatus.productId?.includes('monthly')
                  ? i18n.t('monthlyName')
                  : subscriptionStatus.productId?.includes('quarterly')
                    ? i18n.t('quarterlyName')
                    : subscriptionStatus.productId?.includes('yearly')
                      ? i18n.t('yearlyName')
                      : i18n.t('premiumActiveStatus')
                : i18n.t('getPremiumButton')
            }
          </Text>
        </View>
        {subscriptionStatus.isActive && !subscriptionStatus.isLifetime && subscriptionStatus.expirationDate && (
          <Text style={styles.expirationText}>
            {(() => {
              const remaining = formatRemainingDays(subscriptionStatus.expirationDate);
              return i18n.t('timeRemaining', { 
                days: remaining.days, 
                hours: remaining.hours, 
                minutes: remaining.minutes 
              });
            })()}
          </Text>
        )}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestorePurchases}
          disabled={isLoading}
        >
          <Text style={styles.restoreButtonText}>
            {i18n.t('subscription.restore')}
          </Text>
        </TouchableOpacity>
      </View>

      {!subscriptionStatus.isLifetime && (
        <View style={styles.subscriptionPlans}>
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>{i18n.t('loading')}</Text>
            </View>
          )}
          {subscriptionPlansState.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={styles.subscriptionPlan}
              onPress={() => handleSubscription(plan)}
            >
              <View style={styles.planHeader}>
                <View style={styles.planIconAndName}>
                  <View style={styles.planIcon}>
                    <MaterialCommunityIcons name={plan.icon} size={24} color="#007AFF" />
                  </View>
                  <View style={styles.planNameContainer}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDuration}>{plan.duration}</Text>
                  </View>
                </View>
                <View style={styles.planPriceContainer}>
                  <Text style={styles.planPriceAmount}>${plan.price}</Text>
                  <Text style={styles.planPricePeriod}>{plan.period}</Text>
                </View>
              </View>
              <Text style={styles.planDescription}>{plan.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContent: {
    flex: 1,
    width: '100%',
    padding: 16,
  },
  premiumStatusContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    width: '100%',
  },
  premiumStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  premiumStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  expirationText: {
    fontSize: 14,
    color: '#666',
  },
  subscriptionPlans: {
    width: '100%',
    gap: 8,
  },
  subscriptionPlan: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    width: '100%',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planIconAndName: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  planIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  planNameContainer: {
    marginLeft: 8,
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  planDuration: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planPriceAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
  },
  planPricePeriod: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  planDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18.2,
    marginTop: 4,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 10,
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  restoreButton: {
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  restoreButtonText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
}); 