import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, FlatList, Dimensions } from 'react-native';
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
import { logger } from '../utils/logger';

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
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'error') {
        setLoadError('无法加载汉字笔画数据');
        logger.error(`Error loading character data for ${character}: ${data.message}`);
      }
    } catch (e) {
      // Handle other messages
    }
  };

  const onError = () => {
    setLoadError('无法加载汉字笔画数据');
    logger.error(`Failed to load character data for ${character}`);
  };

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Text style={styles.characterText}>{character}</Text>
      </View>
    );
  }

  const getHtmlContent = (index: number) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <script src="https://www.hanzilearning.xyz/libs/hanzi-writer.min.js"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
              <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">\
                <rect width="60" height="60" fill="none" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="30" x2="60" y2="30" stroke="%23DDD" stroke-width="1"/>\
                <line x1="30" y1="0" x2="30" y2="60" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="0" x2="60" y2="60" stroke="%23DDD" stroke-width="1"/>\
                <line x1="60" y1="0" x2="0" y2="60" stroke="%23DDD" stroke-width="1"/>\
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

          async function loadCharacterData(char) {
            try {
              const response = await fetch(\`https://www.hanzilearning.xyz/api/\${encodeURIComponent(char)}\`);
              if (!response.ok) {
                throw new Error(\`HTTP error! status: \${response.status}\`);
              }
              const data = await response.json();
              return data;
            } catch (error) {
              console.error('Error loading character data:', error);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: \`Error loading character data: \${error.message}\`
              }));
              return null;
            }
          }

          async function initWriter() {
            if (isInitialized) {
              return;
            }

            try {
              const target = document.getElementById('target');
              if (!target) {
                return;
              }

              // Load character data first
              const charData = await loadCharacterData('${character}');
              if (!charData) {
                throw new Error('Failed to load character data');
              }

              writer = HanziWriter.create(target, '${character}', {
                width: 60,
                height: 60,
                padding: 0,
                showOutline: true,
                showCharacter: false,
                strokeColor: '#000000',
                outlineColor: '#CCCCCC',
                strokeWidth: 2,
                delayBetweenStrokes: 50,
                charDataLoader: () => Promise.resolve(charData),
                onLoadCharDataSuccess: () => {
                  try {
                    writer.hideCharacter();
                    writer.showOutline();
                    writer.showCharacter();

                    setTimeout(() => {
                      try {
                        const strokePaths = target.querySelectorAll('path[stroke]');
                        strokePaths.forEach((path, i) => {
                          if (i !== ${index}) {
                            path.style.stroke = '#DDDDDD';
                            path.style.opacity = '0.5';
                            path.style.zIndex = '1';
                          } else {
                            path.style.stroke = '#000000';
                            path.style.opacity = '1';
                            path.style.zIndex = '2';
                            path.parentNode.appendChild(path);
                          }
                        });
                      } catch (error) {
                        console.error('Error styling strokes:', error);
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'error',
                          message: 'Error styling strokes: ' + error.message
                        }));
                      }
                    }, 100);
                  } catch (error) {
                    console.error('Error showing character:', error);
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'error',
                      message: 'Error showing character: ' + error.message
                    }));
                  }
                },
                onLoadCharDataError: (error) => {
                  console.error('Error loading character data:', error);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: 'Error loading character data: ' + error
                  }));
                }
              });

              isInitialized = true;
            } catch (error) {
              console.error('Error initializing writer:', error);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: 'Error initializing writer: ' + error.message
              }));
            }
          }

          window.addEventListener('load', initWriter);
        </script>
      </body>
    </html>
  `;

  const renderGridItem = ({ item: index }: { item: number }) => (
    <View key={index} style={styles.gridContainer}>
      <View style={styles.grid}>
        <WebView
          ref={ref => {
            if (ref) {
              webViewRefs.current[index] = ref;
            }
          }}
          source={{ 
            html: getHtmlContent(index),
            baseUrl: '' 
          }}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={['*']}
          mixedContentMode="always"
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error:', nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView HTTP error:', nativeEvent);
          }}
          onShouldStartLoadWithRequest={() => true}
        />
      </View>
      <Text style={styles.gridLabel}>{i18n.t('stroke', { number: index + 1 })}</Text>
    </View>
  );

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
        <ViewShot 
          ref={viewShotRef} 
          style={styles.gridsContainer}
          onLayout={(event) => {
            setModalHeight(event.nativeEvent.layout.height);
          }}
        >
          <FlatList
            data={Array.from({ length: strokeCount }, (_, i) => i)}
            renderItem={renderGridItem}
            keyExtractor={(item) => item.toString()}
            numColumns={4}
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={true}
          />
        </ViewShot>

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
    padding: 10,
    margin: 5,
    height: Dimensions.get('window').height * 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
    marginBottom: 8,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 5,
  },
  gridsContainer: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 4,
  },
  gridContainer: {
    alignItems: 'center',
    marginBottom: 6,
    width: '24%',
    minWidth: 60,
    maxWidth: 60,
  },
  grid: {
    width: 60,
    height: 60,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  webview: {
    width: 60,
    height: 60,
    backgroundColor: 'transparent',
  },
  gridLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FF0000',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  characterText: {
    color: '#333',
    fontSize: 14,
  },
}); 