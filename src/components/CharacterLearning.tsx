import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cnchar from 'cnchar';
import { hanziDict } from '../data/hanziDict';

interface HanziInfo {
  definition: string;
  pinyin: string[];
  words: string[];
  english: string;
  strokes: number;
}

interface Props {
  character: string;
  onComplete?: (isCorrect: boolean) => void;
  onHanziInfo?: (info: HanziInfo) => void;
}

export const CharacterLearning = ({ character, onComplete, onHanziInfo }: Props) => {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);

  // 获取汉字信息
  const getHanziInfo = (char: string): HanziInfo => {
    const defaultInfo = {
      definition: '加载中...',
      pinyin: [],
      words: [],
      english: '',
      strokes: 0
    };

    const hanziInfo = hanziDict[char];
    if (!hanziInfo) return defaultInfo;

    return {
      ...defaultInfo,
      pinyin: hanziInfo.pinyin,
      english: hanziInfo.english.join('; '),
      definition: hanziInfo.english[0].split(';')[0]
    };
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://fastly.jsdelivr.net/npm/hanzi-writer@3.7/dist/hanzi-writer.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/cnchar@3.2.3/cnchar.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/cnchar-all@3.2.3/cnchar.all.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/cnchar-trad@3.2.3/cnchar.trad.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/cnchar-draw@3.2.3/cnchar.draw.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/cnchar-radical@3.2.3/cnchar.radical.min.js"></script>
        <style>
          body { 
            margin: 0; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            background-color: transparent; 
          }
          #character-target-div { 
            width: 250px; 
            height: 250px; 
            background-color: transparent;
            background-image: url('data:image/svg+xml;utf8,\
              <svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250">\
                <rect width="250" height="250" fill="none" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="125" x2="250" y2="125" stroke="%23DDD" stroke-width="1"/>\
                <line x1="125" y1="0" x2="125" y2="250" stroke="%23DDD" stroke-width="1"/>\
                <line x1="0" y1="0" x2="250" y2="250" stroke="%23DDD" stroke-width="1"/>\
                <line x1="250" y1="0" x2="0" y2="250" stroke="%23DDD" stroke-width="1"/>\
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
          let cncharReady = false;

          // 等待 cnchar 加载完成
          function waitForCnchar() {
            if (window.cnchar && window.cnchar.stroke) {
              cncharReady = true;
              initializeAll();
            } else {
              setTimeout(waitForCnchar, 100);
            }
          }

          function initWriter(character) {
            if (writer) {
              writer.quiz?.cancel();
              writer.animateCharacter?.cancel();
              writer = null;
            }

            writer = HanziWriter.create('character-target-div', '${character}', {
              width: 250,
              height: 250,
              padding: 5,
              showOutline: true,
              strokeAnimationSpeed: 1,
              delayBetweenStrokes: 500,
              showCharacter: false,
              strokeColor: '#FF4444',
              outlineColor: '#666666',
              charColor: '#666666'
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
              drawingWidth: 12,
              showHintAfterMisses: 3,
              onComplete: () => {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'quizComplete'
                }));
              }
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

  return (
    <View style={styles.container}>
      <View style={styles.displayContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.canvas}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          mixedContentMode="always"
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'ready') {
                setIsReady(true);
              } else if (data.type === 'quizComplete') {
                onComplete?.(true);
              } else if (data.type === 'hanziInfo') {
                onHanziInfo?.(data.data);
              } else if (data.type === 'debug') {
                // 在 React Native 控制台打印调试信息
                console.log('=== WebView Debug Info ===');
                console.log(data.data);
                console.log('========================');
              }
            } catch (error) {
              console.error('Error:', error);
            }
          }}
        />
      </View>

      <View style={styles.buttonContainer}>
        <View style={styles.practiceButtons}>
          <TouchableOpacity 
            style={[styles.button, styles.demonstrateButton]}
            onPress={() => {
              if (webViewRef.current) {
                webViewRef.current.postMessage(JSON.stringify({ type: 'animate' }));
              }
            }}
          >
            <MaterialCommunityIcons name="pencil-box-multiple" size={20} color="white" />
            <Text style={styles.buttonText}>演示笔画</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.practiceButton]}
            onPress={() => {
              if (webViewRef.current) {
                webViewRef.current.postMessage(JSON.stringify({ type: 'quiz' }));
              }
            }}
          >
            <MaterialCommunityIcons name="pencil-outline" size={20} color="white" />
            <Text style={styles.buttonText}>练习书写</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.wrongButton]}
            onPress={() => onComplete?.(false)}
          >
            <MaterialCommunityIcons name="book-plus" size={20} color="white" />
            <Text style={styles.buttonText}>加入错字本</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  displayContainer: {
    width: width - 80,
    height: width - 80,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  buttonContainer: {
    width: '100%',
    marginTop: 20,
  },
  practiceButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    minWidth: 90,
    justifyContent: 'center',
    gap: 4,
  },
  demonstrateButton: {
    backgroundColor: '#5B7B9E',
  },
  practiceButton: {
    backgroundColor: '#7B8D9E',
  },
  wrongButton: {
    backgroundColor: '#9E7B7B',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
}); 