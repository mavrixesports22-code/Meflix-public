import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { WatchHistoryEntry, TitleItem } from '../../types';
import { Focusable } from '../common/Focusable';
import { PlayIcon, CloseIcon } from '../common/Icons';
import { ArtworkImage } from '../common/ArtworkImage';

interface ContinueWatchingRowProps {
  entries: WatchHistoryEntry[];
  onResume: (entry: WatchHistoryEntry) => void;
  onRemove: (key: string) => void;
  onViewHistory: () => void;
}

export const ContinueWatchingRow: React.FC<ContinueWatchingRowProps> = ({
  entries,
  onResume,
  onRemove,
  onViewHistory,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const cardWidth = isMobile ? 180 : 240;
  const cardHeight = isMobile ? 110 : 140;

  if (!entries || entries.length === 0) return null;

  const formatRemaining = (entry: WatchHistoryEntry) => {
    if (entry.completed) return 'Finished';
    if (entry.duration > 0) {
      const leftMinutes = Math.max(1, Math.ceil((entry.duration - entry.position) / 60));
      return `${leftMinutes} min left`;
    }
    const mins = Math.floor(entry.position / 60);
    const secs = Math.floor(entry.position % 60);
    return `Resume at ${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Continue Watching</Text>
        <Focusable onPress={onViewHistory} style={styles.viewHistoryBtn}>
          <Text style={styles.viewHistoryText}>View history ↗</Text>
        </Focusable>
      </View>

      <FlatList
        data={entries}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const percent = item.duration > 0 ? Math.min(100, (item.position / item.duration) * 100) : 0;
          const backdropUri = item.item.backdrop || item.item.poster;

          return (
            <View style={[styles.card, { width: cardWidth }]}>
              {/* Artwork with Play trigger */}
              <Focusable
                onPress={() => onResume(item)}
                style={[styles.artContainer, { height: cardHeight }]}
                focusBorderColor={Colors.red}
              >
                <ArtworkImage uri={backdropUri} title={item.item.title} style={styles.image} />
                <View style={styles.playOverlay}>
                  <View style={styles.playCircle}>
                    <PlayIcon size={16} color={Colors.white} />
                  </View>
                </View>
                {/* Progress bar */}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${percent}%` }]} />
                </View>
              </Focusable>

              {/* Caption */}
              <View style={styles.captionRow}>
                <View style={styles.textContainer}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.item.title}
                  </Text>
                  <Text style={styles.remainingText}>
                    {formatRemaining(item)}
                  </Text>
                </View>
                <Focusable
                  onPress={() => onRemove(item.key)}
                  style={styles.removeBtn}
                >
                  <CloseIcon size={16} color={Colors.gray} />
                </Focusable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  title: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  viewHistoryBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewHistoryText: {
    color: Colors.gray,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    marginRight: 12,
    backgroundColor: '#1b1b20',
    borderRadius: 6,
    overflow: 'hidden',
  },
  artContainer: {
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(20, 20, 20, 0.75)',
    borderWidth: 1.5,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.red,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
  },
  textContainer: {
    flex: 1,
    marginRight: 6,
  },
  itemTitle: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  remainingText: {
    color: Colors.gray,
    fontSize: 11,
    marginTop: 2,
  },
  removeBtn: {
    padding: 6,
  },
});
