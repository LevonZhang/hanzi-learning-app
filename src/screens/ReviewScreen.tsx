import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, Platform, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';
import { LearningManager } from '../services/LearningManager';
import SubscriptionService from '../services/SubscriptionService';
import StatisticsService from '../services/StatisticsService';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { useResponsive } from '../hooks/useResponsive';

interface ReviewScreenProps {
  navigation: any;
}

interface ReviewItem {
  character: string;
  mistakes: number;
  lastReviewDate: string;
}

export const ReviewScreen = ({ navigation }: ReviewScreenProps) => {
  const { theme, isDesktop, isIPad } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  
  // 添加明确的Mac设备检测
  const isMacOS = Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac'));
  // 兼容新旧版本 React Native 的 Mac Catalyst 检测
  const isMacCatalyst = Platform.OS === 'ios' && (
    Platform.isMacCatalyst || // React Native 0.64+
    (isIPad && windowWidth > 1024) // 兼容旧版本 RN
  );
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;
  
  // 调试输出
  console.log('复习页设备信息:', { 
    Platform: Platform.OS, 
    isDesktop, 
    isIPad, 
    isMacOS,
    isMacCatalyst,
    isMacDevice,
    windowWidth
  });
  
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  const dynamicStyles = {
    characterContainer: {
      padding: isDesktop ? 20 : 16,
    },
    characterText: {
      fontSize: isMacDevice ? 22 : isDesktop ? 40 : isIPad ? 32 : 22,
    },
    mistakesText: {
      fontSize: isMacDevice ? 11 : isDesktop ? 16 : isIPad ? 14 : 12,
    },
    emptyText: {
      fontSize: isMacDevice ? 16 : isDesktop ? 24 : isIPad ? 20 : 16,
    },
    removeButton: {
      width: isMacDevice ? 28 : isDesktop ? 40 : isIPad ? 36 : 32,
      height: isMacDevice ? 28 : isDesktop ? 40 : isIPad ? 36 : 32,
      borderRadius: isMacDevice ? 14 : isDesktop ? 20 : isIPad ? 18 : 16,
    },
  };

  useEffect(() => {
    loadReviewItems();
  }, []);

  const loadReviewItems = async () => {
    const learningManager = LearningManager.getInstance();
    const items = await learningManager.getMostMistakenChars(20);
    setReviewItems(items);
  };

  const startReviewForChar = async (item: ReviewItem) => {
    // 检查会员权限
    const subscriptionService = SubscriptionService.getInstance();
    const canReview = await subscriptionService.canUseReview();
    
    if (!canReview) {
      Alert.alert(
        i18n.t('premiumFeature'),
        i18n.t('reviewPremiumDesc'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          { 
            text: i18n.t('getPremium'),
            onPress: () => {
              navigation.navigate('Settings', { screen: 'premium' });
            }
          }
        ]
      );
      return;
    }

    // 找到当前字在列表中的索引
    const currentIndex = reviewItems.findIndex(i => i.character === item.character);
    // 从当前字开始的所有字
    const remainingChars = reviewItems.slice(currentIndex).map(item => item.character);
    
    navigation.navigate('Learning', {
      mode: 'review',
      reviewWords: remainingChars
    });
  };

  const removeFromReview = async (character: string) => {
    try {
      const learningManager = LearningManager.getInstance();
      await learningManager.removeFromReview(character);
      
      // 标记为已掌握
      await StatisticsService.recordLearnedCharacter(character, true);
      
      // 重新加载列表
      loadReviewItems();
    } catch (error) {
      console.error('Error removing from review:', error);
    }
  };

  const renderItem = ({ item }: { item: ReviewItem }) => (
    <View style={[styles.itemContainer, isDesktop && styles.desktopItemContainer]}>
      <TouchableOpacity
        style={[styles.characterContainer, dynamicStyles.characterContainer]}
        onPress={() => startReviewForChar(item)}
      >
        <Text style={[styles.characterText, dynamicStyles.characterText]}>
          {item.character}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.removeButton, dynamicStyles.removeButton, { backgroundColor: theme.colors.error }]}
        onPress={() => removeFromReview(item.character)}
      >
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={isMacDevice ? 16 : isDesktop ? 24 : isIPad ? 20 : 16}
          color={theme.colors.textLight}
        />
      </TouchableOpacity>
    </View>
  );

  return (
    <ResponsiveContainer>
      <View style={styles.container}>
        {reviewItems.length > 0 ? (
          <FlatList
            data={reviewItems}
            renderItem={renderItem}
            keyExtractor={item => item.character}
            numColumns={isDesktop ? 3 : isIPad ? 2 : 1}
            columnWrapperStyle={
              (isDesktop || isIPad) ? styles.columnWrapper : undefined
            }
            contentContainerStyle={[
              styles.listContent,
              (isDesktop || isIPad) && styles.desktopListContent
            ]}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="check-circle"
              size={isDesktop ? 80 : 60}
              color={theme.colors.success}
            />
            <Text style={[styles.emptyText, dynamicStyles.emptyText]}>
              {i18n.t('noReviewItems')}
            </Text>
          </View>
        )}
      </View>
    </ResponsiveContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    width: '100%',
  },
  listContent: {
    padding: 16,
    width: '100%',
  },
  desktopListContent: {
    padding: 24,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 16,
    width: '100%',
  },
  itemContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 16,
    maxWidth: '100%',
    minWidth: 200,
  },
  desktopItemContainer: {
    maxWidth: '31%',
  },
  characterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterText: {
    fontWeight: '600',
  },
  mistakesText: {
    color: '#666',
  },
  removeButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
}); 