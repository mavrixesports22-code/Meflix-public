import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';
import { TitleItem } from '../../types';
import { Focusable } from '../common/Focusable';
import { Badge } from '../common/Badge';
import { PlayIcon, InfoIcon, PlusIcon, CheckIcon, VolumeIcon, MuteIcon } from '../common/Icons';
import { ArtworkImage } from '../common/ArtworkImage';
import { BRAND_ASSETS } from '../../theme/brandAssets';

interface BillboardHeroProps {
  item: TitleItem;
  onPlay: (item: TitleItem) => void;
  onMoreInfo: (item: TitleItem) => void;
  isInList: boolean;
  onToggleList: (id: string, title?: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const BillboardHero: React.FC<BillboardHeroProps> = ({
  item,
  onPlay,
  onMoreInfo,
  isInList,
  onToggleList,
  isMuted,
  onToggleMute,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const heroHeight = isMobile ? 420 : 560;

  const backdropUri = item.backdrop || item.poster;

  return (
    <View style={[styles.container, { height: heroHeight }]}>
      {/* Backdrop Image */}
      <ArtworkImage uri={backdropUri} title={item.title} style={styles.backdrop} />

      {/* Dark Gradient Overlays */}
      <LinearGradient
        colors={['rgba(11, 11, 16, 0.95)', 'rgba(11, 11, 16, 0.65)', 'rgba(11, 11, 16, 0.1)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientHorizontal}
      />
      <LinearGradient
        colors={['transparent', 'rgba(16, 16, 18, 0.7)', Colors.bg]}
        locations={[0, 0.6, 1]}
        style={styles.gradientVertical}
      />

      {/* Content */}
      <View style={[styles.content, isMobile && styles.contentMobile]}>
        {/* Badge */}
        <View style={styles.badgeRow}>
          <Image
            source={BRAND_ASSETS.emblem}
            style={styles.monogram}
            resizeMode="contain"
          />
          <Text style={styles.kindText}>
            {item.type === 'movie' ? 'FEATURED MOVIE' : 'FEATURED SERIES'}
          </Text>
        </View>

        {/* Title */}
        <Text
          style={[styles.title, isMobile && styles.titleMobile]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        {/* Metadata */}
        <View style={styles.metaRow}>
          {item.match && <Badge text={item.match} variant="match" />}
          {item.maturity && <Badge text={item.maturity} variant="outline" />}
          {item.resolution && <Badge text={item.resolution} variant="outline" />}
          {item.duration ? (
            <Text style={styles.durationText}>{item.duration}</Text>
          ) : null}
        </View>

        {/* Synopsis */}
        {!isMobile && (
          <Text style={styles.synopsis} numberOfLines={3}>
            {item.synopsis}
          </Text>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          {/* Play Button */}
          <Focusable
            onPress={() => onPlay(item)}
            style={styles.playBtn}
            focusBorderColor={Colors.red}
            hasTVPreferredFocus={true}
          >
            <PlayIcon size={20} color="#000000" />
            <Text style={styles.playBtnText}>Play</Text>
          </Focusable>

          {/* More Info Button */}
          <Focusable
            onPress={() => onMoreInfo(item)}
            style={styles.infoBtn}
          >
            <InfoIcon size={20} color={Colors.white} />
            <Text style={styles.infoBtnText}>More Info</Text>
          </Focusable>

          {/* My List Toggle Button */}
          <Focusable
            onPress={() => onToggleList(item.id, item.title)}
            style={styles.listBtn}
          >
            {isInList ? (
              <CheckIcon size={18} color={Colors.white} />
            ) : (
              <PlusIcon size={18} color={Colors.white} />
            )}
            <Text style={styles.listBtnText}>
              {isInList ? 'In List' : 'My List'}
            </Text>
          </Focusable>
        </View>
      </View>

      {/* Right Volume / Rating Controls */}
      {!isMobile && (
        <View style={styles.rightOverlay}>
          <Focusable onPress={onToggleMute} style={styles.volBtn}>
            {isMuted ? (
              <MuteIcon size={20} color={Colors.white} />
            ) : (
              <VolumeIcon size={20} color={Colors.white} />
            )}
          </Focusable>
          <View style={styles.ratingPill}>
            <Text style={styles.ratingPillText}>{item.maturity || '16+'}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#17171b',
    overflow: 'hidden',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  gradientHorizontal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '75%',
  },
  gradientVertical: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    maxWidth: 580,
    zIndex: 10,
    gap: 12,
  },
  contentMobile: {
    left: 16,
    right: 16,
    bottom: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monogram: {
    width: 24,
    height: 24,
  },
  kindText: {
    color: '#e6dfe2',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  title: {
    color: Colors.white,
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 48,
    letterSpacing: -1,
  },
  titleMobile: {
    fontSize: 28,
    lineHeight: 32,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  durationText: {
    color: Colors.grayLight,
    fontSize: 12,
  },
  synopsis: {
    color: '#d0cdd3',
    fontSize: 14,
    lineHeight: 22,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 4,
  },
  playBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: 'bold',
  },
  infoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(109, 109, 110, 0.7)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 4,
  },
  infoBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  listBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 4,
  },
  listBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  rightOverlay: {
    position: 'absolute',
    right: 24,
    bottom: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  volBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  ratingPill: {
    backgroundColor: 'rgba(50, 50, 50, 0.7)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.red,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ratingPillText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
});
