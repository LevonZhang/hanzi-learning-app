import React from 'react';
import { SettingsLayout } from './SettingsLayout';
import { GameStatsSection } from './components/GameStatsSection';

export const GameStatsScreen = () => {
  return (
    <SettingsLayout>
      <GameStatsSection />
    </SettingsLayout>
  );
}; 