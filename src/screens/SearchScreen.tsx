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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';
import HanziService from '../services/HanziService';
import SubscriptionService from '../services/SubscriptionService';

interface SearchResult {
  character: string;
  pinyin: string[];
}

export const SearchScreen = ({ navigation }: any) => {
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [canSearch, setCanSearch] = useState(false);
  const isAlertShowing = useRef(false);

  useEffect(() => {
    checkSearchPermission();
  }, []);

  const checkSearchPermission = async () => {
    try {
      const hasPermission = await SubscriptionService.canUseSearch();
      setCanSearch(hasPermission);
    } catch (error) {
      console.error('Failed to check search permission:', error);
      setCanSearch(false);
    }
  };

  const handleSearch = async (text: string) => {
    setSearchText(text);
    
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }

    if (!canSearch && !isAlertShowing.current) {
      isAlertShowing.current = true;
      Alert.alert(
        i18n.t('premiumFeature'),
        i18n.t('searchPremiumDesc'),
        [
          { 
            text: i18n.t('cancel'), 
            style: 'cancel',
            onPress: () => {
              setSearchText('');
              isAlertShowing.current = false;
            }
          },
          { 
            text: i18n.t('getPremium'),
            onPress: () => {
              setSearchText('');
              isAlertShowing.current = false;
              navigation.navigate('Settings', { screen: 'premium' });
            }
          }
        ],
        { 
          cancelable: true,
          onDismiss: () => {
            setSearchText('');
            isAlertShowing.current = false;
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
      <Text style={styles.characterText}>{item.character}</Text>
      <Text style={styles.pinyinText}>{item.pinyin.join(', ')}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <MaterialCommunityIcons name="magnify" size={24} color="#666" />
          <TextInput
            style={styles.searchInput}
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
              <MaterialCommunityIcons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={searchResults}
        renderItem={renderSearchResult}
        keyExtractor={(item) => item.character}
        contentContainerStyle={styles.resultsList}
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
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 12,
  },
  pinyinText: {
    fontSize: 16,
    color: '#666',
  },
}); 