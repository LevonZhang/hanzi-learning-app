import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const SettingsScreen = () => {
  const [dailyWords, setDailyWords] = useState(5); // 默认每日学习5个字

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>学习设置</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>每日学习字数</Text>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>会员服务</Text>
          <TouchableOpacity style={styles.premiumButton}>
            <MaterialCommunityIcons name="crown" size={24} color="#FFD700" />
            <Text style={styles.premiumButtonText}>升级至会员</Text>
          </TouchableOpacity>
          <Text style={styles.premiumDescription}>
            解锁所有高级功能，包括无限制的每日学习字数、详细的学习统计、个性化复习计划等
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>版本</Text>
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