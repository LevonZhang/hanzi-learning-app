import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export const SettingsLayout = ({ children }: SettingsLayoutProps) => {
  const { isDesktop, isIPad, width } = useResponsive();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#fff',
      width: '100%',
    },
    content: {
      flex: 1,
      padding: isIPad ? 20 : 16,
      maxWidth: isDesktop ? 1200 : isIPad ? 1000 : '100%',
      width: '100%',
      alignSelf: 'center',
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}; 