import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Colors } from '../../theme/colors';
import { TitleItem } from '../../types';
import { Focusable } from '../common/Focusable';
import { ArtworkImage } from '../common/ArtworkImage';

interface TitleCardProps {
  item: TitleItem;
  rank?: number;
  onPress: (item: TitleItem) => void;
  progressPercent?: number;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  item,
  rank,
  onPress,
  progressPercent,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const artworkUri = item.poster || item.backdrop;

  // --- Authenticated Netflix Top 10 Card Layout ---
  if (rank !== undefined) {
    const cardWidth = isMobile ? 180 : 220;
    const cardHeight = isMobile ? 140 : 180;
    const posterWidth = isMobile ? 95 : 125;

    return (
      <Focusable
        onPress={() => onPress(item)}
        style={[styles.top10Container, { width: cardWidth, height: cardHeight }]}
        focusBorderColor={Colors.red}
      >
        {/* Giant Stylized Rank Number */}
        <Text style={[styles.top10Rank, isMobile && styles.top10RankMobile]}>
          {rank}
        </Text>

        {/* Poster Artwork on Right */}
        <View style={[styles.top10PosterWrap, { width: posterWidth }]}>
          <ArtworkImage uri={artworkUri} title={item.title} style={styles.image} />
          {progressPercent !== undefined && progressPercent > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
            </View>
          )}
        </View>
      </Focusable>
    );
  }

  // --- Standard Clean Card Layout ---
  const standardWidth = isMobile ? 120 : 160;
  const standardHeight = isMobile ? 175 : 235;

  return (
    <Focusable
      onPress={() => onPress(item)}
      style={[styles.standardContainer, { width: standardWidth, height: standardHeight }]}
      focusBorderColor={Colors.red}
    >
      <ArtworkImage uri={artworkUri} title={item.title} style={styles.image} />

      {/* MX Originals Badge */}
      {item.isOriginal && (
        <View style={styles.originalBadge}>
          <Text style={styles.originalBadgeText}>MX</Text>
        </View>
      )}

      {/* Watch Progress Bar */}
      {progressPercent !== undefined && progressPercent > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
      )}
    </Focusable>
  );
};

const styles = StyleSheet.create({
  standardContainer: {
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: Colors.cardBg,
    marginRight: 10,
    position: 'relative',
  },
  top10Container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
    position: 'relative',
  },
  top10Rank: {
    fontSize: 130,
    fontWeight: '900',
    color: '#08080b',
    letterSpacing: -12,
    marginRight: -22,
    zIndex: 1,
    includeFontPadding: false,
    textShadowColor: '#595959',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 1,
  },
  top10RankMobile: {
    fontSize: 100,
    marginRight: -16,
    letterSpacing: -8,
  },
  top10PosterWrap: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    zIndex: 2,
    backgroundColor: Colors.cardBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  originalBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Colors.red,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    zIndex: 3,
  },
  originalBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 3,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.red,
  },
});
