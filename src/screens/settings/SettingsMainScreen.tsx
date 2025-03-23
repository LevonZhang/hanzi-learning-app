import React from 'react';
import { SettingsLayout } from './SettingsLayout';
import { BasicSettingsSection } from './components/BasicSettingsSection';

export const SettingsMainScreen = () => {
  return (
    <SettingsLayout>
      <BasicSettingsSection />
    </SettingsLayout>
  );
}; 