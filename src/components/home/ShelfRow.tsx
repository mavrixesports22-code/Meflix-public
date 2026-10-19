import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { TitleItem, Shelf } from '../../types';
import { TitleCard } from './TitleCard';

interface ShelfRowProps {
  shelf: Shelf;
  items: TitleItem[];
  onSelectTitle: (item: TitleItem) => void;
  watchProgressMap?: Record<string, number>;
}

export const ShelfRow: React.FC<ShelfRowProps> = ({
  shelf,
  items,
  onSelectTitle,
  watchProgressMap = {},
}) => {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Shelf Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{shelf.title}</Text>
        {shelf.badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{shelf.badge}</Text>
          </View>
        )}
      </View>

      {/* Horizontal Carousel */}
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <TitleCard
            item={item}
            rank={shelf.isTop10 ? index + 1 : undefined}
            onPress={onSelectTitle}
            progressPercent={watchProgressMap[item.netmirrorId || item.id]}
          />
        )}
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
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  title: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  badge: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.4)',
  },
  badgeText: {
    color: Colors.red,
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
});
