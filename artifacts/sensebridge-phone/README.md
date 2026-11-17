# SenseBridge Phone

This Expo companion registers a phone for alerts from one private wearable
account. Pairing uses the one-time code from the SenseBridge control center;
the API rejects expired codes and phones already registered to a different
wearable account. The vibration test is local to the phone and does not send a
wearable event.

## Real-device push setup

The app can request Android or iOS notification permission and obtain an Expo
push token once it has a genuine Expo project ID. Before real remote delivery:

1. Link the native app to an Expo project and set its project ID in
   `expo.extra.eas.projectId` or the build-time environment variable
   `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Configure an APNs authentication key for the iOS app in Expo's secure
   credential manager.
3. Configure Firebase Cloud Messaging (FCM v1) for the Android app in Expo's
   secure credential manager.
4. Test delivery on a physical iPhone and Android device using a native app
   build. The browser preview verifies the screen only; it cannot register a
   mobile push token or verify hardware vibration.

Keep the APNs `.p8` key and Firebase service-account JSON in Expo's credential
manager, not in this repository or the Pi setup archive. The API sends through
Expo Push Service and does not need a provider credential in the Pi package.
An Expo project ID alone does not prove that APNs or FCM delivery is configured.

AI-generated alert candidates are explicitly unverified. They are informational
only and must not be used as emergency or safety confirmation.
