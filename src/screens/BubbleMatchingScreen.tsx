import React, { useState, useEffect, useRef } from 'react';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_AREA_WIDTH = SCREEN_WIDTH - 20;
const GAME_AREA_HEIGHT = SCREEN_HEIGHT * 0.6;

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
  const { isIPad, isDesktop, theme } = useResponsive();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  
  const BUBBLE_SIZE = Platform.OS === 'macos' ? 100 : isIPad ? 70 : 60;
  const HORIZONTAL_GAP = Platform.OS === 'macos' ? 8 : isIPad ? 6 : 5;
  const VERTICAL_OVERLAP = Platform.OS === 'macos' ? -10 : isIPad ? -7 : -5;
  const TOP_MARGIN = Platform.OS === 'macos' ? 15 : isIPad ? 12 : 10;

  const [currentLevel, setCurrentLevel] = useState<GameLevel>(1);
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
  const progressWidth = useRef(new Animated.Value(0)).current;
  const floatingAnimation = useRef(new Animated.Value(0)).current;
  const levelTransition = useRef(new Animated.Value(1)).current;
  const scoreTransition = useRef(new Animated.Value(1)).current;
  const [isAnimating, setIsAnimating] = useState(false);
  const [wordPairs, setWordPairs] = useState<WordPair[]>([]);
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);
  const [canPlay, setCanPlay] = useState(true);
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [removedBubbleIds, setRemovedBubbleIds] = useState<Set<string>>(new Set());
  const [visibleBubbles, setVisibleBubbles] = useState<Set<string>>(new Set());

  // 在组件加载时加载游戏进度
  useEffect(() => {
    const loadProgress = async () => {
      try {
        const progress = await gameService.loadGameProgress(route.params.mode);
        if (progress) {
          const level = progress.currentLevel;
          if (level >= 1 && level <= 5) {
            setCurrentLevel(level as GameLevel);
          }
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
    const isCompleted = currentLevel > gameService.getTotalLevels();
    await gameService.saveGameProgress({
      currentLevel: currentLevel,
      score,
      completedWords,
      isCompleted
    }, route.params.mode);
    await gameService.updateGameStats(score, isCompleted, route.params.mode);
  };

  useEffect(() => {
    saveProgress();
  }, [currentLevel, score, completedWords]);

  const getLevelBubbleCount = (level: GameLevel) => {
    if (level <= 3) {
      return [3, 5, 10][level - 1];
    }
    return 12; // 第4关之后每关12个气球
  };

  const generateLayeredPositions = (totalBubbles: number) => {
    const positions: { x: number; y: number }[] = [];
    const bubblesPerRow = isDesktop ? 6 : isIPad ? 4 : 3;
    const effectiveBubbleSize = BUBBLE_SIZE + 10;
    const rows = Math.ceil(totalBubbles / bubblesPerRow);
    
    // 计算游戏区域的宽度和起始位置
    const gameAreaWidth = windowWidth - (isDesktop || isIPad ? 48 : 20);
    const bubbleAreaWidth = bubblesPerRow * effectiveBubbleSize;
    const startX = (gameAreaWidth - bubbleAreaWidth) / 2;
    const startY = 20;
    const verticalGap = BUBBLE_SIZE - 10;

    for (let row = 0; row < rows; row++) {
      const y = startY + row * verticalGap;
      const bubblesInThisRow = Math.min(bubblesPerRow, totalBubbles - row * bubblesPerRow);
      
      for (let col = 0; col < bubblesInThisRow; col++) {
        const x = startX + col * effectiveBubbleSize;
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
    try {
      // 检查是否超过免费用户关卡限制
      const subscriptionService = SubscriptionService.getInstance();
      const isLevelLocked = await subscriptionService.checkGameLevelLimit(currentLevel);
      
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

      const bubbleCount = getLevelBubbleCount(currentLevel as GameLevel);
      const wordPairs = await gameService.getWordPairsForLevel(currentLevel);
      
      const validWordPairs = wordPairs.filter((pair: WordPair) => 
        pair.characters.length === 2 && 
        pair.characters[0] && 
        pair.characters[1] && 
        pair.word
      );
      
      if (validWordPairs.length === 0) {
        if (currentLevel === 5) {
          Alert.alert(i18n.t('gameComplete'), i18n.t('gameCompleteMessage'));
          navigation.goBack();
        } else {
          setCurrentLevel(prev => (prev + 1) as GameLevel);
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
      setVisibleBubbles(new Set(newBubbles.map(b => b.id)));
      
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
    ]).start(() => {
      setVisibleBubbles(prev => {
        const next = new Set(prev);
        next.delete(bubble.id);
        return next;
      });
    });
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

  // 在组件内更新关卡
  const updateLevel = (newLevel: number) => {
    if (newLevel >= 1 && newLevel <= 5) {
      const nextLevel = newLevel as GameLevel;
      setCurrentLevel(nextLevel);
    }
  };

  // 处理气泡点击
  const handleBubblePress = async (bubble: Bubble) => {
    if (!canPlay || isAnimating || !visibleBubbles.has(bubble.id)) return; // 忽略已消失的气泡

    // 检查当前点击的气泡是否能与当前字符配对
    if (!currentChar) return;
    const isMatch = bubble.matches.includes(currentChar);

    if (isMatch) {
      // 播放正确音效
      await playCorrectSound();
      
      // 播放消失动画
      setIsAnimating(true);
      const matchingBubble = bubbles.find(b => b.char === currentChar);
      if (!matchingBubble) return;

      await Promise.all([
        playBubblePopAnimation(bubble),
        playBubblePopAnimation(matchingBubble)
      ]);
      setIsAnimating(false);

      // 更新分数
      const newScore = score + 10;
      updateProgressBar(newScore);
      setScore(newScore);

      // 更新剩余的气泡
      const remainingBubbles = bubbles.filter(b => visibleBubbles.has(b.id));
      
      // 如果所有气泡都已匹配完成
      if (remainingBubbles.length <= 2) {
        await handleGameComplete(newScore);
        return;
      }

      // 选择下一个要匹配的字符
      const nextChar = remainingBubbles.find(b => !b.isSecondChar)?.char || '';
      setCurrentChar(nextChar);

    } else {
      // 播放错误音效
      await playWrongSound();
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

  // 处理游戏完成
  const handleGameComplete = async (finalScore: number) => {
    try {
      await gameService.updateGameStats(finalScore, true, route.params.mode);
      await gameService.resetGame(route.params.mode);
      
      if (currentLevel >= 5) {
        setIsGameComplete(true);
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
      } else {
        const nextLevel = (currentLevel + 1) as GameLevel;
        setCurrentLevel(nextLevel);
        initializeLevel();
      }
    } catch (error) {
      console.error('Error handling game completion:', error);
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
  }, [currentLevel]);

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
  }, [currentLevel]);

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

  // 动态样式
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
      paddingHorizontal: 15,
      paddingVertical: 10,
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      width: '100%',
    },
    desktopHeader: {
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    headerButton: {
      padding: 8,
      borderRadius: 8,
    },
    levelTitleContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    levelTitle: {
      fontSize: Platform.OS === 'macos' ? 24 : isIPad ? 20 : 18,
      fontWeight: '600',
      color: '#333',
    },
    desktopLevelTitle: {
      fontSize: Platform.OS === 'macos' ? 28 : isIPad ? 24 : 20,
    },
    progressSection: {
      paddingHorizontal: 15,
      paddingVertical: 10,
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      width: '100%',
    },
    scoreContainer: {
      marginBottom: 8,
    },
    scoreText: {
      fontSize: Platform.OS === 'macos' ? 22 : isIPad ? 19 : 16,
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
      paddingBottom: Platform.OS === 'ios' ? 120 : 90,
      width: '100%',
    },
    desktopGameArea: {
      paddingBottom: 140,
      alignSelf: 'center',
      width: '100%',
      maxWidth: 1200,
    },
    bubblesContainer: {
      flex: 1,
      position: 'relative',
      width: '100%',
    },
    targetArea: {
      height: Platform.OS === 'macos' ? 120 : isIPad ? 90 : 80,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'absolute',
      bottom: Platform.OS === 'macos' ? 160 : isIPad ? 130 : 110,
      left: 0,
      right: 0,
      width: '100%',
    },
    desktopTargetArea: {
      height: Platform.OS === 'macos' ? 140 : isIPad ? 100 : 90,
      bottom: Platform.OS === 'macos' ? 180 : isIPad ? 140 : 120,
    },
    targetControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      width: '100%',
    },
    currentCharContainer: {
      backgroundColor: 'white',
      width: BUBBLE_SIZE - (Platform.OS === 'macos' ? 25 : isIPad ? 15 : 10),
      height: BUBBLE_SIZE - (Platform.OS === 'macos' ? 25 : isIPad ? 15 : 10),
      borderRadius: (BUBBLE_SIZE - (Platform.OS === 'macos' ? 25 : isIPad ? 15 : 10)) / 2,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    currentCharGradient: {
      width: '100%',
      height: '100%',
      borderRadius: (BUBBLE_SIZE - (Platform.OS === 'macos' ? 25 : isIPad ? 15 : 10)) / 2,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    desktopCurrentCharContainer: {
      width: BUBBLE_SIZE - 16,
      height: BUBBLE_SIZE - 16,
      borderRadius: (BUBBLE_SIZE - 16) / 2,
    },
    currentCharText: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#333',
      textShadowColor: 'rgba(255, 255, 255, 0.9)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      zIndex: 2,
    },
    desktopCurrentCharText: {
      fontSize: 36,
    },
    bubbleContainer: {
      position: 'absolute',
      zIndex: 1,
    },
    bubbleShadow: {
      backgroundColor: 'white',
      borderRadius: BUBBLE_SIZE / 2,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    bubble: {
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE,
      borderRadius: BUBBLE_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bubbleText: {
      fontSize: BUBBLE_SIZE * 0.4,
      color: '#fff',
      fontWeight: '600',
    },
    instructionsContainer: {
      position: 'absolute',
      bottom: Platform.OS === 'ios' ? 100 : 70,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 10,
      width: '100%',
    },
    instructionsBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(76, 175, 80, 0.3)',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 3,
      gap: 8,
      width: '98%',
    },
    instructionsText: {
      color: '#444',
      fontSize: 13,
      fontWeight: '500',
      flex: 1,
      lineHeight: 18,
      flexWrap: 'nowrap',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: '#333',
    },
  });

  const renderBubble = (bubble: Bubble) => {
    return (
      <Animated.View
        key={bubble.id}
        style={[
          styles.bubbleContainer,
          {
            transform: [
              { translateY: bubble.floatingAnim },
              { scale: bubble.scale }
            ],
            opacity: bubble.opacity,
            left: bubble.position.x,
            top: bubble.position.y,
          },
        ]}
      >
        <View style={styles.bubbleShadow}>
          <TouchableOpacity
            onPress={() => handleBubblePress(bubble)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={bubble.colors}
              style={styles.bubble}
            >
              <Text style={styles.bubbleText}>{bubble.char}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const handleExit = async () => {
    Alert.alert(
      i18n.t('exitGame'),
      i18n.t('exitGameMessage', {
        score,
        level: currentLevel,
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
                currentLevel: currentLevel,
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

  return (
    <ResponsiveContainer>
      <View style={styles.container}>
        <View style={[styles.header, isDesktop && styles.desktopHeader]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={isDesktop ? 28 : 24}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
          
          <View style={styles.levelTitleContainer}>
            <Text style={[
              styles.levelTitle,
              isDesktop && styles.desktopLevelTitle
            ]}>
              {i18n.t('levelTitle', { current: currentLevel, total: totalLevels })}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={showHintAnimation}
            disabled={isShowingHint}
          >
            <MaterialCommunityIcons
              name="lightbulb"
              size={isDesktop ? 28 : 24}
              color={isShowingHint ? theme.colors.textSecondary : theme.colors.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.scoreContainer}>
            <Text style={[styles.scoreText]}>
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
          isDesktop && { maxWidth: 1200 },
          !isDesktop && { maxWidth: '100%' }
        ]}>
          <View style={styles.bubblesContainer}>
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
                  styles.currentCharContainer,
                  isDesktop && styles.desktopCurrentCharContainer
                ]}>
                  <LinearGradient
                    colors={BUBBLE_COLORS[0]}
                    style={styles.currentCharGradient}
                    start={{ x: 0.2, y: 0.2 }}
                    end={{ x: 0.8, y: 0.8 }}
                  >
                    <Text style={[
                      styles.currentCharText,
                      isDesktop && styles.desktopCurrentCharText
                    ]}>
                      {currentChar}
                    </Text>
                  </LinearGradient>
                </View>
              </Animated.View>
            </View>
          </View>
        </View>
      </View>
    </ResponsiveContainer>
  );
}; 