# iOS App Setup Guide

**Milestones O+P+Q: iOS App Foundation + Pairing + Photo Upload + Approvals**

## Overview
The iOS app is now set up with full pairing, photo upload, and approvals functionality. It can scan a QR code from the macOS app to connect to your Mac server, monitor for new photos, and manage approvals.

## Files Created

### Milestone O (Pairing)

**Models:**
- `Models/AppState.swift` - iOS-specific app state management
  - Connection status tracking
  - Device ID management
  - Pairing state
  - Photo monitoring state

**Utilities:**
- `Utilities/KeychainHelper.swift` - Secure storage for tunnel URL

**Managers:**
- `Managers/ConnectionManager.swift` - Handles pairing and server communication
  - QR code pairing flow
  - Health check testing
  - Device registration
  - Polling for approvals (10-second interval)

**Views:**
- `Views/PairingView.swift` - Initial pairing screen with QR scanner
- `Views/QRScannerViewRepresentable.swift` - QR code scanner implementation
- `Views/ConnectionStatusView.swift` - Shows connection health
- `Views/MainTabView.swift` - Main app tabs (Inbox, Search, Settings)

**Updated Files:**
- `ContentView.swift` - Routes to pairing or main app based on paired state
- `photo_agent_iosApp.swift` - App entry point

### Milestone P (Photo Upload)

**Managers:**
- `Managers/PhotosMonitor.swift` - Photo monitoring and upload system
  - PHPhotoLibraryChangeObserver implementation
  - Automatic photo upload after pairing
  - Image compression and hashing
  - Real-time statistics

**Views:**
- `Views/UploadStatusView.swift` - Upload progress and controls

### Milestone Q (Approvals + Search)

**Managers:**
- `Managers/ApprovalManager.swift` - Approvals data management

**Views:**
- `Views/ApprovalsView.swift` - Approvals inbox with filters
- `Views/ApprovalDetailView.swift` - Detailed approval view
- `Views/SearchView.swift` - Search interface

## Required Permissions

### Camera Permission (for QR Scanner)
You need to add camera usage description to the Info.plist:

**In Xcode:**
1. Open `photo-agent-ios.xcodeproj`
2. Select the project in the navigator
3. Select the `photo-agent-ios` target
4. Go to the "Info" tab
5. Add a new key: `NSCameraUsageDescription`
6. Set value: `"We need camera access to scan the QR code from your Mac"`

**Or manually add to Info.plist:**
```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to scan the QR code from your Mac</string>
```

### Photo Library Permission (for Photo Upload)
You need to add photo library usage description to the Info.plist:

**In Xcode:**
1. Open `photo-agent-ios.xcodeproj`
2. Select the project in the navigator
3. Select the `photo-agent-ios` target
4. Go to the "Info" tab
5. Add a new key: `NSPhotoLibraryUsageDescription`
6. Set value: `"We need access to upload and analyze your photos"`

**Or manually add to Info.plist:**
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>We need access to upload and analyze your photos</string>
```

## Pairing Flow

1. **Launch iOS app** → Shows PairingView
2. **Tap "Scan QR Code"** → Opens camera
3. **Scan QR code from macOS Status Dashboard** → Extracts tunnel URL
4. **App tests connection** → Calls `/health` endpoint
5. **If successful** → Stores tunnel URL in Keychain
6. **Register device** → Calls `POST /api/devices`
7. **Navigate to MainTabView** → Shows Inbox, Search, Settings tabs
8. **Start polling** → Polls `/api/approvals/stats/counts` every 10 seconds

## Manual Pairing (Alternative)

If QR scanning doesn't work:
1. Tap "Enter URL Manually"
2. Type/paste the tunnel URL (e.g., `https://xyz.trycloudflare.com`)
3. Tap "Connect"

## Photo Upload Flow

1. **Pair device** (see above)
2. **Go to Settings tab**
3. **Tap "Start Monitoring"** under Photo Upload section
4. **Grant Photos permission** when prompted
5. **Take new photos** with iOS camera
6. **Photos auto-upload** within seconds
7. **View statistics** in Settings tab (uploaded, pending, failed)

