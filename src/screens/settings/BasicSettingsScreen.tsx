import React from 'react';
import { SettingsLayout } from './SettingsLayout';
import { BasicSettingsSection } from './components/BasicSettingsSection';

export const BasicSettingsScreen = () => {
  return (
    <SettingsLayout>
      <BasicSettingsSection />
    </SettingsLayout>
  );
}; 