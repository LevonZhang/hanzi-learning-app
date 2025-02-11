import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';

interface GamesScreenProps {
  navigation: any;
}

export const GamesScreen = ({ navigation }: GamesScreenProps) => {
  const navigateToGame = (mode: 'word' | 'pronunciation') => {
    navigation.navigate('BubbleMatching', { mode });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{i18n.t('games')}</Text>
      
      <View style={styles.gamesGrid}>
        <TouchableOpacity
          style={[styles.gameCard, styles.wordCard]}
          onPress={() => navigateToGame('word')}
        >
          <MaterialCommunityIcons name="puzzle" size={40} color="#fff" />
          <Text style={styles.gameTitle}>{i18n.t('wordMatching')}</Text>
          <Text style={styles.gameDescription}>{i18n.t('wordMatchingDesc')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.gameCard, styles.pronunciationCard]}
          onPress={() => navigateToGame('pronunciation')}
        >
          <MaterialCommunityIcons name="volume-high" size={40} color="#fff" />
          <Text style={styles.gameTitle}>{i18n.t('pronunciationMatching')}</Text>
          <Text style={styles.gameDescription}>{i18n.t('pronunciationMatchingDesc')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  gamesGrid: {
    gap: 20,
  },
  gameCard: {
    padding: 20,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minHeight: 160,
  },
  wordCard: {
    backgroundColor: '#5B7B9E',
  },
  pronunciationCard: {
    backgroundColor: '#4CAF50',
  },
  gameTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
    marginBottom: 8,
    textAlign: 'center',
  },
  gameDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
}); 