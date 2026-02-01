# ModelManager.swift Changes Required

**Date:** Feb 1, 2026  
**File:** `photo-agent-macos/photo-agent-macos/Managers/ModelManager.swift`

---

## Summary of Changes

The refactor moves image analysis from the Mac Swift app to the Node server. ModelManager.swift will be **significantly simplified** - its primary responsibility becomes **status checking only**.

---

## What to KEEP

### ✅ Keep: Ollama Status Check
```swift
func checkOllamaStatus() async {
    // Keep this entire method as-is
    // Still useful to show users if Ollama is running
}

private func fetchAvailableModels() async throws -> [String] {
    // Keep this helper method
}
```

**Reasoning:** Users still need to see if Ollama is running on their Mac, even though the Node server will be the one actually calling it.

---

## What to REMOVE

### ❌ Remove: Entire Analysis Pipeline
```swift
// DELETE these methods:
func analyzePhotos(assets: [PHAsset]) async
private func analyzePhoto(asset: PHAsset) async
private func analyzeSummaryAndOCR(imageData: Data) async throws
private func generateEmbedding(text: String) async throws
private func sendAnalysisToServer(...) async throws
private func getImageData(from asset: PHAsset) async
private func parseResponseForSummaryAndOCR(_ response: String)
private func getFilename(from asset: PHAsset) async
private func mediaTypeString(from mediaType: PHAssetMediaType)
```

**Reasoning:** All analysis now happens in Node server via Bull queues. The Mac app just uploads images.

### ❌ Remove: Error Cases
```swift
// DELETE these error types:
case .analysisError
case .embeddingError
case .serverUploadError
```

**Keep only:**
```swift
enum OllamaError: LocalizedError {
    case serverError  // Keep: still used for status check
}
```

### ❌ Remove: Analysis Progress Tracking
```swift
// DELETE from AppState.swift:
@Published var analysisProgress: (current: Int, total: Int) = (0, 0)
@Published var analysisError: String?
```

**Reasoning:** Progress tracking will be done via Bull queue status API instead.

---

## New Simplified ModelManager.swift

```swift
//
//  ModelManager.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//  Refactored on 2/1/26 - Analysis moved to Node server
//

import Foundation

@MainActor
class ModelManager {
    private let appState: AppState
    private let ollamaBaseURL = "http://localhost:11434"
    
    // Models to use (for status display only)
    private let visionModel = "qwen3-vl:8b"
    private let embeddingModel = "nomic-embed-text"
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    // MARK: - Public API
    
    /// Check if Ollama is running and which models are available
    func checkOllamaStatus() async {
        appState.ollamaStatus = .starting
        appState.ollamaError = nil
        
        do {
            let models = try await fetchAvailableModels()
            appState.loadedModels = models
            
            // Check if required models are available
            let hasVisionModel = models.contains(visionModel)
            let hasEmbeddingModel = models.contains(embeddingModel)
            
            if hasVisionModel && hasEmbeddingModel {
                appState.ollamaStatus = .running
                print("✅ Ollama is running with required models")
            } else {
                appState.ollamaStatus = .error
                var missingModels: [String] = []
                if !hasVisionModel { missingModels.append(visionModel) }
                if !hasEmbeddingModel { missingModels.append(embeddingModel) }
                appState.ollamaError = "Missing models: \(missingModels.joined(separator: ", "))"
                print("❌ Missing required models: \(missingModels.joined(separator: ", "))")
            }
        } catch {
            appState.ollamaStatus = .error
            appState.ollamaError = "Ollama not running. Please start Ollama service."
            print("❌ Failed to connect to Ollama: \(error)")
        }
    }
    
    // MARK: - Private Methods
    
    /// Fetch available models from Ollama
    private func fetchAvailableModels() async throws -> [String] {
        let url = URL(string: "\(ollamaBaseURL)/api/tags")!
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw OllamaError.serverError
        }
        
        struct ModelsResponse: Codable {
            struct Model: Codable {
                let name: String
            }
            let models: [Model]
        }
        
        let modelsResponse = try JSONDecoder().decode(ModelsResponse.self, from: data)
        return modelsResponse.models.map { $0.name }
    }
}

// MARK: - Error Types

enum OllamaError: LocalizedError {
    case serverError
    
    var errorDescription: String? {
        switch self {
        case .serverError:
            return "Failed to connect to Ollama server"
        }
    }
}
```

