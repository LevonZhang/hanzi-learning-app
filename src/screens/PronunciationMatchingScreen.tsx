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
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { i18n } from '../i18n/i18n';
import gameService, { PronunciationChar } from '../services/GameService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { storageService } from '../services/StorageService';
import StatisticsService from '../services/StatisticsService';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { useResponsive } from '../hooks/useResponsive';
import SubscriptionService from '../services/SubscriptionService';
import { CONSTANTS } from '../config/env';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_AREA_WIDTH = SCREEN_WIDTH - 10; // 进一步减少边距
const GAME_AREA_HEIGHT = SCREEN_HEIGHT * 0.9; // 进一步增加游戏区域高度

// 更新气泡尺寸计算，减小气泡尺寸，增加数量
const getBubbleSize = (isDesktop: boolean, isIPad: boolean, isMacOS: boolean, isMacCatalyst: boolean) => {
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;
  // 进一步减小气泡尺寸以容纳更多
  if (isMacDevice) return Math.min(SCREEN_WIDTH / 11, SCREEN_HEIGHT / 11);
  if (isIPad) return Math.min(SCREEN_WIDTH / 8, SCREEN_HEIGHT / 8);
  return Math.min(SCREEN_WIDTH / 7, SCREEN_HEIGHT / 8);
};
const BUBBLE_SIZE = getBubbleSize(
  Platform.OS === 'web' || Platform.OS === 'macos', 
  Platform.OS === 'ios' && Dimensions.get('window').width > 768,
  Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac')),
  Platform.OS === 'ios' && (Platform.isMacCatalyst || (Platform.OS === 'ios' && Dimensions.get('window').width > 1024))
);
const HORIZONTAL_GAP = 0;
const VERTICAL_OVERLAP = -8;
const TOP_MARGIN = 20;
const MAX_HEIGHT = GAME_AREA_HEIGHT * 0.4;

// 修改颜色系统，每个色系使用相同基色的不同深浅和透明度
const BUBBLE_COLORS: readonly [string, string, string][] = [
  ['#FF6B6B', '#FF8787', '#FFA5A5'],
  ['#4ECDC4', '#45B7AF', '#3CA29A'],
  ['#FFD93D', '#FFE066', '#FFE88F'],
  ['#95E1D3', '#A8E6DA', '#BBE9E2'],
  ['#A8E6CF', '#BDEBD7', '#D1F0E0'],
  ['#FF8B94', '#FFA3AA', '#FFBBC1'],
] as const;

type GameLevel = 1 | 2 | 3 | 4 | 5;

type GameStackParamList = {
  GamesList: undefined;
  WordGame: { mode: 'word' };
  PronunciationGame: { mode: 'pronunciation' };
};

type PronunciationMatchingScreenProps = NativeStackScreenProps<GameStackParamList, 'PronunciationGame'>;

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

