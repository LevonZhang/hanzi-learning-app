import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n, Language } from '../i18n/i18n';

export const SettingsScreen = () => {
  const [dailyWords, setDailyWords] = useState(5); // 默认每日学习5个字
  const [currentLanguage, setCurrentLanguage] = useState<Language>(i18n.getLanguage());

  const handleLanguageChange = async (language: Language) => {
    await i18n.setLanguage(language);
    setCurrentLanguage(language);
    // 显示需要重启应用的提示
    Alert.alert(
      i18n.t('confirm'),
      i18n.t('languageChangeRestart'),
      [{ text: i18n.t('confirm'), onPress: () => {} }]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('learningSettings')}</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>{i18n.t('dailyNewWords')}</Text>
            <View style={styles.numberSelector}>
              <TouchableOpacity 
                style={styles.numberButton}
                onPress={() => setDailyWords(Math.max(1, dailyWords - 1))}
              >
                <Text style={styles.numberButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.numberText}>{dailyWords}</Text>
              <TouchableOpacity 
                style={styles.numberButton}
                onPress={() => setDailyWords(Math.min(20, dailyWords + 1))}
              >
                <Text style={styles.numberButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>{i18n.t('language')}</Text>
            <View style={styles.languageSelector}>
              <TouchableOpacity 
                style={[
                  styles.languageButton,
                  currentLanguage === 'zh' && styles.languageButtonActive
                ]}
                onPress={() => handleLanguageChange('zh')}
              >
                <Text style={[
                  styles.languageButtonText,
                  currentLanguage === 'zh' && styles.languageButtonTextActive
                ]}>{i18n.t('languageZh')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.languageButton,
                  currentLanguage === 'en' && styles.languageButtonActive
                ]}
                onPress={() => handleLanguageChange('en')}
              >
                <Text style={[
                  styles.languageButtonText,
                  currentLanguage === 'en' && styles.languageButtonTextActive
                ]}>{i18n.t('languageEn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.languageButton,
                  currentLanguage === 'ja' && styles.languageButtonActive
                ]}
                onPress={() => handleLanguageChange('ja')}
              >
                <Text style={[
                  styles.languageButtonText,
                  currentLanguage === 'ja' && styles.languageButtonTextActive
                ]}>{i18n.t('languageJa')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('membershipService')}</Text>
          <TouchableOpacity style={styles.premiumButton}>
            <MaterialCommunityIcons name="crown" size={24} color="#FFD700" />
            <Text style={styles.premiumButtonText}>{i18n.t('upgradePremium')}</Text>
          </TouchableOpacity>
          <Text style={styles.premiumDescription}>
            {i18n.t('premiumDescription')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t('about')}</Text>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>{i18n.t('version')}</Text>
            <Text style={styles.settingValue}>1.0.0</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  settingValue: {
    fontSize: 16,
    color: '#666',
  },
  numberSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 4,
  },
  numberButton: {
    width: 30,
    height: 30,
    backgroundColor: '#5B7B9E',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  numberText: {
    fontSize: 16,
    marginHorizontal: 15,
    minWidth: 20,
    textAlign: 'center',
  },
  languageSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  languageButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5B7B9E',
  },
  languageButtonActive: {
    backgroundColor: '#5B7B9E',
  },
  languageButtonText: {
    color: '#5B7B9E',
    fontSize: 14,
    fontWeight: '600',
  },
  languageButtonTextActive: {
    color: '#fff',
  },
  premiumButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5B7B9E',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  premiumDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
  },
}); 