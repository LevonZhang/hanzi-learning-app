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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { i18n } from '../i18n/i18n';
import { gameService, PronunciationChar } from '../services/GameService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { storageService } from '../services/StorageService';
import StatisticsService from '../services/StatisticsService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_AREA_WIDTH = SCREEN_WIDTH - 20;
const GAME_AREA_HEIGHT = SCREEN_HEIGHT * 0.6;
const BUBBLE_SIZE = 80;
const HORIZONTAL_GAP = 5;
const VERTICAL_OVERLAP = -8;
const TOP_MARGIN = 20;
const MAX_HEIGHT = GAME_AREA_HEIGHT * 0.4;

// 修改颜色系统，每个色系使用相同基色的不同深浅和透明度
const BUBBLE_COLORS: readonly [string, string, string][] = [
  ['#FF9AA2', '#FFB7B2', '#FFDAC1'],
  ['#E2F0CB', '#B5EAD7', '#C7CEEA'],
  ['#FF9AA2', '#FFB7B2', '#FFDAC1'],
  ['#E2F0CB', '#B5EAD7', '#C7CEEA'],
];

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
  const [level, setLevel] = useState<GameLevel>(1);
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

  // 生成分层的气球位置
  const generateLayeredPositions = (totalBubbles: number) => {
    const positions: Array<{ x: number; y: number }> = [];
    const bubblesPerRow = Math.floor(GAME_AREA_WIDTH / (BUBBLE_SIZE + HORIZONTAL_GAP));
    let currentY = TOP_MARGIN;
    let remainingBubbles = totalBubbles;
    
    while (remainingBubbles > 0 && currentY < MAX_HEIGHT) {
      const bubblesInThisRow = Math.min(remainingBubbles, bubblesPerRow);
      const rowWidth = bubblesInThisRow * (BUBBLE_SIZE + HORIZONTAL_GAP) - HORIZONTAL_GAP;
      const startX = (GAME_AREA_WIDTH - rowWidth) / 2;
      
      for (let i = 0; i < bubblesInThisRow; i++) {
        const x = startX + i * (BUBBLE_SIZE + HORIZONTAL_GAP);
        const randomOffset = Math.random() * 10 - 5;
        positions.push({
          x: x + randomOffset,
          y: currentY + (Math.random() * 10 - 5)
        });
      }
      
      remainingBubbles -= bubblesInThisRow;
      currentY += BUBBLE_SIZE + VERTICAL_OVERLAP;
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

  const initializeLevel = async () => {
    setIsGameStarted(false);
    gameStartAnim.setValue(0);
    
    const bubbleCount = getLevelBubbleCount(level);
    
    try {
      // 获取拼音数据
      const pronunciationChars = await gameService.getPronunciationCharsForLevel(level);
      
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
      if (shuffledChars.length > 0) {
        updateCurrentChar(shuffledChars[0]);
      }

      // 启动游戏开始动画
      setTimeout(() => {
        setIsGameStarted(true);
        playGameStartAnimation();
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

  const handleBubblePress = async (bubble: Bubble) => {
    if (!currentChar || !isGameStarted) return;

    const isMatch = currentChar.char === bubble.char;

    if (isMatch) {
      if (successSound) {
        try {
          await successSound.setPositionAsync(0);
          await successSound.playAsync();
        } catch (error) {
          console.error('Error playing success sound:', error);
        }
      }
      
      playBubblePopAnimation(bubble);

      setScore(prev => {
        const newScore = prev + 10;
        updateProgressBar(newScore);
        return newScore;
      });
      
      setTimeout(() => {
        setBubbles(prev => {
          const remainingBubbles = prev.filter(b => b.id !== bubble.id);
          // 为剩余的肥皂泡重新生成位置
          const newPositions = generateLayeredPositions(remainingBubbles.length);
          
          // 为每个剩余的肥皂泡分配新位置
          return remainingBubbles.map((b, index) => {
            const newPosition = newPositions[index] || { x: 0, y: 0 };
            
            // 创建位置动画
            Animated.spring(b.floatingAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 50,
              friction: 7,
            }).start();
            
            // 使用动画移动到新位置
            Animated.spring(new Animated.ValueXY({ x: b.position.x, y: b.position.y }), {
              toValue: newPosition,
              useNativeDriver: true,
              tension: 50,
              friction: 7,
            }).start();
            
            return {
              ...b,
              position: newPosition,
            };
          });
        });
        
        const handleGameEnd = async () => {
          if (level === 5) {
            const isNewRecord = await storageService.saveGameScore('pronunciation', score);
            await handleGameComplete(score);
          } else {
            setLevel(prev => (prev + 1) as GameLevel);
          }
        };

        setRemainingChars(prev => {
          const newChars = prev.filter(char => char.char !== currentChar.char);
          if (newChars.length > 0) {
            const nextChar = newChars[0];
            updateCurrentChar(nextChar);
          } else {
            handleGameEnd();
          }
          return newChars;
        });
      }, 300);
    } else {
      if (failureSound) {
        try {
          await failureSound.setPositionAsync(0);
          await failureSound.playAsync();
        } catch (error) {
          console.error('Error playing failure sound:', error);
        }
      }
      
      // 更新分数（错误匹配扣5分）
      setScore(prev => {
        const newScore = Math.max(0, prev - 5);
        updateProgressBar(newScore);
        return newScore;
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

  // 关卡完成动画
  const playLevelCompleteAnimation = () => {
    setShowLevelComplete(true);
    Animated.sequence([
      Animated.spring(levelCompleteAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.delay(1500),
      Animated.timing(levelCompleteAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLevelComplete(false);
      if (level === 5) {
        navigation.goBack();
      } else {
        setLevel(prev => (prev + 1) as GameLevel);
      }
    });
  };

  const handleGameComplete = async (finalScore: number) => {
    try {
      // 更新游戏统计
      await StatisticsService.updateGameScore('pronunciationGame', finalScore);
      
      Alert.alert(
        i18n.t('gameComplete'),
        i18n.t('gameCompleteMessage'),
        [
          {
            text: i18n.t('confirm'),
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Failed to update game score:', error);
    }
  };

  useEffect(() => {
    initializeLevel();
  }, [level]);

  useEffect(() => {
    playLevelTransition();
  }, [level]);

  useEffect(() => {
    playScoreTransition();
  }, [score]);

  const renderBubble = (bubble: Bubble) => {
    const floatingTransform = bubble.floatingAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -10]
    });

    const rotation = bubbleRotations[bubble.id]?.interpolate({
      inputRange: [-5, 5],
      outputRange: ['-5deg', '5deg']
    }) || '0deg';

    return (
      <Animated.View
        key={bubble.id}
        style={[
          styles.bubble,
          {
            transform: [
              { scale: bubble.scale },
              { translateY: floatingTransform },
              { rotate: rotation }
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
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={bubble.colors}
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.levelInfo}>
          <TouchableOpacity
            style={styles.exitButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons 
              name="arrow-left-circle" 
              size={28} 
              color="#4CAF50" 
            />
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: levelTransition }] }}>
            <Text style={styles.levelText}>{i18n.t('level', { level })}</Text>
          </Animated.View>
          
          <TouchableOpacity
            style={[styles.hintButton, isShowingHint && styles.hintButtonDisabled]}
            onPress={showHintAnimation}
            disabled={isShowingHint}
          >
            <MaterialCommunityIcons 
              name="lightbulb" 
              size={24} 
              color={isShowingHint ? '#999' : '#FFD700'} 
            />
          </TouchableOpacity>
        </View>
        <View style={styles.progressContainer}>
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
          <Animated.View style={{ transform: [{ scale: scoreTransition }] }}>
            <Text style={styles.smallScoreText}>{score}</Text>
          </Animated.View>
        </View>
      </View>

      <Animated.View 
        style={[
          styles.gameArea,
          {
            opacity: gameStartAnim,
            transform: [
              {
                translateY: gameStartAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [50, 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={styles.bubblesContainer}>
          {bubbles.map(renderBubble)}
        </View>
      </Animated.View>

      {showLevelComplete && (
        <Animated.View 
          style={[
            styles.levelCompleteContainer,
            {
              opacity: levelCompleteAnim,
              transform: [
                {
                  scale: levelCompleteAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1]
                  })
                }
              ]
            }
          ]}
        >
          <LinearGradient
            colors={['#4CAF50', '#45a049']}
            style={styles.levelCompleteGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons name="star" size={40} color="#FFD700" />
            <Text style={styles.levelCompleteText}>
              {i18n.t('levelComplete', { level })}
            </Text>
            <Text style={styles.levelCompleteScore}>
              {i18n.t('score', { score })}
            </Text>
          </LinearGradient>
        </Animated.View>
      )}

      <View style={styles.bottomContainer}>
        {currentChar && (
          <TouchableOpacity
            style={styles.currentCharButton}
            onPress={() => {
              playCurrentCharSound();
              playCurrentCharAnimation();
            }}
            activeOpacity={0.7}
          >
            <Animated.View style={{
              transform: [
                { translateY: speakerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -5]
                })}
              ]
            }}>
              <LinearGradient
                colors={['#4CAF50', '#45a049']}
                style={styles.speakerButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="volume-high" size={28} color="#fff" />
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>
        )}

        <View style={styles.instructionsContainer}>
          <View style={styles.instructionsBox}>
            <MaterialCommunityIcons name="information" size={16} color="#4CAF50" />
            <Text style={styles.instructionsText}>
              {i18n.t('correctMatch')} +{i18n.t('points', { points: 10 })} | {i18n.t('incorrectMatch')} {i18n.t('points', { points: -5 })} | {i18n.t('useHint')} {i18n.t('points', { points: -2 })}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  levelInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  levelText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
    marginRight: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  gameArea: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  bubblesContainer: {
    width: GAME_AREA_WIDTH,
    height: GAME_AREA_HEIGHT,
    position: 'relative',
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
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instructionsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 15,
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
    maxWidth: '95%',
  },
  instructionsText: {
    color: '#444',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },
  levelCompleteContainer: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
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