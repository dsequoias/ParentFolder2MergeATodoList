# Set Android SDK so aapt and other tools are found (path with spaces is OK when set as env var).
$sdk = "C:\Users\David Sequoias\AppData\Local\Android\Sdk"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
# Add platform-tools to PATH so adb is found
$env:Path = "$sdk\platform-tools;$sdk\build-tools\36.0.0;$env:Path"
npx expo run:android @args
