import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { CharacterLearning } from '../components/CharacterLearning';

const SAMPLE_CHARACTERS = ['我', '你', '好', '学', '习'];

export const MainLearningScreen = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <SafeAreaView style={styles.container}>
      <CharacterLearning 
        character={SAMPLE_CHARACTERS[currentIndex]}
        onComplete={() => {
          // 动画完成后的逻辑
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
}); 