import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Modal, Alert, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cnchar from 'cnchar';
import { hanziDict as importedHanziDict } from '../data/hanziDict';
import { StrokeOrderCard } from './StrokeOrderCard';
import { i18n } from '../i18n/i18n';
import { LearningManager } from '../services/LearningManager';
import { useResponsive } from '../hooks/useResponsive';

const hanziDict = importedHanziDict as HanziDict;

interface HanziDictEntry {
  pinyin: string[];
  english: string[];
  chinese: string[];
  radical?: string;
  traditional?: string;
  japanese?: string;
}

interface HanziDict {
  [key: string]: HanziDictEntry;
}

interface HanziInfo {
  definition: string;
  pinyin: string[];
  words: string[];
  english: string;
  radical?: string;
  strokes: number;
  traditional?: string;
  japanese?: string;
}

interface Props {
  character: string;
  onComplete: (isCorrect: boolean) => void;
  onHanziInfo: (info: HanziInfo) => void;
  isReviewMode: boolean;
  isDesktop?: boolean;
}

export const CharacterLearning: React.FC<Props> = ({ character, onComplete, onHanziInfo, isReviewMode = false, isDesktop }) => {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [showStrokeOrder, setShowStrokeOrder] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hasStrokeData, setHasStrokeData] = useState(true);
  const { width, height } = Dimensions.get('window');
  const { isIPad } = useResponsive();
  
  const shouldUseDesktopLayout = isDesktop || width > 768;

  useEffect(() => {
    // Reset states when character changes
    setIsLoading(true);
    setLoadError(false);
    setIsReady(false);
    setHasStrokeData(true);
    
    // 获取汉字的笔画数
    const strokes = cnchar.stroke(character);
    const strokeCount = typeof strokes === 'number' ? strokes : Array.isArray(strokes) ? strokes[0] : 0;
    setStrokeCount(strokeCount);
    
    // 检查是否有笔画数据
    if (strokeCount === 0) {
      setHasStrokeData(false);
    }
  }, [character]);

  // 获取汉字信息
  const getHanziInfo = (char: string): HanziInfo => {
    const defaultInfo = {
      definition: '加载中...',
      pinyin: [],
      words: [],
      english: '',
      radical: '',
      strokes: 0,
      traditional: '',
      japanese: ''
    };

    const hanziInfo = hanziDict[char];
    if (!hanziInfo) return defaultInfo;

    return {
      ...defaultInfo,
      pinyin: hanziInfo.pinyin,
      english: hanziInfo.english.join('; '),
      radical: hanziInfo.radical,
      definition: hanziInfo.english[0].split(';')[0],
      traditional: hanziInfo.traditional,
      japanese: hanziInfo.japanese
    };
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: transparent;
            touch-action: none;
          }
          #character-target-div {
            width: ${shouldUseDesktopLayout ? (isIPad ? 300 : 400) : 200}px;
            height: ${shouldUseDesktopLayout ? (isIPad ? 300 : 400) : 200}px;
            background-color: transparent;
            background-image: url('data:image/svg+xml;utf8,\
              <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">\
                <rect width="200" height="200" fill="none" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="100" x2="200" y2="100" stroke="%23DDD" stroke-width="1"/>\
                <line x1="100" y1="0" x2="100" y2="200" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="0" x2="200" y2="200" stroke="%23DDD" stroke-width="1"/>\
                <line x1="200" y1="0" x2="0" y2="200" stroke="%23DDD" stroke-width="1"/>\
              </svg>');
            background-size: 100% 100%;
            position: relative;
          }
        </style>
      </head>
      <body>
        <div id="character-target-div"></div>
        <script>
          let writer = null;
          
          function waitForCnchar() {
            if (typeof HanziWriter !== 'undefined') {
              initializeAll();
            } else {
              setTimeout(waitForCnchar, 100);
            }
          }

          function initWriter(character) {
            if (writer) {
              writer.setCharacter(character);
              return;
            }
            
            writer = HanziWriter.create('character-target-div', character, {
              width: ${shouldUseDesktopLayout ? (isIPad ? 300 : 400) : 200},
              height: ${shouldUseDesktopLayout ? (isIPad ? 300 : 400) : 200},
              padding: ${shouldUseDesktopLayout ? (isIPad ? 5 : 5) : 3},
              showOutline: true,
              strokeAnimationSpeed: 1,
              delayBetweenStrokes: 100,
              strokeColor: '#FF0000',
              outlineColor: '#333333',
              highlightColor: '#00FF00',
              drawingColor: '#FF0000',
              radicalColor: '#168F16',
              showCharacter: false,
              showHintAfterMisses: 3,
              highlightOnComplete: true,
              leniency: 1.0,
            });

            return writer;
          }

          function startAnimation() {
            if (!writer) {
              writer = initWriter('${character}');
            }
            writer.animateCharacter();
          }

          function startQuiz() {
            if (!writer) {
              writer = initWriter('${character}');
            }
            writer.quiz({
              showOutline: true,
              highlightOnComplete: true,
              showCharacter: true,
              strokeHighlightSpeed: 2,
              drawingWidth: ${shouldUseDesktopLayout ? (isIPad ? 10 : 20) : 12},
              showHintAfterMisses: 3,
              onComplete: () => {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'quizComplete'
                }));
              },
              gridColor: '#DDD'
            });
          }

          window.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'animate') {
              startAnimation();
            } else if (data.type === 'quiz') {
              startQuiz();
            }
          });

          function initializeAll() {
            // 初始化写字板
            writer = initWriter('${character}');
          }

          // 开始等待 cnchar 加载
          waitForCnchar();

          // 初始化完成后通知 React Native
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        </script>
      </body>
    </html>
  `;

  useEffect(() => {
    if (isReady && webViewRef.current) {
      // 初始化后自动开始演示笔画
      webViewRef.current.postMessage(JSON.stringify({
        type: 'init',
        character
      }));
      
      // 发送汉字信息
      const info = getHanziInfo(character);
      onHanziInfo?.(info);
      
      // 短暂延迟后开始动画，确保初始化完成
      setTimeout(() => {
        webViewRef.current?.postMessage(JSON.stringify({
          type: 'animate'
        }));
      }, 500);
    }
  }, [character, isReady]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: '#fff',
      paddingBottom: 20,
    },
    displayContainer: {
      width: shouldUseDesktopLayout ? Math.min(width - 100, height - 100) : width - 140,
      height: shouldUseDesktopLayout ? Math.min(width - 100, height - 100) : width - 140,
      backgroundColor: 'transparent',
      overflow: 'hidden',
      marginTop: shouldUseDesktopLayout ? (isIPad ? -40 : -60) : -15,
      marginBottom: shouldUseDesktopLayout ? (isIPad ? -80 : -40) : -5,
      position: 'relative',
    },
    canvas: {
      width: shouldUseDesktopLayout ? Math.min(width - 100, height - 100) : width - 140,
      height: shouldUseDesktopLayout ? Math.min(width - 100, height - 100) : width - 140,
      backgroundColor: 'transparent',
    },
    buttonContainer: {
      width: shouldUseDesktopLayout ? (isIPad ? '95%' : '90%') : '100%',
      maxWidth: 1000,
      paddingHorizontal: isIPad ? 16 : 20,
      gap: isIPad ? 10 : 8,
      marginTop: isIPad ? -120 : 0,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: isIPad ? 10 : 8,
    },
    button: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: shouldUseDesktopLayout ? (isIPad ? 10 : 20) : 10,
      borderRadius: 8,
      gap: shouldUseDesktopLayout ? (isIPad ? 8 : 12) : 8,
      minWidth: shouldUseDesktopLayout ? (isIPad ? 110 : 150) : 120,
      backgroundColor: '#5B7B9E',
    },
    buttonText: {
      color: '#fff',
      fontSize: shouldUseDesktopLayout ? (isIPad ? 15 : 24) : 13,
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
    },
    demonstrateButton: {},
    practiceButton: {},
    wrongBookButton: {},
    generateButton: {},
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: '#fff',
      borderRadius: 12,
      width: shouldUseDesktopLayout ? (isIPad ? '75%' : '60%') : '90%',
      maxWidth: 800,
      maxHeight: '80%',
      padding: 15,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 15,
    },
    modalTitle: {
      fontSize: shouldUseDesktopLayout ? (isIPad ? 19 : 20) : 18,
      fontWeight: '600',
      color: '#333',
    },
    closeButton: {
      padding: 5,
    },
    closeButtonText: {
      fontSize: 24,
      color: '#666',
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 15,
    },
    modalButton: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
      minWidth: shouldUseDesktopLayout ? (isIPad ? 130 : 150) : 120,
      alignItems: 'center',
    },
    saveButton: {
      backgroundColor: '#5B7B9E',
    },
    shareButton: {
      backgroundColor: '#4CAF50',
    },
    saveButtonText: {
      color: '#fff',
      fontSize: shouldUseDesktopLayout ? (isIPad ? 15 : 16) : 14,
      fontWeight: '500',
    },
    shareButtonText: {
      color: '#fff',
      fontSize: shouldUseDesktopLayout ? (isIPad ? 15 : 16) : 14,
      fontWeight: '500',
    },
    loadingContainer: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: [
        { translateX: -(shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150) / 2 },
        { translateY: -(shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150) / 2 }
      ],
      width: shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150,
      height: shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fff',
      zIndex: 2,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    loadingText: {
      marginTop: 10,
      fontSize: shouldUseDesktopLayout ? (isIPad ? 15 : 16) : 14,
      color: '#666',
    },
    errorText: {
      marginTop: 10,
      fontSize: shouldUseDesktopLayout ? (isIPad ? 15 : 16) : 14,
      color: '#FF3B30',
      textAlign: 'center',
      paddingHorizontal: 15,
    },
    overlayContainer: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: [
        { translateX: -(shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150) / 2 },
        { translateY: -(shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150) / 2 }
      ],
      width: shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150,
      height: shouldUseDesktopLayout ? Math.min(width - 200, height - 200) : width - 150,
      zIndex: 1,
      borderRadius: 12,
    },
    hidden: {
      opacity: 0,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.displayContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={[styles.canvas, isLoading && styles.hidden]}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          mixedContentMode="always"
          onLoadEnd={() => {
            setTimeout(() => {
              setIsLoading(false);
            }, 500);
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
            setLoadError(true);
            setIsLoading(false);
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'ready') {
                setIsReady(true);
                setLoadError(false);
              } else if (data.type === 'quizComplete') {
                onComplete?.(true);
              } else if (data.type === 'hanziInfo') {
                onHanziInfo?.(data.data);
              }
            } catch (error) {
              console.error('WebView message error:', error);
              setLoadError(true);
              setIsLoading(false);
            }
          }}
        />
        {isLoading && (
          <View style={[styles.loadingContainer, styles.overlayContainer]}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>{i18n.t('loading')}</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.button, styles.demonstrateButton]}
            onPress={() => {
              if (webViewRef.current) {
                webViewRef.current.postMessage(JSON.stringify({ type: 'animate' }));
              }
            }}
          >
            <MaterialCommunityIcons 
              name="pencil-outline" 
              size={shouldUseDesktopLayout ? (isIPad ? 24 : 28) : 20} 
              color="#fff" 
            />
            <Text style={styles.buttonText}>{i18n.t('demonstrateStrokes')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.practiceButton]}
            onPress={() => {
              if (webViewRef.current) {
                webViewRef.current.postMessage(JSON.stringify({ type: 'quiz' }));
              }
            }}
          >
            <MaterialCommunityIcons 
              name="pencil" 
              size={shouldUseDesktopLayout ? (isIPad ? 24 : 28) : 20} 
              color="#fff" 
            />
            <Text style={styles.buttonText}>{i18n.t('practice')}</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.buttonRow}>
          {!isReviewMode && (
            <TouchableOpacity 
              style={[styles.button, styles.wrongBookButton]}
              onPress={async () => {
                try {
                  const learningManager = LearningManager.getInstance();
                  await learningManager.recordProgress(character, false);
                  await onComplete?.(false);
                  Alert.alert(
                    i18n.t('success'),
                    i18n.t('addedToReview'),
                    [{ text: i18n.t('confirm') }]
                  );
                } catch (error) {
                  console.error('Error adding to review:', error);
                  Alert.alert(
                    i18n.t('error'),
                    i18n.t('addToReviewFailed'),
                    [{ text: i18n.t('confirm') }]
                  );
                }
              }}
            >
              <MaterialCommunityIcons 
                name="bookmark-plus" 
                size={shouldUseDesktopLayout ? (isIPad ? 24 : 28) : 20} 
                color="#fff" 
              />
              <Text style={styles.buttonText}>{i18n.t('addToWrongBook')}</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={[styles.button, styles.generateButton, !isReviewMode && { flex: 1 }]}
            onPress={() => setShowStrokeOrder(true)}
          >
            <MaterialCommunityIcons 
              name="card-outline" 
              size={shouldUseDesktopLayout ? (isIPad ? 24 : 28) : 20} 
              color="#fff" 
            />
            <Text style={styles.buttonText}>{i18n.t('generateCard')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showStrokeOrder}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowStrokeOrder(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <StrokeOrderCard 
              character={character} 
              strokeCount={strokeCount}
              onClose={() => setShowStrokeOrder(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}; 