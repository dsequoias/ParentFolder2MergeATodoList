# Set Android SDK so aapt and other tools are found (path with spaces is OK when set as env var).
# Does NOT run the build (Gradle is very heavy and can freeze the machine). Run the build yourself after.
$sdk = "C:\Users\David Sequoias\AppData\Local\Android\Sdk"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$sdk\platform-tools;$sdk\build-tools\36.0.0;$env:Path"
Write-Host "Android env set (ANDROID_HOME, PATH). To build, run:" -ForegroundColor Green
Write-Host "  npx expo run:android" -ForegroundColor Cyan
