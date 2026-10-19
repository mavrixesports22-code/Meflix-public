import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { Focusable } from '../common/Focusable';
import {
  deviceAuthService,
  DeviceAccessRequest,
} from '../../services/deviceAuthService';
import { RefreshIcon } from '../common/Icons';

interface DeviceAccessGateProps {
  status: 'unregistered' | 'pending' | 'rejected';
  ip: string;
  deviceId: string;
  existingRequest?: DeviceAccessRequest;
  onAccessApproved: () => void;
  onOpenAdmin: () => void;
}

export const DeviceAccessGate: React.FC<DeviceAccessGateProps> = ({
  status: initialStatus,
  ip,
  deviceId,
  existingRequest,
  onAccessApproved,
  onOpenAdmin,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 600;

  const [currentStatus, setCurrentStatus] = useState<'unregistered' | 'pending' | 'rejected'>(
    initialStatus
  );
  const [userName, setUserName] = useState(existingRequest?.name || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Admin PIN prompt state
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Sync state if initialStatus prop changes
  useEffect(() => {
    setCurrentStatus(initialStatus);
  }, [initialStatus]);

  // Periodic polling when pending: check if admin approved the device/IP
  useEffect(() => {
    if (currentStatus !== 'pending') return;

    const interval = setInterval(async () => {
      const res = await deviceAuthService.checkDeviceStatus();
      if (res.status === 'approved') {
        onAccessApproved();
      } else if (res.status === 'rejected') {
        setCurrentStatus('rejected');
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [currentStatus, onAccessApproved]);

  const handleSubmitRequest = async () => {
    if (!userName.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await deviceAuthService.submitAccessRequest(userName.trim());
      setCurrentStatus('pending');
      setIsSubmitting(false);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Failed to submit request.');
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    setErrorMessage(null);
    try {
      const res = await deviceAuthService.checkDeviceStatus();
      if (res.status === 'approved') {
        onAccessApproved();
      } else if (res.status === 'rejected') {
        setCurrentStatus('rejected');
      } else if (res.status === 'pending') {
        setErrorMessage('Status: Request submitted and pending approval.');
      } else {
        setCurrentStatus('unregistered');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleVerifyPin = async () => {
    setPinError(null);
    const valid = await deviceAuthService.verifyAdminPin(adminPin);
    if (valid) {
      setShowPinPrompt(false);
      setAdminPin('');
      onOpenAdmin();
    } else {
      setPinError('Invalid Admin Passcode. Default is 778899.');
    }
  };

  return (
    <View style={styles.outerContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(24, insets.top + 20),
              paddingBottom: Math.max(32, insets.bottom + 24),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.card, isMobile && styles.cardMobile]}>
            {/* Netflix Brand Wordmark */}
            <Image
              source={require('../../../assets/brand/meflix-wordmark.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            {/* Title & Description */}
            {currentStatus === 'unregistered' && (
              <>
                <Text style={styles.heading}>Request Access</Text>
                <Text style={styles.subheading}>
                  Enter your name to request streaming access for this device.
                </Text>
              </>
            )}

            {currentStatus === 'pending' && (
              <>
                <Text style={styles.heading}>Thanks for sending!</Text>
                <Text style={styles.subheading}>
                  We have received your access request{userName ? ` for ${userName}` : ''}.
                  Your device will unlock automatically as soon as it is approved.
                </Text>
              </>
            )}

            {currentStatus === 'rejected' && (
              <>
                <Text style={[styles.heading, styles.headingDeclined]}>Access Declined</Text>
                <Text style={styles.subheading}>
                  Your device request was declined by the administrator. Contact your admin
                  or submit a new request.
                </Text>
              </>
            )}

            {/* Subtle Device Info (Authentic Netflix metadata styling) */}
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                IP: <Text style={styles.metaHighlight}>{ip || 'Detecting…'}</Text>
              </Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{deviceAuthService.getPlatformName()}</Text>
            </View>

            {/* Main Form Elements */}
            {currentStatus === 'unregistered' && (
              <View style={styles.formArea}>
                <TextInput
                  value={userName}
                  onChangeText={setUserName}
                  placeholder="Enter your name"
                  placeholderTextColor="#8c8c8c"
                  style={styles.textInput}
                  autoCapitalize="words"
                  autoFocus={!isMobile}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitRequest}
                />

                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

                <Focusable
                  onPress={handleSubmitRequest}
                  style={styles.primaryBtn}
                  focusBorderColor={Colors.white}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send Access Request</Text>
                  )}
                </Focusable>
              </View>
            )}

            {currentStatus === 'pending' && (
              <View style={styles.formArea}>
                {/* Clean Netflix status row */}
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color={Colors.red} />
                  <Text style={styles.statusText}>Checking for approval…</Text>
                </View>

                {errorMessage ? <Text style={styles.noticeText}>{errorMessage}</Text> : null}

                <Focusable onPress={handleManualCheck} style={styles.secondaryBtn}>
                  {isChecking ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <RefreshIcon size={16} color={Colors.white} />
                      <Text style={styles.secondaryBtnText}>Check Status Now</Text>
                    </>
                  )}
                </Focusable>

                <Focusable
                  onPress={() => setCurrentStatus('unregistered')}
                  style={styles.textLinkBtn}
                >
                  <Text style={styles.textLink}>Edit Name / Re-send</Text>
                </Focusable>
              </View>
            )}

            {currentStatus === 'rejected' && (
              <View style={styles.formArea}>
                <Focusable
                  onPress={() => setCurrentStatus('unregistered')}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Submit New Request</Text>
                </Focusable>
              </View>
            )}

            {/* Admin Entry Link / PIN Box */}
            <View style={styles.footerSection}>
              {!showPinPrompt ? (
                <Focusable
                  onPress={() => setShowPinPrompt(true)}
                  style={styles.adminLinkBtn}
                >
                  <Text style={styles.adminLinkText}>Admin Sign In</Text>
                </Focusable>
              ) : (
                <View style={styles.pinBox}>
                  <Text style={styles.pinHeading}>Enter Admin Passcode</Text>
                  <TextInput
                    value={adminPin}
                    onChangeText={setAdminPin}
                    placeholder="Admin PIN (Default: 778899)"
                    placeholderTextColor="#8c8c8c"
                    keyboardType="numeric"
                    secureTextEntry
                    maxLength={8}
                    style={styles.pinInput}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyPin}
                  />

                  {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}

                  <View style={styles.pinBtnRow}>
                    <Focusable onPress={handleVerifyPin} style={styles.pinSubmitBtn}>
                      <Text style={styles.pinSubmitBtnText}>Unlock</Text>
                    </Focusable>
                    <Focusable
                      onPress={() => {
                        setShowPinPrompt(false);
                        setPinError(null);
                        setAdminPin('');
                      }}
                      style={styles.pinCancelBtn}
                    >
                      <Text style={styles.pinCancelBtnText}>Cancel</Text>
                    </Focusable>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 99999,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 32,
    alignItems: 'center',
  },
  cardMobile: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 12,
  },
  logo: {
    width: 140,
    height: 40,
    marginBottom: 24,
  },
  heading: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  headingDeclined: {
    color: '#e50914',
  },
  subheading: {
    color: '#8c8c8c',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    maxWidth: 360,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  metaText: {
    color: '#737373',
    fontSize: 12,
  },
  metaHighlight: {
    color: '#a3a3a3',
    fontWeight: '600',
  },
  metaDot: {
    color: '#555555',
    fontSize: 12,
  },
  formArea: {
    width: '100%',
    gap: 16,
  },
  textInput: {
    backgroundColor: '#333333',
    borderRadius: 4,
    color: '#ffffff',
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  errorText: {
    color: '#e50914',
    fontSize: 13,
    textAlign: 'center',
  },
  noticeText: {
    color: '#8c8c8c',
    fontSize: 13,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: Colors.red,
    borderRadius: 4,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    height: 48,
  },
  secondaryBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  textLinkBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  textLink: {
    color: '#8c8c8c',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  footerSection: {
    marginTop: 28,
    width: '100%',
    alignItems: 'center',
  },
  adminLinkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  adminLinkText: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '500',
  },
  pinBox: {
    width: '100%',
    backgroundColor: '#1f1f1f',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  pinHeading: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  pinInput: {
    backgroundColor: '#333333',
    borderRadius: 4,
    color: '#ffffff',
    paddingHorizontal: 16,
    height: 46,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 4,
    width: '100%',
  },
  pinBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  pinSubmitBtn: {
    flex: 1,
    backgroundColor: Colors.red,
    borderRadius: 4,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSubmitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  pinCancelBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCancelBtnText: {
    color: '#cccccc',
    fontSize: 14,
  },
});
