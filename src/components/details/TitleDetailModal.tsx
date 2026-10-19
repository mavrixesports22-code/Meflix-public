import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';
import { TitleItem, Episode } from '../../types';
import { netmirrorService } from '../../services/netmirrorService';
import { Focusable } from '../common/Focusable';
import { Badge } from '../common/Badge';
import { TitleCard } from '../home/TitleCard';
import { PlayIcon, PlusIcon, CheckIcon, CloseIcon } from '../common/Icons';
import { ArtworkImage } from '../common/ArtworkImage';

interface TitleDetailModalProps {
  item: TitleItem | null;
  visible: boolean;
  onClose: () => void;
  onPlay: (item: TitleItem, episode?: Episode) => void;
  isInList: boolean;
  onToggleList: (id: string, title?: string) => void;
  onSelectRelated: (item: TitleItem) => void;
}

export const TitleDetailModal: React.FC<TitleDetailModalProps> = ({
  item,
  visible,
  onClose,
  onPlay,
  isInList,
  onToggleList,
  onSelectRelated,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 768;
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [currentEpisodes, setCurrentEpisodes] = useState<Episode[]>([]);
  const [hasLoadedSeason, setHasLoadedSeason] = useState(false);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState('');
  const [recommendations, setRecommendations] = useState<TitleItem[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(0);
  const episodeRequest = useRef(0);
  const previewFrames = [...new Set([item?.backdrop, item?.poster].filter((uri): uri is string => Boolean(uri)))];

  useEffect(() => {
    setCurrentEpisodes(item?.episodes || []);
    setHasLoadedSeason(false);
    setSelectedSeasonIdx(Math.max(0, item?.seasons?.findIndex(season => season.id === item.selectedSeason) ?? 0));
    setEpisodesError('');
    setEpisodesLoading(false);
    setRecommendations([]);
    setRecommendationsLoading(false);
    setPreviewFrame(0);
    episodeRequest.current++;
    if (!visible || !item) return;
    let active = true;
    if (item.type === 'series' && !(item.episodes?.length) && item.seasons?.[0]) {
      setEpisodesLoading(true);
      setHasLoadedSeason(true);
      netmirrorService.fetchEpisodes(item.seasons[0].id).then(list => { if (active) setCurrentEpisodes(list); })
        .catch(() => { if (active) setEpisodesError('Episodes could not be loaded. Select the season to retry.'); })
        .finally(() => { if (active) setEpisodesLoading(false); });
    }
    const references = (item.suggestions || []).slice(0, 6);
    if (references.length) {
      setRecommendationsLoading(true);
      Promise.allSettled(references.map(reference => netmirrorService.fetchTitle(reference.netmirrorId || reference.id)))
        .then(results => { if (active) setRecommendations(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])); })
        .finally(() => { if (active) setRecommendationsLoading(false); });
    }
    return () => { active = false; episodeRequest.current++; };
  }, [item, visible]);

  useEffect(() => {
    if (!visible || !item || previewFrames.length < 2) return;
    const timer = setInterval(() => setPreviewFrame(index => (index + 1) % previewFrames.length), 9000);
    return () => clearInterval(timer);
  }, [visible, item?.id, item?.backdrop, item?.poster]);

  if (!item) return null;

  const backdropUri = previewFrames[previewFrame % Math.max(previewFrames.length, 1)];
  const episodes = hasLoadedSeason ? currentEpisodes : (item.episodes || []);
  const seasons = item.seasons || [];

  const handleSelectSeason = async (idx: number, seasonId: string) => {
    const requestId = ++episodeRequest.current;
    setSelectedSeasonIdx(idx);
    setCurrentEpisodes([]);
    setHasLoadedSeason(true);
    setEpisodesLoading(true);
    setEpisodesError('');
    try {
      const fetched = await netmirrorService.fetchEpisodes(seasonId);
      if (episodeRequest.current === requestId) setCurrentEpisodes(fetched);
    } catch { if (episodeRequest.current === requestId) setEpisodesError('Episodes could not be loaded. Tap the season to retry.'); }
    finally { if (episodeRequest.current === requestId) setEpisodesLoading(false); }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          {/* Close Button */}
          <Focusable onPress={onClose} style={[styles.closeBtn, isMobile && { top: insets.top + 10 }]}>
            <CloseIcon size={20} color={Colors.white} />
          </Focusable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(40, insets.bottom + 24) }]}>
            {/* Modal Hero Banner */}
            <View style={styles.heroBanner}>
              <ArtworkImage uri={backdropUri} title={item.title} style={styles.heroImage} />
              <LinearGradient
                colors={['transparent', 'rgba(25, 25, 29, 0.8)', Colors.modalBg]}
                style={styles.heroGradient}
              />
              <View style={styles.heroContent}>
                <Text style={styles.title}>{item.title}</Text>
                <View style={styles.heroActions}>
                  <Focusable
                    onPress={() => onPlay(item)}
                    style={styles.playBtn}
                    focusBorderColor={Colors.red}
                    hasTVPreferredFocus={true}
                  >
                    <PlayIcon size={20} color="#000000" />
                    <Text style={styles.playBtnText}>Play</Text>
                  </Focusable>

                  <Focusable
                    onPress={() => onToggleList(item.id, item.title)}
                    style={styles.roundListBtn}
                  >
                    {isInList ? (
                      <CheckIcon size={20} color={Colors.white} />
                    ) : (
                      <PlusIcon size={20} color={Colors.white} />
                    )}
                  </Focusable>
                </View>
              </View>
            </View>

            {/* Modal Body */}
            <View style={styles.body}>
              <View style={[styles.metaGrid, isMobile && styles.metaGridMobile]}>
                {/* Left Overview Column */}
                <View style={styles.overviewCol}>
                  <View style={styles.badgeRow}>
                    {item.match && <Badge text={item.match} variant="match" />}
                    {item.year && <Text style={styles.grayMeta}>{item.year}</Text>}
                    {item.maturity && <Badge text={item.maturity} variant="outline" />}
                    {item.duration && <Text style={styles.grayMeta}>{item.duration}</Text>}
                    {item.resolution && <Badge text={item.resolution} variant="outline" />}
                  </View>
                  <Text style={styles.synopsis}>{item.synopsis}</Text>
                </View>

                {/* Right Credits Column */}
                <View style={styles.creditsCol}>
                  {item.cast && item.cast.length > 0 && (
                    <Text style={styles.creditText}>
                      <Text style={styles.creditLabel}>Cast: </Text>
                      {item.cast.slice(0, 4).join(', ')}
                    </Text>
                  )}
                  {item.creator && (
                    <Text style={styles.creditText}>
                      <Text style={styles.creditLabel}>Creator: </Text>
                      {item.creator}
                    </Text>
                  )}
                  {item.genres && item.genres.length > 0 && (
                    <Text style={styles.creditText}>
                      <Text style={styles.creditLabel}>Genres: </Text>
                      {item.genres.join(', ')}
                    </Text>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <Text style={styles.creditText}>
                      <Text style={styles.creditLabel}>This show is: </Text>
                      {item.tags.join(', ')}
                    </Text>
                  )}
                </View>
              </View>

              {/* Episodes Section (Series) */}
              {(item.type === 'series' || seasons.length > 0) && (
                <View style={styles.episodesSection}>
                  <View style={styles.episodesHeader}>
                    <Text style={styles.episodesTitle}>Episodes</Text>
                    {seasons.length > 1 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonPicker}>
                        {seasons.map((s, idx) => (
                          <Focusable
                            key={s.id || idx}
                            onPress={() => handleSelectSeason(idx, s.id)}
                            style={[
                              styles.seasonBtn,
                              selectedSeasonIdx === idx && styles.seasonBtnActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.seasonBtnText,
                                selectedSeasonIdx === idx && styles.seasonBtnTextActive,
                              ]}
                            >
                              {s.s || `Season ${idx + 1}`}
                            </Text>
                          </Focusable>
                        ))}
                      </ScrollView>
                    )}
                  </View>

                  {/* Episodes List */}
                  {episodesLoading && <ActivityIndicator color={Colors.red} style={{ paddingVertical: 10 }} />}
                  {!!episodesError && <Text accessibilityRole="alert" style={styles.creditText}>{episodesError}</Text>}
                  <View style={styles.episodesList}>
                    {episodes.map(ep => (
                      <Focusable
                        key={ep.netmirrorId || ep.num}
                        onPress={() => onPlay(item, ep)}
                        style={styles.episodeCard}
                        focusBorderColor={Colors.red}
                      >
                        <Text style={styles.episodeNum}>{ep.num}</Text>
                        <ArtworkImage uri={ep.thumb || backdropUri} title={ep.title} style={styles.episodeThumb} />
                        <View style={styles.episodeInfo}>
                          <View style={styles.episodeTitleRow}>
                            <Text style={styles.episodeTitle} numberOfLines={1}>
                              {ep.title}
                            </Text>
                            {ep.duration && (
                              <Text style={styles.episodeDuration}>{ep.duration}</Text>
                            )}
                          </View>
                          {ep.synopsis ? (
                            <Text style={styles.episodeSynopsis} numberOfLines={2}>
                              {ep.synopsis}
                            </Text>
                          ) : null}
                        </View>
                      </Focusable>
                    ))}
                  </View>
                  {!episodesLoading && !episodesError && episodes.length === 0 && <Text style={styles.creditText}>No episodes are available for this season.</Text>}
                </View>
              )}

              {/* Recommendations Section */}
              {(recommendationsLoading || recommendations.length > 0) && (
                <View style={styles.recommendationsSection}>
                  <Text style={styles.recHeading}>More Like This</Text>
                  {recommendationsLoading && recommendations.length === 0 && <ActivityIndicator color={Colors.red} />}
                  <View style={styles.recGrid}>
                    {recommendations.slice(0, 6).map(rec => (
                      <TitleCard
                        key={rec.id}
                        item={rec}
                        onPress={() => onSelectRelated(rec)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: Colors.modalBg,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroBanner: {
    width: '100%',
    height: 270,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroContent: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    gap: 14,
  },
  title: {
    color: Colors.white,
    fontSize: 32,
    fontWeight: '800',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 4,
  },
  playBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  roundListBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    backgroundColor: 'rgba(40, 40, 45, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 24,
    gap: 24,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 32,
  },
  metaGridMobile: {
    flexDirection: 'column',
    gap: 16,
  },
  overviewCol: {
    flex: 3,
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  grayMeta: {
    color: Colors.grayLight,
    fontSize: 13,
  },
  synopsis: {
    color: '#d0cdd3',
    fontSize: 14,
    lineHeight: 22,
  },
  creditsCol: {
    flex: 2,
    gap: 8,
  },
  creditText: {
    color: '#d0cdd3',
    fontSize: 13,
    lineHeight: 18,
  },
  creditLabel: {
    color: Colors.gray,
  },
  episodesSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 20,
    gap: 16,
  },
  episodesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  episodesTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  seasonPicker: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 38,
  },
  seasonBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#26262e',
  },
  seasonBtnActive: {
    backgroundColor: Colors.red,
  },
  seasonBtnText: {
    color: Colors.grayLight,
    fontSize: 12,
  },
  seasonBtnTextActive: {
    color: Colors.white,
    fontWeight: 'bold',
  },
  episodesList: {
    gap: 12,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#1f1f26',
    borderRadius: 6,
    gap: 12,
  },
  episodeNum: {
    color: Colors.gray,
    fontSize: 18,
    fontWeight: 'bold',
    width: 24,
    textAlign: 'center',
  },
  episodeThumb: {
    width: 100,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#111',
  },
  episodeInfo: {
    flex: 1,
    gap: 4,
  },
  episodeTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  episodeTitle: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  episodeDuration: {
    color: Colors.gray,
    fontSize: 12,
  },
  episodeSynopsis: {
    color: Colors.gray,
    fontSize: 12,
    lineHeight: 16,
  },
  recommendationsSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 20,
    gap: 16,
  },
  recHeading: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  recGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
