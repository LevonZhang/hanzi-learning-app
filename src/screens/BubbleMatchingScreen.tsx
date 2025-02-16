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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_AREA_WIDTH = SCREEN_WIDTH - 20;
const GAME_AREA_HEIGHT = SCREEN_HEIGHT * 0.6;
const BUBBLE_SIZE = 80;
const HORIZONTAL_GAP = 5; // 减小水平间距
const VERTICAL_OVERLAP = -8; // 增加垂直重叠
const TOP_MARGIN = 10; // 使用常量作为起始边距

// 修改颜色系统，每个色系使用相同基色的不同深浅和透明度
const BUBBLE_COLORS = [
  // 粉色系
  ['rgba(255, 182, 193, 0.9)', 'rgba(255, 192, 203, 0.6)', 'rgba(255, 228, 235, 0.4)'],
  // 蓝色系
  ['rgba(135, 206, 235, 0.9)', 'rgba(176, 224, 230, 0.6)', 'rgba(240, 248, 255, 0.4)'],
  // 紫色系
  ['rgba(216, 191, 216, 0.9)', 'rgba(221, 160, 221, 0.6)', 'rgba(245, 230, 245, 0.4)'],
  // 绿色系
  ['rgba(144, 238, 144, 0.9)', 'rgba(152, 251, 152, 0.6)', 'rgba(240, 255, 240, 0.4)'],
  // 黄色系
  ['rgba(255, 218, 185, 0.9)', 'rgba(255, 228, 196, 0.6)', 'rgba(255, 245, 238, 0.4)'],
  // 青色系
  ['rgba(175, 238, 238, 0.9)', 'rgba(224, 255, 255, 0.6)', 'rgba(240, 255, 255, 0.4)']
];

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
  matches: string[];
  colors: string[];
  position: { x: number; y: number };
  isSecondChar: boolean;
  word: string;
  floatingAnim: Animated.Value;
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
    const bubblesPerRow = 4; // 每行固定4个气球
    const effectiveBubbleSize = BUBBLE_SIZE + 10; // 减小气球之间的间距
    const rows = Math.ceil(totalBubbles / bubblesPerRow);
    
    // 计算总宽度和起始x坐标，使每行气球居中
    const totalWidth = bubblesPerRow * effectiveBubbleSize;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;  // 移除 effectiveBubbleSize / 2，让整体布局向左移动半个气球宽度
    
    // 设置起始y坐标靠近顶部，只留一点边距
    const startY = 20; // 距离顶部20像素
    const verticalGap = BUBBLE_SIZE - 10; // 垂直方向上气球间距略小于气球大小

    for (let row = 0; row < rows; row++) {
      const bubblesInThisRow = Math.min(bubblesPerRow, totalBubbles - row * bubblesPerRow);
      // 计算这一行的总宽度
      const rowWidth = bubblesInThisRow * effectiveBubbleSize;
      // 计算这一行的起始x坐标，使这一行居中
      const rowStartX = (SCREEN_WIDTH - rowWidth) / 2;  // 同样移除 effectiveBubbleSize / 2

      for (let col = 0; col < bubblesInThisRow; col++) {
        // 基础位置
        const x = rowStartX + col * effectiveBubbleSize;
        const y = startY + row * verticalGap;
        
        // 添加较小的随机偏移
        const randomOffsetX = (Math.random() - 0.5) * 6; // 减小水平随机偏移
        const randomOffsetY = (Math.random() - 0.5) * 6; // 减小垂直随机偏移
        
        positions.push({
          x: x + randomOffsetX,
          y: y + randomOffsetY
        });
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
    const isLevelLocked = await SubscriptionService.checkGameLevelLimit(level);
    
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
            top: bubble.position.y
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => handleBubblePress(bubble)}
          style={styles.bubbleContent}
        >
          <LinearGradient
            colors={bubble.colors as unknown as readonly [string, string, string]}
            style={styles.bubbleGradient}
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
            <Text style={styles.bubbleText}>{bubble.char}</Text>
          </LinearGradient>
        </TouchableOpacity>
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerButton} 
          onPress={handleExit}
        >
          <MaterialCommunityIcons name="exit-to-app" size={24} color="#666" />
        </TouchableOpacity>

        <View style={styles.levelTitleContainer}>
          <Text style={styles.levelTitle}>
            {i18n.t('levelTitle', { current: level, total: totalLevels })}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.headerButton} 
          onPress={showHintAnimation}
        >
          <MaterialCommunityIcons name="lightbulb-outline" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarContainer}>
          <Animated.View 
            style={[
              styles.progressBar,
              { width: progressWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%']
              })}
            ]}
          />
        </View>
        <Text style={styles.scoreText}>{score}</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{i18n.t('loading')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.gameArea}>
            <View style={styles.bubblesContainer}>
              {bubbles.map(renderBubble)}
            </View>

            <View style={styles.targetArea}>
              <View style={styles.targetControls}>
                <Animated.View style={{
                  transform: [{
                    translateY: floatingAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -10]
                    })
                  }]
                }}>
                  <LinearGradient
                    colors={BUBBLE_COLORS[0] as unknown as readonly [string, string, string]}
                    style={styles.currentCharContainer}
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
                    <Text style={styles.currentCharText}>{currentChar}</Text>
                  </LinearGradient>
                </Animated.View>
              </View>
            </View>
          </View>

          <View style={styles.instructionsContainer}>
            <View style={styles.instructionsBox}>
              <MaterialCommunityIcons name="information" size={16} color="#4CAF50" />
              <Text style={styles.instructionsText}>
                {i18n.t('correctMatch')} +10 {i18n.t('points')} | {i18n.t('incorrectMatch')} -5 {i18n.t('points')} | {i18n.t('useHint')} -2 {i18n.t('points')}
              </Text>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  gameArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: Platform.OS === 'ios' ? 120 : 90, // 增加底部间距，iOS 需要更多空间
  },
  bubblesContainer: {
    width: GAME_AREA_WIDTH,
    height: GAME_AREA_HEIGHT,
    marginHorizontal: 10,
    position: 'relative', // 改为相对定位，作为气球的容器
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    position: 'absolute', // 改为绝对定位
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleGradient: {
    width: BUBBLE_SIZE - 8,
    height: BUBBLE_SIZE - 8,
    borderRadius: BUBBLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 2,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'transparent',
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    zIndex: 2,
  },
  targetArea: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 140 : 110, // 增加底部距离，将目标区域往上移
    left: 0,
    right: 0,
  },
  targetControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  currentCharContainer: {
    width: BUBBLE_SIZE - 20, // 稍微小一点的尺寸
    height: BUBBLE_SIZE - 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: (BUBBLE_SIZE - 20) / 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 2,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'transparent',
  },
  currentCharText: {
    fontSize: 28, // 稍微小一点的字号
    fontWeight: 'bold',
    color: '#333',
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    zIndex: 2,
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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  progressBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    minWidth: 40,
    textAlign: 'right',
  },
}); 