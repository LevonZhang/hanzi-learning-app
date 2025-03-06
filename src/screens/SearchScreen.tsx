import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';
import HanziService from '../services/HanziService';
import SubscriptionService from '../services/SubscriptionService';
import { useResponsive } from '../hooks/useResponsive';

interface SearchResult {
  character: string;
  pinyin: string[];
}

export const SearchScreen = ({ navigation }: any) => {
  const { isIPad, isDesktop } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isAlertShowing, setIsAlertShowing] = useState(false);
  
  // 添加Mac设备检测
  const isMacOS = Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac'));
  // 兼容新旧版本 React Native 的 Mac Catalyst 检测
  const isMacCatalyst = Platform.OS === 'ios' && (
    Platform.isMacCatalyst || // React Native 0.64+
    (isIPad && windowWidth > 1024) // 兼容旧版本 RN
  );
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;

  // Create dynamic styles based on device type
  const dynamicStyles = {
    searchInput: {
      fontSize: isMacDevice ? 14 : isIPad ? 28 : 16,
    },
    characterText: {
      fontSize: isMacDevice ? 20 : isIPad ? 44 : 24,
    },
    pinyinText: {
      fontSize: isMacDevice ? 14 : isIPad ? 28 : 16,
    },
  };

  const handleSearch = async (text: string) => {
    setSearchText(text);
    
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }

    // 检查会员权限
    const subscriptionService = SubscriptionService.getInstance();
    const canSearch = await subscriptionService.canUseSearch();

    if (!canSearch && !isAlertShowing) {
      setIsAlertShowing(true);
      Alert.alert(
        i18n.t('premiumFeature'),
        i18n.t('searchPremiumDesc'),
        [
          { 
            text: i18n.t('cancel'), 
            style: 'cancel',
            onPress: () => {
              setSearchText('');
              setIsAlertShowing(false);
            }
          },
          { 
            text: i18n.t('getPremium'),
            onPress: () => {
              setSearchText('');
              setIsAlertShowing(false);
              navigation.navigate('Settings', { screen: 'premium' });
            }
          }
        ],
        { 
          cancelable: true,
          onDismiss: () => {
            setSearchText('');
            setIsAlertShowing(false);
          }
        }
      );
      return;
    }

    if (canSearch) {
      const hanziService = HanziService.getInstance();
      const results = await hanziService.searchCharacter(text);
      setSearchResults(results);
    }
  };

  const handleCharacterPress = (character: string) => {
    navigation.navigate('Learning', {
      mode: 'display',
      character: character,
    });
  };

  const renderSearchResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleCharacterPress(item.character)}
    >
      <Text style={[styles.characterText, dynamicStyles.characterText]}>{item.character}</Text>
      <Text style={[styles.pinyinText, dynamicStyles.pinyinText]}>{item.pinyin.join(', ')}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={[
          styles.searchInputContainer,
          { paddingVertical: isIPad ? 15 : Platform.OS === 'ios' ? 10 : 4 }
        ]}>
          <MaterialCommunityIcons 
            name="magnify" 
            size={isMacDevice ? 20 : isIPad ? 32 : 24} 
            color="#666" 
          />
          <TextInput
            style={[styles.searchInput, dynamicStyles.searchInput]}
            value={searchText}
            onChangeText={handleSearch}
            placeholder={i18n.t('searchPlaceholder')}
            placeholderTextColor="#999"
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => handleSearch('')}
              style={styles.clearButton}
            >
              <MaterialCommunityIcons 
                name="close-circle" 
                size={isMacDevice ? 16 : isIPad ? 28 : 20} 
                color="#999" 
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={searchResults}
        renderItem={renderSearchResult}
        keyExtractor={(item) => item.character}
        contentContainerStyle={[
          styles.resultsList,
          { padding: isMacDevice ? 12 : isIPad ? 20 : 15 }
        ]}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: '#333',
    padding: 4,
  },
  clearButton: {
    padding: 4,
  },
  resultsList: {
    padding: 15,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  characterText: {
    fontWeight: 'bold',
    color: '#333',
    marginRight: 12,
  },
  pinyinText: {
    color: '#666',
  },
}); 