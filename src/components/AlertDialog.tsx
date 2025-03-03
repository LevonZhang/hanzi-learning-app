import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  Platform,
  useWindowDimensions
} from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

interface AlertDialogProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: Array<{
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }>;
  onDismiss?: () => void;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  visible,
  title,
  message,
  buttons,
  onDismiss
}) => {
  const { isIPad, isDesktop } = useResponsive();
  const { width } = useWindowDimensions();
  
  // 添加Mac设备检测
  const isMacOS = Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac'));
  // 兼容新旧版本 React Native 的 Mac Catalyst 检测
  const isMacCatalyst = Platform.OS === 'ios' && (
    Platform.isMacCatalyst || // React Native 0.64+
    (isIPad && width > 1024) // 兼容旧版本 RN
  );
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;
  
  // 根据设备类型确定样式大小
  const getDialogWidth = () => {
    if (isMacDevice) return width * 0.3; // Mac设备
    if (isIPad) return width * 0.4; // iPad
    return width * 0.85; // 手机
  };
  
  // 获取字体大小
  const getFontSize = (baseSize: number) => {
    if (isMacDevice) return baseSize * 1.1; // Mac设备
    if (isIPad) return baseSize * 1.4; // iPad 放大1.4倍
    return baseSize;
  };
  
  // 获取按钮高度
  const getButtonHeight = () => {
    if (isMacDevice) return 48;
    if (isIPad) return 60; // iPad上更高的按钮
    return 44;
  };
  
  const styles = StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContainer: {
      backgroundColor: '#fff',
      borderRadius: 14,
      width: getDialogWidth(),
      maxWidth: 500,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    titleContainer: {
      paddingTop: isIPad ? 24 : 16,
      paddingBottom: isIPad ? 8 : 4,
      paddingHorizontal: isIPad ? 24 : 16,
      alignItems: 'center',
    },
    title: {
      fontSize: getFontSize(18),
      fontWeight: '600',
      color: '#000',
      textAlign: 'center',
    },
    messageContainer: {
      paddingHorizontal: isIPad ? 24 : 16,
      paddingBottom: isIPad ? 24 : 16,
      alignItems: 'center',
    },
    message: {
      fontSize: getFontSize(16),
      color: '#333',
      textAlign: 'center',
      lineHeight: getFontSize(20),
    },
    buttonContainer: {
      borderTopWidth: 0.5,
      borderTopColor: '#CCCCCC',
    },
    buttonRow: {
      flexDirection: buttons.length > 2 ? 'column' : 'row',
    },
    button: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      height: getButtonHeight(),
      paddingHorizontal: 12,
    },
    buttonText: {
      fontSize: getFontSize(16),
      fontWeight: '500',
    },
    defaultButtonText: {
      color: '#007AFF',
    },
    cancelButtonText: {
      fontWeight: '600',
      color: '#007AFF',
    },
    destructiveButtonText: {
      color: '#FF3B30',
    },
    buttonBorder: {
      borderLeftWidth: 0.5,
      borderLeftColor: '#CCCCCC',
    },
    buttonBottomBorder: {
      borderBottomWidth: 0.5,
      borderBottomColor: '#CCCCCC',
    },
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {title.length > 0 && (
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{title}</Text>
            </View>
          )}
          
          <View style={styles.messageContainer}>
            <Text style={styles.message}>{message}</Text>
          </View>
          
          <View style={styles.buttonContainer}>
            <View style={styles.buttonRow}>
              {buttons.map((button, index) => {
                const isLastRow = buttons.length > 2 && index === buttons.length - 1;
                const showLeftBorder = buttons.length <= 2 && index > 0;
                const showBottomBorder = buttons.length > 2 && index < buttons.length - 1;
                
                // 确定按钮文本颜色
                let buttonTextStyle;
                switch (button.style) {
                  case 'destructive':
                    buttonTextStyle = styles.destructiveButtonText;
                    break;
                  case 'cancel':
                    buttonTextStyle = styles.cancelButtonText;
                    break;
                  default:
                    buttonTextStyle = styles.defaultButtonText;
                }
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      showLeftBorder && styles.buttonBorder,
                      showBottomBorder && styles.buttonBottomBorder,
                      isLastRow && { borderBottomWidth: 0 }
                    ]}
                    onPress={() => {
                      if (button.onPress) button.onPress();
                      if (onDismiss) onDismiss();
                    }}
                  >
                    <Text style={[styles.buttonText, buttonTextStyle]}>
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}; 