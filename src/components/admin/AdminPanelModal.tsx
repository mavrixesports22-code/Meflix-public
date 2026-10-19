import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { Focusable } from '../common/Focusable';
import {
  deviceAuthService,
  DeviceAccessRequest,
} from '../../services/deviceAuthService';
import {
  ShieldIcon,
  CloseIcon,
  RefreshIcon,
  TrashIcon,
  CheckIcon,
} from '../common/Icons';

interface AdminPanelModalProps {
  visible: boolean;
  onClose: () => void;
  onDeviceApproved?: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  visible,
  onClose,
  onDeviceApproved,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 768;

  const [requests, setRequests] = useState<DeviceAccessRequest[]>([]);
  const [whitelistedIps, setWhitelistedIps] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const allReqs = await deviceAuthService.getAllRequests();
      const allIps = await deviceAuthService.getWhitelistedIps();
      setRequests(allReqs);
      setWhitelistedIps(allIps);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const showToast = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const handleApprove = async (deviceId: string, name: string) => {
    await deviceAuthService.approveRequest(deviceId);
    showToast(`Approved access for ${name}`);
    await loadData();
    onDeviceApproved?.();
  };

  const handleReject = async (deviceId: string, name: string) => {
    await deviceAuthService.rejectRequest(deviceId);
    showToast(`Revoked access for ${name}`);
    await loadData();
    onDeviceApproved?.();
  };

  const handleDelete = async (deviceId: string, name: string) => {
    await deviceAuthService.deleteRequest(deviceId);
    showToast(`Removed ${name}`);
    await loadData();
    onDeviceApproved?.();
  };

  const handleAddManualIp = async () => {
    if (!manualIp.trim()) return;
    await deviceAuthService.addWhitelistedIp(manualIp.trim());
    showToast(`Whitelisted IP ${manualIp.trim()}`);
    setManualIp('');
    await loadData();
    onDeviceApproved?.();
  };

  const handleRemoveIp = async (ip: string) => {
    await deviceAuthService.removeWhitelistedIp(ip);
    showToast(`Removed IP ${ip}`);
    await loadData();
    onDeviceApproved?.();
  };

  if (!visible) return null;

  const filteredRequests = requests.filter(r => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'approved') return r.status === 'approved';
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;

