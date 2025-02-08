import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  character: string;
  onComplete?: (isCorrect: boolean) => void;
}

export const CharacterLearning = ({ character, onComplete }: Props) => {
  const webViewRef = useRef(null);

  useEffect(() => {
    // 当字符改变时重新初始化
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'init',
        character
      }));
    }
  }, [character]);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.7/dist/hanzi-writer.min.js"></script>
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
            try {
              if (typeof HanziWriter === 'undefined') {
                throw new Error('HanziWriter library not loaded');
              }
              
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
                radicalColor: '#44FF44',
                outlineColor: '#666666',
                charColor: '#666666'
              });

              startAnimation();
              return writer;
            } catch (error) {
              console.error('Error:', error);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: error.message
              }));
              return null;
            }
          }

          function startAnimation() {
            if (writer) {
              writer.quiz?.cancel();
              writer.animateCharacter?.cancel();
              writer.animateCharacter({
                onComplete: () => {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'animationComplete'
                  }));
                }
              });
            }
          }

          function startQuiz() {
            if (writer) {
              writer.quiz?.cancel();
              writer.animateCharacter?.cancel();
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
                },
                onMistake: (strokeData) => {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'quizMistake',
                    strokeNumber: strokeData.strokeNum
                  }));
                }
              });
            }
          }

          window.addEventListener('message', (event) => {
            try {
              const { type, character } = JSON.parse(event.data);
              if (type === 'init') {
                initWriter(character);
              } else if (type === 'animate') {
                startAnimation();
              } else if (type === 'quiz') {
                startQuiz();
              }
            } catch (error) {
              console.error('Error:', error);
            }
          });

          window.addEventListener('load', () => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'ready'
            }));
          });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <View style={styles.characterContainer}>
        <Text style={styles.character}>{character}</Text>
      </View>
      
      <View style={styles.displayContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.canvas}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'ready') {
                webViewRef.current?.postMessage(JSON.stringify({
                  type: 'init',
                  character
                }));
              } else if (data.type === 'quizComplete') {
                console.log('练习完成！');
              } else if (data.type === 'quizMistake') {
                console.log('笔画错误，请重试');
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
                webViewRef.current.postMessage(JSON.stringify({
                  type: 'animate',
                  character
                }));
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
                webViewRef.current.postMessage(JSON.stringify({
                  type: 'quiz',
                  character
                }));
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
  characterContainer: {
    marginBottom: 20,
  },
  character: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
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