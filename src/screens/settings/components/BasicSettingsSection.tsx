import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../../../i18n/i18n';
import { useResponsive } from '../../../hooks/useResponsive';
import { Theme } from '../../../theme';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type SettingsStackParamList = {
  SettingsMain: undefined;
  BasicSettings: undefined;
  Premium: undefined;
  LearningStats: undefined;
  GameStats: undefined;
};

type NavigationProp = NativeStackNavigationProp<SettingsStackParamList>;

const DAILY_WORDS_OPTIONS = [3, 5, 10, 15, 20];
const LANGUAGE_OPTIONS = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' }
];

export const BasicSettingsSection = () => {
  const { theme, isDesktop, isIPad } = useResponsive() as { theme: Theme; isDesktop: boolean; isIPad: boolean };
  const [dailyWords, setDailyWords] = useState(5);
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  const [showDailyWordsModal, setShowDailyWordsModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const navigation = useNavigation<NavigationProp>();

  useEffect(() => {
    loadSettings();
  }, []);

  // 监听语言变化
  useEffect(() => {
    setCurrentLanguage(i18n.language);
  }, [i18n.language]);

  const loadSettings = async () => {
    try {
      const storedDailyWords = await AsyncStorage.getItem('dailyWords');
      const storedLanguage = await AsyncStorage.getItem('language');

      if (storedDailyWords) setDailyWords(parseInt(storedDailyWords));
      if (storedLanguage) {
        setCurrentLanguage(storedLanguage);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  };

  const saveDailyWords = async (value: number) => {
    try {
      await AsyncStorage.setItem('dailyWords', value.toString());
      setDailyWords(value);
    } catch (error) {
      console.error('保存每日字数失败:', error);
    }
  };

  const changeLanguage = async (lang: string) => {
    try {
      await AsyncStorage.setItem('language', lang);
      await i18n.changeLanguage(lang);
      setCurrentLanguage(lang);
      // Force reload translations
      i18n.reloadResources(lang).then(() => {
      });
    } catch (error) {
      console.error('切换语言失败:', error);
    }
  };

  const renderSelectButton = (label: string, value: string | number, onPress: () => void) => (
    <TouchableOpacity
      style={[styles.selectButton, { backgroundColor: theme.colors.surface }]}
      onPress={onPress}
    >
      <Text style={[styles.selectButtonText, { color: theme.colors.text }]}>{value}</Text>
      <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.text} />
    </TouchableOpacity>
  );

  const renderOptionItem = (value: string | number, onSelect: (value: any) => void) => (
    <TouchableOpacity
      key={value}
      style={[styles.optionItem, { borderBottomColor: theme.colors.border }]}
      onPress={() => onSelect(value)}
    >
      <Text style={[styles.optionText, { color: theme.colors.text }]}>{value}</Text>
    </TouchableOpacity>
  );

  const renderModal = (
    visible: boolean,
    onClose: () => void,
    options: Array<any>,
    onSelect: (value: any) => void,
    getValue: (item: any) => string | number = (item) => item
  ) => (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
          <ScrollView>
            {options.map((item) => renderOptionItem(getValue(item), onSelect))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.settingGroup}>
        <Text style={[styles.settingGroupTitle, { color: theme.colors.text }]}>
          {i18n.t('settings.basic')}
        </Text>
        <View style={styles.settingItem}>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
            {i18n.t('settings.dailyWords')}
          </Text>
          <View style={styles.numberSelector}>
            <TouchableOpacity 
              onPress={() => dailyWords > 1 && saveDailyWords(dailyWords - 1)}
              style={[styles.numberButton, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.numberButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.numberValue, { color: theme.colors.text }]}>{dailyWords}</Text>
            <TouchableOpacity 
              onPress={() => dailyWords < 20 && saveDailyWords(dailyWords + 1)}
              style={[styles.numberButton, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.numberButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.settingGroup}>
        <Text style={[styles.settingGroupTitle, { color: theme.colors.text }]}>
          {i18n.t('settings.language')}
        </Text>
        <View style={styles.languageButtons}>
          {LANGUAGE_OPTIONS.map(option => (
            <TouchableOpacity 
              key={option.value}
              style={[
                styles.languageButton,
                currentLanguage === option.value && [styles.activeLanguage, { backgroundColor: theme.colors.primary }]
              ]}
              onPress={() => changeLanguage(option.value)}
            >
              <Text style={[
                styles.languageButtonText,
                { color: theme.colors.text },
                currentLanguage === option.value && styles.activeLanguageText
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  settingGroup: {
    marginBottom: 25,
  },
  settingGroupTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 16,
  },
  numberSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  numberButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  numberValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  languageButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 100,
  },
  activeLanguage: {
    borderColor: 'transparent',
  },
  languageButtonText: {
    fontSize: 16,
    textAlign: 'center',
  },
  activeLanguageText: {
    color: '#fff',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
  },
  selectButtonText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxWidth: 300,
    maxHeight: 400,
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 16,
    textAlign: 'center',
  },
}); 