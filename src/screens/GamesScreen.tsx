import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, useWindowDimensions } from 'react-native';
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
  const { isIPad, isDesktop } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  
  // 添加Mac设备检测
  const isMacOS = Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac'));
  // 兼容新旧版本 React Native 的 Mac Catalyst 检测
  const isMacCatalyst = Platform.OS === 'ios' && (
    Platform.isMacCatalyst || // React Native 0.64+
    (isIPad && windowWidth > 1024) // 兼容旧版本 RN
  );
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;
  
  // 调试输出
  console.log('游戏页设备信息:', { 
    Platform: Platform.OS, 
    isDesktop, 
    isIPad, 
    isMacOS,
    isMacCatalyst,
    isMacDevice,
    windowWidth
  });
  
  const screenStyles = styles({ isIPad, isMacDevice });

  return (
    <SafeAreaView style={screenStyles.container}>
      <View style={screenStyles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={screenStyles.backButton}
        >
          <MaterialCommunityIcons 
            name="arrow-left" 
            size={isMacDevice ? 22 : isIPad ? 32 : 24} 
            color="#666" 
          />
        </TouchableOpacity>
        <Text style={screenStyles.title}>{i18n.t('games')}</Text>
      </View>

      <View style={screenStyles.content}>
        <TouchableOpacity 
          style={[screenStyles.gameCard, screenStyles.wordGame]}
          onPress={() => navigation.navigate('WordGame', { mode: 'word' })}
        >
          <MaterialCommunityIcons 
            name="cards" 
            size={isMacDevice ? 28 : isIPad ? 48 : 32} 
            color="#fff" 
          />
          <View style={screenStyles.gameInfo}>
            <Text style={screenStyles.gameName}>{i18n.t('wordGame')}</Text>
            <Text style={screenStyles.gameDescription}>{i18n.t('wordGameDesc')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[screenStyles.gameCard, screenStyles.pronunciationGame]}
          onPress={() => navigation.navigate('PronunciationGame', { mode: 'pronunciation' })}
        >
          <MaterialCommunityIcons 
            name="microphone" 
            size={isMacDevice ? 28 : isIPad ? 48 : 32} 
            color="#fff" 
          />
          <View style={screenStyles.gameInfo}>
            <Text style={screenStyles.gameName}>{i18n.t('pronunciationGame')}</Text>
            <Text style={screenStyles.gameDescription}>{i18n.t('pronunciationGameDesc')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = ({ isIPad, isMacDevice }: { isIPad: boolean, isMacDevice: boolean }) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: isMacDevice ? 40 : isIPad ? 60 : 50,
    paddingBottom: isMacDevice ? 60 : isIPad ? 100 : 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: isMacDevice ? 12 : isIPad ? 20 : 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: isMacDevice ? 8 : isIPad ? 12 : 8,
  },
  title: {
    fontSize: isMacDevice ? 22 : isIPad ? 32 : 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: isMacDevice ? 10 : isIPad ? 15 : 10,
  },
  content: {
    flex: 1,
    padding: isMacDevice ? 15 : isIPad ? 20 : 15,
    gap: isMacDevice ? 15 : isIPad ? 20 : 15,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: isMacDevice ? 12 : isIPad ? 20 : 12,
    borderRadius: isMacDevice ? 12 : isIPad ? 16 : 12,
    gap: isMacDevice ? 12 : isIPad ? 16 : 12,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    color: '#fff',
    fontSize: isMacDevice ? 18 : isIPad ? 28 : 16,
    fontWeight: '600',
    marginBottom: isMacDevice ? 3 : isIPad ? 4 : 2,
  },
  gameDescription: {
    color: '#fff',
    opacity: 0.9,
    fontSize: isMacDevice ? 14 : isIPad ? 20 : 13,
  },
  wordGame: {
    backgroundColor: '#34C759',
  },
  pronunciationGame: {
    backgroundColor: '#5856D6',
  },
}); 