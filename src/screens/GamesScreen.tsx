import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type GameStackParamList = {
  GamesList: undefined;
  WordGame: { mode: 'word' };
  PronunciationGame: { mode: 'pronunciation' };
};

type GamesScreenProps = NativeStackScreenProps<GameStackParamList, 'GamesList'>;

export const GamesScreen = ({ navigation }: GamesScreenProps) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#666" />
        </TouchableOpacity>
        <Text style={styles.title}>{i18n.t('games')}</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity 
          style={[styles.gameCard, styles.wordGame]}
          onPress={() => navigation.navigate('WordGame', { mode: 'word' })}
        >
          <MaterialCommunityIcons name="cards" size={32} color="#fff" />
          <View style={styles.gameInfo}>
            <Text style={styles.gameName}>{i18n.t('wordGame')}</Text>
            <Text style={styles.gameDescription}>{i18n.t('wordGameDesc')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.gameCard, styles.pronunciationGame]}
          onPress={() => navigation.navigate('PronunciationGame', { mode: 'pronunciation' })}
        >
          <MaterialCommunityIcons name="microphone" size={32} color="#fff" />
          <View style={styles.gameInfo}>
            <Text style={styles.gameName}>{i18n.t('pronunciationGame')}</Text>
            <Text style={styles.gameDescription}>{i18n.t('pronunciationGameDesc')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 80,
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
    padding: 15,
    gap: 15,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  gameDescription: {
    color: '#fff',
    opacity: 0.9,
    fontSize: 13,
  },
  wordGame: {
    backgroundColor: '#34C759',
  },
  pronunciationGame: {
    backgroundColor: '#5856D6',
  },
}); 