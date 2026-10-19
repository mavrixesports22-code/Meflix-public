import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { NavTab } from '../../types';
import { Focusable } from '../common/Focusable';
import { SearchIcon, CloseIcon, HelpIcon, UserIcon, CaretDownIcon, NetflixSmileyIcon, ShieldIcon } from '../common/Icons';
import { UserProfile } from '../../types';
import { BRAND_ASSETS } from '../../theme/brandAssets';

interface TopNavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  onOpenHistory: () => void;
  onShowToast?: (message: string) => void;
  onDisconnectService?: () => void;
  onOpenAdmin?: () => void;
  activeProfile?: UserProfile | null;
  onSwitchProfile?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  isSearchOpen,
  onToggleSearch,
  onOpenHistory,
  onShowToast,
  onDisconnectService,
  onOpenAdmin,
  activeProfile,
  onSwitchProfile,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 768;
  const [profileOpen, setProfileOpen] = useState(false);

  const tabs: { key: NavTab; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'tv', label: 'TV Shows' },
    { key: 'movies', label: 'Movies' },
    { key: 'popular', label: 'New & Popular' },
    { key: 'my-list', label: 'My List' },
  ];

  const contentHeight = isMobile ? 54 : 64;
  const navbarTotalHeight = contentHeight + insets.top;

  return (
    <View style={[styles.container, { height: navbarTotalHeight, paddingTop: insets.top }]}>
      <View style={styles.leftSection}>
        {/* Logo */}
        <Focusable onPress={() => onSelectTab('home')} style={styles.logoBtn}>
          <Image
            source={BRAND_ASSETS.wordmark}
            style={styles.logo}
            resizeMode="contain"
          />
        </Focusable>

        {/* Desktop/TV Navigation Links */}
        {!isMobile && (
          <View style={styles.navLinks}>
            {tabs.map(tab => {
              const active = currentTab === tab.key;
              return (
                <Focusable
                  key={tab.key}
                  onPress={() => onSelectTab(tab.key)}
                  style={[styles.navLink, active && styles.navLinkActive]}
                  focusBorderColor={Colors.red}
                >
                  <Text style={[styles.navLinkText, active && styles.navLinkTextActive]}>
                    {tab.label}
                  </Text>
                  {active && <View style={styles.activeIndicator} />}
                </Focusable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.rightSection}>
        {/* Search Input / Toggle */}
        <View style={[styles.searchBox, isSearchOpen && styles.searchBoxOpen]}>
          <Focusable onPress={onToggleSearch} style={styles.iconBtn}>
            <SearchIcon size={18} color={Colors.white} />
          </Focusable>
          {isSearchOpen && (
            <>
              <TextInput
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Search movies and series..."
                placeholderTextColor={Colors.gray}
                style={styles.searchInput}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Focusable onPress={() => onSearchChange('')} style={styles.clearBtn}>
                  <CloseIcon size={16} color={Colors.gray} />
                </Focusable>
              )}
            </>
          )}
        </View>

        {/* Help / Shortcuts Icon Button */}
        {!isMobile && (
          <Focusable
            onPress={() =>
              onShowToast?.(
                'Player shortcuts: Space to pause, ← / → to seek, M to mute, F for fullscreen. Choose a language under Audio.'
              )
            }
            style={styles.iconBtn}
          >
            <HelpIcon size={20} color={Colors.white} />
          </Focusable>
        )}

        {/* Admin Panel Quick Access Button */}
        {onOpenAdmin && (
          <Focusable
            onPress={onOpenAdmin}
            style={styles.iconBtn}
            accessibilityLabel="Admin Security Panel"
          >
            <ShieldIcon size={19} color="#888888" />
          </Focusable>
        )}

        {/* Profile Avatar: Tapping immediately switches profiles ("Who's Watching?") */}
        <Focusable
          onPress={() => onSwitchProfile?.()}
          style={styles.profileToggle}
          accessibilityLabel={`Active profile: ${activeProfile?.name || 'User'}. Tap to switch profile.`}
        >
          <View
            style={[
              styles.avatar,
              activeProfile?.avatarColor ? { backgroundColor: activeProfile.avatarColor } : null,
            ]}
          >
            {activeProfile?.avatarImage ? (
              <Image
                source={activeProfile.avatarImage}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <NetflixSmileyIcon size={16} color="#FFFFFF" />
            )}
          </View>
        </Focusable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: Colors.glassNav,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  logoBtn: {
    paddingVertical: 4,
  },
  logo: {
    width: 120,
    height: 38,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  navLink: {
    paddingVertical: 8,
    position: 'relative',
  },
  navLinkActive: {},
  navLinkText: {
    color: Colors.grayLight,
    fontSize: 14,
    fontWeight: '500',
  },
  navLinkTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.red,
    borderRadius: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 6,
  },
  searchBoxOpen: {
    backgroundColor: '#1b1b22',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  searchInput: {
    color: Colors.white,
    fontSize: 13,
    paddingVertical: 6,
    paddingHorizontal: 8,
    width: Platform.select({ web: 220, default: 160 }),
  },
  clearBtn: {
    padding: 4,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 20,
  },
  profileToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: '#0080FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileDropdown: {
    position: 'absolute',
    top: 56,
    right: 0,
    width: 220,
    backgroundColor: '#202026',
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 1000,
  },
  dropdownHeading: {
    color: Colors.gray,
    fontSize: 11,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownText: {
    color: Colors.white,
    fontSize: 13,
  },
  disconnectItem: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 4,
  },
  disconnectText: {
    color: '#ff9297',
    fontSize: 13,
  },
});
