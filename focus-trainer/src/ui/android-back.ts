import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { handleBackButton } from './back-rule';
import type { Route } from './router';

export async function registerBackButton(getRoute: () => Route): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  await App.addListener('backButton', () => {
    handleBackButton(getRoute(), {
      confirm: (message) => confirm(message),
      back: () => history.back(),
      minimize: () => void App.minimizeApp(),
      historyDepth: history.length,
    });
  });
}
