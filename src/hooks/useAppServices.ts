'use client';

import { useContext } from 'react';
import type { AppServices } from 'services/AppServicesContext';
import { AppServicesContext } from 'services/AppServicesContext';

export function useAppServices(): AppServices {
  const ctx = useContext(AppServicesContext);
  if (!ctx) {
    throw new Error('useAppServices must be used inside <AppServicesProvider>');
  }
  return ctx;
}
