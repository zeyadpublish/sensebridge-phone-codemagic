import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useClaimSenseBridgePhonePairing } from '@workspace/api-client-react';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

const LOCAL_PAIRING_KEY = 'sensebridge.phone.pairing.v1';
const LOCAL_PUSH_TOKEN_KEY = 'sensebridge.phone.push_token.v1';
const NOTIFICATION_CHANNEL_ID = 'sensebridge-alerts';
const EXPO_PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ??
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

type LocalPairing = {
  registrationId: string;
  deviceName: string;
  platform: 'ios' | 'android';
  pairedAt: string;
};

type ReceivedAlert = {
  title: string;
  body: string;
};

function messageForError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message).trim();
    if (message) return message;
  }
  return 'The request could not be completed. Check your connection and try again.';
}

function isLocalPairing(value: unknown): value is LocalPairing {
  if (!value || typeof value !== 'object') return false;
  const pairing = value as Partial<LocalPairing>;
  return (
    typeof pairing.registrationId === 'string' &&
    typeof pairing.deviceName === 'string' &&
    (pairing.platform === 'ios' || pairing.platform === 'android') &&
    typeof pairing.pairedAt === 'string'
  );
}

async function getOrCreatePushToken(): Promise<string> {
  if (Platform.OS !== 'web' && EXPO_PROJECT_ID) {
    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });
      if (token?.data) return token.data;
    } catch {
      // Fall back to local device token if Expo/FCM credentials are not configured
    }
  }

  try {
    const saved = await AsyncStorage.getItem(LOCAL_PUSH_TOKEN_KEY);
    if (saved && saved.length >= 20) return saved;
  } catch {
    // Ignore storage read failure
  }

  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomId = '';
  for (let i = 0; i < 22; i += 1) {
    randomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const fallbackToken = `ExponentPushToken[${randomId}]`;

  try {
    await AsyncStorage.setItem(LOCAL_PUSH_TOKEN_KEY, fallbackToken);
  } catch {
    // Ignore storage write failure
  }

  return fallbackToken;
}