  return (
    <View style={styles.backdrop}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <View
          style={[
            styles.container,
            isMobile && styles.containerMobile,
            {
              paddingTop: Math.max(16, insets.top + 8),
              paddingBottom: Math.max(16, insets.bottom + 8),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.shieldBadge}>
              <ShieldIcon size={20} color={Colors.red} />
            </View>
            <View>
              <Text style={styles.title}>Admin Security Portal</Text>
              <Text style={styles.subtitle}>
                Device Access Approvals &amp; IP Whitelist Control
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Focusable onPress={loadData} style={styles.refreshBtn}>
              <RefreshIcon size={18} color={Colors.white} />
            </Focusable>
            <Focusable onPress={onClose} style={styles.closeBtn}>
              <CloseIcon size={22} color={Colors.white} />
            </Focusable>
          </View>
        </View>

        {/* Status Notice Toast */}
        {statusNotice ? (
          <View style={styles.noticeBar}>
            <Text style={styles.noticeText}>{statusNotice}</Text>
          </View>
        ) : null}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{requests.length}</Text>
            <Text style={styles.statLabel}>Total Requests</Text>
          </View>
          <View style={[styles.statCard, styles.statCardPending]}>
            <Text style={[styles.statNum, styles.statNumPending]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pending Approval</Text>
          </View>
          <View style={[styles.statCard, styles.statCardApproved]}>
            <Text style={[styles.statNum, styles.statNumApproved]}>
              {approvedCount + whitelistedIps.length}
            </Text>
            <Text style={styles.statLabel}>Authorized Devices/IPs</Text>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(['all', 'pending', 'approved'] as const).map(tab => {
            const active = filter === tab;
            return (
              <Focusable
                key={tab}
                onPress={() => setFilter(tab)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {tab === 'all'
                    ? `All (${requests.length})`
                    : tab === 'pending'
                    ? `Pending (${pendingCount})`
                    : `Approved (${approvedCount})`}
                </Text>
              </Focusable>
            );
          })}
        </View>

        {/* Content Scroll */}
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading && requests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={Colors.red} />
              <Text style={styles.emptyText}>Loading device records…</Text>
            </View>
          ) : filteredRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🛡️</Text>
              <Text style={styles.emptyTitle}>No requests in this category</Text>
              <Text style={styles.emptyText}>
                {filter === 'pending'
                  ? 'All devices have been reviewed.'
                  : 'New device requests will appear here.'}
              </Text>
            </View>
          ) : (
            <View style={styles.cardsList}>
              {filteredRequests.map(req => {
                const isApproved = req.status === 'approved';
                const isPending = req.status === 'pending';
                const isRejected = req.status === 'rejected';

                return (
                  <View key={req.deviceId} style={styles.deviceCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardUser}>
                        <Text style={styles.userName}>{req.name}</Text>
                        <Text style={styles.devicePlatform}>{req.platform}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          isApproved && styles.statusBadgeApproved,
                          isPending && styles.statusBadgePending,
                          isRejected && styles.statusBadgeRejected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            isApproved && styles.statusTextApproved,
                            isPending && styles.statusTextPending,
                            isRejected && styles.statusTextRejected,
                          ]}
                        >
                          {isApproved
                            ? 'APPROVED'
                            : isPending
                            ? 'PENDING'
                            : 'DECLINED'}
                        </Text>
                      </View>
                    </View>

                    {/* Metadata Grid */}
                    <View style={styles.metaGrid}>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>IP ADDRESS</Text>
                        <Text style={styles.metaValueIp}>{req.ip || 'Unknown'}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>DEVICE ID</Text>
                        <Text style={styles.metaValueMono}>{req.deviceId}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>REQUEST TIME</Text>
                        <Text style={styles.metaValue}>
                          {new Date(req.requestedAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.cardActions}>
                      {!isApproved && (
                        <Focusable
                          onPress={() => handleApprove(req.deviceId, req.name)}
                          style={styles.approveBtn}
                        >
                          <CheckIcon size={16} color={Colors.white} />
                          <Text style={styles.approveBtnText}>Approve &amp; Allow IP</Text>
                        </Focusable>
                      )}

                      {isApproved && (
                        <Focusable
                          onPress={() => handleReject(req.deviceId, req.name)}
                          style={styles.revokeBtn}
                        >
                          <Text style={styles.revokeBtnText}>Revoke Access</Text>
                        </Focusable>
                      )}

                      {isPending && (
                        <Focusable
                          onPress={() => handleReject(req.deviceId, req.name)}
                          style={styles.declineBtn}
                        >
                          <Text style={styles.declineBtnText}>Decline</Text>
                        </Focusable>
                      )}

                      <Focusable
                        onPress={() => handleDelete(req.deviceId, req.name)}
                        style={styles.deleteBtn}
                      >
                        <TrashIcon size={16} color={Colors.gray} />
                      </Focusable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Quick Manual IP Whitelist Section */}
          <View style={styles.whitelistSection}>
            <Text style={styles.sectionHeading}>Manual IP Whitelist</Text>
            <Text style={styles.sectionSub}>
              Any device connected through these IP addresses can access Meflix immediately.
            </Text>

            <View style={styles.ipInputRow}>
              <TextInput
                value={manualIp}
                onChangeText={setManualIp}
                placeholder="Enter IP (e.g. 192.168.1.50 or 103.21.x.x)"
                placeholderTextColor={Colors.gray}
                style={styles.ipInput}
                autoCapitalize="none"
              />
              <Focusable onPress={handleAddManualIp} style={styles.addIpBtn}>
                <Text style={styles.addIpBtnText}>+ Whitelist IP</Text>
              </Focusable>
            </View>

            {whitelistedIps.length > 0 && (
              <View style={styles.ipTagsRow}>
                {whitelistedIps.map(ip => (
                  <View key={ip} style={styles.ipTag}>
                    <Text style={styles.ipTagText}>{ip}</Text>
                    <Focusable
                      onPress={() => handleRemoveIp(ip)}
                      style={styles.ipTagRemove}
                    >
                      <CloseIcon size={14} color={Colors.grayLight} />
                    </Focusable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardAvoid: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: '92%',
    maxWidth: 720,
    maxHeight: '90%',
    backgroundColor: '#121217',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
  },
  containerMobile: {
    width: '100%',
    height: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    borderWidth: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  shieldBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.gray,
    fontSize: 11,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  closeBtn: {
    padding: 8,
  },
  noticeBar: {
    backgroundColor: '#1e3a2f',
    borderColor: '#2ecc71',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  noticeText: {
    color: '#2ecc71',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#181820',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  statCardPending: {
    borderColor: 'rgba(241, 196, 15, 0.25)',
  },
  statCardApproved: {
    borderColor: 'rgba(46, 204, 113, 0.25)',
  },
  statNum: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  statNumPending: {
    color: '#f1c40f',
  },
  statNumApproved: {
    color: '#2ecc71',
  },
  statLabel: {
    color: Colors.gray,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  filterPillActive: {
    backgroundColor: Colors.red,
  },
  filterText: {
    color: Colors.grayLight,
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: Colors.white,
  },
  scroll: {
    flex: 1,
  },
  emptyContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.gray,
    fontSize: 13,
    textAlign: 'center',
  },
  cardsList: {
    gap: 12,
    marginBottom: 20,
  },
  deviceCard: {
    backgroundColor: '#181820',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardUser: {
    flex: 1,
  },
  userName: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  devicePlatform: {
    color: Colors.gray,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusBadgeApproved: {
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.4)',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(241, 196, 15, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(241, 196, 15, 0.4)',
  },
  statusBadgeRejected: {
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.4)',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextApproved: {
    color: '#2ecc71',
  },
  statusTextPending: {
    color: '#f1c40f',
  },
  statusTextRejected: {
    color: '#e74c3c',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: 10,
    borderRadius: 6,
  },
  metaItem: {
    minWidth: 120,
  },
  metaLabel: {
    color: Colors.gray,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metaValueIp: {
    color: '#3498db',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  metaValueMono: {
    color: Colors.grayLight,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  metaValue: {
    color: Colors.white,
    fontSize: 12,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#27ae60',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  approveBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  revokeBtn: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.4)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  revokeBtnText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '600',
  },
  declineBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  declineBtnText: {
    color: Colors.grayLight,
    fontSize: 12,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginLeft: 'auto',
  },
  whitelistSection: {
    backgroundColor: '#181820',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionHeading: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionSub: {
    color: Colors.gray,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
  },
  ipInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ipInput: {
    flex: 1,
    backgroundColor: '#0d0d12',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 6,
    color: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  addIpBtn: {
    backgroundColor: Colors.red,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 6,
  },
  addIpBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  ipTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  ipTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 152, 219, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 152, 219, 0.35)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  ipTagText: {
    color: '#3498db',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  ipTagRemove: {
    padding: 2,
  },
});
