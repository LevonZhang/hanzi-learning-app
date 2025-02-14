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

interface StrokeOrderCardProps {
  character: string;
  strokeCount: number;
}

export const StrokeOrderCard = ({ character, strokeCount }: StrokeOrderCardProps) => {
  const { t } = useTranslation();
  const viewShotRef = useRef<ViewShot>(null);
  const webViewRefs = useRef<WebView[]>([]);
  const [modalHeight, setModalHeight] = useState(0);
  const windowHeight = Dimensions.get('window').height;

  const getHtmlContent = (index: number) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://fastly.jsdelivr.net/npm/hanzi-writer@3.7/dist/hanzi-writer.min.js"></script>
        <style>
          body { 
            margin: 0; 
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: transparent;
          }
          #grid-${index} {
            width: 100px;
            height: 100px;
            background-color: transparent;
            position: relative;
          }
          .grid-lines {
            position: absolute;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
          }
          .grid-line {
            position: absolute;
            background-color: #e0e0e0;
          }
          .horizontal { 
            width: 100%; 
            height: 1px; 
            left: 0;
          }
          .vertical { 
            height: 100%; 
            width: 1px; 
            top: 0;
          }
          .diagonal1 { 
            width: 141.4%; 
            height: 1px;
            top: 50%;
            left: -20.7%;
            transform: rotate(45deg);
            transform-origin: center;
          }
          .diagonal2 { 
            width: 141.4%; 
            height: 1px;
            top: 50%;
            left: -20.7%;
            transform: rotate(-45deg);
            transform-origin: center;
          }
          .character-target {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
          }
        </style>
      </head>
      <body>
        <div id="grid-${index}">
          <div class="grid-lines">
            <div class="grid-line horizontal" style="top: 0%"></div>
            <div class="grid-line horizontal" style="top: 50%"></div>
            <div class="grid-line horizontal" style="top: 100%"></div>
            <div class="grid-line vertical" style="left: 0%"></div>
            <div class="grid-line vertical" style="left: 50%"></div>
            <div class="grid-line vertical" style="left: 100%"></div>
            <div class="grid-line diagonal1"></div>
            <div class="grid-line diagonal2"></div>
          </div>
          <div id="character-target-${index}" class="character-target"></div>
        </div>
        <script>
          let writer = null;

          async function initializeWriter() {
            if (writer) {
              writer.quiz?.cancel();
              writer.animateCharacter?.cancel();
              writer = null;
            }

            writer = HanziWriter.create('character-target-${index}', '${character}', {
              width: 100,
              height: 100,
              padding: 5,
              showOutline: false,
              showCharacter: false,
              strokeAnimationSpeed: 0,
              delayBetweenStrokes: 0,
              strokeColor: '#dddddd',
              outlineColor: '#dddddd',
              drawingWidth: 3,
              coordSystem: {
                scale: 1,
                xOffset: 0,
                yOffset: 0,
                flipX: false,
                flipY: false
              }
            });

            // 等待字体加载完成
            await new Promise(resolve => setTimeout(resolve, 500));
            return writer;
          }

          async function updateStrokes() {
            if (!writer) {
              writer = await initializeWriter();
            }

            try {
              const strokes = writer.getStrokes();
              const targetIndex = ${index};

              // 显示所有笔画
              strokes.forEach((stroke, i) => {
                stroke.show();
                if (i === targetIndex) {
                  // 当前笔画显示为黑色
                  stroke.setColor('#000000');
                } else if (i < targetIndex) {
                  // 之前的笔画显示为浅灰色
                  stroke.setColor('#dddddd');
                } else {
                  // 后面的笔画隐藏
                  stroke.hide();
                }
              });

              // 发送完成消息
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'strokeComplete',
                index: targetIndex
              }));
            } catch (error) {
              console.error('Error updating strokes:', error);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: error.message
              }));
            }
          }

          window.onload = async function() {
            try {
              await updateStrokes();
            } catch (error) {
              console.error('Error:', error);
            }
          };
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
          await Share.share({
            url: uri,
          });
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

      if (viewShotRef.current) {
        const uri = await viewShotRef.current.capture({
          format: "jpg",
          quality: 0.8,
          result: "tmpfile",
          height: modalHeight,
          width: Dimensions.get('window').width - 60
        });
        await Sharing.shareAsync(uri);
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
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 10,
    marginBottom: 10,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    gap: 15,
    backgroundColor: '#fff',
    padding: 10,
  },
  gridContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  grid: {
    width: 100,
    height: 100,
    borderWidth: 1,
    borderColor: '#4CAF50',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  webview: {
    width: 100,
    height: 100,
    backgroundColor: 'transparent',
  },
  gridLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
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
}); 