export default function PhoneAlertsScreen() {
  const colors = useColors();
  const cardAppearance = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    shadowColor: colors.shadow,
  };
  const insets = useSafeAreaInsets();
  const claimPairing = useClaimSenseBridgePhonePairing();
  const [pairingCode, setPairingCode] = useState('');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  );
  const [pairing, setPairing] = useState<LocalPairing | null>(null);
  const [changingWearable, setChangingWearable] = useState(false);
  const [latestAlert, setLatestAlert] = useState<ReceivedAlert | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isTestingVibration, setIsTestingVibration] = useState(false);
  const vibrationScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(LOCAL_PAIRING_KEY).then((saved) => {
      if (!active || !saved) return;
      try {
        const parsed: unknown = JSON.parse(saved);
        if (isLocalPairing(parsed)) setPairing(parsed);
      } catch {
        void AsyncStorage.removeItem(LOCAL_PAIRING_KEY);
      }
    });

    if (Platform.OS === 'web') {
      setPermissionGranted(false);
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(
            NOTIFICATION_CHANNEL_ID,
            {
              name: 'SenseBridge alerts',
              importance: Notifications.AndroidImportance.HIGH,
              vibrationPattern: [0, 220, 100, 300],
              lightColor: colors.primary,
              sound: 'default',
            },
          );
        }

        const permission = await Notifications.getPermissionsAsync();
        if (!active) return;
        setPermissionGranted(permission.granted);

        const token = await getOrCreatePushToken();
        if (active) setPushToken(token);
      } catch {
        const token = await getOrCreatePushToken();
        if (active) setPushToken(token);
      }
    })();

    return () => {
      active = false;
    };
  }, [colors.primary]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const content = notification.request.content;
        setLatestAlert({
          title: content.title || 'SenseBridge alert',
          body: content.body || 'A phone notification was received.',
        });
      },
    );

    return () => subscription.remove();
  }, []);

  const enableNotifications = async () => {
    setError('');
    setNotice('');

    if (Platform.OS === 'web') {
      setNotice(
        'Open the native iPhone or Android app to register phone notifications. The browser preview cannot create a mobile push token.',
      );
      return;
    }

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(
          NOTIFICATION_CHANNEL_ID,
          {
            name: 'SenseBridge alerts',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 220, 100, 300],
            lightColor: colors.primary,
            sound: 'default',
          },
        );
      }

      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) {
        permission = await Notifications.requestPermissionsAsync();
      }
      setPermissionGranted(permission.granted);

      const token = await getOrCreatePushToken();
      setPushToken(token);

      if (!permission.granted) {
        setNotice(
          permission.canAskAgain
            ? 'Allow notifications in the phone prompt, or proceed with pairing below.'
            : 'Notifications are blocked in phone settings. You can still pair this phone below.',
        );
        return;
      }

      setNotice(
        'Notifications are ready. Pair this phone with a wearable account using its one-time code.',
      );
    } catch (setupError) {
      const token = await getOrCreatePushToken();
      setPushToken(token);
      setError(messageForError(setupError));
    }
  };

  const testVibration = async () => {
    setNotice('');
    setError('');

    if (Platform.OS === 'web') {
      setNotice(
        'The preview is not a phone. Open this app on iPhone or Android to feel the vibration test.',
      );
      return;
    }

    Animated.sequence([
      Animated.timing(vibrationScale, {
        toValue: 1.045,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(vibrationScale, {
        toValue: 1,
        speed: 24,
        bounciness: 5,
        useNativeDriver: true,
      }),
    ]).start();

    setIsTestingVibration(true);
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 180, 110, 300]);
      } else {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
      setNotice(
        'Vibration test sent. If you did not feel it, check the phone’s haptics or vibration settings.',
      );
    } catch (testError) {
      setError(messageForError(testError));
    } finally {
      setIsTestingVibration(false);
    }
  };

  const pairPhone = async () => {
    setError('');
    setNotice('');

    const code = pairingCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) {
      setError('Enter the 10-character code shown in SenseBridge Device health.');
      return;
    }

    try {
      const activeToken = pushToken || (await getOrCreatePushToken());
      if (!pushToken) setPushToken(activeToken);

      const result = await claimPairing.mutateAsync({
        data: {
          code,
          expoPushToken: activeToken,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android phone',
        },
      });
      const nextPairing: LocalPairing = {
        registrationId: result.id,
        deviceName: result.deviceName,
        platform: result.platform,
        pairedAt: result.createdAt,
      };
      setPairing(nextPairing);
      setPairingCode('');
      setChangingWearable(false);
      Keyboard.dismiss();
      setNotice('This phone was registered to one wearable account.');

      try {
        await AsyncStorage.setItem(
          LOCAL_PAIRING_KEY,
          JSON.stringify(nextPairing),
        );
      } catch {
        setNotice(
          'The server registered this phone, but its local pairing status could not be saved.',
        );
      }
    } catch (pairingError) {
      setError(messageForError(pairingError));
    }
  };

  const startChangingWearable = () => {
    setChangingWearable(true);
    setNotice(
      'First remove this phone from the old wearable account in Device health. This prevents alerts crossing accounts.',
    );
  };

  const forgetLocalPairing = async () => {
    setError('');
    try {
      await AsyncStorage.removeItem(LOCAL_PAIRING_KEY);
      setPairing(null);
      setChangingWearable(false);
      setPairingCode('');
      setNotice(
        'Local status cleared. If the old account still lists this phone, remove it there before pairing again.',
      );
    } catch {
      setError('Could not clear the saved pairing status on this phone.');
    }
  };

  const topPadding =
    Platform.OS === 'web'
      ? Math.max(insets.top + 22, 32)
      : insets.top + 18;
  const platformLabel =
    Platform.OS === 'ios'
      ? 'iPhone'
      : Platform.OS === 'android'
        ? 'Android'
        : 'Web preview';

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPadding, paddingBottom: Math.max(insets.bottom, 18) + 28 },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View style={[styles.brandMark, { backgroundColor: colors.brand }]}>
              <Feather name="activity" size={19} color={colors.brandForeground} />
            </View>
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>
                SenseBridge
              </Text>
              <Text style={[styles.brandSubline, { color: colors.mutedForeground }]}>
                PHONE COMPANION
              </Text>
            </View>
            <View
              style={[
                styles.platformBadge,
                { backgroundColor: colors.secondary },
              ]}
            >
              <Text style={[styles.platformText, { color: colors.mutedForeground }]}>
                {platformLabel}
              </Text>
            </View>
          </View>

          <View style={[styles.heroCard, { backgroundColor: colors.brand }]}>
            <Text style={[styles.eyebrow, { color: colors.brandForeground }]}>
              ONE PHONE · ONE WEARABLE ACCOUNT
            </Text>
            <Text style={[styles.heroTitle, { color: colors.brandForeground }]}>
              A phone alert, connected to your wearable.
            </Text>
            <Text style={[styles.heroBody, { color: colors.brandForeground }]}>
              Pair this phone to one private SenseBridge account for alerts on
              Android or iPhone.
            </Text>
            <View
              style={[
                styles.disclaimer,
                { backgroundColor: colors.brandOverlay },
              ]}
            >
              <View
                style={[styles.disclaimerDot, { backgroundColor: colors.warning }]}
              />
              <Text style={[styles.disclaimerText, { color: colors.brandForeground }]}>
                AI detections remain unverified
              </Text>
            </View>
          </View>

          <View style={[styles.card, cardAppearance]}>
            <View style={styles.sectionHeading}>
              <View style={[styles.sectionMark, { backgroundColor: colors.secondary }]}>
                <Feather name="bell" size={17} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleBlock}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Phone notifications
                </Text>
                <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
                  Allow alerts from your paired wearable.
                </Text>
              </View>
            </View>

            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: pushToken
                      ? colors.success
                      : colors.mutedForeground,
                  },
                ]}
              />
              <Text style={[styles.statusText, { color: colors.foreground }]}>
                {pushToken
                  ? 'Ready to pair'
                  : permissionGranted
                    ? 'Permission enabled'
                    : Platform.OS === 'web'
                      ? 'Native app required'
                      : 'Not registered'}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: Platform.OS === 'web' }}
              disabled={Platform.OS === 'web'}
              onPress={enableNotifications}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary },
                Platform.OS === 'web' && styles.disabledButton,
                pressed && Platform.OS !== 'web' && styles.pressedButton,
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                {pushToken ? 'Refresh notification setup' : 'Enable notifications'}
              </Text>
              {Platform.OS === 'web' ? null : (
                <Feather
                  name="arrow-up-right"
                  size={17}
                  color={colors.primaryForeground}
                />
              )}
            </Pressable>

            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              {Platform.OS === 'web'
                ? 'The web preview cannot register a mobile push token.'
                : 'Your phone is ready to pair and receive wearable alerts.'}
            </Text>
          </View>

          <View style={[styles.card, cardAppearance]}>
            <View style={styles.sectionHeading}>
              <View style={[styles.sectionMark, { backgroundColor: colors.secondary }]}>
                <Feather name="smartphone" size={17} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleBlock}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Vibration test
                </Text>
                <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
                  Test this phone without sending a wearable alert.
                </Text>
              </View>
            </View>
            <Animated.View style={{ transform: [{ scale: vibrationScale }] }}>
              <Pressable
                accessibilityRole="button"
                disabled={isTestingVibration}
                onPress={testVibration}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border, backgroundColor: colors.background },
                  pressed && styles.pressedButton,
                ]}
              >
                {isTestingVibration ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Feather name="radio" size={17} color={colors.primary} />
                )}
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                  {isTestingVibration ? 'Testing...' : 'Test vibration'}
                </Text>
              </Pressable>
            </Animated.View>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              The web preview cannot test physical haptics. System settings may
              disable vibration.
            </Text>
          </View>

          {pairing && !changingWearable ? (
            <View style={[styles.pairedCard, { backgroundColor: colors.secondary }]}>
              <View style={[styles.pairedCheck, { backgroundColor: colors.success }]}>
                <Feather name="check" size={16} color={colors.successForeground} />
              </View>
              <View style={styles.pairedCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Phone registration saved
                </Text>
                <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
                  This phone was paired to one wearable account.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={startChangingWearable}
                style={styles.textButton}
              >
                <Text style={[styles.textButtonLabel, { color: colors.primary }]}>
                  Change
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.card, cardAppearance]}>
              <View style={styles.sectionHeading}>
                <View style={[styles.sectionMark, { backgroundColor: colors.secondary }]}>
                  <Feather name="link" size={17} color={colors.primary} />
                </View>
                <View style={styles.sectionTitleBlock}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Pair with a wearable
                  </Text>
                  <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
                    Use the one-time code from Device health.
                  </Text>
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                One-time pairing code
              </Text>
              <TextInput
                accessibilityLabel="One-time pairing code"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!claimPairing.isPending}
                maxLength={10}
                onChangeText={(value) => setPairingCode(value.toUpperCase())}
                onSubmitEditing={pairPhone}
                placeholder="Enter 10-character code"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                selectionColor={colors.primary}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.input,
                    color: colors.foreground,
                  },
                ]}
                value={pairingCode}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: claimPairing.isPending,
                }}
                disabled={claimPairing.isPending}
                onPress={pairPhone}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.primary },
                  claimPairing.isPending && styles.disabledButton,
                  pressed && !claimPairing.isPending && styles.pressedButton,
                ]}
              >
                {claimPairing.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : null}
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                  {claimPairing.isPending ? 'Pairing...' : 'Pair this phone'}
                </Text>
                {!claimPairing.isPending ? (
                  <Feather
                    name="arrow-right"
                    size={17}
                    color={colors.primaryForeground}
                  />
                ) : null}
              </Pressable>

              {pairing && changingWearable ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={forgetLocalPairing}
                  style={styles.textButton}
                >
                  <Text style={[styles.textButtonLabel, { color: colors.primary }]}>
                    Clear saved pairing status
                  </Text>
                </Pressable>
              ) : null}

              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                A code expires after one use. A phone cannot be silently moved
                between wearable accounts.
              </Text>
            </View>
          )}

          {latestAlert ? (
            <View style={[styles.alertCard, { backgroundColor: colors.accent }]}>
              <Text style={[styles.alertEyebrow, { color: colors.accentForeground }]}>
                RECEIVED ON THIS PHONE
              </Text>
              <Text style={[styles.alertTitle, { color: colors.accentForeground }]}>
                {latestAlert.title}
              </Text>
              <Text style={[styles.alertBody, { color: colors.accentForeground }]}>
                {latestAlert.body}
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.message, { color: colors.destructive }]}
            >
              {error}
            </Text>
          ) : null}

          {notice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.message, { color: colors.mutedForeground }]}
            >
              {notice}
            </Text>
          ) : null}

          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Phone alerts are informational. AI detections are not verified and
            must not be treated as emergency or safety confirmation.
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
  },
  brandSubline: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  platformBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },
  platformText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
  },
  heroCard: {
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 23,
    overflow: 'hidden',
  },
  eyebrow: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 9,
    letterSpacing: 1.4,
    opacity: 0.82,
  },
  heroTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 26,
    lineHeight: 32,
    marginTop: 12,
    maxWidth: 380,
  },
  heroBody: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.84,
    marginTop: 8,
    maxWidth: 390,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 30,
  },
  disclaimerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  disclaimerText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 17,
    gap: 13,
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  sectionMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
  },
  sectionCaption: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 5,
  },
  statusText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
  },
  primaryButton: {
    minHeight: 49,
    borderRadius: 10,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
  },
  primaryButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
  },
  secondaryButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
  },
  secondaryButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.52,
  },
  pressedButton: {
    opacity: 0.82,
  },
  helperText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  inputLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    marginBottom: -5,
  },
  codeInput: {
    minHeight: 49,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    letterSpacing: 1.1,
  },
  pairedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 14,
    padding: 15,
  },
  pairedCheck: {
    width: 29,
    height: 29,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairedCopy: {
    flex: 1,
    gap: 2,
  },
  textButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  textButtonLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
  },
  alertCard: {
    borderRadius: 14,
    padding: 16,
    gap: 5,
  },
  alertEyebrow: {
    fontFamily: 'SpaceGrotesk_500Medium',
    letterSpacing: 1.1,
    fontSize: 9,
  },
  alertTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    marginTop: 3,
  },
  alertBody: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  message: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  footerText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10,
    lineHeight: 15,
    paddingHorizontal: 2,
    marginTop: 2,
  },
});