export const PronunciationMatchingScreen = ({ navigation }: PronunciationMatchingScreenProps) => {
  const { isIPad, isDesktop, theme } = useResponsive();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  
  const [currentLevel, setCurrentLevel] = useState<GameLevel>(1);
  const [score, setScore] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [currentChar, setCurrentChar] = useState<PronunciationChar | null>(null);
  const [remainingChars, setRemainingChars] = useState<PronunciationChar[]>([]);
  const [isShowingHint, setIsShowingHint] = useState(false);
  const [successSound, setSuccessSound] = useState<Audio.Sound | null>(null);
  const [failureSound, setFailureSound] = useState<Audio.Sound | null>(null);
  const [maxScore, setMaxScore] = useState(0);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [canPlay, setCanPlay] = useState(true);
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  // 所有的 Animated.Value 都使用 useRef
  const progressWidth = useRef(new Animated.Value(0)).current;
  const floatingAnimation = useRef(new Animated.Value(0)).current;
  const currentCharScale = useRef(new Animated.Value(1)).current;
  const currentCharOpacity = useRef(new Animated.Value(1)).current;
  const progressBarWidth = useRef(new Animated.Value(0)).current;
  const levelTransition = useRef(new Animated.Value(1)).current;
  const scoreTransition = useRef(new Animated.Value(1)).current;
  const gameStartAnim = useRef(new Animated.Value(0)).current;
  const levelCompleteAnim = useRef(new Animated.Value(0)).current;
  
  // 为每个气泡创建旋转动画值
  const bubbleRotations = useRef<{ [key: string]: Animated.Value }>({}).current;

  // 添加喇叭动画
  const speakerAnim = useRef(new Animated.Value(0)).current;

  // 添加完整的Mac设备检测
  const isMacOS = Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac'));
  // 兼容新旧版本 React Native 的 Mac Catalyst 检测
  const isMacCatalyst = Platform.OS === 'ios' && (
    Platform.isMacCatalyst || // React Native 0.64+
    (isIPad && windowWidth > 1024) // 兼容旧版本 RN
  );
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;

  // 初始化气泡旋转动画
  useEffect(() => {
    bubbles.forEach(bubble => {
      if (!bubbleRotations[bubble.id]) {
        bubbleRotations[bubble.id] = new Animated.Value(0);
        const randomRotation = Math.random() * 10 - 5;
        const randomDuration = 2000 + Math.random() * 1000;

        Animated.loop(
          Animated.sequence([
            Animated.timing(bubbleRotations[bubble.id], {
              toValue: randomRotation,
              duration: randomDuration,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.sin),
            }),
            Animated.timing(bubbleRotations[bubble.id], {
              toValue: -randomRotation,
              duration: randomDuration,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.sin),
            }),
          ])
        ).start();
      }
    });
  }, [bubbles]);

  // 添加喇叭浮动动画
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(speakerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(speakerAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ])
    ).start();
  }, []);

  const getLevelBubbleCount = (level: GameLevel) => {
    const counts = {
      1: 3,
      2: 5,
      3: 10,
      4: 15,
      5: 18,
    };
    return counts[level];
  };

  // 完全重写气球位置生成算法，更好利用空间
  const generateLayeredPositions = (totalBubbles: number) => {
    const positions: { x: number; y: number }[] = [];
    
    // 根据设备类型调整每行气泡数量
    const bubblesPerRow = isMacDevice ? 8 : isDesktop ? 7 : isIPad ? 6 : 4;
    
    // 使用更精确的宽度计算 - 参考BubbleMatchingScreen
    let gameAreaWidth = windowWidth;
    
    // 减少边距以充分利用屏幕空间
    if (isDesktop) {
      gameAreaWidth = windowWidth - 20;
    } else if (isIPad) {
      gameAreaWidth = windowWidth - 20;
    } else {
      gameAreaWidth = windowWidth - 10;
    }
    
    // 计算每个气泡的有效尺寸(包括间距)
    const effectiveBubbleSize = BUBBLE_SIZE + (isMacDevice ? 6 : 10);
    
    const rows = Math.ceil(totalBubbles / bubblesPerRow);
    
    // 确保有足够的空间放置气泡
    const bubbleAreaWidth = Math.min(bubblesPerRow * effectiveBubbleSize, gameAreaWidth);
    
    // 计算水平偏移量使所有行居中
    const startX = (gameAreaWidth - bubbleAreaWidth) / 2;
    
    // 设置起始Y坐标和行间距 - 减少垂直间距以容纳更多气泡
    const startY = isMacDevice ? 0 : 10;
    const verticalGap = BUBBLE_SIZE * (isMacDevice ? 0.85 : 0.9);

    // 为每一行创建气泡位置
    for (let row = 0; row < rows; row++) {
      const y = startY + row * verticalGap;
      const bubblesInThisRow = Math.min(bubblesPerRow, totalBubbles - row * bubblesPerRow);
      
      // 计算当前行的实际宽度
      const rowWidth = bubblesInThisRow * effectiveBubbleSize;
      
      // 计算当前行的起始X坐标，使行居中
      const rowStartX = startX + (bubbleAreaWidth - rowWidth) / 2;
      
      // 为这一行的每个气泡创建位置
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
        const successSoundObject = new Audio.Sound();
        const failureSoundObject = new Audio.Sound();

        await successSoundObject.loadAsync(require('../../assets/sounds/success.wav'));
        await failureSoundObject.loadAsync(require('../../assets/sounds/failure.wav'));

        setSuccessSound(successSoundObject);
        setFailureSound(failureSoundObject);
      } catch (error) {
        console.error('加载音效失败:', error);
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
      const randomDelay = Math.random() * 1000;
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

  // 在组件加载时加载游戏进度
  useEffect(() => {
    const loadProgress = async () => {
      try {
        const progress = await gameService.loadGameProgress('pronunciation');
        if (progress) {
          setCurrentLevel(progress.currentLevel as GameLevel);
          setScore(progress.score);
        }
      } catch (error) {
        console.error('加载游戏进度失败:', error);
      }
    };
    loadProgress();
  }, []);

  const initializeLevel = async () => {
    setIsGameStarted(false);
    gameStartAnim.setValue(0);
    
    // 只有在进入新关卡时才检查限制
    if (currentLevel > CONSTANTS.FREE_GAME_LEVEL_LIMIT) {
      // Add subscription check
      const subscriptionService = SubscriptionService.getInstance();
      const isLevelLocked = await subscriptionService.checkGameLevelLimit(currentLevel);
      if (isLevelLocked) {
        Alert.alert(
          i18n.t('premiumFeature'),
          i18n.t('levelLockedDesc'),
          [
            {
              text: i18n.t('cancel'),
              style: 'cancel',
              onPress: () => navigation.goBack()
            },
            {
              text: i18n.t('subscribe'),
              onPress: () => navigation.getParent()?.navigate('Settings', { screen: 'premium' })
            }
          ]
        );
        return;
      }
    }
    
    const bubbleCount = getLevelBubbleCount(currentLevel);
    
    try {
      // 获取拼音数据
      const pronunciationChars = await gameService.getPronunciationCharsForLevel(currentLevel);
      
      if (!pronunciationChars || pronunciationChars.length === 0) {
        Alert.alert('错误', '无法加载关卡数据');
        return;
      }
      
      // 过滤掉无效的汉字
      const validChars = pronunciationChars.filter(char => char.char);
      
      if (validChars.length === 0) {
        Alert.alert('错误', '无法加载关卡数据');
        return;
      }
      
      // 计算所有关卡的总分
      let totalMaxScore = 0;
      for (let i = 1; i <= 5; i++) {
        const levelChars = await gameService.getPronunciationCharsForLevel(i as GameLevel);
        const validLevelChars = levelChars.filter(char => char.char);
        totalMaxScore += validLevelChars.length * 10;
      }
      setMaxScore(totalMaxScore);
      
      // 预先生成所有位置
      const positions = generateLayeredPositions(validChars.length);

      // 创建气泡
      let newBubbles: Bubble[] = validChars.map((char, index) => {
        const colorIndex = index % BUBBLE_COLORS.length;
        const position = positions[index] || { x: 0, y: 0 };

        return {
          id: `${char.char}-${index}`,
          char: char.char,
          scale: new Animated.Value(1),
          opacity: new Animated.Value(1),
          colors: BUBBLE_COLORS[colorIndex],
          position: position,
          floatingAnim: new Animated.Value(0)
        };
      });

      // 随机打乱气泡顺序
      newBubbles = shuffleArray(newBubbles);
      setBubbles(newBubbles);
      
      // 设置剩余的字符和当前要匹配的字
      const shuffledChars = shuffleArray(validChars);
      setRemainingChars(shuffledChars);
      
      // 启动游戏开始动画
      setTimeout(() => {
        setIsGameStarted(true);
        playGameStartAnimation();
        // 设置第一个字并播放其声音
        if (shuffledChars.length > 0) {
          const firstChar = shuffledChars[0];
          updateCurrentChar(firstChar);
          // 确保在设置完当前字符后再播放声音
          setTimeout(() => {
            gameService.playCharacterSound(firstChar.char);
          }, 500);
        }
      }, 500);
    } catch (error) {
      Alert.alert('错误', '初始化关卡时出错');
    }
  };

  // 气球爆炸动画
  const playBubblePopAnimation = (bubble: Bubble) => {
    const randomRotation = Math.random() * 360;
    const randomDirection = Math.random() > 0.5 ? 1 : -1;

    Animated.parallel([
      Animated.sequence([
        Animated.timing(bubble.scale, {
          toValue: 1.2,
          duration: 100,
          useNativeDriver: true,
          easing: Easing.out(Easing.back(2)),
        }),
        Animated.timing(bubble.scale, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.in(Easing.back(2)),
        }),
      ]),
      Animated.timing(bubble.opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      // 添加旋转和位移动画
      Animated.timing(bubble.floatingAnim, {
        toValue: randomDirection * 100,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
    ]).start();
  };

  // 修改进度条更新函数
  const updateProgressBar = (newScore: number) => {
    const validScore = Math.max(0, newScore);
    const progressPercentage = (validScore / maxScore) * 100;
    
    Animated.spring(progressBarWidth, {
      toValue: progressPercentage,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  };

  // 播放当前字符的动画
  const playCurrentCharAnimation = () => {
    Animated.sequence([
      Animated.timing(currentCharScale, {
        toValue: 1.1,
        duration: 100,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(2)),
      }),
      Animated.timing(currentCharScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
        easing: Easing.in(Easing.back(2)),
      }),
    ]).start();
  };

  // 更新当前字符时的动画
  const updateCurrentChar = (newChar: PronunciationChar | null) => {
    Animated.sequence([
      Animated.timing(currentCharOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(currentCharScale, {
        toValue: 0.8,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentChar(newChar);
      Animated.parallel([
        Animated.timing(currentCharOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(currentCharScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
      ]).start();
    });
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

  const handleBubblePress = async (bubble: Bubble) => {
    if (isAnimating || !currentChar) return;

    const isMatch = bubble.char === currentChar.char;
    setIsAnimating(true);

    if (isMatch) {
      await playCorrectSound();
      
      const newScore = score + 10;
      setScore(newScore);
      updateProgressBar(newScore);

      // 移除匹配的气球，但保持其他气球位置不变
      setBubbles(prevBubbles => prevBubbles.filter(b => b.id !== bubble.id));

      // 更新剩余的字符
      const newRemainingChars = remainingChars.filter(char => char.char !== currentChar.char);
      setRemainingChars(newRemainingChars);

      // 检查是否完成当前关卡
      if (newRemainingChars.length === 0) {
        const totalLevels = gameService.getTotalLevels();
        if (currentLevel >= totalLevels) {
          handleGameComplete(newScore);
        } else {
          setCurrentLevel((prev: GameLevel) => (prev + 1 as GameLevel));
        }
      } else if (newRemainingChars.length > 0) {
        // 如果还有剩余字符，设置下一个当前字符并播放其声音
        const nextChar = newRemainingChars[0];
        updateCurrentChar(nextChar);
        // 等待气泡破裂动画完成后播放下一个字的声音
        setTimeout(async () => {
          await gameService.playCharacterSound(nextChar.char);
        }, 800);
      }

      playBubblePopAnimation(bubble);
      setTimeout(() => {
        setIsAnimating(false);
      }, 1000);
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
  };

  const playCurrentCharSound = async () => {
    if (!currentChar) return;
    
    try {
      await gameService.playCharacterSound(currentChar.char);
    } catch (error) {
      console.error('播放声音失败:', error);
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

    // 找到正确的气泡
    const correctBubble = bubbles.find(b => b.char === currentChar.char);

    if (correctBubble) {
      // 为正确的气泡创建闪烁动画
      Animated.sequence([
        Animated.timing(correctBubble.scale, {
          toValue: 1.3,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(correctBubble.scale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // 3秒后重置提示状态
    setTimeout(() => {
      setIsShowingHint(false);
    }, 3000);
  };

  // 更新关卡时的动画
  const playLevelTransition = () => {
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
  };

  // 更新分数时的动画
  const playScoreTransition = () => {
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
  };

  // 游戏开始动画
  const playGameStartAnimation = () => {
    Animated.spring(gameStartAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  };

  // 更新关卡
  const updateLevel = (newLevel: number) => {
    if (newLevel >= 1 && newLevel <= 5) {
      setCurrentLevel(newLevel as GameLevel);
    }
  };

  // 处理游戏完成
  const handleGameComplete = async (finalScore: number) => {
    try {
      await gameService.updateGameStats(finalScore, true, 'pronunciation');
      await gameService.resetGame('pronunciation');
      
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
        updateLevel(currentLevel + 1);
        await initializeLevel();
      }
    } catch (error) {
      console.error('Error handling game completion:', error);
    }
  };

  // 处理关卡完成动画
  const playLevelCompleteAnimation = () => {
    setShowLevelComplete(true);
    Animated.sequence([
      Animated.timing(levelTransition, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(levelTransition, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      })
    ]).start(() => {
      setShowLevelComplete(false);
      if (currentLevel === 5) {
        navigation.goBack();
      } else {
        updateLevel(currentLevel + 1);
      }
    });
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
                completedWords: [], // 不需要记录已完成的字符
                isCompleted: false
              }, 'pronunciation');
              
              // 更新游戏统计
              await gameService.updateGameStats(score, false, 'pronunciation');
              
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

  useEffect(() => {
    initializeLevel();
  }, [currentLevel]);

  useEffect(() => {
    playLevelTransition();
  }, [currentLevel]);

  useEffect(() => {
    playScoreTransition();
  }, [score]);

  // 添加保存游戏进度的useEffect
  useEffect(() => {
    const saveProgress = async () => {
      try {
        await gameService.saveGameProgress({
          currentLevel: currentLevel,
          score,
          completedWords: [], // 不需要记录已完成的字符
          isCompleted: currentLevel > gameService.getTotalLevels()
        }, 'pronunciation');
      } catch (error) {
        console.error('保存游戏进度失败:', error);
      }
    };
    
    // 当游戏已经初始化后才保存进度（避免覆盖已加载的进度）
    if (isGameStarted) {
      saveProgress();
    }
  }, [currentLevel, score, isGameStarted]);

  // 计算游戏区域尺寸
  const bubblesPerRow = isDesktop ? 7 : isIPad ? 5 : 4;
  const gameAreaWidth = windowWidth - (isDesktop || isIPad ? 48 : 20);
  const bubbleSpacing = HORIZONTAL_GAP;
  const availableWidth = gameAreaWidth - (bubblesPerRow + 1) * bubbleSpacing;
  const calculatedBubbleSize = Math.min(
    availableWidth / bubblesPerRow,
    BUBBLE_SIZE
  );

  // 动态样式
  const dynamicStyles = {
    container: {
      padding: isMacDevice ? 10 : Platform.OS === 'macos' ? 16 : isIPad ? 16 : 10,
    },
    levelTitle: {
      fontSize: isMacDevice ? 18 : Platform.OS === 'macos' ? 28 : isIPad ? 24 : 18,
    },
    desktopLevelTitle: {
      fontSize: isMacDevice ? 20 : Platform.OS === 'macos' ? 32 : isIPad ? 28 : 20,
    },
    scoreText: {
      fontSize: isMacDevice ? 16 : Platform.OS === 'macos' ? 24 : isIPad ? 22 : 16,
    },
    bubbleText: {
      fontSize: isMacDevice ? 26 : Platform.OS === 'macos' ? 46 : isIPad ? 40 : 22,
    },
    currentCharText: {
      fontSize: isMacDevice ? 28 : Platform.OS === 'macos' ? 46 : isIPad ? 40 : 28,
    },
    hintText: {
      fontSize: isMacDevice ? 30 : Platform.OS === 'macos' ? 48 : isIPad ? 36 : 32,
    },
    instructionsText: {
      fontSize: isMacDevice ? 14 : Platform.OS === 'macos' ? 20 : isIPad ? 16 : 13,
      lineHeight: isMacDevice ? 20 : Platform.OS === 'macos' ? 28 : isIPad ? 22 : 18,
    },
    pointsText: {
      fontSize: isMacDevice ? 16 : Platform.OS === 'macos' ? 24 : isIPad ? 20 : 16,
    },
    headerBackButton: {
      fontSize: isMacDevice ? 20 : Platform.OS === 'macos' ? 32 : isIPad ? 28 : 24,
    },
    hintButton: {
      fontSize: isMacDevice ? 20 : Platform.OS === 'macos' ? 32 : isIPad ? 28 : 24,
    },
    soundButtonIcon: {
      fontSize: isMacDevice ? 28 : Platform.OS === 'macos' ? 40 : isIPad ? 36 : 28,
    }
  };

  const renderBubble = (bubble: Bubble) => {
    const floatingTransform = bubble.floatingAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -10]
    });

    const rotation = bubbleRotations[bubble.id]?.interpolate({
      inputRange: [-5, 5],
      outputRange: ['-5deg', '5deg']
    }) || '0deg';

    // 修改气泡渲染方式
    return (
      <Animated.View
        key={bubble.id}
        style={[
          {
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            position: 'absolute',
            left: bubble.position.x,
            top: bubble.position.y,
            transform: [
              { scale: bubble.scale },
              { translateY: floatingTransform },
              { rotate: rotation }
            ],
            opacity: bubble.opacity,
            justifyContent: 'center',
            alignItems: 'center'
          }
        ]}
      >
        <TouchableOpacity
          onPress={() => handleBubblePress(bubble)}
          style={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          activeOpacity={0.8}
        >
          <View style={[
            styles.bubbleShadow, 
            {
              width: BUBBLE_SIZE * 0.95,
              height: BUBBLE_SIZE * 0.95,
              borderRadius: BUBBLE_SIZE / 2
            }
          ]}>
            <LinearGradient
              colors={bubble.colors}
              style={[
                styles.bubbleGradient,
                {
                  borderRadius: BUBBLE_SIZE / 2
                }
              ]}
              start={{ x: 0.2, y: 0.2 }}
              end={{ x: 0.8, y: 0.8 }}
            >
              {/* 反光效果 */}
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0)']}
                style={[styles.reflection, styles.mainReflection]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0)']}
                style={[styles.reflection, styles.secondaryReflection]}
                start={{ x: 1, y: 1 }}
                end={{ x: 0, y: 0 }}
              />
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
              <Text style={[styles.bubbleText, dynamicStyles.bubbleText]}>{bubble.char}</Text>
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <ResponsiveContainer style={{ width: '100%' }} withPadding={false} useMaxWidth={false}>
      <View style={[styles.container, { padding: 0, width: '100%' }]}>
        <View style={[styles.header, isDesktop && styles.desktopHeader, { paddingVertical: isMacDevice ? 4 : 6 }]}>
          <TouchableOpacity
            style={[styles.headerButton, { padding: 4 }]}
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
              {i18n.t('levelTitle', { current: currentLevel, total: gameService.getTotalLevels() })}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.headerButton, { padding: 4 }]}
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

        <View style={[styles.progressSection, { paddingVertical: 4, width: '100%' }]}>
          <View style={[styles.scoreContainer, { marginBottom: 4 }]}>
            <Text style={[styles.scoreText, dynamicStyles.scoreText]}>
              {i18n.t('score', { score })}
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <Animated.View 
              style={[
                styles.progressBar,
                {
                  width: progressBarWidth.interpolate({
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
            width: isDesktop ? '100%' : isIPad ? windowWidth - 20 : windowWidth - 10,
            alignSelf: 'stretch',
            paddingHorizontal: 0,
            paddingBottom: Platform.OS === 'ios' ? 30 : 20,
            paddingTop: 0
          }
        ]}>
          <View style={[
            styles.bubblesContainer, 
            { 
              width: '100%',
              height: GAME_AREA_HEIGHT,
              alignSelf: 'stretch',
              paddingTop: 0,
              paddingBottom: 0
            }
          ]}>
            {bubbles.map(renderBubble)}
          </View>

          <View style={[
            styles.targetArea, 
            isDesktop && styles.desktopTargetArea,
            { 
              bottom: Platform.OS === 'ios' ? 100 : 80,
              width: '100%'
            }
          ]}>
            <View style={styles.targetControls}>
              <TouchableOpacity
                style={[
                  styles.soundButton, 
                  isDesktop && styles.desktopSoundButton,
                  isMacDevice && {
                    padding: 8,
                    borderRadius: 18
                  }
                ]}
                onPress={playCurrentCharSound}
              >
                <MaterialCommunityIcons
                  name="volume-high"
                  size={dynamicStyles.soundButtonIcon.fontSize}
                  color={theme.colors.primary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ResponsiveContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
    width: '100%',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    width: '100%',
  },
  desktopHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  desktopLevelTitle: {
    fontSize: 24,
  },
  gameArea: {
    flex: 1,
    justifyContent: 'space-between',
    width: '100%',
    alignSelf: 'stretch',
    paddingBottom: Platform.OS === 'ios' ? 90 : 70,
    position: 'relative',
  },
  desktopGameArea: {
    paddingBottom: 100,
    alignSelf: 'center',
    width: '100%',
    maxWidth: '100%', // 移除最大宽度限制
  },
  bubblesContainer: {
    flex: 1,
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  targetArea: {
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 0,
    right: 0,
    width: '100%',
  },
  desktopTargetArea: {
    height: 100,
    bottom: 110,
  },
  targetControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    width: '100%',
  },
  soundButton: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  desktopSoundButton: {
    padding: 16,
    borderRadius: 32,
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
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    zIndex: 2,
  },
  bottomContainer: {
    paddingBottom: Platform.OS === 'ios' ? 100 : 80,
    alignItems: 'center',
  },
  currentCharButton: {
    marginBottom: 20,
  },
  speakerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
    backgroundColor: '#fff',
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
  levelCompleteContainer: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 20,
    marginHorizontal: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  levelCompleteGradient: {
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    width: '100%',
  },
  levelCompleteText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 10,
  },
  levelCompleteScore: {
    fontSize: 20,
    color: '#fff',
    marginTop: 10,
  },
  hintButton: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginHorizontal: 15,
  },
  hintButtonDisabled: {
    opacity: 0.5,
  },
  exitButton: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  smallScoreText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 30,
    textAlign: 'center',
  },
}); 