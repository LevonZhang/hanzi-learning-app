import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { i18n } from '../i18n/i18n';

interface MenuScreenProps {
  navigation: any;
}

export const MenuScreen = ({ navigation }: MenuScreenProps) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{i18n.t('appName')}</Text>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Settings')}
          style={styles.settingsButton}
        >
          <MaterialCommunityIcons name="cog" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity 
          style={[styles.menuItem, styles.learningItem]}
          onPress={() => navigation.navigate('Learning')}
        >
          <MaterialCommunityIcons name="book-open-variant" size={32} color="#fff" />
          <Text style={styles.menuText}>{i18n.t('startLearning')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuItem, styles.gamesItem]}
          onPress={() => navigation.navigate('Games')}
        >
          <MaterialCommunityIcons name="gamepad-variant" size={32} color="#fff" />
          <Text style={styles.menuText}>{i18n.t('games')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuItem, styles.reviewItem]}
          onPress={() => navigation.navigate('Review')}
        >
          <MaterialCommunityIcons name="refresh" size={32} color="#fff" />
          <Text style={styles.menuText}>{i18n.t('review')}</Text>
        </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 8,
  },
  menuContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    gap: 15,
  },
  menuText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  learningItem: {
    backgroundColor: '#007AFF',
  },
  gamesItem: {
    backgroundColor: '#34C759',
  },
  reviewItem: {
    backgroundColor: '#FF9500',
  },
}); 