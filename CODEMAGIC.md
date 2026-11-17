# Build SenseBridge Phone for Google Play

1. In Codemagic, add this GitHub repo and select its `main` branch.
2. In Codemagic’s **Code signing identities**, upload your Android **upload keystore** with reference `sensebridge_android`. If the app is already on Google Play, use its existing upload key.
3. Create the `sensebridge_android_release` environment group:

   | Variable | Value |
   | --- | --- |
   | `EXPO_PUBLIC_DOMAIN` | The published SenseBridge control center host, with no `/api` suffix |
   | `EXPO_PUBLIC_EAS_PROJECT_ID` | The UUID of the Expo project that sends notifications |
   | `ANDROID_PACKAGE_NAME` | The Android app ID registered in Firebase and used in Play Console |
   | `GOOGLE_SERVICES_JSON_BASE64` | Base64-encoded `google-services.json` from that Firebase Android app |

   Configure FCM v1 credentials for the same app in Expo’s credential manager for remote delivery. Don’t commit signing files, passwords, or Firebase service account credentials to GitHub.
4. Start **SenseBridge Android Release**. When it succeeds, download `app-release.aab` from Codemagic’s build artifacts. The workflow does not submit anything to Google Play.
5. Upload the AAB to **Play Console → Internal testing** first. On an Android device, test vibration, then pair the installed app and confirm a real wearable alert arrives. Future uploads need a version code greater than previous releases; this workflow uses Codemagic’s `BUILD_NUMBER`.