## Approvals Flow

1. **Photos analyzed** by server (Phase 2)
2. **Event flyers detected** with confidence ≥ 70%
3. **Approval created** automatically
4. **Badge appears** on Inbox tab
5. **Open Inbox** → See pending approvals
6. **Tap approval** → View full details
7. **Approve or Reject** → Status updates immediately

## Unpair Device

Settings tab → "Unpair Device" button removes tunnel URL from Keychain and returns to pairing screen.

## Testing

### Without macOS app running:
- Should show "Server unreachable" error
- Connection status shows red "Error"

### With macOS app running:
- QR scan should extract tunnel URL
- Health check should succeed
- Connection status shows green "Connected"
- Device appears in `/api/devices` endpoint

### Photo upload testing:
- Enable monitoring in Settings
- Take new photo with camera
- Check upload statistics
- Verify photo appears on server (Bull Board)

### Approvals testing:
- Upload event flyer photo
- Wait for analysis (~10-30 seconds)
- Check Inbox badge for count
- Open Inbox → see approval card
- Tap approval → view details
- Approve or reject → status updates

## Next Steps (Milestone R)

- Replace polling with Server-Sent Events
- Real-time push notifications
- Battery-efficient updates

## Implementation Notes

### Polling vs SSE
Currently using 10-second polling as per your preference. SSE will be added later in Milestone R.

### Models Not Shared
As per your preference, models are duplicated between iOS and macOS for now. Shared package refactor can come later.

### Device Registration
The device registration endpoint is non-critical. If it fails (e.g., endpoint doesn't exist yet), pairing still succeeds.

### Photo Monitoring
Only monitors photos taken AFTER pairing timestamp. This ensures privacy and prevents uploading entire photo library.

### Security
- Tunnel URL stored in Keychain (secure)
- Device ID persisted in UserDefaults
- Photos permissions properly requested
- No sensitive data in logs

## Troubleshooting

**QR Scanner shows black screen:**
- Check camera permissions in Settings app
- Make sure `NSCameraUsageDescription` is in Info.plist

**Connection fails:**
- Verify tunnel is running on Mac
- Check tunnel URL is correct
- Try manual entry instead of QR scan

**Photo upload not working:**
- Check photo library permissions in Settings app
- Make sure `NSPhotoLibraryUsageDescription` is in Info.plist
- Verify monitoring is enabled in Settings tab
- Check server is running and reachable

**No approvals showing:**
- Photos need to be analyzed first (Phase 2)
- Only event flyers with confidence ≥ 70% create approvals
- Check server logs for intent classification
- Try uploading an obvious event flyer image

**Polling not working:**
- Check network connection
- Verify server is running
- Look for polling errors in Xcode console

## Architecture Summary

```
iOS App
  ├── Pairing (Milestone O)
  │   ├── QR scanner + manual entry
  │   ├── Connection testing
  │   ├── Device registration
  │   └── Keychain storage
  │
  ├── Photo Upload (Milestone P)
  │   ├── PHPhotoLibrary monitoring
  │   ├── Image compression (70% JPEG)
  │   ├── SHA-256 hashing
  │   ├── Multipart upload
  │   └── Statistics tracking
  │
  └── Approvals + Search (Milestone Q)
      ├── Approval polling (10s)
      ├── Filter by status
      ├── Detailed view with AI reasoning
      ├── Approve/Reject actions
      └── Search UI (placeholder)
```

## Server Endpoints Used

- `GET /health` - Connection testing
- `POST /api/devices` - Device registration
- `POST /api/assets/upload` - Photo upload
- `GET /api/approvals` - List approvals
- `GET /api/approvals/:id` - Get approval details
- `PATCH /api/approvals/:id` - Update approval status
- `GET /api/approvals/stats/counts` - Get approval counts
- `GET /api/search` - Search (not implemented yet)

