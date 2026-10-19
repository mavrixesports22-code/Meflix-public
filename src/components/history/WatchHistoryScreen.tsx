import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { WatchHistoryEntry } from '../../types';
import { Focusable } from '../common/Focusable';
import { PlayIcon, CloseIcon } from '../common/Icons';
import { ArtworkImage } from '../common/ArtworkImage';

interface WatchHistoryScreenProps {
  entries: WatchHistoryEntry[];
  onResume: (entry: WatchHistoryEntry) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onStartBrowsing: () => void;
}

export const WatchHistoryScreen: React.FC<WatchHistoryScreenProps> = ({
  entries,
  onResume,
  onRemove,
  onClear,
  onStartBrowsing,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

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

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>Watch history</Text>
          <Text style={styles.subtitle}>
            {entries.length > 0
              ? `${entries.length} watched ${entries.length === 1 ? 'title or episode' : 'titles and episodes'} · Saved on this device`
              : 'Your watched titles will be saved on this device.'}
          </Text>
        </View>

        {entries.length > 0 && (
          <Focusable onPress={onClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear history</Text>
          </Focusable>
        )}
      </View>

      {/* Entries List or Empty State */}
      {entries.length > 0 ? (
        <View style={styles.list}>
          {entries.map(entry => {
            const thumb = entry.item.backdrop || entry.item.poster;

            return (
              <View key={entry.key} style={styles.row}>
                {/* Thumbnail with Play */}
                <Focusable
                  onPress={() => onResume(entry)}
                  style={[styles.thumbContainer, isMobile && styles.thumbContainerMobile]}
                  focusBorderColor={Colors.red}
                >
                  <ArtworkImage uri={thumb} title={entry.item.title} style={styles.thumbImage} />
                  <View style={styles.playOverlay}>
                    <PlayIcon size={18} color={Colors.white} />
                  </View>
                </Focusable>

                {/* Details */}
                <View style={styles.details}>
                  <Text style={styles.entryTitle} numberOfLines={1}>
                    {entry.item.title}
                  </Text>
                  <Text style={styles.entryKind}>
                    {entry.episode || (entry.item.type === 'movie' ? 'Movie' : 'Episode')}
                  </Text>
                  <Text style={styles.entryMeta}>
                    {formatRemaining(entry)} · {formatDate(entry.updatedAt)}
                  </Text>
                </View>

                {/* Remove button */}
                <Focusable
                  onPress={() => onRemove(entry.key)}
                  style={styles.removeBtn}
                >
                  <CloseIcon size={18} color={Colors.gray} />
                </Focusable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>⏱</Text>
          <Text style={styles.emptyTitle}>No watch history yet</Text>
          <Text style={styles.emptySubtitle}>Titles you watch will appear here.</Text>
          <Focusable onPress={onStartBrowsing} style={styles.browseBtn}>
            <Text style={styles.browseBtnText}>Browse titles</Text>
          </Focusable>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 16,
  },
  headerTitles: {
    gap: 4,
  },
  title: {
    color: Colors.white,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.gray,
    fontSize: 13,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#26262e',
  },
  clearText: {
    color: Colors.red,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1b20',
    borderRadius: 8,
    padding: 10,
    gap: 14,
  },
  thumbContainer: {
    width: 140,
    height: 80,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbContainerMobile: {
    width: 100,
    height: 60,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    gap: 4,
  },
  entryTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  entryKind: {
    color: Colors.grayLight,
    fontSize: 12,
  },
  entryMeta: {
    color: Colors.gray,
    fontSize: 11,
  },
  removeBtn: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: Colors.gray,
    fontSize: 14,
  },
  browseBtn: {
    marginTop: 8,
    backgroundColor: Colors.red,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 4,
  },
  browseBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
