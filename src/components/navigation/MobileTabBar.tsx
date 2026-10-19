import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { NavTab } from '../../types';
import { Focusable } from '../common/Focusable';
import { HomeIcon, PopularIcon, MyListIcon } from '../common/Icons';

interface MobileTabBarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({ currentTab, onSelectTab }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(6, insets.bottom);
  const isHomeActive = ['home', 'tv', 'movies'].includes(currentTab);
  const isPopularActive = currentTab === 'popular';
  const isMyListActive = ['my-list', 'history'].includes(currentTab);

  return (
    <View style={[styles.container, { height: 50 + bottomInset, paddingBottom: bottomInset }]}>
      <Focusable
        onPress={() => onSelectTab('home')}
        style={styles.tab}
        scaleOnFocus={false}
      >
        <HomeIcon size={22} color={isHomeActive ? Colors.white : Colors.gray} />
        <Text style={[styles.label, isHomeActive && styles.labelActive]}>Home</Text>
      </Focusable>

      <Focusable
        onPress={() => onSelectTab('popular')}
        style={styles.tab}
        scaleOnFocus={false}
      >
        <PopularIcon size={22} color={isPopularActive ? Colors.white : Colors.gray} />
        <Text style={[styles.label, isPopularActive && styles.labelActive]}>New & Popular</Text>
      </Focusable>

      <Focusable
        onPress={() => onSelectTab('my-list')}
        style={styles.tab}
        scaleOnFocus={false}
      >
        <MyListIcon size={22} color={isMyListActive ? Colors.white : Colors.gray} />
        <Text style={[styles.label, isMyListActive && styles.labelActive]}>My Meflix</Text>
      </Focusable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 56,
    flexDirection: 'row',
    backgroundColor: '#121216',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 4,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    color: Colors.gray,
    marginTop: 4,
    fontWeight: '500',
  },
  labelActive: {
    color: Colors.white,
    fontWeight: '700',
  },
});
