import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../../theme/colors';
import { UserProfile, StreamingServiceOption } from '../../types';
import { StorageService } from '../../services/storageService';
import { Focusable } from '../common/Focusable';
import { NetflixSmileyIcon, ShieldIcon } from '../common/Icons';

interface ProfileSelectScreenProps {
  onSelectProfile: (profile: UserProfile) => void;
  selectedProfileId?: string;
  onOpenAdmin?: () => void;
}

const ACTIVE_PROFILE_KEY = 'meflix_active_profile_v1';

export const STREAMING_SERVICES: StreamingServiceOption[] = [
  { id: 'netflix', name: 'Meflix (Netflix)', tag: 'M-FLIX', color: '#E50914' },
  { id: 'prime', name: 'Prime Video', tag: 'PRIME', color: '#00A8E1' },
];

export const SERVICE_PROFILES: UserProfile[] = [
  {
    id: 'p_netflix',
    name: 'Meflix',
    avatarColor: '#E50914',
    primaryService: 'netflix',
    services: ['netflix'],
    avatarImage: require('../../../assets/brand/netflix-profile.jpg'),
  },
  {
    id: 'p_prime',
    name: 'Prime Video',
    avatarColor: '#00A8E1',
    primaryService: 'prime',
    services: ['prime'],
    avatarImage: require('../../../assets/brand/prime-profile.jpg'),
  },
];

export const ProfileSelectScreen: React.FC<ProfileSelectScreenProps> = ({
  onSelectProfile,
  selectedProfileId,
  onOpenAdmin,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 768;

  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(selectedProfileId);

  const handleSelect = async (profile: UserProfile) => {
    setActiveProfileId(profile.id);
    await StorageService.setItem(ACTIVE_PROFILE_KEY, profile);
    onSelectProfile(profile);
  };

  const avatarSize = isMobile ? 104 : 136;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Header Navbar */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../../assets/brand/meflix-wordmark.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {onOpenAdmin && (
          <Focusable
            onPress={onOpenAdmin}
            style={styles.adminBtn}
            accessibilityLabel="Admin Security Panel"
          >
            <ShieldIcon size={18} color="#777777" />
          </Focusable>
        )}
      </View>

      {/* Main Profile Grid View */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Who's Watching?</Text>
        <Text style={styles.subtitle}>Select your streaming service profile to begin</Text>

        <View style={styles.profileGrid}>
          {SERVICE_PROFILES.map(profile => {
            const isSelected = profile.id === activeProfileId;
            const serviceConfig = STREAMING_SERVICES.find(
              s => s.id === profile.primaryService
            );

            return (
              <Focusable
                key={profile.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${profile.name}`}
                onPress={() => handleSelect(profile)}
                style={styles.profileCard}
                focusBorderColor={Colors.white}
              >
                <View
                  style={[
                    styles.avatarBox,
                    {
                      width: avatarSize,
                      height: avatarSize,
                      backgroundColor: profile.avatarColor,
                      borderColor: isSelected ? Colors.white : 'transparent',
                    },
                  ]}
                >
                  {profile.avatarImage ? (
                    <Image
                      source={profile.avatarImage}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <NetflixSmileyIcon size={avatarSize * 0.52} color={Colors.white} />
                  )}

                  {/* Kids Badge */}
                  {profile.isKids && (
                    <View style={styles.kidsBadge}>
                      <Text style={styles.kidsBadgeText}>KIDS</Text>
                    </View>
                  )}
                </View>

                <Text
                  style={[
                    styles.profileName,
                    isSelected && styles.profileNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {profile.name}
                </Text>

                {/* Service Tag Pill */}
                {serviceConfig && (
                  <View
                    style={[
                      styles.serviceTagPill,
                      { borderColor: serviceConfig.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.serviceTagText,
                        { color: serviceConfig.color },
                      ]}
                    >
                      {serviceConfig.tag}
                    </Text>
                  </View>
                )}
              </Focusable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  logo: {
    width: 100,
    height: 30,
  },
  adminBtn: {
    padding: 8,
    borderRadius: 6,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#777777',
    fontSize: 13,
    marginBottom: 36,
    textAlign: 'center',
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    maxWidth: 520,
  },
  profileCard: {
    alignItems: 'center',
    marginHorizontal: 8,
    marginBottom: 20,
  },
  avatarBox: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileName: {
    color: '#848484',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 100,
  },
  profileNameSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  serviceTagPill: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  serviceTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  kidsBadge: {
    position: 'absolute',
    bottom: 4,
    backgroundColor: '#000000',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  kidsBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
