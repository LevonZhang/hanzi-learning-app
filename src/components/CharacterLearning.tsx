import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  character: string;
  onComplete?: (isCorrect: boolean) => void;
}

export const CharacterLearning = ({ character, onComplete }: Props) => {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);

  const htmlContent = `
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
          #character-target-div { 
            width: 300px; 
            height: 300px; 
            background-color: transparent;
          }
        </style>
      </head>
      <body>
        <div id="character-target-div"></div>
        <script>
          let writer = null;
          
          function initWriter(character) {
            if (writer) {
              writer.quiz?.cancel();
              writer.animateCharacter?.cancel();
              writer = null;
            }

            writer = HanziWriter.create('character-target-div', character, {
              width: 300,
              height: 300,
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
            <MaterialCommunityIcons name="pencil-box-multiple" size={24} color="white" />
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
            <MaterialCommunityIcons name="pencil-outline" size={24} color="white" />
            <Text style={styles.buttonText}>练习书写</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.wrongButton]}
            onPress={() => onComplete?.(false)}
          >
            <MaterialCommunityIcons name="book-plus" size={24} color="white" />
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
    padding: 20,
  },
  displayContainer: {
    width: width - 40,
    height: width - 40,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  canvas: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  buttonContainer: {
    width: '100%',
    marginTop: 20,
    gap: 20,
  },
  practiceButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    flexWrap: 'wrap',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    minWidth: 110,
    justifyContent: 'center',
    gap: 8,
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
    fontSize: 15,
    fontWeight: '600',
  },
}); 