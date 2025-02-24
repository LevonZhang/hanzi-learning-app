import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList } from 'react-native';
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
  const { theme, isDesktop, isTablet } = useResponsive();
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [canReview, setCanReview] = useState(false);

  useEffect(() => {
    loadReviewItems();
    checkReviewPermission();
  }, []);

  const checkReviewPermission = async () => {
    try {
      const subscriptionService = SubscriptionService.getInstance();
      const hasPermission = await subscriptionService.canUseReview();
      setCanReview(hasPermission);
    } catch (error) {
      console.error('Failed to check review permission:', error);
      setCanReview(false);
    }
  };

  const loadReviewItems = async () => {
    const learningManager = LearningManager.getInstance();
    const items = await learningManager.getMostMistakenChars(20);
    setReviewItems(items);
  };

  const startReviewForChar = (item: ReviewItem) => {
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
        style={[styles.characterContainer, isDesktop && styles.desktopCharacterContainer]}
        onPress={() => startReviewForChar(item)}
      >
        <Text style={[styles.characterText, isDesktop && styles.desktopCharacterText]}>
          {item.character}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.removeButton, { backgroundColor: theme.colors.error }]}
        onPress={() => removeFromReview(item.character)}
      >
        <MaterialCommunityIcons
          name="close"
          size={isDesktop ? 24 : 20}
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
            numColumns={isDesktop ? 3 : isTablet ? 2 : 1}
            columnWrapperStyle={
              (isDesktop || isTablet) ? [
                styles.columnWrapper,
                isTablet && styles.tabletColumnWrapper
              ] : undefined
            }
            contentContainerStyle={[
              styles.listContent,
              (isDesktop || isTablet) && styles.desktopListContent
            ]}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="check-circle"
              size={isDesktop ? 80 : 60}
              color={theme.colors.success}
            />
            <Text style={[styles.emptyText, isDesktop && styles.desktopEmptyText]}>
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
  tabletColumnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  desktopCharacterContainer: {
    padding: 20,
  },
  characterText: {
    fontSize: 32,
    fontWeight: '600',
  },
  desktopCharacterText: {
    fontSize: 40,
  },
  mistakesText: {
    fontSize: 14,
    color: '#666',
  },
  desktopMistakesText: {
    fontSize: 16,
  },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  desktopEmptyText: {
    fontSize: 24,
  },
}); 