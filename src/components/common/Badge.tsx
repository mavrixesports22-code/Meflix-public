import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface BadgeProps {
  text: string;
  variant?: 'outline' | 'match' | 'pill' | 'subtle';
}

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'outline' }) => {
  if (!text) return null;

  if (variant === 'match') {
    return <Text style={styles.matchText}>{text}</Text>;
  }

  if (variant === 'pill') {
    return (
      <View style={styles.pillContainer}>
        <Text style={styles.pillText}>{text}</Text>
      </View>
    );
  }

  if (variant === 'subtle') {
    return <Text style={styles.subtleText}>{text}</Text>;
  }

  return (
    <View style={styles.outlineContainer}>
      <Text style={styles.outlineText}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  outlineContainer: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  outlineText: {
    color: Colors.grayLight,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  pillContainer: {
    backgroundColor: 'rgba(50, 50, 55, 0.85)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.red,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  pillText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  matchText: {
    color: Colors.matchGreen,
    fontSize: 13,
    fontWeight: 'bold',
  },
  subtleText: {
    color: Colors.gray,
    fontSize: 12,
  },
});
