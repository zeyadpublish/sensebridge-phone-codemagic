# Build SenseBridge Phone APK with Codemagic

1. In Codemagic, add this GitHub repo ([zeyadpublish/sensebridge-phone-codemagic](https://github.com/zeyadpublish/sensebridge-phone-codemagic)) and select its `main` branch.
2. In Codemagic’s **Code signing identities**, upload your Android **release keystore** with reference `sensebridge_android`.
3. Create the `sensebridge_android_release` environment group:

   | Variable | Value |
   | --- | --- |
   | `EXPO_PUBLIC_DOMAIN` | The published SenseBridge control center host, with no `/api` suffix |
   | `EXPO_PUBLIC_EAS_PROJECT_ID` | The UUID of the Expo project that sends notifications |
   | `ANDROID_PACKAGE_NAME` | The Android app ID registered in Firebase |
   | `GOOGLE_SERVICES_JSON_BASE64` | Base64-encoded `google-services.json` from that Firebase Android app |

   Configure FCM v1 credentials for the same app in Expo’s credential manager for remote delivery. Don’t commit signing files, passwords, or Firebase service account credentials to GitHub.
4. Start **SenseBridge Android Release**. When it succeeds, download `app-release.apk` from Codemagic’s build artifacts.
5. Install `app-release.apk` directly on an Android device, test vibration, then pair the installed app and confirm a real wearable alert arrives. Future builds use Codemagic’s `BUILD_NUMBER` as the Android `versionCode`.
