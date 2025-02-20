import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';

interface Props {
  character: string;
  onComplete?: () => void;
  nextCharacter?: string;
}

export const HanziDisplay: React.FC<Props> = React.memo(({ 
  character, 
  onComplete,
  nextCharacter 
}) => {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [jsSource, setJsSource] = useState<string>('');
  const writerRef = useRef<any>(null);

  useEffect(() => {
    const loadJsFile = async () => {
      try {
        const asset = Asset.fromModule(require('../../assets/js/hanzi-writer.min.js'));
        await asset.downloadAsync();
        setJsSource(asset.localUri || '');
      } catch (error) {
        console.error('Failed to load HanziWriter library:', error);
      }
    };
    loadJsFile();
  }, []);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="${jsSource}"></script>
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
          let characterData = {};
          
          async function preloadCharacter(character) {
            if (!characterData[character]) {
              try {
                const data = await HanziWriter.loadCharacterData(character);
                characterData[character] = data;
                console.log('Preloaded character:', character);
              } catch (error) {
                console.error('Failed to preload character:', character, error);
              }
            }
          }
          
          async function updateWriter(character) {
            try {
              if (typeof HanziWriter === 'undefined') {
                throw new Error('HanziWriter library not loaded');
              }
              
              // 预加载当前字符数据
              await preloadCharacter(character);
              
              if (writer) {
                // 如果 writer 已存在，只更新字符
                writer.setCharacter(character);
              } else {
                // 创建新的 writer 实例
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
                  charColor: '#666666',
                  onLoadCharDataSuccess: () => {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'characterLoaded',
                      character
                    }));
                  },
                  onLoadCharDataError: (error) => {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'error',
                      message: 'Failed to load character data: ' + error
                    }));
                  }
                });
              }

              // 开始动画
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

          window.addEventListener('message', async (event) => {
            try {
              const { type, character, nextCharacter } = JSON.parse(event.data);
              
              if (type === 'init' || type === 'animate') {
                // 更新当前汉字
                await updateWriter(character);
                
                // 预加载下一个汉字
                if (nextCharacter) {
                  preloadCharacter(nextCharacter);
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

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'animationComplete') {
        onComplete?.();
      } else if (data.type === 'ready') {
        webViewRef.current?.postMessage(JSON.stringify({
          type: 'init',
          character,
          nextCharacter
        }));
      } else if (data.type === 'characterLoaded') {
        setIsLoading(false);
      } else if (data.type === 'error') {
        console.error('HanziWriter error:', data.message);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }, [character, nextCharacter, onComplete]);

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'init',
        character,
        nextCharacter
      }));
    }
  }, [character, nextCharacter]);

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF4444" />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={[styles.webview, isLoading && styles.hidden]}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onMessage={handleMessage}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  hidden: {
    opacity: 0,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
}); 