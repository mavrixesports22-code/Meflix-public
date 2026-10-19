import { Platform, TextStyle } from 'react-native';

export const Typography = {
  headingOutfit: Platform.select({
    ios: 'Outfit-Bold',
    android: 'Outfit_700Bold',
    default: 'Outfit, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  }),
  bodyInter: Platform.select({
    ios: 'Inter-Regular',
    android: 'Inter_400Regular',
    default: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  }),
  bodyInterMedium: Platform.select({
    ios: 'Inter-Medium',
    android: 'Inter_500Medium',
    default: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  }),
  bodyInterSemiBold: Platform.select({
    ios: 'Inter-SemiBold',
    android: 'Inter_600SemiBold',
    default: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  }),
  bodyInterBold: Platform.select({
    ios: 'Inter-Bold',
    android: 'Inter_700Bold',
    default: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  }),
};
