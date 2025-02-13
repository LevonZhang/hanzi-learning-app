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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { i18n } from '../i18n/i18n';
import { gameService, WordPair, PronunciationChar } from '../services/GameService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_AREA_WIDTH = SCREEN_WIDTH - 20;
const GAME_AREA_HEIGHT = SCREEN_HEIGHT * 0.6;
const BUBBLE_SIZE = 80;
const HORIZONTAL_GAP = 5; // 减小水平间距
const VERTICAL_OVERLAP = -8; // 增加垂直重叠

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
  isSecondChar: boolean; // 标记是否是词组的第二个字
  word: string; // 保存完整词组信息
  floatingAnim: Animated.Value; // 添加漂浮动画值
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
  const [level, setLevel] = useState<GameLevel>(1);
  const [score, setScore] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const [remainingFirstChars, setRemainingFirstChars] = useState<string[]>([]);
  const [isShowingHint, setIsShowingHint] = useState(false);
  const gameMode = route.params.mode;
  const [successSound, setSuccessSound] = useState<Audio.Sound | null>(null);
  const [failureSound, setFailureSound] = useState<Audio.Sound | null>(null);
  const [maxScore, setMaxScore] = useState(0);
  const progressWidth = useState(new Animated.Value(0))[0];
  const floatingAnimation = useState(new Animated.Value(0))[0];

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
    let currentY = 10; // 起始y坐标（距离顶部的距离）
    let remainingBubbles = totalBubbles;
    
    while (remainingBubbles > 0) {
      // 计算当前行可以放置的气球数量
      const bubblesInThisRow = Math.min(remainingBubbles, bubblesPerRow);
      // 计算当前行的起始x坐标，使这一行气球居中
      const rowWidth = bubblesInThisRow * (BUBBLE_SIZE + HORIZONTAL_GAP) - HORIZONTAL_GAP;
      const startX = (GAME_AREA_WIDTH - rowWidth) / 2;
      
      // 在当前行放置气球
      for (let i = 0; i < bubblesInThisRow; i++) {
        const x = startX + i * (BUBBLE_SIZE + HORIZONTAL_GAP);
        // 在x坐标上添加一点随机偏移，使排列不那么规则
        const randomOffset = Math.random() * 10 - 5; // -5到5的随机偏移
        positions.push({
          x: x + randomOffset,
          y: currentY
        });
      }
      
      // 更新剩余气球数量和下一行的y坐标
      remainingBubbles -= bubblesInThisRow;
      currentY += BUBBLE_SIZE + VERTICAL_OVERLAP; // 下一行向下移动，可以稍微重叠
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
    const bubbleCount = getLevelBubbleCount(level);
    let newBubbles: Bubble[] = [];
    
    // 获取词组数据
    const wordPairs = gameService.getWordPairsForLevel(level);
    console.log('获取到的词组:', wordPairs);
    
    // 过滤掉无效的词组（确保每个词组都有有效的字符）
    const validWordPairs = wordPairs.filter(pair => 
      pair.characters.length === 2 && 
      pair.characters[0] && 
      pair.characters[1] && 
      pair.word
    );
    
    if (validWordPairs.length === 0) {
      console.warn(`Level ${level} has no valid word pairs`);
      // 如果当前关卡没有有效词组，直接进入下一关或结束游戏
      if (level === 5) {
        Alert.alert(i18n.t('gameComplete'), i18n.t('gameCompleteMessage'));
        navigation.goBack();
      } else {
        setLevel(prev => (prev + 1) as GameLevel);
      }
      return;
    }
    
    // 计算所有关卡的总分（每个词组10分）
    let totalMaxScore = 0;
    for (let i = 1; i <= 5; i++) {
      const levelPairs = gameService.getWordPairsForLevel(i as GameLevel);
      const validPairs = levelPairs.filter(pair => 
        pair.characters.length === 2 && 
        pair.characters[0] && 
        pair.characters[1] && 
        pair.word
      );
      totalMaxScore += validPairs.length * 10;
    }
    setMaxScore(totalMaxScore);
    
    // 预先生成所有位置
    const positions = generateLayeredPositions(validWordPairs.length);

    // 收集所有第二个字和它们对应可以组成的词
    const secondChars = validWordPairs.map(pair => ({
      char: pair.characters[1],
      word: pair.word
    }));

    // 随机打乱第二个字的顺序
    const shuffledSecondChars = shuffleArray(secondChars);
    setRemainingFirstChars(shuffledSecondChars.map(item => item.char));

    // 创建气泡（第一个字），并随机打乱顺序
    const firstChars = validWordPairs.map((pair, index) => {
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

    // 随机打乱第一个字的顺序
    newBubbles = shuffleArray(firstChars);

    setBubbles(newBubbles);
    
    // 设置第一个要匹配的字
    if (shuffledSecondChars.length > 0) {
      const secondChar = shuffledSecondChars[0].char;
      console.log('设置当前要匹配的字:', secondChar);
      setCurrentChar(secondChar);
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
    // 确保分数不为负数
    const validScore = Math.max(0, newScore);
    const progressPercentage = (validScore / maxScore) * 100;
    
    Animated.spring(progressWidth, {
      toValue: progressPercentage,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  };

  const handleBubblePress = async (bubble: Bubble) => {
    if (!currentChar || bubble.isSecondChar) return;

    console.log('尝试匹配:', currentChar, '+', bubble.char);

    // 检查这两个字是否能组成词组
    const canFormWord = bubbles.some(b => {
      const word1 = bubble.char + currentChar;
      const word2 = currentChar + bubble.char;
      return b.word === word1 || b.word === word2;
    });

    console.log('是否能组成词组:', canFormWord);

    if (canFormWord) {
      console.log('匹配成功！');
      if (successSound) {
        try {
          await successSound.setPositionAsync(0);
          await successSound.playAsync();
        } catch (error) {
          console.error('Error playing success sound:', error);
        }
      }
      
      playBubblePopAnimation(bubble);

      // 更新分数（正确配对加10分）
      setScore(prev => {
        const newScore = prev + 10;
        updateProgressBar(newScore);
        return newScore;
      });
      
      // 等待动画完成后移除气球
      setTimeout(() => {
        setBubbles(prev => prev.filter(b => b.id !== bubble.id));
        
        // 移除已使用的第一个字
        setRemainingFirstChars(prev => {
          const newChars = prev.filter(char => char !== currentChar);
          console.log('剩余待匹配的字:', newChars);
          // 设置下一个要匹配的字
          if (newChars.length > 0) {
            const nextChar = newChars[0];
            console.log('设置下一个要匹配的字:', nextChar);
            setCurrentChar(nextChar);
          } else {
            console.log('所有字都已匹配完成');
            // 如果没有剩余的字了，检查是否要进入下一关
            if (level === 5) {
              Alert.alert(i18n.t('gameComplete'), i18n.t('gameCompleteMessage'));
              navigation.goBack();
            } else {
              setLevel(prev => (prev + 1) as GameLevel);
            }
          }
          return newChars;
        });
      }, 300);
    } else {
      console.log('匹配失败');
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

  useEffect(() => {
    initializeLevel();
  }, [level]);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.levelText}>{i18n.t('level', { level })}</Text>
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
        <Text style={styles.scoreText}>{i18n.t('score', { score })}</Text>
      </View>

      {/* 添加进度条 */}
      <View style={styles.progressContainer}>
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
            {i18n.t('correctMatch')} +{i18n.t('points', { points: 10 })} | {i18n.t('incorrectMatch')} {i18n.t('points', { points: -5 })} | {i18n.t('useHint')} {i18n.t('points', { points: -2 })}
          </Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    backgroundColor: 'transparent',
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
  hintButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  hintButtonDisabled: {
    opacity: 0.5,
  },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    marginHorizontal: 20,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
    // 添加渐变效果
    shadowColor: '#4CAF50',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 70, // 将提示信息容器位置往上移动
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instructionsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start', // 改为flex-start以便更好地处理多行文本
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
    maxWidth: '95%', // 限制最大宽度
  },
  instructionsText: {
    color: '#444',
    fontSize: 13,
    fontWeight: '500',
    flex: 1, // 添加flex: 1使文本能够正确换行
    lineHeight: 18, // 添加行高使多行文本更易读
  },
}); 