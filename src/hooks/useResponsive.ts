import { useState, useEffect } from 'react';
import { ScaledSize, Platform } from 'react-native';
import { getDeviceType, DeviceType, getWindowDimensions, addDimensionsListener } from '../utils/responsive';
import { getTheme, Theme } from '../theme';

interface ResponsiveInfo {
  deviceType: DeviceType;
  theme: Theme;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  isIPad: boolean;
}

export const useResponsive = (): ResponsiveInfo => {
  const [dimensions, setDimensions] = useState<ScaledSize>(getWindowDimensions());
  const deviceType = getDeviceType(dimensions.width);
  const theme = getTheme(deviceType);
  const isIPad = Platform.OS === 'ios' && Platform.isPad;

  useEffect(() => {
    const subscription = addDimensionsListener((window) => {
      setDimensions(window);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    deviceType,
    theme,
    isPhone: deviceType === 'PHONE',
    isTablet: deviceType === 'TABLET',
    isDesktop: deviceType === 'DESKTOP',
    width: dimensions.width,
    height: dimensions.height,
    isIPad
  };
}; 