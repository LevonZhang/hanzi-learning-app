import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ScrollView, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { WebView } from 'react-native-webview';
import { i18n } from '../i18n/i18n';
import cnchar from 'cnchar';
import 'cnchar-draw';  // 导入绘制模块
import * as Share from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import HanziWriter from 'hanzi-writer';

interface StrokeOrderCardProps {
  character: string;
  strokeCount: number;
  onClose?: () => void;
}

declare global {
  interface Window {
    HanziWriter: any;
    ReactNativeWebView: {
      postMessage: (message: string) => void;
    };
  }
}

export const StrokeOrderCard = ({ character, strokeCount, onClose }: StrokeOrderCardProps) => {
  const { t } = useTranslation();
  const viewShotRef = useRef<ViewShot>(null);
  const webViewRefs = useRef<WebView[]>([]);
  const [modalHeight, setModalHeight] = useState(0);
  const windowHeight = Dimensions.get('window').height;
  const [writer, setWriter] = useState<HanziWriter | null>(null);
  const [targetStrokeIndex, setTargetStrokeIndex] = useState<number>(-1);

  const getHtmlContent = (index: number) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: transparent;
          }
          #target {
            width: 100%;
            height: 100%;
            background-color: white;
            background-image: url('data:image/svg+xml;utf8,\
              <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">\
                <rect width="100" height="100" fill="none" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="50" x2="100" y2="50" stroke="%23DDD" stroke-width="1"/>\
                <line x1="50" y1="0" x2="50" y2="100" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="0" x2="100" y2="100" stroke="%23DDD" stroke-width="1"/>\
                <line x1="100" y1="0" x2="0" y2="100" stroke="%23DDD" stroke-width="1"/>\
              </svg>');
            background-size: 100% 100%;
          }
          .stroke-path {
            stroke-linecap: round;
            stroke-linejoin: round;
          }
        </style>
      </head>
      <body>
        <div id="target"></div>
        <script>
          let isInitialized = false;
          let writer = null;
          const strokeColors = ['#FF0000', '#0000FF', '#00AA00', '#AA00FF', '#FF8800'];
          const currentColor = strokeColors[${index} % strokeColors.length];

          async function initWriter() {
            if (isInitialized) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'debug',
                message: 'Already initialized, skipping'
              }));
              return;
            }

            try {
              const target = document.getElementById('target');
              if (!target) {
                console.error('Target element not found');
                return;
              }

              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'debug',
                message: \`Starting initialization for stroke \${${index}}\`
              }));

              writer = HanziWriter.create(target, '${character}', {
                width: target.offsetWidth,
                height: target.offsetHeight,
                padding: 5,
                showOutline: true,
                showCharacter: false,
                strokeColor: currentColor,
                outlineColor: '#CCCCCC',
                strokeWidth: 3,
                delayBetweenStrokes: 50,
                renderer: 'svg',
                onLoadCharDataSuccess: () => {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'debug',
                    message: 'Character data loaded'
                  }));
                  isInitialized = true;
                  setupDisplay();
                },
                onLoadCharDataError: (error) => {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: \`Failed to load character data: \${error}\`
                  }));
                }
              });
            } catch (error) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: error.toString()
              }));
            }
          }

          function setupDisplay() {
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'debug',
                message: 'Setting up display'
              }));

              // 重置显示状态
              writer.hideCharacter();
              writer.hideOutline();

              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'debug',
                message: 'Reset display state'
              }));

              // 先显示轮廓
              writer.showOutline();
              
              // 等待一小段时间确保轮廓显示完成
              setTimeout(() => {
                try {
                  // 获取所有笔画路径并设置颜色
                  const svg = document.querySelector('#target svg');
                  const paths = svg.querySelectorAll('path');
                  
                  // 记录找到的路径数量
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'debug',
                    message: \`Found \${paths.length} paths\`
                  }));

                  // 先隐藏所有笔画
                  writer.hideCharacter();
                  
                  // 显示当前笔画
                  writer.showStroke(${index});

                  // 设置颜色
                  const strokePaths = Array.from(paths).filter(path => {
                    const style = window.getComputedStyle(path);
                    return style.display !== 'none' && style.opacity !== '0';
                  });

                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'debug',
                    message: \`Active paths: \${strokePaths.length}\`
                  }));

                  strokePaths.forEach(path => {
                    path.setAttribute('stroke', currentColor);
                    path.setAttribute('style', \`stroke: \${currentColor} !important; opacity: 1 !important;\`);
                  });

                  // 设置轮廓颜色
                  const outlinePaths = Array.from(paths).filter(path => {
                    const style = window.getComputedStyle(path);
                    return style.display !== 'none' && style.opacity === '0';
                  });

                  outlinePaths.forEach(path => {
                    path.setAttribute('stroke', '#CCCCCC');
                    path.setAttribute('style', 'stroke: #CCCCCC !important; opacity: 0.5 !important;');
                  });

                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'debug',
                    message: 'Colors applied'
                  }));
                } catch (error) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: \`Error in color setup: \${error.toString()}\`
                  }));
                }
              }, 100);

            } catch (error) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: \`Error in display setup: \${error.toString()}\`
              }));
            }
          }

          initWriter();
        </script>
      </body>
    </html>
  `;

  const renderGrids = () => {
    const grids = [];
    for (let i = 0; i < strokeCount; i++) {
      grids.push(
        <View key={i} style={styles.gridContainer}>
          <View style={styles.grid}>
            <WebView
              ref={ref => {
                if (ref) {
                  webViewRefs.current[i] = ref;
                }
              }}
              source={{ html: getHtmlContent(i) }}
              style={styles.webview}
              scrollEnabled={false}
              bounces={false}
              javaScriptEnabled={true}
              onShouldStartLoadWithRequest={() => true}
              onMessage={(event) => {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'debug') {
                  console.log(`Grid ${i} Debug:`, data.message);
                }
              }}
            />
          </View>
          <Text style={styles.gridLabel}>{i18n.t('stroke', { number: i + 1 })}</Text>
        </View>
      );
    }
    return grids;
  };

  const handleCapture = async () => {
    try {
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        return uri;
      }
      return null;
    } catch (error) {
      console.error('Error capturing view:', error);
      return null;
    }
  };

  const handleShare = async () => {
    try {
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        if (uri) {
          await Sharing.shareAsync(uri);
        }
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const saveToGallery = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissionNeeded'), t('galleryPermission'));
        return;
      }

      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        if (uri) {
          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert(t('saveSuccess'), t('cardSaved'));
        }
      }
    } catch (error) {
      console.error('Error saving to gallery:', error);
      Alert.alert(t('error'), t('saveFailed'));
    }
  };

  const shareCard = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(i18n.t('error'), i18n.t('deviceNotSupported'));
        return;
      }

      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        if (uri) {
          await Sharing.shareAsync(uri);
        }
      }
    } catch (error) {
      console.error('Share failed:', error);
      Alert.alert(i18n.t('error'), i18n.t('shareFailed'));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="pencil-outline" size={24} color="#4CAF50" />
          <Text style={styles.title}>{i18n.t('strokeOrder')}</Text>
        </View>
        <TouchableOpacity 
          onPress={onClose}
          style={[styles.actionButton, styles.closeButton]}
        >
          <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>{i18n.t('close')}</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.contentContainer}>
        <ScrollView 
          style={[styles.scrollView, { maxHeight: windowHeight * 0.6 }]}
          contentContainerStyle={styles.scrollViewContent}
        >
          <ViewShot 
            ref={viewShotRef} 
            style={styles.gridsContainer}
            onLayout={(event) => {
              setModalHeight(event.nativeEvent.layout.height);
            }}
          >
            {renderGrids()}
          </ViewShot>
        </ScrollView>

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.saveButton]}
            onPress={saveToGallery}
          >
            <MaterialCommunityIcons name="image" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{i18n.t('saveToGallery')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.shareButton]}
            onPress={shareCard}
          >
            <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{i18n.t('shareCard')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    margin: 10,
    height: Dimensions.get('window').height * 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 10,
    marginBottom: 10,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 10,
  },
  gridsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 25,
    backgroundColor: '#fff',
    padding: 20,
  },
  gridContainer: {
    alignItems: 'center',
    marginBottom: 15,
    width: 120,
    minWidth: 120,
  },
  grid: {
    width: 120,
    height: 120,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  webview: {
    width: 120,
    height: 120,
    backgroundColor: 'transparent',
  },
  gridLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 15,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#5B7B9E',
  },
  shareButton: {
    backgroundColor: '#4CAF50',
  },
  closeButton: {
    backgroundColor: '#FF4444',
    marginLeft: 0,
  },
}); 