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

          function initWriter() {
            if (isInitialized) {
              return;
            }

            try {
              const target = document.getElementById('target');
              if (!target) {
                return;
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
                        console.error(error);
                      }
                    }, 100);
                  } catch (error) {
                    console.error(error);
                  }
                }
              });

              isInitialized = true;
            } catch (error) {
              console.error(error);
            }
          }

          window.addEventListener('load', initWriter);
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
              source={{ 
                html: getHtmlContent(i),
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 4,
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
}); 