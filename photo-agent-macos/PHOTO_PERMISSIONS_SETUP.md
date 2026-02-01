# Photos Permission Setup for macOS App

## Required Configuration

To enable Photos library access, you need to add the following to your Xcode project:

### 1. Add Photos Framework Usage Description

In Xcode:
1. Select the `photo-agent-macos` target
2. Go to the "Info" tab
3. Add a new entry:
   - **Key**: `NSPhotoLibraryUsageDescription` (or "Privacy - Photo Library Usage Description")
   - **Value**: "This app analyzes your photos locally to extract intent and automate tasks. Your photos never leave your device."

Alternatively, you can add this to the build settings:
```
INFOPLIST_KEY_NSPhotoLibraryUsageDescription = "This app analyzes your photos locally to extract intent and automate tasks. Your photos never leave your device.";
```

### 2. Import Photos Framework

The PhotosManager.swift file already imports the Photos framework, but ensure your target links against:
- `Photos.framework`
- `PhotosUI.framework` (if using photo picker later)

### 3. App Sandbox Considerations

The app sandbox is currently disabled (as noted in previous setup). When re-enabling:
- Enable "Photo Library" access in "App Sandbox" entitlements
- Or add to your entitlements file:
```xml
<key>com.apple.security.assets.pictures.read-write</key>
<true/>
```

## Testing

After adding the permission:
1. Run the app
2. When you trigger photo scanning, macOS will prompt for permission
3. Grant "Full Access" to allow the app to read your photo library

## Current Implementation

- **PhotosManager.swift**: Handles authorization and scanning
- **AppState.swift**: Tracks authorization and scanning status
- **UserAsset.swift**: Model for photo metadata

The app will show a blocking screen if permission is denied, as this is required functionality.
