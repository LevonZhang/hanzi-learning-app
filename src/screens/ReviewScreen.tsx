import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';
import { LearningManager } from '../services/LearningManager';

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

  useEffect(() => {
    loadReviewItems();
  }, []);

  const loadReviewItems = async () => {
    const learningManager = LearningManager.getInstance();
    const items = await learningManager.getMostMistakenChars(20);
    setReviewItems(items);
  };

  const startReview = (items: ReviewItem[]) => {
    navigation.navigate('Learning', {
      mode: 'review',
      reviewWords: items.map(item => item.character)
    });
  };

  const renderReviewItem = ({ item }: { item: ReviewItem }) => (
    <View style={styles.reviewItem}>
      <Text style={styles.character}>{item.character}</Text>
      <View style={styles.itemInfo}>
        <Text style={styles.mistakes}>{i18n.t('mistakes')}: {item.mistakes}</Text>
        <Text style={styles.date}>{i18n.t('lastReview')}: {new Date(item.lastReviewDate).toLocaleDateString()}</Text>
      </View>
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
          <>
            <FlatList
              data={reviewItems}
              renderItem={renderReviewItem}
              keyExtractor={(item) => item.character}
              contentContainerStyle={styles.listContent}
            />
            <TouchableOpacity 
              style={styles.startButton}
              onPress={() => startReview(reviewItems)}
            >
              <MaterialCommunityIcons name="play" size={24} color="#fff" />
              <Text style={styles.startButtonText}>{i18n.t('startReview')}</Text>
            </TouchableOpacity>
          </>
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
  mistakes: {
    fontSize: 16,
    color: '#FF3B30',
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    margin: 20,
    padding: 15,
    borderRadius: 10,
    gap: 10,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
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