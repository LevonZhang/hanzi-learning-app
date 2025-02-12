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
import { i18n } from '../i18n/i18n';
import { gameService, WordPair, PronunciationChar } from '../services/GameService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type GameMode = 'word' | 'pronunciation';
type GameLevel = 1 | 2 | 3 | 4 | 5;

type GameStackParamList = {
  GamesList: undefined;
  WordGame: { mode: 'word' };
  PronunciationGame: { mode: 'pronunciation' };
};

type BubbleMatchingScreenProps = NativeStackScreenProps<GameStackParamList, 'WordGame' | 'PronunciationGame'>;

interface Bubble {
  id: string;
  char: string;
  position: Animated.ValueXY;
  scale: Animated.Value;
  rotation: Animated.Value;
  matches: string[];
}

export const BubbleMatchingScreen = ({ navigation, route }: BubbleMatchingScreenProps) => {
  const [level, setLevel] = useState<GameLevel>(1);
  const [score, setScore] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  const gameMode = route.params.mode;

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

  const createBubbleAnimations = (bubble: Bubble) => {
    // 创建漂浮动画
    Animated.loop(
      Animated.sequence([
        Animated.timing(bubble.position.y, {
          toValue: -30,
          duration: 2000 + Math.random() * 1000,
          useNativeDriver: true,
        }),
        Animated.timing(bubble.position.y, {
          toValue: 0,
          duration: 2000 + Math.random() * 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 创建旋转动画
    Animated.loop(
      Animated.sequence([
        Animated.timing(bubble.rotation, {
          toValue: 1,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(bubble.rotation, {
          toValue: -1,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 创建缩放动画
    Animated.loop(
      Animated.sequence([
        Animated.timing(bubble.scale, {
          toValue: 1.1,
          duration: 1500 + Math.random() * 500,
          useNativeDriver: true,
        }),
        Animated.timing(bubble.scale, {
          toValue: 1,
          duration: 1500 + Math.random() * 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const initializeLevel = async () => {
    const bubbleCount = getLevelBubbleCount(level);
    let newBubbles: Bubble[] = [];

    if (gameMode === 'word') {
      const wordPairs = gameService.getWordPairsForLevel(level);
      newBubbles = wordPairs.flatMap(pair => pair.characters.map((char, index) => ({
        id: `${pair.word}-${index}`,
        char,
        position: new Animated.ValueXY({
          x: Math.random() * (SCREEN_WIDTH - 100),
          y: Math.random() * (SCREEN_HEIGHT / 2),
        }),
        scale: new Animated.Value(1),
        rotation: new Animated.Value(0),
        matches: gameService.getMatchesForChar(char, 'word'),
      })));

      // 随机选择一个字符作为目标
      const randomBubble = newBubbles[Math.floor(Math.random() * newBubbles.length)];
      setCurrentTarget(randomBubble.matches[Math.floor(Math.random() * randomBubble.matches.length)]);
    } else {
      const pronunciationChars = gameService.getPronunciationCharsForLevel(level);
      newBubbles = pronunciationChars.map((charData, index) => ({
        id: `${charData.char}-${index}`,
        char: charData.char,
        position: new Animated.ValueXY({
          x: Math.random() * (SCREEN_WIDTH - 100),
          y: Math.random() * (SCREEN_HEIGHT / 2),
        }),
        scale: new Animated.Value(1),
        rotation: new Animated.Value(0),
        matches: gameService.getMatchesForChar(charData.char, 'pronunciation'),
      }));

      // 随机选择一个发音字符作为目标
      const randomChar = pronunciationChars[Math.floor(Math.random() * pronunciationChars.length)];
      setCurrentTarget(randomChar.char);
      if (gameMode === 'pronunciation') {
        await gameService.playCharacterSound(randomChar.char);
      }
    }

    newBubbles.forEach(createBubbleAnimations);
    setBubbles(newBubbles);
  };

  const handleBubblePress = async (bubble: Bubble) => {
    if (!currentTarget) return;

    if (bubble.matches.includes(currentTarget)) {
      // 配对成功
      setScore(prev => prev + 10);
      setBubbles(prev => prev.filter(b => b.id !== bubble.id));
      
      if (bubbles.length === 1) {
        // 关卡完成
        if (level === 5) {
          Alert.alert(i18n.t('gameComplete'), i18n.t('gameCompleteMessage'));
          navigation.goBack();
        } else {
          setLevel(prev => (prev + 1) as GameLevel);
        }
      }
    } else {
      // 配对失败
      setScore(prev => Math.max(0, prev - 5));
    }
  };

  const playPronunciation = async () => {
    if (currentTarget) {
      await gameService.playCharacterSound(currentTarget);
    }
  };

  useEffect(() => {
    initializeLevel();
  }, [level]);

  const renderBubble = (bubble: Bubble) => {
    const spin = bubble.rotation.interpolate({
      inputRange: [-1, 1],
      outputRange: ['-30deg', '30deg'],
    });

    return (
      <Animated.View
        key={bubble.id}
        style={[
          styles.bubble,
          {
            transform: [
              { translateX: bubble.position.x },
              { translateY: bubble.position.y },
              { scale: bubble.scale },
              { rotate: spin },
            ],
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => handleBubblePress(bubble)}
          style={styles.bubbleContent}
        >
          <Text style={styles.bubbleText}>{bubble.char}</Text>
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
          {gameMode === 'pronunciation' ? (
            <TouchableOpacity
              style={styles.soundButton}
              onPress={playPronunciation}
            >
              <MaterialCommunityIcons name="volume-high" size={32} color="#fff" />
            </TouchableOpacity>
          ) : (
            <Text style={styles.targetText}>{currentTarget}</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
    paddingTop: 50,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  levelText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a90e2',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a90e2',
  },
  gameArea: {
    flex: 1,
    position: 'relative',
    marginBottom: 20,
  },
  bubblesContainer: {
    flex: 1,
    padding: 20,
  },
  bubble: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  bubbleContent: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  bubbleText: {
    fontSize: 24,
    color: '#333',
    fontWeight: 'bold',
  },
  targetArea: {
    height: 80,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  targetText: {
    fontSize: 32,
    color: '#333',
    fontWeight: 'bold',
  },
  soundButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4a90e2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
}); 