import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainLearningScreen } from './src/screens/MainLearningScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen 
          name="MainLearning" 
          component={MainLearningScreen}
          options={{ title: '汉字学习' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
} 