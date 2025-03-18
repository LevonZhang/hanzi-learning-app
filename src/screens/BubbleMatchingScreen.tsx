import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  Easing,
  ActivityIndicator,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { i18n } from '../i18n/i18n';
import gameService from '../services/GameService';
import { WordPair, PronunciationChar } from '../services/GameService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { storageService } from '../services/StorageService';
import StatisticsService from '../services/StatisticsService';
import SubscriptionService from '../services/SubscriptionService';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { useResponsive } from '../hooks/useResponsive';
import { CONSTANTS } from '../config/env';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_AREA_WIDTH = SCREEN_WIDTH - 20;
const GAME_AREA_HEIGHT = SCREEN_HEIGHT * 0.6;

// 根据设备类型设置气球尺寸和间距
const getBubbleSize = (isDesktop: boolean, isIPad: boolean, isMacDevice: boolean) => {
  if (isMacDevice) return 70; // Mac设备使用更小尺寸，从85减小到70
  if (isDesktop) return 100; // 桌面版，从120减小到100
  if (isIPad) return 80; // iPad，从100减小到80
  return 65; // 手机，从80减小到65
};

const HORIZONTAL_GAP = 10;
const VERTICAL_OVERLAP = -10;
const TOP_MARGIN = 15;

const BUBBLE_COLORS: readonly [string, string, string][] = [
  ['#FF6B6B', '#FF8787', '#FFA5A5'],
  ['#4ECDC4', '#45B7AF', '#3CA29A'],
  ['#FFD93D', '#FFE066', '#FFE88F'],
  ['#95E1D3', '#A8E6DA', '#BBE9E2'],
  ['#A8E6CF', '#BDEBD7', '#D1F0E0'],
  ['#FF8B94', '#FFA3AA', '#FFBBC1'],
] as const;

type GameMode = 'word' | 'pronunciation';
type GameLevel = 1 | 2 | 3 | 4 | 5;

type GameStackParamList = {
  GamesList: undefined;
  WordGame: { mode: 'word' };
  PronunciationGame: { mode: 'pronunciation' };
};

type BubbleMatchingScreenProps = NativeStackScreenProps<GameStackParamList, 'WordGame' | 'PronunciationGame'>;

interface WordGroup {
  firstChar: string;
  secondChar: string;
}

interface Bubble {
  id: string;
  char: string;
  scale: Animated.Value;
  opacity: Animated.Value;
  colors: readonly [string, string, string];
  position: {
    x: number;
    y: number;
  };
  floatingAnim: Animated.Value;
  matches: string[];
  word: string;
  isSecondChar: boolean;
}

