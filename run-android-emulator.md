# Run My.Daily.Duty on Your Phone (Nokia)

The app uses a **development build** (expo-dev-client). To run it on your Nokia with live reload:

## Run on your phone (recommended)

1. **Connect the Nokia** with a USB cable and turn on **USB debugging** (Settings → Developer options).

2. **Check the device** (PowerShell):
   ```powershell
   & "C:\Users\David Sequoias\AppData\Local\Android\Sdk\platform-tools\adb.exe" devices
   ```
   You should see your device (e.g. `GZQL... device`). If it says `unauthorized`, accept the prompt on the phone.

3. **Redirect port 8081** so the phone can reach Metro on your PC:
   ```powershell
   & "C:\Users\David Sequoias\AppData\Local\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
   ```

4. **Build and run** from the TodoApp folder:
   ```powershell
   cd "c:\Users\David Sequoias\SQLite\Databases\TodoApp"
   npm run android
   ```
   This builds the app, installs it on the Nokia, starts Metro, and opens the app. Keep the terminal open.

**Next time** (app already on the phone): start Metro with `npx expo start`, run the `adb reverse` command above, then open **My.Daily.Duty** on the phone. It will load from your PC.

---

## Standalone APK (no PC needed)

To use the app without a computer:

```powershell
cd "c:\Users\David Sequoias\SQLite\Databases\TodoApp"
npx eas build --platform android --profile preview
```

When asked “Install and run on an emulator?”, choose **no**. Then open the build link on your phone (or download the APK) and install. The app will run without Metro.

---

## Emulator (optional)

If you want to use the Android emulator instead:

1. In **Android Studio**: **Device Manager** → start a virtual device (Cold Boot). Wait until it’s fully booted.
2. Run `adb devices` and ensure the emulator shows as **device** (not offline).
3. Run `npm run android` from the TodoApp folder. The app will install on the emulator and connect to Metro.
