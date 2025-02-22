import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ViewStyle, Platform, SafeAreaView, useWindowDimensions } from 'react-native';
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
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

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
    useMaxWidth && (isTablet ? styles.tabletMaxWidth : { maxWidth: theme.layout.maxWidth }),
    withPadding && { 
      padding: isTablet ? 24 : theme.layout.containerPadding,
      paddingHorizontal: isTablet ? 32 : theme.layout.containerPadding,
    },
    isTablet && styles.tabletContainer,
    style,
  ];

  const contentWrapper = (
    <View style={[
      containerStyle,
      isTablet && styles.tabletContentWrapper
    ]}>
      {children}
    </View>
  );

  if (useSafeArea) {
    return (
      <SafeAreaView style={[
        styles.safeArea,
        isTablet && styles.tabletSafeArea
      ]}>
        {contentWrapper}
      </SafeAreaView>
    );
  }

  return contentWrapper;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
    width: '100%',
  },
  tabletSafeArea: {
    alignItems: 'center',
  },
  container: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
  },
  tabletMaxWidth: {
    maxWidth: 1024,
  },
  tabletContainer: {
    alignItems: 'center',
  },
  tabletContentWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 