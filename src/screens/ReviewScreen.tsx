import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';
import { LearningManager } from '../services/LearningManager';
import StatisticsService from '../services/StatisticsService';
import SubscriptionService from '../services/SubscriptionService';

interface ReviewScreenProps {
  navigation: any;
}

interface ReviewItem {
  character: string;
  mistakes: number;
  lastReviewDate: string;
}

export const ReviewScreen = ({ navigation }: ReviewScreenProps) => {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [canReview, setCanReview] = useState(false);

  useEffect(() => {
    loadReviewItems();
    checkReviewPermission();
  }, []);

  const checkReviewPermission = async () => {
    const hasPermission = await SubscriptionService.canUseReview();
    setCanReview(hasPermission);
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

  const renderReviewItem = ({ item }: { item: ReviewItem }) => (
    <View style={styles.reviewItem}>
      <TouchableOpacity 
        style={styles.itemContent}
        onPress={() => startReviewForChar(item)}
      >
        <Text style={styles.character}>{item.character}</Text>
        <View style={styles.itemInfo}>
          <Text style={styles.date}>{new Date(item.lastReviewDate).toLocaleDateString()}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.deleteButton}
        onPress={() => removeFromReview(item.character)}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={22} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#666" />
        </TouchableOpacity>
        <Text style={styles.title}>{i18n.t('review')}</Text>
      </View>

      <View style={styles.content}>
        {reviewItems.length > 0 ? (
          <FlatList
            data={reviewItems}
            renderItem={renderReviewItem}
            keyExtractor={(item) => item.character}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="check-circle" size={64} color="#34C759" />
            <Text style={styles.emptyStateText}>{i18n.t('noReviewNeeded')}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 20,
  },
  reviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    marginBottom: 10,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  character: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    width: 50,
    textAlign: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 15,
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
}); 