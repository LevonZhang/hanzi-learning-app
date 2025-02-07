import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import cnchar from 'cnchar';
import 'cnchar-draw';

interface Props {
  character: string;
  onComplete?: () => void;
}

export const CharacterLearning = ({ character, onComplete }: Props) => {
  const webViewRef = useRef(null);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body>
        <canvas id="canvas" width="300" height="300"></canvas>
        <script>
          // 接收来自 React Native 的消息
          window.addEventListener('message', (event) => {
            const { type, character } = JSON.parse(event.data);
            if (type === 'draw') {
              cnchar.draw(character, {
                el: '#canvas',
                type: 'animation',
                animation: {
                  strokeAnimationSpeed: 1,
                  delayBetweenStrokes: 1000,
                  onComplete: () => {
                    window.ReactNativeWebView.postMessage('animationComplete');
                  }
                }
              });
            }
          });
        </script>
      </body>
    </html>
  `;

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'draw',
        character
      }));
    }
  }, [character]);

  return (
    <View style={styles.container}>
      <Text style={styles.character}>{character}</Text>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.canvas}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'animationComplete') {
            onComplete?.();
          }
        }}
      />
      <TouchableOpacity 
        style={styles.button}
        onPress={() => {
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'draw',
            character
          }));
        }}
      >
        <Text>重新演示</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },
  character: {
    fontSize: 48,
    marginBottom: 20,
  },
  canvas: {
    width: 300,
    height: 300,
    backgroundColor: '#f0f0f0',
  },
  button: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#007AFF',
    borderRadius: 5,
  },
}); 