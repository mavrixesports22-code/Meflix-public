import React from 'react';
import { Image, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { Focusable } from '../components/common/Focusable';
import { ArtworkImage } from '../components/common/ArtworkImage';
import { TitleItem } from '../types';
import { PrimeColors as C } from './primeTheme';
import { BRAND_ASSETS } from '../theme/brandAssets';

export function MeflixLogo() {
  return <Image accessibilityLabel="Meflix" source={BRAND_ASSETS.wordmark} resizeMode="contain" style={s.logo} />;
}

export function PrimeButton({ label, onPress, icon, primary, style, selected, disabled }: {
  label: string; onPress: () => void; icon?: React.ReactNode; primary?: boolean;
  style?: StyleProp<ViewStyle>; selected?: boolean; disabled?: boolean;
}) {
  return <Focusable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }}
    disabled={disabled} onPress={onPress} focusBorderColor={C.blue}
    style={[s.button, primary && s.primary, selected && s.selected, disabled && { opacity: 0.5 }, style]}>
    {icon}<Text style={[s.buttonText, primary && { color: C.background }]}>{label}</Text>
  </Focusable>;
}

export function PrimeArtwork({ item, style, poster = false }: { item: TitleItem; style?: StyleProp<ViewStyle>; poster?: boolean }) {
  const uri = poster ? item.poster || item.backdrop : item.backdrop || item.poster;
  return <ArtworkImage uri={uri} title={item.title} style={[s.art, style]} />;
}

export function PrimeCard({ item, width, onPress, progress }: { item: TitleItem; width: number; onPress: () => void; progress?: number }) {
  return <Focusable accessibilityRole="button" accessibilityLabel={`View ${item.title}`} onPress={onPress}
    testID={`prime-card-${item.netmirrorId || item.id}`}
    focusBorderColor={C.blue} style={{ width, gap: 6 }}>
    <PrimeArtwork item={item} style={{ height: width * 0.5625, borderRadius: 5, overflow: 'hidden' }} />
    {progress !== undefined && <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} /></View>}
    <Text numberOfLines={1} style={s.cardTitle}>{item.hydrated === false ? 'Loading title…' : item.title}</Text>
    <Text style={s.cardMeta}>{item.hydrated === false ? 'Loading details' : [item.year, item.type === 'series' ? 'TV show' : 'Movie'].filter(Boolean).join('  ·  ')}</Text>
  </Focusable>;
}

export function PrimeEmpty({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  return <View style={s.empty}><Text style={s.emptySymbol}>＋</Text><Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptyText}>{description}</Text>{action && onAction && <PrimeButton label={action} onPress={onAction} primary />}</View>;
}

const s = StyleSheet.create({
  logo: { width: 132, height: 38 },
  button: { flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, minHeight: 48, borderRadius: 6, backgroundColor: C.elevated },
  primary: { backgroundColor: '#fff' }, selected: { borderWidth: 1, borderColor: C.blue }, buttonText: { color: C.text, fontSize: 15, fontWeight: '600' },
  art: { backgroundColor: C.surface },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: '600' }, cardMeta: { color: C.secondary, fontSize: 12 }, progressTrack: { height: 3, backgroundColor: C.border }, progressFill: { height: 3, backgroundColor: C.blue },
  empty: { padding: 36, alignItems: 'center', gap: 16, minHeight: 300, justifyContent: 'center' }, emptySymbol: { fontSize: 54, color: C.secondary }, emptyTitle: { fontSize: 23, color: C.text, fontWeight: '700', textAlign: 'center' }, emptyText: { color: C.secondary, fontSize: 15, lineHeight: 23, textAlign: 'center', maxWidth: 460 },
});

