import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../theme/colors';
import { TitleItem } from '../../types';
import { TitleCard } from '../home/TitleCard';
import { Focusable } from '../common/Focusable';

interface SearchGridProps {
  query: string;
  results: TitleItem[];
  recentSearches: string[];
  onSelectTitle: (item: TitleItem) => void;
  onSelectRecent: (term: string) => void;
  onClearRecent: () => void;
}

export const SearchGrid: React.FC<SearchGridProps> = ({
  query,
  results,
  recentSearches,
  onSelectTitle,
  onSelectRecent,
  onClearRecent,
}) => {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
      {/* Recent Searches Pills (if query is empty) */}
      {!query && recentSearches.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionTitle}>Recent Searches</Text>
            <Focusable onPress={onClearRecent} style={styles.clearBtn}>
              <Text style={styles.clearText}>Clear</Text>
            </Focusable>
          </View>
          <View style={styles.pillsRow}>
            {recentSearches.map((term, idx) => (
              <Focusable
                key={idx}
                onPress={() => onSelectRecent(term)}
                style={styles.pill}
                focusBorderColor={Colors.red}
              >
                <Text style={styles.pillText}>{term}</Text>
              </Focusable>
            ))}
          </View>
        </View>
      )}

      {/* Query Title */}
      <Text style={styles.heading}>
        {query ? `Results for "${query}"` : 'Popular Searches & Discover'}
      </Text>

      {/* Results Grid */}
      {results.length > 0 ? (
        <View style={styles.grid}>
          {results.map(item => (
            <View key={item.id} style={styles.cardWrapper}>
              <TitleCard item={item} onPress={onSelectTitle} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>No results found for "{query}"</Text>
          <Text style={styles.emptySubtitle}>
            Try searching for another movie, TV show, genre or actor name.
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
  },
  recentSection: {
    gap: 10,
    marginBottom: 8,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.gray,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    color: Colors.red,
    fontSize: 12,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    backgroundColor: '#202026',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pillText: {
    color: Colors.white,
    fontSize: 13,
  },
  heading: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  cardWrapper: {
    marginBottom: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: Colors.gray,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 380,
  },
});