// 添加洗牌函数
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const BubbleMatchingScreen = ({ navigation, route }: BubbleMatchingScreenProps) => {
  const { theme, isDesktop, isIPad } = useResponsive();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  
  // 添加完整的Mac设备检测
  const isMacOS = Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac'));
  // 兼容新旧版本 React Native 的 Mac Catalyst 检测
  const isMacCatalyst = Platform.OS === 'ios' && (
    Platform.isMacCatalyst || // React Native 0.64+
    (isIPad && windowWidth > 1024) // 兼容旧版本 RN
  );
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;
  
  // 动态计算气球尺寸
  const BUBBLE_SIZE = getBubbleSize(isDesktop, isIPad, isMacDevice);

  // 添加动态样式定义，根据设备类型调整文本大小
  const dynamicStyles = {
    levelTitle: {
      fontSize: isMacDevice ? 20 : isIPad ? 24 : 18,
    },
    desktopLevelTitle: {
      fontSize: isMacDevice ? 22 : isIPad ? 28 : 24,
    },
    scoreText: {
      fontSize: isMacDevice ? 18 : isIPad ? 22 : 18,
    },
    headerBackButton: {
      fontSize: isMacDevice ? 20 : isIPad ? 28 : 24,
    },
    hintButton: {
      fontSize: isMacDevice ? 20 : isIPad ? 28 : 24,
    },
    instructionsText: {
      fontSize: isMacDevice ? 14 : isIPad ? 16 : 13,
      lineHeight: isMacDevice ? 20 : isIPad ? 22 : 18,
    },
    bubbleText: {
      fontSize: isMacDevice ? 24 : isIPad ? 32 : 22,
    }
  };

  const [level, setLevel] = useState<number>(1);
  const [score, setScore] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const [remainingFirstChars, setRemainingFirstChars] = useState<string[]>([]);
  const [isShowingHint, setIsShowingHint] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [totalLevels, setTotalLevels] = useState(0);
  const [completedWords, setCompletedWords] = useState<string[]>([]);
  const gameMode = route.params.mode;
  const [successSound, setSuccessSound] = useState<Audio.Sound | null>(null);
  const [failureSound, setFailureSound] = useState<Audio.Sound | null>(null);
  const [maxScore, setMaxScore] = useState(0);
  const progressWidth = useState(new Animated.Value(0))[0];
  const floatingAnimation = useState(new Animated.Value(0))[0];
  const levelTransition = useState(new Animated.Value(1))[0];
  const scoreTransition = useState(new Animated.Value(1))[0];
  const [isAnimating, setIsAnimating] = useState(false);
  const [wordPairs, setWordPairs] = useState<WordPair[]>([]);

  // 在组件加载时加载游戏进度
  useEffect(() => {
    const loadProgress = async () => {
      try {
        const progress = await gameService.loadGameProgress(route.params.mode);
        if (progress) {
          setLevel(progress.currentLevel);
          setScore(progress.score);
          setCompletedWords(progress.completedWords);
        }
        const levels = await gameService.getTotalLevels();
        setTotalLevels(levels);
      } catch (error) {
        console.error('加载游戏进度失败:', error);
      }
    };
    loadProgress();
  }, []);

  const saveProgress = async () => {
    const isCompleted = level > gameService.getTotalLevels();
    await gameService.saveGameProgress({
      currentLevel: level,
      score,
      completedWords,
      isCompleted
    }, route.params.mode);
    await gameService.updateGameStats(score, isCompleted, route.params.mode);
  };

  useEffect(() => {
    saveProgress();
  }, [level, score, completedWords]);

  const getLevelBubbleCount = (level: GameLevel) => {
    if (level <= 3) {
      return [3, 5, 10][level - 1];
    }
    return 12; // 第4关之后每关12个气球
  };

  const generateLayeredPositions = (totalBubbles: number) => {
    const positions: { x: number; y: number }[] = [];
    const bubblesPerRow = isMacDevice ? 6 : isDesktop ? 7 : isIPad ? 6 : 4;
    const effectiveBubbleSize = BUBBLE_SIZE + (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8);
    const rows = Math.ceil(totalBubbles / bubblesPerRow);
    
    // 使用更精确的宽度计算
    let gameAreaWidth = windowWidth;
    
    // iPad和桌面版使用限制的宽度，但确保足够宽
    if (isDesktop) {
      gameAreaWidth = Math.min(1200, windowWidth);
    } else if (isIPad) {
      // 确保iPad上游戏区域足够宽
      gameAreaWidth = windowWidth - 48;
    } else {
      // 手机上的宽度
      gameAreaWidth = windowWidth - 20;
    }
    
    // 确保有足够的空间放置气泡
    const bubbleAreaWidth = Math.min(bubblesPerRow * effectiveBubbleSize, gameAreaWidth);
    const startY = isMacDevice ? 20 : isDesktop ? 40 : isIPad ? 30 : 20;
    const verticalGap = BUBBLE_SIZE * (isMacDevice ? 0.95 : isDesktop ? 0.8 : isIPad ? 0.85 : 0.9);

    for (let row = 0; row < rows; row++) {
      const y = startY + row * verticalGap;
      const bubblesInThisRow = Math.min(bubblesPerRow, totalBubbles - row * bubblesPerRow);
      
      // 计算每一行的实际宽度和中心位置
      const rowWidth = bubblesInThisRow * effectiveBubbleSize;
      const rowStartX = (gameAreaWidth - rowWidth) / 2;
      
      for (let col = 0; col < bubblesInThisRow; col++) {
        const x = rowStartX + col * effectiveBubbleSize;
        positions.push({ x, y });
      }
    }

    return positions;
  };

  // 加载音效
  useEffect(() => {
    const loadSounds = async () => {
      try {
        const correctSound = new Audio.Sound();
        await correctSound.loadAsync(require('../../assets/sounds/success.wav'));
        setSuccessSound(correctSound);

        const wrongSound = new Audio.Sound();
        await wrongSound.loadAsync(require('../../assets/sounds/failure.wav'));
        setFailureSound(wrongSound);
      } catch (error) {
        // Silent error handling
      }
    };

    loadSounds();

    return () => {
      const unloadSounds = async () => {
        if (successSound) {
          await successSound.unloadAsync();
        }
        if (failureSound) {
          await failureSound.unloadAsync();
        }
      };
      unloadSounds();
    };
  }, []);

  // 添加漂浮动画
  useEffect(() => {
    const startFloatingAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatingAnimation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
          Animated.timing(floatingAnimation, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
        ])
      ).start();
    };

    startFloatingAnimation();
  }, []);

  // 在 useEffect 中添加气球漂浮动画
  useEffect(() => {
    bubbles.forEach(bubble => {
      const randomDelay = Math.random() * 1000; // 0-1秒的随机延迟
      const startBubbleFloating = () => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(bubble.floatingAnim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.sin),
            }),
            Animated.timing(bubble.floatingAnim, {
              toValue: 0,
              duration: 2000,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.sin),
            }),
          ])
        ).start();
      };
      setTimeout(startBubbleFloating, randomDelay);
    });
  }, [bubbles]);

  const initializeLevel = async () => {
    // 只有在进入新关卡时才检查限制
    if (level > CONSTANTS.FREE_GAME_LEVEL_LIMIT) {
      const subscriptionService = SubscriptionService.getInstance();
      const isLevelLocked = await subscriptionService.checkGameLevelLimit(level);
      
      if (isLevelLocked) {
        Alert.alert(
          i18n.t('levelLocked'),
          i18n.t('levelLockedDesc'),
          [
            { text: i18n.t('cancel'), style: 'cancel' },
            { 
              text: i18n.t('getPremium'),
              onPress: () => {
                navigation.getParent()?.navigate('Settings', { screen: 'premium' });
              }
            }
          ]
        );
        navigation.goBack();
        return;
      }
    }

    try {
      const bubbleCount = getLevelBubbleCount(level as GameLevel);
      const wordPairs = await gameService.getWordPairsForLevel(level);
      
      const validWordPairs = wordPairs.filter((pair: WordPair) => 
        pair.characters.length === 2 && 
        pair.characters[0] && 
        pair.characters[1] && 
        pair.word
      );
      
      if (validWordPairs.length === 0) {
        if (level === 5) {
          Alert.alert(i18n.t('gameComplete'), i18n.t('gameCompleteMessage'));
          navigation.goBack();
        } else {
          setLevel(prev => (prev + 1) as GameLevel);
        }
        return;
      }
      
      let totalMaxScore = 0;
      for (let i = 1; i <= 5; i++) {
        const levelPairs = await gameService.getWordPairsForLevel(i as GameLevel);
        const validPairs = levelPairs.filter(pair => 
          pair.characters.length === 2 && 
          pair.characters[0] && 
          pair.characters[1] && 
          pair.word
        );
        totalMaxScore += validPairs.length * 10;
      }
      setMaxScore(totalMaxScore);
      
      const positions = generateLayeredPositions(validWordPairs.length);

      const secondChars = validWordPairs.map((pair: WordPair) => ({
        char: pair.characters[1],
        word: pair.word
      }));

      const shuffledSecondChars = shuffleArray(secondChars);
      setRemainingFirstChars(shuffledSecondChars.map(item => item.char));

      const firstChars = validWordPairs.map((pair: WordPair, index: number) => {
        const colorIndex = index % BUBBLE_COLORS.length;
        const position = positions[index] || { x: 0, y: 0 };

        return {
          id: `${pair.word}-first`,
          char: pair.characters[0],
          scale: new Animated.Value(1),
          opacity: new Animated.Value(1),
          matches: [pair.characters[1]],
          word: pair.word,
          colors: BUBBLE_COLORS[colorIndex],
          position,
          isSecondChar: false,
          floatingAnim: new Animated.Value(0)
        };
      });

      const newBubbles: Bubble[] = shuffleArray(firstChars);
      setBubbles(newBubbles);
      
      if (shuffledSecondChars.length > 0) {
        setCurrentChar(shuffledSecondChars[0].char);
      }
    } catch (error) {
      Alert.alert(
        i18n.t('error'),
        i18n.t('levelInitError'),
        [{ text: i18n.t('confirm'), onPress: () => navigation.goBack() }]
      );
    }
  };

  // 气球爆炸动画
  const playBubblePopAnimation = (bubble: Bubble) => {
    Animated.parallel([
      Animated.timing(bubble.scale, {
        toValue: 1.2,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(bubble.opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 修改进度条更新函数
  const updateProgressBar = (newScore: number) => {
    const totalWords = gameService.getTotalWordPairsCount();
    const progressPercentage = (completedWords.length / totalWords) * 100;
    
    Animated.spring(progressWidth, {
      toValue: progressPercentage,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  };

  const handleBubblePress = async (bubble: Bubble) => {
    if (isAnimating || !currentChar) return;
    
    const isMatch = bubble.matches.includes(currentChar);
      setIsAnimating(true);
      
    try {
      if (isMatch) {
      await playCorrectSound();
      
      const newScore = score + 10;
      setScore(newScore);
      updateProgressBar(newScore);
      
        setCompletedWords([...completedWords, bubble.word]);

        // 移除匹配的气球，但保持其他气球位置不变
        setBubbles(prevBubbles => prevBubbles.filter(b => b.id !== bubble.id));

        // 更新剩余的第一个字符
        const remainingChars = remainingFirstChars.filter(char => char !== currentChar);
        setRemainingFirstChars(remainingChars);

        // 检查是否完成当前关卡
        if (bubbles.length <= 1) { // 因为当前气泡还未从状态中移除，所以用1判断
          const totalLevels = gameService.getTotalLevels();
          if (level >= totalLevels) {
            handleGameComplete(newScore);
          } else {
            setLevel(level + 1);
            await initializeLevel();
          }
        } else if (remainingChars.length > 0) {
          // 如果还有剩余字符，设置下一个当前字符
          setCurrentChar(remainingChars[0]);
        }

        playBubblePopAnimation(bubble);
        
        // 延迟重置动画状态
        setTimeout(() => {
      setIsAnimating(false);
        }, 500);
    } else {
      await playWrongSound();
        
        const newScore = Math.max(0, score - 5);
        setScore(newScore);
        updateProgressBar(newScore);

        Animated.sequence([
          Animated.timing(bubble.scale, {
            toValue: 1.2,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(bubble.scale, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setIsAnimating(false);
        });
      }
    } catch (error) {
      console.error('处理气泡点击时出错:', error);
      setIsAnimating(false);
    }
  };

  // 修改提示函数的分数扣减逻辑
  const showHintAnimation = () => {
    if (isShowingHint || !currentChar) return;
    
    // 使用提示扣2分
    setScore(prev => {
      const newScore = Math.max(0, prev - 2);
      updateProgressBar(newScore);
      return newScore;
    });

    setIsShowingHint(true);

    // 找到所有可以匹配的气泡
    const matchingBubbles = bubbles.filter(b => {
      const word1 = b.char + currentChar;
      const word2 = currentChar + b.char;
      return bubbles.some(b2 => b2.word === word1 || b2.word === word2);
    });

    // 为每个匹配的气泡创建闪烁动画
    matchingBubbles.forEach(bubble => {
      Animated.sequence([
        Animated.timing(bubble.scale, {
          toValue: 1.3,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(bubble.scale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });

    // 3秒后重置提示状态
    setTimeout(() => {
      setIsShowingHint(false);
    }, 3000);
  };

  const handleGameComplete = async (finalScore: number) => {
    try {
      await gameService.updateGameStats(finalScore, true, route.params.mode);
      await gameService.resetGame(route.params.mode);
      
        Alert.alert(
          i18n.t('gameComplete'),
          i18n.t('gameCompleteMessage'),
          [
            {
              text: i18n.t('confirm'),
              onPress: () => navigation.goBack()
            }
          ]
        );
    } catch (error) {
      // Silent error handling
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    const init = async () => {
      try {
        setIsLoading(true);
        await initializeLevel();
      } catch (error) {
        console.error('初始化游戏失败:', error);
        if (isMounted) {
          Alert.alert(
            i18n.t('error'),
            i18n.t('gameInitError'),
            [{ text: i18n.t('confirm'), onPress: () => navigation.goBack() }]
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    init();
    
    return () => {
      isMounted = false;
    };
  }, [level]);

  // 添加关卡切换动画
  useEffect(() => {
    Animated.sequence([
      Animated.timing(levelTransition, {
        toValue: 1.2,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(2)),
      }),
      Animated.timing(levelTransition, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.back(2)),
      }),
    ]).start();
  }, [level]);

  // 添加分数更新动画
  useEffect(() => {
    Animated.sequence([
      Animated.timing(scoreTransition, {
        toValue: 1.2,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(2)),
      }),
      Animated.timing(scoreTransition, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.back(2)),
      }),
    ]).start();
  }, [score]);

  const renderBubble = (bubble: Bubble) => {
    return (
      <Animated.View
        key={bubble.id}
        style={[
          styles.bubble,
          {
            transform: [
              { scale: bubble.scale },
              {
                translateY: bubble.floatingAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10]
                })
              }
            ],
            opacity: bubble.opacity,
            position: 'absolute',
            left: bubble.position.x,
            top: bubble.position.y,
            zIndex: 10
          },
        ]}
      >
        <View style={styles.bubbleContent}>
          <View style={styles.bubbleShadow}>
            <LinearGradient
              colors={bubble.colors}
              style={styles.bubbleGradient}
              start={{ x: 0.2, y: 0.2 }}
              end={{ x: 0.8, y: 0.8 }}
            >
              <TouchableOpacity
                onPress={() => handleBubblePress(bubble)}
                style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
              >
                <Text style={[styles.bubbleText, dynamicStyles.bubbleText]}>{bubble.char}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </Animated.View>
    );
  };

  const handleExit = async () => {
    Alert.alert(
      i18n.t('exitGame'),
      i18n.t('exitGameMessage', {
        score,
        level,
        total: gameService.getTotalLevels()
      }),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel'
        },
        {
          text: i18n.t('confirm'),
          onPress: async () => {
            try {
              // 保存游戏进度
              await gameService.saveGameProgress({
                currentLevel: level,
                score,
                completedWords,
                isCompleted: false
              }, route.params.mode);
              
              // 更新游戏统计
              await gameService.updateGameStats(score, false, route.params.mode);
              
              // 退出游戏
              navigation.goBack();
            } catch (error) {
              console.error('保存游戏进度失败:', error);
              navigation.goBack();
            }
          }
        }
      ]
    );
  };

  const playCorrectSound = async () => {
    if (successSound) {
      try {
        await successSound.setPositionAsync(0);
        await successSound.playAsync();
      } catch (error) {
        console.error('播放成功音效失败:', error);
      }
    }
  };

  const playWrongSound = async () => {
    if (failureSound) {
      try {
        await failureSound.setPositionAsync(0);
        await failureSound.playAsync();
      } catch (error) {
        console.error('播放失败音效失败:', error);
      }
    }
  };

  // 将样式定义移到组件内部
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#f0f8ff',
      width: '100%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: isMacDevice ? 12 : isIPad ? 15 : 15,
      paddingVertical: isMacDevice ? 8 : isIPad ? 10 : 10,
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
    },
    desktopHeader: {
      paddingHorizontal: isMacDevice ? 20 : 24,
      paddingVertical: isMacDevice ? 14 : 16,
    },
    headerButton: {
      padding: isMacDevice ? 6 : 8,
      borderRadius: 8,
    },
    levelTitleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    levelTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#333',
    },
    desktopLevelTitle: {
      fontSize: 24,
    },
    progressSection: {
      paddingHorizontal: isMacDevice ? 12 : 15,
      paddingVertical: isMacDevice ? 8 : 10,
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
    },
    scoreContainer: {
      marginBottom: isMacDevice ? 6 : 8,
    },
    scoreText: {
      fontSize: 18,
      fontWeight: '600',
      color: '#333',
    },
    progressBarContainer: {
      height: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      backgroundColor: '#4CAF50',
    },
    gameArea: {
      flex: 1,
      justifyContent: 'space-between',
      width: '100%',
      alignSelf: 'stretch',
      paddingBottom: isMacDevice ? 160 : (Platform.OS === 'ios' ? 120 : 90),
      paddingHorizontal: 0,
    },
    desktopGameArea: {
      paddingBottom: isMacDevice ? 180 : 140,
      alignSelf: 'center',
      width: '100%',
      maxWidth: 1200,
    },
    bubblesContainer: {
      flex: 1,
      position: 'relative',
      width: '100%',
      alignSelf: 'stretch',
    },
    targetArea: {
      height: isMacDevice ? 80 : 100,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'absolute',
      bottom: isMacDevice || isIPad ? 180 : (Platform.OS === 'ios' ? 140 : 110),
      left: 0,
      right: 0,
      width: '100%',
    },
    targetControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isMacDevice ? 15 : 20,
    },
    currentCharContainer: {
      width: BUBBLE_SIZE - (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8),
      height: BUBBLE_SIZE - (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8),
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: (BUBBLE_SIZE - (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8)) / 2,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.6)',
      backgroundColor: 'transparent',
    },
    currentCharShadow: {
      width: BUBBLE_SIZE - (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8),
      height: BUBBLE_SIZE - (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8),
      borderRadius: (BUBBLE_SIZE - (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8)) / 2,
      shadowColor: '#000',
      shadowOffset: {
        width: 2,
        height: 4,
      },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 6,
      backgroundColor: '#fff', // 添加实色背景以便高效计算阴影
      overflow: 'hidden',
    },
    currentCharGradient: {
      width: '100%',
      height: '100%',
      borderRadius: (BUBBLE_SIZE - (isMacDevice ? 10 : isDesktop ? 15 : isIPad ? 12 : 8)) / 2,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.6)',
    },
    currentCharText: {
      fontSize: isMacDevice ? 24 : isDesktop ? 36 : isIPad ? 30 : 22,
      fontWeight: 'bold',
      color: '#333',
      textShadowColor: 'rgba(255, 255, 255, 0.9)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      zIndex: 2,
    },
    bubble: {
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE,
      position: 'absolute',
      justifyContent: 'center',
      alignItems: 'center',
    },
    bubbleContent: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    bubbleShadow: {
      width: BUBBLE_SIZE - 4,
      height: BUBBLE_SIZE - 4,
      borderRadius: BUBBLE_SIZE / 2,
      shadowColor: '#000',
      shadowOffset: {
        width: 2,
        height: 4,
      },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 6,
      backgroundColor: '#fff',
      overflow: 'hidden',
    },
    bubbleGradient: {
      width: '100%',
      height: '100%',
      borderRadius: BUBBLE_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.6)',
    },
    reflection: {
      position: 'absolute',
      width: BUBBLE_SIZE * 0.8,
      height: BUBBLE_SIZE * 0.8,
      borderRadius: BUBBLE_SIZE,
    },
    mainReflection: {
      top: BUBBLE_SIZE * 0.1,
      right: BUBBLE_SIZE * 0.1,
      opacity: 0.8,
      transform: [
        { scale: 0.6 },
        { rotate: '45deg' }
      ],
    },
    secondaryReflection: {
      bottom: BUBBLE_SIZE * 0.1,
      left: BUBBLE_SIZE * 0.1,
      opacity: 0.4,
      transform: [
        { scale: 0.4 },
        { rotate: '45deg' }
      ],
    },
    iridescence: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.3,
      transform: [
        { rotate: '-30deg' }
      ],
    },
    bubbleText: {
      fontSize: isMacDevice ? 28 : isDesktop ? 42 : isIPad ? 36 : 28,
      fontWeight: 'bold',
      color: '#333',
      textShadowColor: 'rgba(255, 255, 255, 0.9)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      zIndex: 2,
    },
    instructionsContainer: {
      position: 'absolute',
      bottom: isMacDevice || isIPad ? 120 : (Platform.OS === 'ios' ? 90 : 70),
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 10,
      width: '100%',
      zIndex: 5,
    },
    instructionsBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      paddingVertical: isMacDevice ? 8 : 10,
      paddingHorizontal: isMacDevice ? 12 : 15,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(76, 175, 80, 0.4)',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.15,
      shadowRadius: 5,
      elevation: 4,
      gap: isMacDevice ? 6 : 8,
      width: '98%',
      maxWidth: isDesktop ? 800 : isIPad ? 650 : 380,
    },
    instructionsText: {
      color: '#333',
      fontSize: isMacDevice ? 13 : isIPad ? 14 : 13,
      fontWeight: '500',
      flex: 1,
      lineHeight: isMacDevice ? 18 : isIPad ? 20 : 18,
      flexWrap: 'wrap',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 10,
      fontSize: isMacDevice ? 12 : 16,
      color: '#333',
    },
    desktopTargetArea: {
      height: isMacDevice ? 90 : 120,
      bottom: isMacDevice ? 200 : 160,
    },
    desktopCurrentCharContainer: {
      width: BUBBLE_SIZE - (isMacDevice ? 15 : isDesktop ? 16 : 12),
      height: BUBBLE_SIZE - (isMacDevice ? 15 : isDesktop ? 16 : 12),
      borderRadius: (BUBBLE_SIZE - (isMacDevice ? 15 : isDesktop ? 16 : 12)) / 2,
    },
    desktopCurrentCharText: {
      fontSize: isMacDevice ? 26 : 36,
    },
  });

  return (
    <ResponsiveContainer style={{ width: '100%' }} withPadding={false} useMaxWidth={false}>
      <View style={[styles.container, { width: '100%' }]}>
        <View style={[styles.header, isDesktop && styles.desktopHeader]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={dynamicStyles.headerBackButton.fontSize}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
          
          <View style={styles.levelTitleContainer}>
            <Text style={[
              styles.levelTitle, 
              dynamicStyles.levelTitle,
              isDesktop && styles.desktopLevelTitle,
              isDesktop && dynamicStyles.desktopLevelTitle
            ]}>
              {i18n.t('levelTitle', { current: level, total: totalLevels })}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={showHintAnimation}
            disabled={isShowingHint}
          >
            <MaterialCommunityIcons
              name="lightbulb"
              size={dynamicStyles.hintButton.fontSize}
              color={isShowingHint ? theme.colors.textSecondary : theme.colors.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={[styles.progressSection, { width: '100%' }]}>
          <View style={styles.scoreContainer}>
            <Text style={[styles.scoreText, dynamicStyles.scoreText]}>
              {i18n.t('score', { score })}
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <Animated.View 
              style={[
                styles.progressBar,
                {
                  width: progressWidth.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%']
                  })
                }
              ]} 
            />
          </View>
        </View>

        <View style={[
          styles.gameArea, 
          isDesktop && styles.desktopGameArea,
          { 
            width: isDesktop ? '100%' : isIPad ? windowWidth - 48 : windowWidth - 20,
            alignSelf: 'center'
          }
        ]}>
          <View style={[
            styles.bubblesContainer, 
            { 
              width: '100%',
              alignSelf: 'center'
            }
          ]}>
            {bubbles.map(renderBubble)}
          </View>

          <View style={[styles.targetArea, isDesktop && styles.desktopTargetArea]}>
            <View style={styles.targetControls}>
              <Animated.View style={{
                transform: [{
                  translateY: floatingAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -10]
                  })
                }]
              }}>
                <View style={[
                  styles.currentCharShadow,
                  isDesktop && styles.desktopCurrentCharContainer
                ]}>
                  <LinearGradient
                    colors={BUBBLE_COLORS[0]}
                    style={styles.currentCharGradient}
                    start={{ x: 0.2, y: 0.2 }}
                    end={{ x: 0.8, y: 0.8 }}
                  >
                  {/* 主反光效果 - 右上角 */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0)']}
                    style={[styles.reflection, styles.mainReflection]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  {/* 次要反光效果 - 左下角 */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0)']}
                    style={[styles.reflection, styles.secondaryReflection]}
                    start={{ x: 1, y: 1 }}
                    end={{ x: 0, y: 0 }}
                  />
                  {/* 彩虹光晕效果 */}
                  <LinearGradient
                    colors={[
                      'rgba(255, 255, 255, 0.4)',
                      'rgba(255, 182, 193, 0.2)',
                      'rgba(173, 216, 230, 0.2)',
                      'rgba(255, 255, 255, 0.1)'
                    ]}
                    style={styles.iridescence}
                    start={{ x: 0.2, y: 0.2 }}
                    end={{ x: 0.8, y: 0.8 }}
                  />
                    <Text style={[
                      styles.currentCharText,
                      dynamicStyles.bubbleText
                    ]}>
                      {currentChar}
                    </Text>
                  </LinearGradient>
                </View>
              </Animated.View>
            </View>
          </View>

          {/* 游戏规则说明 */}
          <View style={styles.instructionsContainer}>
            <View style={styles.instructionsBox}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#4CAF50" />
              <Text style={[styles.instructionsText, dynamicStyles.instructionsText]} numberOfLines={1}>
                {isIPad || isDesktop ? 
                  `${i18n.t('clickMatchingBubble')} | ${i18n.t('correctMatch')}: +10 ${i18n.t('points')} | ${i18n.t('incorrectMatch')}: -5 ${i18n.t('points')} | ${i18n.t('useHint')}: -2 ${i18n.t('points')}` :
                  `${i18n.t('clickMatchingBubble')} | ✓ +10 | ✗ -5 | 💡 -2`
                }
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ResponsiveContainer>
  );
}; 