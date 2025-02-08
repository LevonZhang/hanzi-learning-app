import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface Props {
  character: string;
  onComplete?: () => void;
}

export const HanziDisplay: React.FC<Props> = ({ character, onComplete }) => {
  const webViewRef = useRef<WebView>(null);

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
              
              // 如果已存在 writer，先清除它
              if (writer) {
                writer.quiz?.cancel();
                writer.animateCharacter?.cancel();
                writer = null;
              }

              // 创建新的 writer
              console.log('Creating new writer for character:', character);
              writer = HanziWriter.create('character-target-div', character, {
                width: 300,
                height: 300,
                padding: 5,
                showOutline: true,
                strokeAnimationSpeed: 1,
                delayBetweenStrokes: 500,
                showCharacter: false,  // 不要一开始就显示完整汉字
                strokeColor: '#FF4444',  // 红色笔画
                radicalColor: '#44FF44', // 绿色偏旁
                outlineColor: '#666666', // 中灰色轮廓
                charColor: '#666666'     // 中灰色字体
              });

              // 立即开始动画
              writer.animateCharacter({
                onComplete: () => {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'animationComplete'
                  }));
                }
              });

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

          window.addEventListener('message', (event) => {
            try {
              const { type, character } = JSON.parse(event.data);
              if (type === 'init') {
                // 清除现有的 writer
                if (writer) {
                  writer.quiz?.cancel();
                  writer.animateCharacter?.cancel();
                  writer = null;
                }
                // 重新初始化并显示新汉字
                initWriter(character);
              } else if (type === 'animate') {
                const writer = initWriter(character);
                if (writer) {
                  writer.animateCharacter({
                    onComplete: () => {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'animationComplete'
                      }));
                    }
                  });
                }
              } else if (type === 'quiz') {
                if (writer) {
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

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'init',
        character
      }));
    }
  }, [character]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'animationComplete') {
              onComplete?.();
            } else if (data.type === 'ready') {
              webViewRef.current?.postMessage(JSON.stringify({
                type: 'init',
                character
              }));
            }
          } catch (error) {
            console.error('Error:', error);
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
}); 