import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';

export function ArtworkImage({ uri, title, style, resizeMode = 'cover' }: {
  uri?: string | null; title?: string; style?: StyleProp<ViewStyle>; resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}) {
  const [failed, setFailed] = useState(false);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  useEffect(() => { setFailed(false); setLoadedUri(null); }, [uri]);
  const initial = title?.trim().slice(0, 1).toLocaleUpperCase() || 'M';
  return <View style={[styles.frame, style]}>
    {uri && !failed && <Image key={uri} source={{ uri }} style={StyleSheet.absoluteFill}
      contentFit={resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'scale-down' : resizeMode}
      cachePolicy="memory-disk" priority="normal" transition={100} recyclingKey={uri}
      onLoad={() => setLoadedUri(uri)} onError={() => { setLoadedUri(null); setFailed(true); }} />}
    {(!uri || failed || loadedUri !== uri) && <View pointerEvents="none" style={styles.fallback}>
      <Text style={styles.initial}>{initial}</Text><Text numberOfLines={2} style={styles.title}>{title || 'Meflix'}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: Colors.cardBg },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#17171b' },
  initial: { color: Colors.grayDark, fontSize: 46, fontWeight: '800' },
  title: { color: Colors.grayLight, fontSize: 11, textAlign: 'center', marginTop: 3 },
});
