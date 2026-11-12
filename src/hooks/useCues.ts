import { useCallback, useState } from 'react';

const SOUND = 'wc:sound';
const VIBRATE = 'wc:vibrate';

const read = (key: string) => localStorage.getItem(key) !== '0';

/** The two notification switches, both on by default and remembered. */
export function useCues(): {
  sound: boolean;
  vibrate: boolean;
  toggleSound: () => void;
  toggleVibrate: () => void;
} {
  const [sound, setSound] = useState(() => read(SOUND));
  const [vibrate, setVibrate] = useState(() => read(VIBRATE));

  const toggleSound = useCallback(() => {
    setSound((prev) => {
      localStorage.setItem(SOUND, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  const toggleVibrate = useCallback(() => {
    setVibrate((prev) => {
      localStorage.setItem(VIBRATE, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  return { sound, vibrate, toggleSound, toggleVibrate };
}
