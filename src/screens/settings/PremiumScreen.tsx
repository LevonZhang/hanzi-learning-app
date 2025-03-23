import React, { useMemo } from 'react';
import { SettingsLayout } from './SettingsLayout';
import { PremiumSection } from './components/PremiumSection';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { i18n } from '../../i18n/i18n';

export const PremiumScreen = () => {
  const navigation = useNavigation();
  
  // 使用useMemo缓存PremiumSection组件，减少不必要的重新渲染
  const premiumSection = useMemo(() => {
    return <PremiumSection navigation={navigation} />;
  }, [navigation]);
  
  // 打开隐私政策
  const openPrivacyPolicy = () => {
    Linking.openURL('https://www.hanzilearning.xyz/privacy');
  };

  // 打开用户协议
  const openTermsOfUse = () => {
    Linking.openURL('https://www.hanzilearning.xyz/terms');
  };
  
  return (
    <SettingsLayout>
      <ScrollView style={styles.scrollContainer}>
        {premiumSection}
        
        {/* 自动续费条款说明 */}
        <View style={styles.legalContainer}>
          <Text style={styles.legalTitle}>{i18n.t('subscription.termsTitle')}</Text>
          <Text style={styles.legalText}>
            {i18n.t('subscription.autoRenewalTerms')}
          </Text>
          
          {/* 隐私政策和用户协议链接 */}
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={openPrivacyPolicy}>
              <Text style={styles.linkText}>{i18n.t('privacyPolicy')}</Text>
            </TouchableOpacity>
            <Text style={styles.linkSeparator}>|</Text>
            <TouchableOpacity onPress={openTermsOfUse}>
              <Text style={styles.linkText}>{i18n.t('termsOfUse')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SettingsLayout>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    width: '100%',
  },
  legalContainer: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  legalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  legalText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  linkText: {
    fontSize: 14,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  linkSeparator: {
    marginHorizontal: 8,
    color: '#666',
  },
}); 