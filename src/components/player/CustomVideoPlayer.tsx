import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  ActivityIndicator,
  Pressable,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { useVideoPlayer, VideoView, AudioTrack, SubtitleTrack } from 'expo-video';
import { Colors } from '../../theme/colors';
import { TitleItem, Episode } from '../../types';
import { historyService } from '../../services/historyService';
import { netmirrorService, PlaybackSource, AuthInfo } from '../../services/netmirrorService';
import { Focusable } from '../common/Focusable';
import {
  PlayIcon,
  PauseIcon,
  Rewind10Icon,
  Forward10Icon,
  BackIcon,
  MinimizeIcon,
  EpisodesIcon,
  CloseIcon,
  CheckIcon,
  LockIcon,
  UnlockIcon,
  SpeedIcon,
  AudioSubtitlesIcon,
  NextEpisodeIcon,
  AspectFitIcon,
  BrightnessIcon,
} from '../common/Icons';

const LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  eng: 'English',
  hi: 'Hindi',
  hin: 'Hindi',
  ta: 'Tamil',
  tam: 'Tamil',
  te: 'Telugu',
  tel: 'Telugu',
  ml: 'Malayalam',
  mal: 'Malayalam',
  kn: 'Kannada',
  kan: 'Kannada',
  es: 'Spanish',
  spa: 'Spanish',
  fr: 'French',
  fra: 'French',
  de: 'German',
  ger: 'German',
  deu: 'German',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  zh: 'Chinese',
  zho: 'Chinese',
  ar: 'Arabic',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
};

const getTrackKey = (track: AudioTrack | SubtitleTrack, index?: number): string => {
  if (track.id && track.id.trim()) return track.id.trim();
  const lang = (track.language || '').trim().toLowerCase();
  const lbl = (track.label || (track as any).name || '').trim().toLowerCase();
  return `${lang}_${lbl}_${index ?? ''}`;
};

const matchAudioTrack = (tracks: AudioTrack[], pref: string): AudioTrack | undefined => {
  const p = pref.toLowerCase().trim();
  return tracks.find((t, i) => {
    const l = (t.language || '').toLowerCase().trim();
    const lbl = (t.label || t.name || '').toLowerCase().trim();
    const key = getTrackKey(t, i).toLowerCase();
    return (
      key === p ||
      l === p ||
      lbl.includes(p) ||
      p.includes(lbl) ||
      (LANGUAGE_MAP[l] && LANGUAGE_MAP[l].toLowerCase() === p) ||
      (LANGUAGE_MAP[l] && p.includes(LANGUAGE_MAP[l].toLowerCase()))
    );
  });
};

const matchSubtitleTrack = (tracks: SubtitleTrack[], pref: string): SubtitleTrack | undefined => {
  const p = pref.toLowerCase().replace(/\[cc\]/g, '').trim();
  return tracks.find((t, i) => {
    const l = (t.language || '').toLowerCase().trim();
    const lbl = (t.label || t.name || '').toLowerCase().trim();
    const key = getTrackKey(t, i).toLowerCase();
    return (
      key === p ||
      l === p ||
      lbl.includes(p) ||
      p.includes(lbl) ||
      (LANGUAGE_MAP[l] && LANGUAGE_MAP[l].toLowerCase() === p) ||
      (LANGUAGE_MAP[l] && p.includes(LANGUAGE_MAP[l].toLowerCase()))
    );
  });
};

const formatAudioLabel = (track: AudioTrack, index: number): string => {
  if (track.label && track.label.trim()) return track.label.trim();
  const lang = (track.language || '').toLowerCase().trim();
  if (lang && LANGUAGE_MAP[lang]) return LANGUAGE_MAP[lang];
  if (lang) return lang.toUpperCase();
  return `Audio Track ${index + 1}`;
};

const formatSubtitleLabel = (track: SubtitleTrack, index: number): string => {
  if (track.label && track.label.trim()) return track.label.trim();
  if (track.name && track.name.trim()) return track.name.trim();
  const lang = (track.language || '').toLowerCase().trim();
  if (lang && LANGUAGE_MAP[lang]) return LANGUAGE_MAP[lang];
  if (lang) return lang.toUpperCase();
  return `Subtitle ${index + 1}`;
};

interface CustomVideoPlayerProps {
  item: TitleItem | null;
  initialEpisode?: Episode;
  initialResumePosition?: number;
  visible: boolean;
  onClose: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  item,
  initialEpisode,
  initialResumePosition,
  visible,
  onClose,
  isMinimized,
  onToggleMinimize,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 600;

