import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ViewStyle, Platform, SafeAreaView } from 'react-native';
import { getDeviceType, DeviceType, getWindowDimensions, addDimensionsListener } from '../utils/responsive';
import { getTheme } from '../theme';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  useSafeArea?: boolean;
  useMaxWidth?: boolean;
  withPadding?: boolean;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  style,
  useSafeArea = true,
  useMaxWidth = true,
  withPadding = true,
}) => {
  const [deviceType, setDeviceType] = useState<DeviceType>(getDeviceType());
  const theme = getTheme(deviceType);

  useEffect(() => {
    // 监听屏幕尺寸变化
    const subscription = addDimensionsListener((window) => {
      setDeviceType(getDeviceType(window.width));
    });

    // 清理监听器
    return () => {
      subscription.remove();
    };
  }, []);

  const containerStyle = [
    styles.container,
    useMaxWidth && { maxWidth: theme.layout.maxWidth },
    withPadding && { padding: theme.layout.containerPadding },
    style,
  ];

  if (useSafeArea) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={containerStyle}>{children}</View>
      </SafeAreaView>
    );
  }

  return <View style={containerStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
  },
}); 