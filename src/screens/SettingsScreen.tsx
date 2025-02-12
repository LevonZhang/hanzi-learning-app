import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Switch, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../i18n/i18n';

interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
  const [dailyWords, setDailyWords] = useState(5);
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language || 'zh');
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const storedDailyWords = await AsyncStorage.getItem('dailyWords');
      const storedLanguage = await AsyncStorage.getItem('language');
      const storedPremium = await AsyncStorage.getItem('isPremium');

      if (storedDailyWords) setDailyWords(parseInt(storedDailyWords));
      if (storedLanguage) {
        setCurrentLanguage(storedLanguage);
        i18n.changeLanguage(storedLanguage);
      }
      if (storedPremium) setIsPremium(storedPremium === 'true');
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
      setCurrentLanguage(lang);
      await i18n.changeLanguage(lang);
      // 重置整个应用的导航状态
      navigation.reset({
        index: 0,
        routes: [{ name: 'Learning' }], // 重置到主页面
      });
    } catch (error) {
      console.error('切换语言失败:', error);
    }
  };

  const handlePremium = () => {
    if (isPremium) {
      Alert.alert(i18n.t('premiumActive'), i18n.t('alreadyPremium'));
    } else {
      Alert.alert(
        i18n.t('getPremium'),
        i18n.t('premiumFeatures'),
        [
          {
            text: i18n.t('cancel'),
            style: 'cancel'
          },
          {
            text: i18n.t('subscribe'),
            onPress: () => {
              // TODO: 实现订阅逻辑
              Alert.alert(i18n.t('comingSoon'), i18n.t('featureInDevelopment'));
            }
          }
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#666" />
        </TouchableOpacity>
        <Text style={styles.title}>{i18n.t('settings')}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('learningSettings')}</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>{i18n.t('dailyWords')}</Text>
            <View style={styles.numberSelector}>
              <TouchableOpacity 
                onPress={() => dailyWords > 1 && saveDailyWords(dailyWords - 1)}
                style={styles.numberButton}
              >
                <Text style={styles.numberButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.numberValue}>{dailyWords}</Text>
              <TouchableOpacity 
                onPress={() => dailyWords < 20 && saveDailyWords(dailyWords + 1)}
                style={styles.numberButton}
              >
                <Text style={styles.numberButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('language')}</Text>
          <View style={styles.languageButtons}>
            <TouchableOpacity 
              style={[styles.languageButton, currentLanguage === 'zh' && styles.activeLanguage]}
              onPress={() => changeLanguage('zh')}
            >
              <Text style={[styles.languageButtonText, currentLanguage === 'zh' && styles.activeLanguageText]}>
                中文
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.languageButton, currentLanguage === 'en' && styles.activeLanguage]}
              onPress={() => changeLanguage('en')}
            >
              <Text style={[styles.languageButtonText, currentLanguage === 'en' && styles.activeLanguageText]}>
                English
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.languageButton, currentLanguage === 'ja' && styles.activeLanguage]}
              onPress={() => changeLanguage('ja')}
            >
              <Text style={[styles.languageButtonText, currentLanguage === 'ja' && styles.activeLanguageText]}>
                日本語
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('premium')}</Text>
          <TouchableOpacity 
            style={styles.premiumButton}
            onPress={handlePremium}
          >
            <MaterialCommunityIcons name="crown" size={24} color="#FFD700" />
            <Text style={styles.premiumButtonText}>
              {isPremium ? i18n.t('premiumActive') : i18n.t('getPremium')}
            </Text>
          </TouchableOpacity>
        </View>
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
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
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
    color: '#666',
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
    backgroundColor: '#007AFF',
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
    color: '#333',
    minWidth: 30,
    textAlign: 'center',
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 15,
  },
  languageButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  activeLanguage: {
    backgroundColor: '#007AFF',
  },
  languageButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  activeLanguageText: {
    color: '#fff',
  },
  premiumButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    gap: 10,
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 