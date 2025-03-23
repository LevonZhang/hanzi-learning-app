import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export const SettingsLayout = ({ children }: SettingsLayoutProps) => {
  const { isDesktop, isIPad } = useResponsive();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#fff',
    },
    content: {
      flex: 1,
      padding: isIPad ? 20 : 16,
      maxWidth: isDesktop ? 800 : '100%',
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