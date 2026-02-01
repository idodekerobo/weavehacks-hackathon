# Xcode Project Setup for Milestone O

## Adding New Files to Xcode Project

The iOS files have been created in the file system, but you'll need to add them to your Xcode project for them to compile.

### Steps to Add Files

1. **Open Xcode Project**
   ```bash
   open photo-agent-ios/photo-agent-ios.xcodeproj
   ```

2. **Add New Folders and Files**
   - In Xcode Project Navigator (left sidebar)
   - Right-click on `photo-agent-ios` folder (yellow folder icon)
   - Select "Add Files to photo-agent-ios..."

3. **Add Models Folder**
   - Navigate to: `photo-agent-ios/photo-agent-ios/Models/`
   - Select `AppState.swift`
   - ✅ Check "Copy items if needed" (if prompted)
   - ✅ Check "Create groups"
   - ✅ Target: photo-agent-ios
   - Click "Add"

4. **Add Utilities Folder**
   - Right-click on `photo-agent-ios` folder again
   - "Add Files to photo-agent-ios..."
   - Navigate to: `photo-agent-ios/photo-agent-ios/Utilities/`
   - Select `KeychainHelper.swift`
   - Add with same settings

5. **Add Managers Folder**
   - Repeat for: `photo-agent-ios/photo-agent-ios/Managers/`
   - Select `ConnectionManager.swift`

6. **Add Views Folder**
   - Repeat for: `photo-agent-ios/photo-agent-ios/Views/`
   - Select ALL view files:
     - `PairingView.swift`
     - `QRScannerViewRepresentable.swift`
     - `ConnectionStatusView.swift`
     - `MainTabView.swift`

### Quick Method (All at Once)

Alternatively, add all new folders at once:

1. Right-click on `photo-agent-ios` folder in Xcode
2. Select "Add Files to photo-agent-ios..."
3. Hold ⌘ (Command) and select:
   - `Models/` folder
   - `Utilities/` folder
   - `Managers/` folder
   - `Views/` folder
4. Click "Add"

### Verify Files Are Added

After adding, your Xcode Project Navigator should show:

```
photo-agent-ios/
├── photo-agent-ios/
│   ├── Models/
│   │   └── AppState.swift
│   ├── Utilities/
│   │   └── KeychainHelper.swift
│   ├── Managers/
│   │   └── ConnectionManager.swift
│   ├── Views/
│   │   ├── PairingView.swift
│   │   ├── QRScannerViewRepresentable.swift
│   │   ├── ConnectionStatusView.swift
│   │   └── MainTabView.swift
│   ├── Assets.xcassets/
│   ├── ContentView.swift (existing, updated)
│   └── photo_agent_iosApp.swift (existing, updated)
```

### Add Camera Permission

1. In Xcode Project Navigator, select the **project** (top-level "photo-agent-ios")
2. Select the **target** "photo-agent-ios"
3. Go to **Info** tab
4. Hover over any key and click the **+** button
5. Type: `NSCameraUsageDescription` (or search "Camera")
6. Set value: `We need camera access to scan the QR code from your Mac`

Alternatively, edit Info.plist directly:
1. Find `Info.plist` in Project Navigator
2. Right-click → "Open As" → "Source Code"
3. Add before closing `</dict>`:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>We need camera access to scan the QR code from your Mac</string>
   ```

### Build and Run

1. Select a simulator or device as the build target
2. Press ⌘R to build and run
3. App should launch and show PairingView

### Troubleshooting

**Files show as red in Xcode:**
- File not found in expected location
- Right-click → "Show in Finder" to verify location
- Re-add file with correct path

**Build errors about missing files:**
- Clean build folder: ⇧⌘K (Shift+Command+K)
- Rebuild: ⌘B (Command+B)

**Camera not working:**
- Verify `NSCameraUsageDescription` is in Info.plist
- Check Privacy settings in iOS Settings app
- Reset privacy settings: Settings → General → Reset → Reset Location & Privacy

**Import errors:**
- Make sure all files are added to the target
- Check target membership: Select file → File Inspector (right sidebar) → Target Membership

### iOS Simulator vs Physical Device

**Simulator:**
- QR scanner won't work (no camera)
- Use manual URL entry instead
- Good for testing UI and connection logic

**Physical Device:**
- QR scanner fully functional
- Better testing experience
- Requires provisioning profile (free Apple Developer account works)

## Next Steps After Setup

1. Build and run the app
2. Test pairing with manual URL entry (simulator)
3. Test QR scanner (physical device)
4. Verify connection status in Settings tab
5. Check server logs for device registration

## Need Help?

See `IOS_SETUP.md` for detailed pairing flow documentation.