**Lines of code:** Reduced from ~379 lines to ~90 lines (76% reduction!)

---

## Changes to StatusDashboardView.swift

### Model Analysis Card - Update UI

**OLD:**
```swift
// "Analyze Photos" button
Button("Analyze Photos") {
    Task {
        let assets = await photosManager.getAllScannedAssets()
        await modelManager.analyzePhotos(assets: assets)
    }
}
.disabled(appState.ollamaStatus != .running || appState.serverStatus != .running)

// Progress display
if appState.analysisProgress.total > 0 {
    Text("Analyzing: \(appState.analysisProgress.current)/\(appState.analysisProgress.total)")
}
```

**NEW:**
```swift
// Show queue status from server instead
if appState.serverStatus == .running {
    Button("View Queue Status") {
        // Open browser to http://localhost:1738/admin/queues
        if let url = URL(string: "http://localhost:\(appState.serverPort)/admin/queues") {
            NSWorkspace.shared.open(url)
        }
    }
}

// Fetch and display queue stats from server
if let queueStats = appState.queueStats {
    VStack(alignment: .leading, spacing: 4) {
        Text("Upload Queue: \(queueStats.uploadPending) pending")
        Text("Analysis Queue: \(queueStats.analysisPending) pending, \(queueStats.analysisActive) active")
    }
    .font(.caption)
    .foregroundStyle(.secondary)
}
```

**New AppState properties:**
```swift
// Add to AppState.swift
struct QueueStats {
    let uploadPending: Int
    let uploadActive: Int
    let analysisPending: Int
    let analysisActive: Int
}

@Published var queueStats: QueueStats?
```

**Fetch queue stats:**
```swift
// Add method to fetch from server
func fetchQueueStats() async {
    guard serverStatus == .running else { return }
    
    guard let url = URL(string: "http://localhost:\(serverPort)/api/queue/status") else { return }
    
    do {
        let (data, _) = try await URLSession.shared.data(from: url)
        let stats = try JSONDecoder().decode(QueueStats.self, from: data)
        await MainActor.run {
            self.queueStats = stats
        }
    } catch {
        print("⚠️ Failed to fetch queue stats: \(error)")
    }
}
```

---

## Testing After Refactor

### 1. Status Check Still Works
```swift
// In macOS app
await modelManager.checkOllamaStatus()
// Should show: ✅ Ollama is running with required models
```

### 2. Analysis Happens Server-Side
```bash
# Start server
cd photo-agent-server && npm run dev

# Upload a photo (will happen automatically via PhotosManager refactor)
# Check Bull Board UI
open http://localhost:1738/admin/queues

# Should see:
# - image-upload queue: jobs processing
# - image-analysis queue: jobs processing
```

### 3. Results Stored in SQLite
```bash
# Check database
sqlite3 photo-agent-server/data/photos.db "SELECT id, filename, summary FROM assets LIMIT 5;"
```

---

## Migration Notes

### For existing installations:
1. Users must run `brew services start redis` (Bull dependency)
2. No changes needed to Ollama setup
3. Existing photos in library will need re-upload (one-time)
4. Old metadata-only uploads won't have images - safe to ignore

### Data loss concerns:
- None! Old metadata is preserved in server memory
- Refactor adds new SQLite database (no existing data to migrate)
- Users can re-scan their library with new upload pipeline

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Lines of code | 379 | ~90 |
| Methods | 15 | 3 |
| Responsibilities | Status check + Analysis | Status check only |
| Dependencies | Ollama, PhotoKit, Server | Ollama only |
| Complexity | High (parallel processing, error handling) | Low (simple HTTP check) |

**Result:** 76% code reduction, much simpler Mac app, better architecture for iOS integration.
