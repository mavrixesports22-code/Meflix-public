import { useEffect } from 'react';
import { Platform, BackHandler } from 'react-native';

export type TVRemoteEventType =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'playPause'
  | 'rewind'
  | 'fastForward'
  | 'menu';

interface TVRemoteHandlers {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onSelect?: () => void;
  onPlayPause?: () => void;
  onBack?: () => boolean | void;
}

export function useTVRemote(handlers: TVRemoteHandlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    // 1. Android/TV Back Button Handler
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (handlers.onBack) {
        const handled = handlers.onBack();
        return handled !== false;
      }
      return false;
    });

    // 2. React Native TV Event Handler (if running on TVOS / Android TV)
    let tvSubscription: any = null;
    try {
      // Dynamically access TVEventHandler if present in the runtime
      const ReactNative = require('react-native');
      const TVEventHandler = ReactNative.TVEventHandler;
      if (TVEventHandler) {
        const handler = new TVEventHandler();
        handler.enable(null, (_: any, evt: { eventType: string }) => {
          if (!evt) return;
          switch (evt.eventType) {
            case 'up':
              handlers.onUp?.();
              break;
            case 'down':
              handlers.onDown?.();
              break;
            case 'left':
              handlers.onLeft?.();
              break;
            case 'right':
              handlers.onRight?.();
              break;
            case 'select':
              handlers.onSelect?.();
              break;
            case 'playPause':
              handlers.onPlayPause?.();
              break;
            case 'menu':
              handlers.onBack?.();
              break;
          }
        });
        tvSubscription = handler;
      }
    } catch {
      // Non-TV platform fallback
    }

    return () => {
      backSubscription.remove();
      if (tvSubscription?.disable) {
        try {
          tvSubscription.disable();
        } catch {}
      }
    };
  }, [enabled, handlers]);
}
