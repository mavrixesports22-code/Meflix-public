import React, { useState } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  StyleSheet,
  Platform,
} from 'react-native';
import { Colors } from '../../theme/colors';

interface FocusableProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  scaleOnFocus?: boolean;
  hasTVPreferredFocus?: boolean;
  focusBorderColor?: string;
}

export const Focusable: React.FC<FocusableProps> = ({
  children,
  style,
  focusedStyle,
  scaleOnFocus = true,
  hasTVPreferredFocus = false,
  focusBorderColor = Colors.white,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      hasTVPreferredFocus={hasTVPreferredFocus}
      focusable={true}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={({ pressed }) => [
        style,
        pressed && styles.pressed,
        isFocused && [
          styles.focused,
          scaleOnFocus && styles.scaled,
          { borderColor: focusBorderColor },
          focusedStyle,
        ],
      ]}
      {...props}
    >
      {typeof children === 'function' ? children({ pressed: false }) : children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  focused: {
    borderWidth: 2,
    borderRadius: 6,
    zIndex: 10,
    ...Platform.select({
      web: {
        outlineStyle: 'solid',
        outlineWidth: 2,
        outlineColor: Colors.white,
        outlineOffset: 3,
      } as any,
      default: {},
    }),
  },
  scaled: {
    transform: [{ scale: 1.04 }],
  },
});
