import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

interface SplashScreenProps {
  onFinish: () => void;
  minDurationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  minDurationMs = 2100,
}) => {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;

  const logoScale = useRef(new Animated.Value(0.68)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const glowLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const hasFinishedRef = useRef(false);

  const triggerExit = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    // Freeze the ambient pulse before the logo fades so the exit stays calm.
    glowLoopRef.current?.stop();

    Animated.parallel([
      Animated.timing(exitScale, {
        toValue: 1.28,
        duration: 450,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(exitOpacity, {
        toValue: 0,
        duration: 380,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  };

  useEffect(() => {
    // 1. Entrance animation (scale + fade in)
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 850,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Delayed wordmark fade in
    const wordmarkTimer = setTimeout(() => {
      Animated.timing(wordmarkOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, 450);

    // 3. Subtle ambient glow breathing loop
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.85,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.35,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    glowLoopRef.current = glowLoop;
    glowLoop.start();

    // 4. Automatic completion timer
    const exitTimer = setTimeout(() => {
      triggerExit();
    }, minDurationMs);

    return () => {
      clearTimeout(wordmarkTimer);
      clearTimeout(exitTimer);
      glowLoop.stop();
      glowLoopRef.current = null;
    };
  }, []);

  const logoSize = isMobile ? Math.min(width * 0.42, 170) : 220;
  const wordmarkWidth = isMobile ? Math.min(width * 0.55, 230) : 280;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={triggerExit}
      style={styles.container}
    >
      <StatusBar style="light" hidden />

      <Animated.View
        style={[
          styles.contentWrapper,
          {
            opacity: exitOpacity,
            transform: [{ scale: exitScale }],
          },
        ]}
      >
        {/* Ambient Red Glow Halo behind Emblem */}
        <Animated.View
          style={[
            styles.glowHalo,
            {
              width: logoSize * 1.8,
              height: logoSize * 1.8,
              borderRadius: (logoSize * 1.8) / 2,
              opacity: glowPulse,
            },
          ]}
        />

        {/* Cinematic Netflix M Ribbon Emblem */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../../../assets/brand/meflix-mx.png')}
            style={{ width: logoSize, height: logoSize }}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Elegant Wordmark Beneath */}
        <Animated.View
          style={[
            styles.wordmarkContainer,
            {
              opacity: wordmarkOpacity,
            },
          ]}
        >
          <Image
            source={require('../../../assets/brand/meflix-wordmark.png')}
            style={{ width: wordmarkWidth, height: wordmarkWidth * 0.28 }}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      {/* Subtle Netflix Crimson Progress Bar */}
      <View style={styles.loaderTrack}>
        <Animated.View
          style={[
            styles.loaderIndicator,
            {
              opacity: glowPulse,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowHalo: {
    position: 'absolute',
    backgroundColor: '#E50914',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 60,
    elevation: 24,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  wordmarkContainer: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  loaderTrack: {
    position: 'absolute',
    bottom: 48,
    width: 60,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderIndicator: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
});