  const [resolvedItem, setResolvedItem] = useState<TitleItem | null>(item);
  const [currentEp, setCurrentEp] = useState<Episode | undefined>(initialEpisode);
  const [episodesList, setEpisodesList] = useState<Episode[]>(item?.episodes || []);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showHud, setShowHud] = useState(true);

  // Netflix Mobile APK Features
  const [isLocked, setIsLocked] = useState(false);
  const [showLockedPill, setShowLockedPill] = useState(false);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoFit, setVideoFit] = useState<'contain' | 'cover'>('cover');
  const [aspectToast, setAspectToast] = useState<string | null>(null);
  const [brightness, setBrightness] = useState<number>(1.0);
  const [showBrightnessPill, setShowBrightnessPill] = useState<boolean>(false);
  const [activeLanguageTab, setActiveLanguageTab] = useState<'audio' | 'subtitles'>('audio');
  const [audioTracksList, setAudioTracksList] = useState<AudioTrack[]>([]);
  const [subtitleTracksList, setSubtitleTracksList] = useState<SubtitleTrack[]>([]);
  const [selectedAudioKey, setSelectedAudioKey] = useState<string>('default');
  const [selectedSubtitleKey, setSelectedSubtitleKey] = useState<string>('off');
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);

  // NetMirror backend playback & auth state
  const [resolvedStream, setResolvedStream] = useState<PlaybackSource | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<string>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const hudTimerRef = useRef<any>(null);
  const lockedPillTimeoutRef = useRef<any>(null);
  const doubleTapTimerRef = useRef<any>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const singleTapTimeoutRef = useRef<any>(null);
  const selectedAudioPrefRef = useRef<string>('');
  const selectedSubtitlePrefRef = useRef<string>('off');
  const brightnessRef = useRef<number>(1.0);
  const initialBrightnessRef = useRef<number>(1.0);
  const brightnessPillTimeoutRef = useRef<any>(null);
  const aspectToastTimeoutRef = useRef<any>(null);
  const handleScreenTouchRef = useRef<(evt: any) => void>(() => {});

  // Seamless auto-retry refs for background stream recovery without intrusive error dialogs
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<any>(null);
  const currentTimeRef = useRef<number>(0);
  const itemRef = useRef<TitleItem | null>(item);
  const resolvedItemRef = useRef<TitleItem | null>(resolvedItem);
  const currentEpRef = useRef<Episode | undefined>(currentEp);

  itemRef.current = item;
  resolvedItemRef.current = resolvedItem;
  currentEpRef.current = currentEp;
  currentTimeRef.current = currentTime;

  // Dedicated vertical brightness slider pan responder (Netflix APK PlayerMainControlsSlot.BrightnessSlider)
  const brightnessPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 3,
      onPanResponderGrant: () => {
        initialBrightnessRef.current = brightnessRef.current;
        setShowBrightnessPill(true);
        if (brightnessPillTimeoutRef.current) clearTimeout(brightnessPillTimeoutRef.current);
      },
      onPanResponderMove: (_, gestureState) => {
        const delta = -gestureState.dy / 160;
        const next = Math.max(0.1, Math.min(1.0, initialBrightnessRef.current + delta));
        setBrightness(next);
        brightnessRef.current = next;
        setShowBrightnessPill(true);
      },
      onPanResponderRelease: () => {
        if (brightnessPillTimeoutRef.current) clearTimeout(brightnessPillTimeoutRef.current);
        brightnessPillTimeoutRef.current = setTimeout(() => {
          setShowBrightnessPill(false);
        }, 1400);
      },
    })
  ).current;

  // Screen surface pan responder: handles vertical drag on left 45% for brightness, and taps for HUD/Seek
  const screenPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const startX = gestureState.x0;
        return (
          startX < width * 0.45 &&
          Math.abs(gestureState.dy) > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        );
      },
      onPanResponderGrant: evt => {
        const touchX = evt.nativeEvent.pageX;
        if (touchX < width * 0.45) {
          initialBrightnessRef.current = brightnessRef.current;
        }
      },
      onPanResponderMove: (_, gestureState) => {
        const startX = gestureState.x0;
        if (startX < width * 0.45 && Math.abs(gestureState.dy) > 6) {
          const delta = -gestureState.dy / 180;
          const next = Math.max(0.1, Math.min(1.0, initialBrightnessRef.current + delta));
          setBrightness(next);
          brightnessRef.current = next;
          setShowBrightnessPill(true);
          if (brightnessPillTimeoutRef.current) clearTimeout(brightnessPillTimeoutRef.current);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10) {
          handleScreenTouchRef.current(evt);
        } else {
          if (brightnessPillTimeoutRef.current) clearTimeout(brightnessPillTimeoutRef.current);
          brightnessPillTimeoutRef.current = setTimeout(() => {
            setShowBrightnessPill(false);
          }, 1400);
        }
      },
    })
  ).current;

  // Initialize expo-video player with null source initially.
  // Passing null prevents iOS AVFoundation from trying to open file:/// and throwing audio/subtitle track warnings.
  const player = useVideoPlayer(null, p => {
    p.loop = true;
  });

  // Calculate Next Episode
  const episodes = episodesList.length > 0 ? episodesList : item?.episodes || [];
  const currentEpIndex = episodes.findIndex(
    ep => currentEp && (ep.netmirrorId === currentEp.netmirrorId || ep.num === currentEp.num)
  );
  const nextEp =
    currentEpIndex >= 0 && currentEpIndex + 1 < episodes.length
      ? episodes[currentEpIndex + 1]
      : null;

  // Seamless Resolver: Matches netmirror-player.js architecture
  const loadStream = useCallback(
    async (
      targetItem: TitleItem,
      episodeToPlay?: Episode,
      resumePos?: number,
      isSilentRetry = false
    ) => {
      if (!isSilentRetry) {
        setIsLoadingStream(true);
        setStreamError(null);
      }
      setIsBuffering(true);
      setShowAuthForm(false);
      setAuthError(null);

      try {
        // Look up saved resume position if not passed explicitly
        let targetResume = resumePos;
        if (targetResume === undefined) {
          const cleanId = (targetItem.netmirrorId || targetItem.id).replace(/^nm-/, '');
          const saved = historyService.forTitle(cleanId);
          if (saved && !saved.completed && saved.position >= 5) {
            targetResume = saved.position;
            if (!episodeToPlay && saved.playId) {
              episodeToPlay = {
                id: 'ep-' + saved.playId,
                netmirrorId: saved.playId,
                num: 1,
                title: saved.episode || 'Episode',
              };
            }
          }
        }

        const resolution = await netmirrorService.resolvePlayableTitle(
          targetItem,
          episodeToPlay,
          targetResume,
          isSilentRetry // Invalidate token and get fresh signed CDN URL on retry
        );

        setResolvedStream(resolution.source);
        setResolvedItem(resolution.item);
        setCurrentEp(resolution.currentEpisode);
        if (resolution.allEpisodes && resolution.allEpisodes.length > 0) {
          setEpisodesList(resolution.allEpisodes);
        }
        setIsLoadingStream(false);

        if (player) {
          await player.replaceAsync({
            uri: resolution.source.url,
            headers: resolution.source.headers,
            contentType: 'hls',
          });

          // Sync tracks if immediately available from manifest
          if (player.availableAudioTracks && player.availableAudioTracks.length > 0) {
            setAudioTracksList(player.availableAudioTracks);
          }
          if (player.availableSubtitleTracks && player.availableSubtitleTracks.length > 0) {
            setSubtitleTracksList(player.availableSubtitleTracks);
          }

          // Resume playback position seamlessly if saved
          const resumeTo = resolution.resumePosition || targetResume || 0;
          if (resumeTo > 5) {
            player.currentTime = resumeTo;
            setCurrentTime(resumeTo);
            currentTimeRef.current = resumeTo;
          } else {
            player.currentTime = 0;
            setCurrentTime(0);
            currentTimeRef.current = 0;
          }

          player.play();
          setIsPlaying(true);
        }
      } catch (err: any) {
        setIsLoadingStream(false);
        if (err.code === 'AUTH_REQUIRED') {
          setIsBuffering(false);
          setShowAuthForm(true);
          try {
            const info = await netmirrorService.getAuthInstructions();
            setAuthInfo(info);
          } catch {}
        } else if (isSilentRetry && retryCountRef.current < 4) {
          // Keep buffering spinner active, keep error hidden, schedule next silent retry
          setIsBuffering(true);
          setStreamError(null);
          retryCountRef.current += 1;
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            loadStream(targetItem, episodeToPlay, resumePos, true);
          }, retryCountRef.current * 900);
        } else {
          setIsBuffering(false);
          setStreamError('Playback is temporarily unavailable. Please tap Retry to try again.');
        }
      }
    },
    [player]
  );

  // Trigger stream resolution when player becomes visible or target item/episode changes
  useEffect(() => {
    if (!visible || !item) {
      setResolvedStream(null);
      if (player) {
        try {
          player.pause();
          player.replaceAsync(null);
        } catch {}
      }
      return;
    }

    setResolvedItem(item);
    setEpisodesList(item.episodes || []);
    setCurrentEp(initialEpisode);
    loadStream(item, initialEpisode, initialResumePosition);
  }, [visible, item, initialEpisode, initialResumePosition, loadStream]);

  // Handle OTP authentication submission
  const handleConnectAuth = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await netmirrorService.authenticate(otpCode);
      setShowAuthForm(false);
      setIsAuthenticating(false);
      const currentTarget = resolvedItem || item;
      if (currentTarget) {
        await loadStream(currentTarget, currentEp, initialResumePosition);
      }
    } catch (err: any) {
      setIsAuthenticating(false);
      setAuthError(err.message || 'Invalid login code. Check the code and retry.');
    }
  };

  // Keep player status & events synchronized
  useEffect(() => {
    if (!player) return;

    const subStatus = player.addListener('statusChange', payload => {
      setPlayerStatus(payload.status);
      if (payload.status === 'readyToPlay') {
        retryCountRef.current = 0;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        setStreamError(null);
        setIsBuffering(false);
        if (player.availableAudioTracks && player.availableAudioTracks.length > 0) {
          setAudioTracksList(player.availableAudioTracks);
        }
        if (player.availableSubtitleTracks && player.availableSubtitleTracks.length > 0) {
          setSubtitleTracksList(player.availableSubtitleTracks);
        }
      } else if (payload.status === 'loading') {
        setIsBuffering(true);
      } else if (payload.status === 'error') {
        // Intercept CoreMediaErrorDomain -16190 or transient AVPlayer failure:
        // Keep error screen completely hidden, keep buffering indicator spinning,
        // and silently re-resolve stream in the background.
        if (retryCountRef.current < 4) {
          retryCountRef.current += 1;
          setIsBuffering(true);
          setStreamError(null);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          const backoff = retryCountRef.current * 800;
          retryTimerRef.current = setTimeout(() => {
            const currentTarget = resolvedItemRef.current || itemRef.current;
            if (currentTarget) {
              const resumeTo = currentTimeRef.current > 5 ? currentTimeRef.current : initialResumePosition;
              loadStream(currentTarget, currentEpRef.current, resumeTo, true);
            }
          }, backoff);
        } else {
          setIsBuffering(false);
          setStreamError('Playback is temporarily unavailable. Please tap Retry to try again.');
        }
      }
    });

    const subPlaying = player.addListener('playingChange', payload => {
      setIsPlaying(payload.isPlaying);
      if (payload.isPlaying) {
        retryCountRef.current = 0;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        setStreamError(null);
        if ((player.currentTime || 0) > 0) {
          setIsBuffering(false);
        }
      }
    });

    const subAudios = player.addListener('availableAudioTracksChange', payload => {
      const tracks = payload.availableAudioTracks || [];
      setAudioTracksList(tracks);
      if (selectedAudioPrefRef.current && tracks.length > 0) {
        const matched = matchAudioTrack(tracks, selectedAudioPrefRef.current);
        if (matched) {
          try {
            player.audioTrack = matched;
            setSelectedAudioKey(getTrackKey(matched));
          } catch {}
        }
      }
    });

    const subSubs = player.addListener('availableSubtitleTracksChange', payload => {
      const tracks = payload.availableSubtitleTracks || [];
      setSubtitleTracksList(tracks);
      if (selectedSubtitlePrefRef.current && selectedSubtitlePrefRef.current !== 'off' && tracks.length > 0) {
        const matched = matchSubtitleTrack(tracks, selectedSubtitlePrefRef.current);
        if (matched) {
          try {
            player.subtitleTrack = matched;
            setSelectedSubtitleKey(getTrackKey(matched));
          } catch {}
        }
      }
    });

    const subAudioChange = player.addListener('audioTrackChange', payload => {
      if (payload.audioTrack) {
        setSelectedAudioKey(getTrackKey(payload.audioTrack));
      }
    });

    const subSubChange = player.addListener('subtitleTrackChange', payload => {
      if (payload.subtitleTrack) {
        setSelectedSubtitleKey(getTrackKey(payload.subtitleTrack));
      } else {
        setSelectedSubtitleKey('off');
      }
    });

    return () => {
      subStatus?.remove();
      subPlaying?.remove();
      subAudios?.remove();
      subSubs?.remove();
      subAudioChange?.remove();
      subSubChange?.remove();
    };
  }, [player]);

  // Periodic fallback status & time check
  useEffect(() => {
    if (!player || !visible) return;

    const interval = setInterval(() => {
      try {
        const cur = player.currentTime || 0;
        const dur = player.duration || 0;
        setCurrentTime(cur);
        currentTimeRef.current = cur;
        setDuration(dur);
        setIsPlaying(player.playing);

        const st = player.status;
        if (st) {
          setPlayerStatus(st);
          if (st === 'readyToPlay' || (player.playing && cur > 0)) {
            setIsBuffering(false);
          } else if (st === 'loading') {
            setIsBuffering(true);
          }
        }

        // Sync track lists if populated after manifest load
        if (player.availableAudioTracks && player.availableAudioTracks.length > 0 && audioTracksList.length !== player.availableAudioTracks.length) {
          setAudioTracksList(player.availableAudioTracks);
        }
        if (player.availableSubtitleTracks && player.availableSubtitleTracks.length > 0 && subtitleTracksList.length !== player.availableSubtitleTracks.length) {
          setSubtitleTracksList(player.availableSubtitleTracks);
        }
      } catch {}
    }, 400);

    return () => clearInterval(interval);
  }, [player, visible, audioTracksList.length, subtitleTracksList.length]);

  const handleSelectAudio = useCallback((track: AudioTrack | null, prefKey: string) => {
    setSelectedAudioKey(prefKey);
    selectedAudioPrefRef.current = prefKey;
    if (!player) return;
    try {
      if (track) {
        player.audioTrack = track;
      } else {
        const tracks = (player.availableAudioTracks && player.availableAudioTracks.length > 0)
          ? player.availableAudioTracks
          : audioTracksList;
        const matched = matchAudioTrack(tracks, prefKey);
        if (matched) {
          player.audioTrack = matched;
          setSelectedAudioKey(getTrackKey(matched));
        } else if (tracks.length > 0 && prefKey.toLowerCase() === 'default') {
          player.audioTrack = tracks[0];
        }
      }
    } catch (err) {
      console.warn('Failed to switch audio track:', err);
    }
  }, [player, audioTracksList]);

  const handleSelectSubtitle = useCallback((track: SubtitleTrack | null, prefKey: string) => {
    setSelectedSubtitleKey(prefKey);
    selectedSubtitlePrefRef.current = prefKey;
    if (!player) return;
    try {
      if (prefKey === 'off' || (!track && prefKey === '')) {
        player.subtitleTrack = null;
        setSelectedSubtitleKey('off');
      } else if (track) {
        player.subtitleTrack = track;
      } else {
        const tracks = (player.availableSubtitleTracks && player.availableSubtitleTracks.length > 0)
          ? player.availableSubtitleTracks
          : subtitleTracksList;
        const matched = matchSubtitleTrack(tracks, prefKey);
        if (matched) {
          player.subtitleTrack = matched;
          setSelectedSubtitleKey(getTrackKey(matched));
        } else {
          player.subtitleTrack = null;
        }
      }
    } catch (err) {
      console.warn('Failed to switch subtitle track:', err);
    }
  }, [player, subtitleTracksList]);

  // Save watch progress to history
  const saveProgress = useCallback(() => {
    const currentTarget = resolvedItem || item;
    if (currentTarget && currentTime > 0) {
      const playId =
        currentEp?.netmirrorId || currentTarget.netmirrorId || currentTarget.id.replace(/^nm-/, '');
      historyService.record({
        item: {
          ...currentTarget,
          netmirrorId: currentTarget.netmirrorId || currentTarget.id,
        },
        playId,
        position: currentTime,
        duration: duration || 3600,
        episode: currentEp?.title || (currentTarget.type === 'movie' ? 'Movie' : 'Episode 1'),
        seasonId: currentTarget.selectedSeason,
      });
    }
  }, [resolvedItem, item, currentEp, currentTime, duration]);

  // Record history on unmount or close
  useEffect(() => {
    return () => {
      saveProgress();
    };
  }, [saveProgress]);

  // Auto-hide HUD after 4 seconds of inactivity
  const wakeHud = useCallback(() => {
    setShowHud(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      if (!showSettings && !showEpisodes && !showSpeedModal) {
        setShowHud(false);
      }
    }, 4000);
  }, [showSettings, showEpisodes, showSpeedModal]);

  useEffect(() => {
    wakeHud();
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [showSettings, showEpisodes, showSpeedModal, wakeHud]);

  const togglePlay = () => {
    wakeHud();
    if (!player || !resolvedStream) return;
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      saveProgress();
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const skip = (seconds: number) => {
    wakeHud();
    if (!player || !resolvedStream) return;
    const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
    player.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const changeSpeed = (speed: number) => {
    wakeHud();
    if (!player) return;
    player.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const toggleVideoFit = () => {
    wakeHud();
    setVideoFit(prev => {
      const next = prev === 'contain' ? 'cover' : 'contain';
      const label = next === 'cover' ? 'Fill Screen' : 'Original Ratio (16:9)';
      setAspectToast(label);
      if (aspectToastTimeoutRef.current) clearTimeout(aspectToastTimeoutRef.current);
      aspectToastTimeoutRef.current = setTimeout(() => {
        setAspectToast(null);
      }, 1800);
      return next;
    });
  };

  const playEpisode = (ep: Episode) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryCountRef.current = 0;
    setCurrentEp(ep);
    const currentTarget = resolvedItem || item;
    if (currentTarget) {
      loadStream(currentTarget, ep, 0);
    }
  };

  const handleClose = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryCountRef.current = 0;
    saveProgress();
    if (player) {
      try {
        player.pause();
        player.replaceAsync(null);
      } catch {}
    }
    onClose();
  };

  const triggerDoubleTapFeedback = (side: 'left' | 'right') => {
    setDoubleTapSide(side);
    if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
    doubleTapTimerRef.current = setTimeout(() => {
      setDoubleTapSide(null);
    }, 650);
  };

  // Screen Touch: Handles Single Tap (HUD toggle) and Double Tap (Seek)
  const handleScreenTouch = (evt: any) => {
    if (isLocked) {
      // Locked state: touching screen reveals the locked pill
      setShowUnlockPrompt(false);
      setShowLockedPill(true);
      if (lockedPillTimeoutRef.current) clearTimeout(lockedPillTimeoutRef.current);
      lockedPillTimeoutRef.current = setTimeout(() => {
        setShowLockedPill(false);
        setShowUnlockPrompt(false);
      }, 3500);
      return;
    }

    const now = Date.now();
    const touchX = evt.nativeEvent.locationX ?? evt.nativeEvent.pageX ?? width / 2;
    const timeSinceLast = now - lastTapRef.current.time;

    if (timeSinceLast < 320 && Math.abs(touchX - lastTapRef.current.x) < 140) {
      // Double tap confirmed
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }

      if (touchX < width * 0.4) {
        skip(-10);
        triggerDoubleTapFeedback('left');
      } else if (touchX > width * 0.6) {
        skip(10);
        triggerDoubleTapFeedback('right');
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // First tap: delay to check if a second tap follows
      lastTapRef.current = { time: now, x: touchX };
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = setTimeout(() => {
        setShowHud(prev => {
          if (!prev) wakeHud();
          return !prev;
        });
        lastTapRef.current = { time: 0, x: 0 };
      }, 280);
    }
  };
  handleScreenTouchRef.current = handleScreenTouch;

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatRemainingTime = (current: number, total: number) => {
    if (!total || total <= 0) return '0:00';
    const rem = Math.max(0, total - current);
    return `-${formatTime(rem)}`;
  };

  // Return null if player is not open or item is not loaded
  if (!visible || !item) {
    return null;
  }

  // PiP Minimized Mini-Player
  if (isMinimized) {
    return (
      <View style={styles.miniContainer}>
        <View style={styles.miniInner}>
          {resolvedStream ? (
            <VideoView
              player={player}
              style={styles.miniVideo}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <View style={styles.miniPlaceholder}>
              <ActivityIndicator size="small" color={Colors.red} />
            </View>
          )}
          <Focusable onPress={onToggleMinimize} style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>
              {resolvedStream?.title || resolvedItem?.title || item.title}
            </Text>
            <Text style={styles.miniExpand}>Expand ↗</Text>
          </Focusable>
          <Focusable onPress={togglePlay} style={styles.miniBtn}>
            {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </Focusable>
          <Focusable onPress={handleClose} style={styles.miniBtn}>
            <CloseIcon size={16} />
          </Focusable>
        </View>
      </View>
    );
  }

  const audioOptions = [
    'Original audio',
    'English',
    'Hindi',
    'Spanish',
    'French',
    'German',
    'Japanese',
  ];
  const subtitleOptions = ['Off', 'English [CC]', 'Hindi', 'Spanish', 'French', 'German'];
  const isAwaitingOrBuffering = isLoadingStream || isBuffering;

  return (
    <View style={styles.overlay}>
      {/* 1. Base Video Surface - Consistently mounted to prevent unmount flashes */}
      {resolvedStream ? (
        <VideoView
          player={player}
          style={styles.fullscreenVideo}
          contentFit={videoFit}
          nativeControls={false}
        />
      ) : (
        <View style={styles.fullscreenVideo} />
      )}

      {/* Dimmer Overlay for Brightness Control (Real-time Video Dimmer) */}
      <View
        pointerEvents="none"
        style={[
          styles.brightnessDimmer,
          { opacity: (1 - brightness) * 0.82 },
        ]}
      />

      {/* 2. Unified Single Buffering Overlay (Resolving + Buffering) */}
      {isAwaitingOrBuffering && !streamError && !showAuthForm && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.red} style={styles.bufferingSpinner} />
          <Text style={styles.bufferingTitle} numberOfLines={1}>
            {resolvedStream?.title || resolvedItem?.title || item.title}
          </Text>
          <Text style={styles.bufferingSubtitle}>
            {isLoadingStream ? 'Connecting to video stream…' : 'Buffering…'}
          </Text>
        </View>
      )}
      {/* 3. Error & Login Form Overlay (Only when required) */}
      {(showAuthForm || streamError) && (
        <View style={[styles.statusOverlay, { paddingTop: Math.max(32, insets.top + 16) }]}>
          {showAuthForm ? (
            <View style={styles.authBox}>
              <Text style={styles.authHeading}>Connect to video service</Text>
              <Text style={styles.authMessage}>
                {authInfo?.message || 'Enter the login code shown below to stream.'}
              </Text>

              {authInfo?.instructionImage ? (
                <Image
                  source={{ uri: authInfo.instructionImage }}
                  style={styles.authInstructionImage}
                  resizeMode="contain"
                />
              ) : null}

              {authError ? <Text style={styles.authErrorText}>{authError}</Text> : null}

              <TextInput
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="Login code"
                placeholderTextColor={Colors.gray}
                keyboardType="numeric"
                maxLength={10}
                style={styles.otpInput}
                autoFocus
              />

              <Focusable
                onPress={handleConnectAuth}
                style={styles.connectBtn}
                focusBorderColor={Colors.white}
              >
                {isAuthenticating ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.connectBtnText}>Connect & Play</Text>
                )}
              </Focusable>

              <Focusable onPress={handleClose} style={styles.cancelAuthBtn}>
                <Text style={styles.cancelAuthText}>Cancel</Text>
              </Focusable>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.statusTitle}>Unable to Play Video</Text>
              <Text style={styles.statusSubtitle}>
                {streamError &&
                !streamError.includes('CoreMediaErrorDomain') &&
                !streamError.includes('-16190') &&
                !streamError.includes('Failed to load')
                  ? streamError
                  : 'We encountered an issue loading this video stream. Please check your internet connection and tap Retry.'}
              </Text>

              <View style={styles.statusActions}>
                <Focusable
                  onPress={() => {
                    retryCountRef.current = 0;
                    setStreamError(null);
                    loadStream(
                      resolvedItem || item,
                      currentEp,
                      currentTimeRef.current || initialResumePosition
                    );
                  }}
                  style={styles.retryBtn}
                  focusBorderColor={Colors.white}
                >
                  <Text style={styles.retryBtnText}>Retry Playback</Text>
                </Focusable>
                <Focusable onPress={() => setShowAuthForm(true)} style={styles.authToggleBtn}>
                  <Text style={styles.authToggleText}>Login Code</Text>
                </Focusable>
                <Focusable onPress={handleClose} style={styles.authToggleBtn}>
                  <Text style={styles.authToggleText}>Back</Text>
                </Focusable>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 4. Full-Screen Touch Surface for Single & Double Taps + Left-side Brightness Drag */}
      {!showAuthForm && !streamError && (
        <View
          {...screenPanResponder.panHandlers}
          style={styles.touchSurface}
          accessibilityLabel="Player surface"
        />
      )}

      {/* Floating Brightness Feedback Pill */}
      {showBrightnessPill && (
        <View pointerEvents="none" style={styles.floatingPillContainer}>
          <View style={styles.floatingPill}>
            <BrightnessIcon size={22} color={Colors.white} />
            <Text style={styles.floatingPillText}>{Math.round(brightness * 100)}%</Text>
          </View>
        </View>
      )}

      {/* Aspect Ratio Mode Feedback Toast */}
      {aspectToast && (
        <View pointerEvents="none" style={styles.aspectToastContainer}>
          <View style={styles.aspectToast}>
            <AspectFitIcon size={18} color={Colors.white} />
            <Text style={styles.aspectToastText}>{aspectToast}</Text>
          </View>
        </View>
      )}

      {/* Double Tap Seek Feedback Ripple Badge */}
      {doubleTapSide && (
        <View
          pointerEvents="none"
          style={[
            styles.doubleTapBadgeContainer,
            doubleTapSide === 'left' ? styles.doubleTapLeft : styles.doubleTapRight,
          ]}
        >
          <View style={styles.doubleTapCircle}>
            {doubleTapSide === 'left' ? (
              <Rewind10Icon size={isCompact ? 30 : 38} color={Colors.white} />
            ) : (
              <Forward10Icon size={isCompact ? 30 : 38} color={Colors.white} />
            )}
            <Text style={styles.doubleTapLabel}>10 seconds</Text>
          </View>
        </View>
      )}

      {/* Floating Screen Lock Indicator & Unlock Confirm Pill */}
      {isLocked && showLockedPill && (
        <View
          style={[styles.lockedPillWrapper, { bottom: Math.max(36, insets.bottom + 20) }]}
        >
          {!showUnlockPrompt ? (
            <Focusable
              onPress={() => setShowUnlockPrompt(true)}
              style={styles.lockedPill}
              focusBorderColor={Colors.red}
            >
              <LockIcon size={20} color={Colors.white} />
              <View style={styles.lockedTextContainer}>
                <Text style={styles.lockedTitle}>Screen Locked</Text>
                <Text style={styles.lockedSubtitle}>Tap to Unlock</Text>
              </View>
            </Focusable>
          ) : (
            <View style={styles.unlockConfirmCard}>
              <Text style={styles.unlockConfirmTitle}>Unlock controls?</Text>
              <View style={styles.unlockButtonRow}>
                <Focusable
                  onPress={() => {
                    setIsLocked(false);
                    setShowUnlockPrompt(false);
                    setShowLockedPill(false);
                    wakeHud();
                  }}
                  style={styles.unlockConfirmBtn}
                  focusBorderColor={Colors.white}
                >
                  <UnlockIcon size={16} color={Colors.white} />
                  <Text style={styles.unlockConfirmBtnText}>Unlock</Text>
                </Focusable>
                <Focusable
                  onPress={() => setShowUnlockPrompt(false)}
                  style={styles.unlockCancelBtn}
                >
                  <Text style={styles.unlockCancelBtnText}>Cancel</Text>
                </Focusable>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Player HUD Controls */}
      {showHud && !isLocked && !showAuthForm && !streamError && (
        <View style={styles.hudContainer} pointerEvents="box-none">
          {/* Top Bar (TopBarSlot: Back, Title, Aspect Toggle, Browse) */}
          <View
            style={[styles.topBar, { paddingTop: Math.max(16, insets.top + 8) }]}
            pointerEvents="box-none"
          >
            <View style={styles.topLeft}>
              <Focusable onPress={handleClose} style={styles.hudBtn}>
                <BackIcon size={24} color={Colors.white} />
              </Focusable>
              <View style={styles.titleWrapper}>
                <Text style={styles.hudTitle} numberOfLines={1}>
                  {resolvedStream?.title || resolvedItem?.title || item.title}
                </Text>
                {(resolvedStream?.episode || currentEp) && (
                  <Text style={styles.hudEpTitle} numberOfLines={1}>
                    {resolvedStream?.episode ||
                      (currentEp ? `E${currentEp.num} · ${currentEp.title}` : '')}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.topRight}>
              {/* Aspect Ratio Fit / Fill Toggle */}
              <Focusable onPress={toggleVideoFit} style={styles.topActionBtn}>
                <AspectFitIcon size={18} color={Colors.white} />
                <Text style={styles.topActionText}>
                  {videoFit === 'contain' ? 'Original' : 'Fill'}
                </Text>
              </Focusable>

              {/* PiP Browse Mode */}
              <Focusable onPress={onToggleMinimize} style={styles.topActionBtn}>
                <MinimizeIcon size={18} color={Colors.white} />
                <Text style={styles.topActionText}>Browse</Text>
              </Focusable>
            </View>
          </View>

          {/* Left Vertical Brightness Slider (Netflix APK PlayerMainControlsSlot.BrightnessSlider) */}
          <View
            style={styles.leftBrightnessSlot}
            {...brightnessPanResponder.panHandlers}
            accessibilityLabel="Brightness Slider"
          >
            <BrightnessIcon size={18} color="rgba(255, 255, 255, 0.9)" />
            <View style={styles.brightnessTrack}>
              <View
                style={[
                  styles.brightnessFill,
                  { height: `${Math.round(Math.max(10, brightness * 100))}%` },
                ]}
              />
            </View>
          </View>

          {/* Center Transport Controls (PlayPauseButtonMetrics: 64dp compact vs 80dp regular) */}
          <View style={styles.centerControls} pointerEvents="box-none">
            <Focusable
              onPress={() => skip(-10)}
              style={[styles.centerSkipBtn, isCompact && styles.centerSkipBtnCompact]}
            >
              <Rewind10Icon size={isCompact ? 28 : 34} color={Colors.white} />
            </Focusable>

            {isAwaitingOrBuffering ? (
              <View
                style={[
                  styles.centerPlayBtn,
                  isCompact && styles.centerPlayBtnCompact,
                  styles.centerBufferingBtn,
                ]}
              >
                <ActivityIndicator size="small" color={Colors.white} />
              </View>
            ) : (
              <Focusable
                onPress={togglePlay}
                style={[styles.centerPlayBtn, isCompact && styles.centerPlayBtnCompact]}
                hasTVPreferredFocus={true}
                focusBorderColor={Colors.red}
              >
                {isPlaying ? (
                  <PauseIcon size={isCompact ? 32 : 40} color={Colors.white} />
                ) : (
                  <PlayIcon size={isCompact ? 32 : 40} color={Colors.white} />
                )}
              </Focusable>
            )}

            <Focusable
              onPress={() => skip(10)}
              style={[styles.centerSkipBtn, isCompact && styles.centerSkipBtnCompact]}
            >
              <Forward10Icon size={isCompact ? 28 : 34} color={Colors.white} />
            </Focusable>
          </View>

          {/* Bottom Controls Area (Scrubber Timeline + PlayerBottomBarLayoutStrategy) */}
          <View
            style={[styles.bottomArea, { paddingBottom: Math.max(12, insets.bottom + 6) }]}
            pointerEvents="box-none"
          >
            {/* Scrubber Timeline with Current Time and Remaining Time (-mm:ss) */}
            <View style={styles.scrubberContainer}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration || 100}
                value={currentTime}
                onSlidingComplete={val => {
                  wakeHud();
                  if (player) player.currentTime = val;
                }}
                minimumTrackTintColor={Colors.red}
                maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
                thumbTintColor={Colors.red}
              />
              <View style={styles.timeRow}>
                <Text style={styles.timecode}>{formatTime(currentTime)}</Text>
                <Text style={styles.timecode}>{formatRemainingTime(currentTime, duration)}</Text>
              </View>
            </View>

            {/* Mobile Bottom Action Bar (Lock, Speed, Audio & Subtitles, Episodes, Next Ep) */}
            <View style={styles.bottomBarRow}>
              {/* Lock Button */}
              <Focusable
                onPress={() => {
                  setIsLocked(true);
                  setShowHud(false);
                  setShowLockedPill(true);
                  if (lockedPillTimeoutRef.current) clearTimeout(lockedPillTimeoutRef.current);
                  lockedPillTimeoutRef.current = setTimeout(() => setShowLockedPill(false), 3000);
                }}
                style={styles.bottomBarItem}
              >
                <LockIcon size={isCompact ? 18 : 22} color={Colors.white} />
                <Text style={[styles.bottomBarLabel, isCompact && styles.bottomBarLabelCompact]}>
                  Lock
                </Text>
              </Focusable>

              {/* Speed Button */}
              <Focusable
                onPress={() => {
                  wakeHud();
                  setShowSpeedModal(true);
                  setShowSettings(false);
                  setShowEpisodes(false);
                }}
                style={styles.bottomBarItem}
              >
                <SpeedIcon size={isCompact ? 18 : 22} color={Colors.white} />
                <Text style={[styles.bottomBarLabel, isCompact && styles.bottomBarLabelCompact]}>
                  Speed ({playbackSpeed}X)
                </Text>
              </Focusable>

              {/* Audio & Subtitles Button */}
              <Focusable
                onPress={() => {
                  wakeHud();
                  setShowSettings(true);
                  setShowSpeedModal(false);
                  setShowEpisodes(false);
                }}
                style={styles.bottomBarItem}
              >
                <AudioSubtitlesIcon size={isCompact ? 18 : 22} color={Colors.white} />
                <Text style={[styles.bottomBarLabel, isCompact && styles.bottomBarLabelCompact]}>
                  Audio & Subtitles
                </Text>
              </Focusable>

              {/* Episodes Button (Series only) */}
              {(episodesList.length > 0 || (item.episodes && item.episodes.length > 0)) && (
                <Focusable
                  onPress={() => {
                    wakeHud();
                    setShowEpisodes(true);
                    setShowSettings(false);
                    setShowSpeedModal(false);
                  }}
                  style={styles.bottomBarItem}
                >
                  <EpisodesIcon size={isCompact ? 18 : 22} color={Colors.white} />
                  <Text style={[styles.bottomBarLabel, isCompact && styles.bottomBarLabelCompact]}>
                    Episodes
                  </Text>
                </Focusable>
              )}

              {/* Next Episode Button */}
              {nextEp && (
                <Focusable
                  onPress={() => {
                    wakeHud();
                    playEpisode(nextEp);
                  }}
                  style={styles.bottomBarItem}
                >
                  <NextEpisodeIcon size={isCompact ? 18 : 22} color={Colors.white} />
                  <Text style={[styles.bottomBarLabel, isCompact && styles.bottomBarLabelCompact]}>
                    Next Ep
                  </Text>
                </Focusable>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Playback Speed Bottom Sheet */}
      {showSpeedModal && (
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setShowSpeedModal(false)} />
          <View
            style={[styles.bottomSheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Playback speed</Text>
              <Focusable onPress={() => setShowSpeedModal(false)} style={styles.sheetCloseBtn}>
                <CloseIcon size={20} color={Colors.white} />
              </Focusable>
            </View>
            <View style={styles.sheetOptionsList}>
              {[0.5, 0.75, 1, 1.25, 1.5].map(spd => {
                const isSelected = playbackSpeed === spd;
                return (
                  <Focusable
                    key={spd}
                    onPress={() => {
                      changeSpeed(spd);
                      setShowSpeedModal(false);
                    }}
                    style={[styles.sheetOptionItem, isSelected && styles.sheetOptionItemActive]}
                  >
                    <Text
                      style={[styles.sheetOptionText, isSelected && styles.sheetOptionTextActive]}
                    >
                      {spd === 1 ? '1.0X (Normal)' : `${spd}X`}
                    </Text>
                    {isSelected && <CheckIcon size={18} color={Colors.red} />}
                  </Focusable>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Audio & Subtitles Bottom Sheet (PortraitPlayerTrackKind) */}
      {showSettings && (() => {
        const availableAudios = (player?.availableAudioTracks && player.availableAudioTracks.length > 0)
          ? player.availableAudioTracks
          : audioTracksList;
        const availableSubs = (player?.availableSubtitleTracks && player.availableSubtitleTracks.length > 0)
          ? player.availableSubtitleTracks
          : subtitleTracksList;

        const isAudioSelected = (track: AudioTrack, idx: number): boolean => {
          if (player?.audioTrack) {
            if (track.id && player.audioTrack.id && track.id === player.audioTrack.id) return true;
            if (track.language && player.audioTrack.language && track.language.toLowerCase() === player.audioTrack.language.toLowerCase()) {
              if (track.label && player.audioTrack.label && track.label === player.audioTrack.label) return true;
              if (!track.label && !player.audioTrack.label) return true;
            }
          }
          const key = getTrackKey(track, idx);
          return selectedAudioKey === key;
        };

        const isSubtitleSelected = (track: SubtitleTrack, idx: number): boolean => {
          if (selectedSubtitleKey === 'off' || !player?.subtitleTrack) return false;
          if (player?.subtitleTrack) {
            if (track.id && player.subtitleTrack.id && track.id === player.subtitleTrack.id) return true;
            if (track.language && player.subtitleTrack.language && track.language.toLowerCase() === player.subtitleTrack.language.toLowerCase()) {
              if (track.label && player.subtitleTrack.label && track.label === player.subtitleTrack.label) return true;
              if (track.name && player.subtitleTrack.name && track.name === player.subtitleTrack.name) return true;
              if (!track.label && !player.subtitleTrack.label && !track.name && !player.subtitleTrack.name) return true;
            }
          }
          const key = getTrackKey(track, idx);
          return selectedSubtitleKey === key;
        };

        return (
          <View style={styles.modalBackdrop}>
            <Pressable style={styles.modalDismissArea} onPress={() => setShowSettings(false)} />
            <View
              style={[
                styles.bottomSheet,
                styles.audioSubSheet,
                { paddingBottom: Math.max(16, insets.bottom + 12) },
              ]}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Audio & Subtitles</Text>
                <Focusable onPress={() => setShowSettings(false)} style={styles.sheetCloseBtn}>
                  <CloseIcon size={20} color={Colors.white} />
                </Focusable>
              </View>

              {/* Mobile Tab Switcher for Portrait / Compact */}
              {isCompact ? (
                <View style={styles.langTabHeader}>
                  <Focusable
                    onPress={() => setActiveLanguageTab('audio')}
                    style={[styles.langTabItem, activeLanguageTab === 'audio' && styles.langTabItemActive]}
                  >
                    <Text style={[styles.langTabText, activeLanguageTab === 'audio' && styles.langTabTextActive]}>
                      AUDIO
                    </Text>
                    {activeLanguageTab === 'audio' && <View style={styles.langTabIndicator} />}
                  </Focusable>
                  <Focusable
                    onPress={() => setActiveLanguageTab('subtitles')}
                    style={[styles.langTabItem, activeLanguageTab === 'subtitles' && styles.langTabItemActive]}
                  >
                    <Text style={[styles.langTabText, activeLanguageTab === 'subtitles' && styles.langTabTextActive]}>
                      SUBTITLES
                    </Text>
                    {activeLanguageTab === 'subtitles' && <View style={styles.langTabIndicator} />}
                  </Focusable>
                </View>
              ) : null}

              {/* Content: Single scroll list in compact tabbed mode, or 2 columns in landscape/wide */}
              {isCompact ? (
                <View style={styles.compactListContainer}>
                  {activeLanguageTab === 'audio' ? (
                    <ScrollView style={styles.tabScroll} showsVerticalScrollIndicator={false}>
                      {availableAudios.length > 0 ? (
                        availableAudios.map((track, idx) => {
                          const key = getTrackKey(track, idx);
                          const isSelected = isAudioSelected(track, idx);
                          const label = formatAudioLabel(track, idx);
                          return (
                            <Focusable
                              key={key + '_' + idx}
                              onPress={() => handleSelectAudio(track, key)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {label}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      ) : (
                        ['Original audio', 'English', 'Hindi', 'Spanish', 'French', 'German'].map((opt, idx) => {
                          const key = opt.toLowerCase();
                          const isSelected = selectedAudioKey === key || (selectedAudioKey === 'default' && idx === 0);
                          return (
                            <Focusable
                              key={opt}
                              onPress={() => handleSelectAudio(null, opt)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {opt}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      )}
                    </ScrollView>
                  ) : (
                    <ScrollView style={styles.tabScroll} showsVerticalScrollIndicator={false}>
                      {/* First Option: Always Off in Netflix Subtitles */}
                      <Focusable
                        onPress={() => handleSelectSubtitle(null, 'off')}
                        style={[styles.trackItem, (selectedSubtitleKey === 'off' || !player?.subtitleTrack) && styles.trackItemActive]}
                      >
                        <Text style={[styles.trackText, (selectedSubtitleKey === 'off' || !player?.subtitleTrack) && styles.trackTextActive]}>
                          Off
                        </Text>
                        {(selectedSubtitleKey === 'off' || !player?.subtitleTrack) && (
                          <CheckIcon size={18} color={Colors.white} />
                        )}
                      </Focusable>

                      {availableSubs.length > 0 ? (
                        availableSubs.map((track, idx) => {
                          const key = getTrackKey(track, idx);
                          const isSelected = isSubtitleSelected(track, idx);
                          const label = formatSubtitleLabel(track, idx);
                          return (
                            <Focusable
                              key={key + '_' + idx}
                              onPress={() => handleSelectSubtitle(track, key)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {label}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      ) : (
                        ['English [CC]', 'Hindi', 'Spanish', 'French', 'German'].map(opt => {
                          const isSelected = selectedSubtitleKey.toLowerCase() === opt.toLowerCase();
                          return (
                            <Focusable
                              key={opt}
                              onPress={() => handleSelectSubtitle(null, opt)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {opt}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      )}
                    </ScrollView>
                  )}
                </View>
              ) : (
                <View style={styles.audioSubColumns}>
                  {/* Two-column wide/landscape layout */}
                  <View style={styles.audioSubCol}>
                    <Text style={styles.colHeader}>AUDIO</Text>
                    <ScrollView style={styles.colScroll} showsVerticalScrollIndicator={false}>
                      {availableAudios.length > 0 ? (
                        availableAudios.map((track, idx) => {
                          const key = getTrackKey(track, idx);
                          const isSelected = isAudioSelected(track, idx);
                          const label = formatAudioLabel(track, idx);
                          return (
                            <Focusable
                              key={key + '_' + idx}
                              onPress={() => handleSelectAudio(track, key)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {label}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      ) : (
                        ['Original audio', 'English', 'Hindi', 'Spanish', 'French', 'German'].map((opt, idx) => {
                          const key = opt.toLowerCase();
                          const isSelected = selectedAudioKey === key || (selectedAudioKey === 'default' && idx === 0);
                          return (
                            <Focusable
                              key={opt}
                              onPress={() => handleSelectAudio(null, opt)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {opt}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>

                  <View style={styles.audioSubCol}>
                    <Text style={styles.colHeader}>SUBTITLES</Text>
                    <ScrollView style={styles.colScroll} showsVerticalScrollIndicator={false}>
                      <Focusable
                        onPress={() => handleSelectSubtitle(null, 'off')}
                        style={[styles.trackItem, (selectedSubtitleKey === 'off' || !player?.subtitleTrack) && styles.trackItemActive]}
                      >
                        <Text style={[styles.trackText, (selectedSubtitleKey === 'off' || !player?.subtitleTrack) && styles.trackTextActive]}>
                          Off
                        </Text>
                        {(selectedSubtitleKey === 'off' || !player?.subtitleTrack) && (
                          <CheckIcon size={18} color={Colors.white} />
                        )}
                      </Focusable>

                      {availableSubs.length > 0 ? (
                        availableSubs.map((track, idx) => {
                          const key = getTrackKey(track, idx);
                          const isSelected = isSubtitleSelected(track, idx);
                          const label = formatSubtitleLabel(track, idx);
                          return (
                            <Focusable
                              key={key + '_' + idx}
                              onPress={() => handleSelectSubtitle(track, key)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {label}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      ) : (
                        ['English [CC]', 'Hindi', 'Spanish', 'French', 'German'].map(opt => {
                          const isSelected = selectedSubtitleKey.toLowerCase() === opt.toLowerCase();
                          return (
                            <Focusable
                              key={opt}
                              onPress={() => handleSelectSubtitle(null, opt)}
                              style={[styles.trackItem, isSelected && styles.trackItemActive]}
                            >
                              <Text style={[styles.trackText, isSelected && styles.trackTextActive]}>
                                {opt}
                              </Text>
                              {isSelected && <CheckIcon size={18} color={Colors.white} />}
                            </Focusable>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                </View>
              )}

              {/* Bottom Apply Action (Netflix Mobile APK PortraitPlayerLanguageScreen standard) */}
              <View style={styles.sheetFooter}>
                <Focusable
                  onPress={() => {
                    setShowSettings(false);
                    wakeHud();
                  }}
                  style={styles.sheetApplyBtn}
                  focusBorderColor={Colors.white}
                >
                  <Text style={styles.sheetApplyBtnText}>Apply</Text>
                </Focusable>
              </View>
            </View>
          </View>
        );
      })()}

      {/* Episodes Picker Bottom Sheet / Drawer */}
      {showEpisodes && (
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setShowEpisodes(false)} />
          <View
            style={[styles.episodesDrawer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Episodes</Text>
              <Focusable onPress={() => setShowEpisodes(false)} style={styles.sheetCloseBtn}>
                <CloseIcon size={20} color={Colors.white} />
              </Focusable>
            </View>
            <ScrollView style={styles.episodesScroll} showsVerticalScrollIndicator={false}>
              {episodes.map(ep => {
                const isActive =
                  currentEp?.num === ep.num || currentEp?.netmirrorId === ep.netmirrorId;
                return (
                  <Focusable
                    key={ep.netmirrorId || ep.num}
                    onPress={() => {
                      playEpisode(ep);
                      setShowEpisodes(false);
                    }}
                    style={[styles.episodeItem, isActive && styles.episodeItemActive]}
                  >
                    <Text style={[styles.epNumber, isActive && styles.epNumberActive]}>
                      {ep.num}
                    </Text>
                    <View style={styles.epInfo}>
                      <Text
                        style={[styles.epTitle, isActive && styles.epTitleActive]}
                        numberOfLines={1}
                      >
                        {ep.title}
                      </Text>
                      {ep.duration && <Text style={styles.epDuration}>{ep.duration}</Text>}
                    </View>
                    {isActive && (
                      <View style={styles.playingBadge}>
                        <Text style={styles.playingBadgeText}>PLAYING</Text>
                      </View>
                    )}
                  </Focusable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  fullscreenVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  brightnessDimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 2,
  },
  touchSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  bufferingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
    gap: 8,
    paddingHorizontal: 24,
  },
  bufferingSpinner: {
    marginBottom: 8,
    transform: [{ scale: 1.2 }],
  },
  bufferingTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  bufferingSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  centerBufferingBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0c0c0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 480,
  },
  spinner: {
    marginBottom: 8,
  },
  statusTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusSubtitle: {
    color: Colors.gray,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 20,
  },
  statusActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.red,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
  authToggleBtn: {
    backgroundColor: '#202026',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
  },
  authToggleText: {
    color: Colors.white,
    fontSize: 14,
  },
  authBox: {
    backgroundColor: '#1b1b22',
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 12,
  },
  authHeading: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  authMessage: {
    color: Colors.gray,
    fontSize: 13,
    textAlign: 'center',
  },
  authInstructionImage: {
    width: 280,
    height: 120,
    borderRadius: 6,
    marginVertical: 4,
    backgroundColor: '#111116',
  },
  authErrorText: {
    color: Colors.red,
    fontSize: 12,
    textAlign: 'center',
  },
  otpInput: {
    backgroundColor: '#0c0c0f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 4,
    color: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 4,
    width: '100%',
  },
  connectBtn: {
    backgroundColor: Colors.red,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    width: '100%',
  },
  connectBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
  cancelAuthBtn: {
    paddingVertical: 8,
  },
  cancelAuthText: {
    color: Colors.gray,
    fontSize: 13,
  },

  // Double-tap Seek Feedback
  doubleTapBadgeContainer: {
    position: 'absolute',
    top: '35%',
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doubleTapLeft: {
    left: '12%',
  },
  doubleTapRight: {
    right: '12%',
  },
  doubleTapCircle: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  doubleTapLabel: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },

  // Floating Feedback Pills (Brightness & Aspect Ratio)
  floatingPillContainer: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    zIndex: 50,
  },
  floatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  floatingPillText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  aspectToastContainer: {
    position: 'absolute',
    top: 75,
    alignSelf: 'center',
    zIndex: 50,
  },
  aspectToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20, 20, 26, 0.92)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  aspectToastText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },

  // Floating Lock Indicator & Confirmation
  lockedPillWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
  },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15, 15, 20, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  lockedTextContainer: {
    flexDirection: 'column',
  },
  lockedTitle: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  lockedSubtitle: {
    color: Colors.gray,
    fontSize: 11,
  },
  unlockConfirmCard: {
    backgroundColor: 'rgba(20, 20, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    minWidth: 220,
    elevation: 8,
  },
  unlockConfirmTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  unlockButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  unlockConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.red,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  unlockConfirmBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 13,
  },
  unlockCancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  unlockCancelBtnText: {
    color: Colors.white,
    fontSize: 13,
  },

  // Player HUD
  hudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  hudBtn: {
    padding: 6,
  },
  titleWrapper: {
    flex: 1,
  },
  hudTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  hudEpTitle: {
    color: Colors.grayLight,
    fontSize: 12,
    marginTop: 2,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  topActionText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },

  // Left Vertical Brightness Slider (Netflix APK PlayerMainControlsSlot.BrightnessSlider)
  leftBrightnessSlot: {
    position: 'absolute',
    left: 18,
    top: '32%',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 25,
  },
  brightnessTrack: {
    width: 6,
    height: 120,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  brightnessFill: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 3,
  },

  // Center Controls
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  centerPlayBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayBtnCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  centerSkipBtn: {
    padding: 10,
  },
  centerSkipBtnCompact: {
    padding: 6,
  },

  // Bottom Area & Mobile Bottom Bar
  bottomArea: {
    paddingHorizontal: 16,
    gap: 8,
  },
  scrubberContainer: {
    width: '100%',
  },
  slider: {
    width: '100%',
    height: 36,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: -4,
  },
  timecode: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  bottomBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
  },
  bottomBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 54,
    gap: 4,
  },
  bottomBarLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomBarLabelCompact: {
    fontSize: 10,
  },

  // Modals & Bottom Sheets
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  modalDismissArea: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#18181f',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetTitle: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    padding: 6,
  },
  sheetOptionsList: {
    gap: 4,
  },
  sheetOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  sheetOptionItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetOptionText: {
    color: Colors.grayLight,
    fontSize: 15,
  },
  sheetOptionTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },

  // Audio & Subtitles (Netflix APK PortraitPlayerLanguageScreen clone)
  audioSubSheet: {
    maxHeight: '80%',
  },
  langTabHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 8,
  },
  langTabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  langTabItemActive: {},
  langTabText: {
    color: Colors.gray,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  langTabTextActive: {
    color: Colors.white,
  },
  langTabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: '20%',
    right: '20%',
    height: 3,
    backgroundColor: Colors.red,
    borderRadius: 2,
  },
  compactListContainer: {
    height: 300,
  },
  tabScroll: {
    flex: 1,
  },
  audioSubColumns: {
    flexDirection: 'row',
    gap: 16,
    height: 280,
  },
  audioSubCol: {
    flex: 1,
  },
  colHeader: {
    color: Colors.gray,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  colScroll: {
    flex: 1,
  },
  trackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  trackItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  trackText: {
    color: Colors.grayLight,
    fontSize: 14,
    fontWeight: '500',
  },
  trackTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  sheetFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetApplyBtn: {
    backgroundColor: Colors.red,
    paddingVertical: 13,
    borderRadius: 6,
    alignItems: 'center',
    width: '100%',
  },
  sheetApplyBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Episodes Drawer
  episodesDrawer: {
    backgroundColor: '#18181f',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  episodesScroll: {
    maxHeight: 340,
  },
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  episodeItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
  },
  epNumber: {
    color: Colors.gray,
    fontSize: 16,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
  },
  epNumberActive: {
    color: Colors.red,
  },
  epInfo: {
    flex: 1,
  },
  epTitle: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  epTitleActive: {
    color: Colors.red,
  },
  epDuration: {
    color: Colors.gray,
    fontSize: 11,
    marginTop: 2,
  },
  playingBadge: {
    backgroundColor: Colors.red,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  playingBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: 'bold',
  },

  // PiP Minimized Mini-Player
  miniContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 320,
    height: 80,
    backgroundColor: '#1b1b22',
    borderRadius: 8,
    zIndex: 99999,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  miniInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  miniVideo: {
    width: 100,
    height: 80,
    backgroundColor: '#000',
  },
  miniPlaceholder: {
    width: 100,
    height: 80,
    backgroundColor: '#0c0c0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },
  miniTitle: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  miniExpand: {
    color: Colors.gray,
    fontSize: 11,
    marginTop: 2,
  },
  miniBtn: {
    padding: 8,
  },
});
