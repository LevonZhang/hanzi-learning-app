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
const BUBBLE_SIZE = 60;
const HORIZONTAL_GAP = 10; // 水平间距
const VERTICAL_OVERLAP = -2; // 垂直方向可以稍微重叠

// 定义气球颜色系统
const BALLOON_COLORS = [
  // 红色系
  ['#FF6B6B', '#FF8787', '#FFA5A5'],
  // 蓝色系
  ['#4DABF7', '#74C0FC', '#A5D8FF'],
  // 绿色系
  ['#51CF66', '#69DB7C', '#8CE99A'],
  // 紫色系
  ['#845EF7', '#9775FA', '#B197FC'],
  // 橙色系
  ['#FFB84D', '#FFC774', '#FFD8A8'],
  // 粉色系
  ['#FF8FAB', '#FFA8C0', '#FFC2D6'],
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
}

export const BubbleMatchingScreen = ({ navigation, route }: BubbleMatchingScreenProps) => {
  const [level, setLevel] = useState<GameLevel>(1);
  const [score, setScore] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const [remainingFirstChars, setRemainingFirstChars] = useState<string[]>([]);
  const gameMode = route.params.mode;
  const [successSound, setSuccessSound] = useState<Audio.Sound | null>(null);
  const [failureSound, setFailureSound] = useState<Audio.Sound | null>(null);

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

  const initializeLevel = async () => {
    const bubbleCount = getLevelBubbleCount(level);
    let newBubbles: Bubble[] = [];
    let usedColorIndices = new Set<number>();
    
    // 获取词组数据
    const wordPairs = gameService.getWordPairsForLevel(level);
    console.log('获取到的词组:', wordPairs);
    
    // 预先生成所有位置（为第一个字生成位置，它们会显示在顶部）
    const positions = generateLayeredPositions(wordPairs.length);

    // 收集所有第二个字和它们对应可以组成的词
    const secondChars = wordPairs.map(pair => {
      console.log('词组拆分:', pair.word, '=>', pair.characters[1], '+', pair.characters[0]);
      return {
        char: pair.characters[1],
        word: pair.word
      };
    });
    setRemainingFirstChars(secondChars.map(item => item.char));

    // 创建第一个字的气球（显示在顶部）
    newBubbles = wordPairs.map((pair, index) => {
      const colorIndex = index % BALLOON_COLORS.length;
      const position = positions[index] || { x: 0, y: 0 };

      const bubble = {
        id: `${pair.word}-first`,
        char: pair.characters[0],
        scale: new Animated.Value(1),
        opacity: new Animated.Value(1),
        matches: [pair.characters[1]], // 匹配的是第二个字
        word: pair.word, // 保存完整词组信息
        colors: BALLOON_COLORS[colorIndex],
        position,
        isSecondChar: false
      };
      console.log('创建气球:', bubble.char, '可以匹配:', bubble.matches, '组成词:', bubble.word);
      return bubble;
    });

    setBubbles(newBubbles);
    
    // 设置第一个要匹配的字（第二个字）
    if (secondChars.length > 0) {
      const secondChar = secondChars[0].char;
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

  const handleBubblePress = async (bubble: Bubble) => {
    if (!currentChar || bubble.isSecondChar) return;

    console.log('尝试匹配:', currentChar, '+', bubble.char);
    console.log('气球可匹配的字:', bubble.matches);

    const isMatch = bubble.matches.includes(currentChar);
    console.log('是否匹配:', isMatch);

    if (isMatch) {
      console.log('匹配成功！组成词组:', bubble.word);
      // 播放成功音效
      if (successSound) {
        try {
          await successSound.setPositionAsync(0);
          await successSound.playAsync();
        } catch (error) {
          console.error('Error playing success sound:', error);
        }
      }

      // 播放爆炸动画
      playBubblePopAnimation(bubble);

      // 更新分数
      setScore(prev => prev + 10);
      
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
      // 播放失败音效
      if (failureSound) {
        try {
          await failureSound.setPositionAsync(0);
          await failureSound.playAsync();
        } catch (error) {
          console.error('Error playing failure sound:', error);
        }
      }

      // 扣分
      setScore(prev => Math.max(0, prev - 5));
    }
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
              { scale: bubble.scale }
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
            style={styles.balloonGradient}
            start={{ x: 0.2, y: 0.2 }}
            end={{ x: 0.8, y: 0.8 }}
          >
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
        <Text style={styles.scoreText}>{i18n.t('score', { score })}</Text>
      </View>

      <View style={styles.gameArea}>
        <View style={styles.bubblesContainer}>
          {bubbles.map(renderBubble)}
        </View>

        <View style={styles.targetArea}>
          <LinearGradient
            colors={['rgba(0, 122, 255, 0.9)', 'rgba(0, 122, 255, 0.7)']}
            style={styles.currentCharContainer}
            start={{ x: 0.2, y: 0.2 }}
            end={{ x: 0.8, y: 0.8 }}
          >
            <Text style={styles.currentCharText}>{currentChar}</Text>
          </LinearGradient>
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
    paddingBottom: 50,
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
  balloonGradient: {
    width: BUBBLE_SIZE - 6,
    height: BUBBLE_SIZE - 6,
    borderRadius: BUBBLE_SIZE / 2,
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
  bubbleText: {
    fontSize: 24, // 减小文字大小
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  targetArea: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentCharContainer: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
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
  currentCharText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
}); 