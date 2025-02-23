import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useResponsive } from '../hooks/useResponsive';

type GameStackParamList = {
  GamesList: undefined;
  WordGame: { mode: 'word' };
  PronunciationGame: { mode: 'pronunciation' };
};

type GamesScreenProps = NativeStackScreenProps<GameStackParamList, 'GamesList'>;

export const GamesScreen = ({ navigation }: GamesScreenProps) => {
  const { isTablet } = useResponsive();
  const screenStyles = styles({ isTablet });

  return (
    <SafeAreaView style={screenStyles.container}>
      <View style={screenStyles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={screenStyles.backButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={isTablet ? 32 : 24} color="#666" />
        </TouchableOpacity>
        <Text style={screenStyles.title}>{i18n.t('games')}</Text>
      </View>

      <View style={screenStyles.content}>
        <TouchableOpacity 
          style={[screenStyles.gameCard, screenStyles.wordGame]}
          onPress={() => navigation.navigate('WordGame', { mode: 'word' })}
        >
          <MaterialCommunityIcons name="cards" size={isTablet ? 48 : 32} color="#fff" />
          <View style={screenStyles.gameInfo}>
            <Text style={screenStyles.gameName}>{i18n.t('wordGame')}</Text>
            <Text style={screenStyles.gameDescription}>{i18n.t('wordGameDesc')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[screenStyles.gameCard, screenStyles.pronunciationGame]}
          onPress={() => navigation.navigate('PronunciationGame', { mode: 'pronunciation' })}
        >
          <MaterialCommunityIcons name="microphone" size={isTablet ? 48 : 32} color="#fff" />
          <View style={screenStyles.gameInfo}>
            <Text style={screenStyles.gameName}>{i18n.t('pronunciationGame')}</Text>
            <Text style={screenStyles.gameDescription}>{i18n.t('pronunciationGameDesc')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = ({ isTablet }: { isTablet: boolean }) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: isTablet ? 60 : 50,
    paddingBottom: isTablet ? 100 : 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: isTablet ? 20 : 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: isTablet ? 12 : 8,
  },
  title: {
    fontSize: isTablet ? 32 : 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: isTablet ? 15 : 10,
  },
  content: {
    flex: 1,
    padding: isTablet ? 20 : 15,
    gap: isTablet ? 20 : 15,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: isTablet ? 20 : 12,
    borderRadius: isTablet ? 16 : 12,
    gap: isTablet ? 16 : 12,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    color: '#fff',
    fontSize: isTablet ? 28 : 16,
    fontWeight: '600',
    marginBottom: isTablet ? 4 : 2,
  },
  gameDescription: {
    color: '#fff',
    opacity: 0.9,
    fontSize: isTablet ? 20 : 13,
  },
  wordGame: {
    backgroundColor: '#34C759',
  },
  pronunciationGame: {
    backgroundColor: '#5856D6',
  },
}); 