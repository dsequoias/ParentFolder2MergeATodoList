import React, { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'TodoApp_timeZone';

const getStoredTimeZone = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
  } catch (e) {}
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [timeZone, setTimeZoneState] = useState(getStoredTimeZone);

  const setTimeZone = useCallback((tz) => {
    setTimeZoneState(tz);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, tz);
    } catch (e) {}
  }, []);

  return (
    <SettingsContext.Provider value={{ timeZone, setTimeZone }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

// Common time zones for the picker
export const TIME_ZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (US)' },
  { value: 'America/Chicago', label: 'Central (US)' },
  { value: 'America/Denver', label: 'Mountain (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific (US)' },
  { value: 'America/Phoenix', label: 'Arizona' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Asia/Kolkata', label: 'India' },
];
