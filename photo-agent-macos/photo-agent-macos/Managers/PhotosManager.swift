//
//  PhotosManager.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import Foundation
import Photos
import CoreLocation

@MainActor
class PhotosManager: ObservableObject {
    private weak var appState: AppState?
    
    // Configuration
    private let scanLimit = 1000 // Hardcoded for now, make configurable later
    private let serverURL: String
    
    // Internal state
    private var isScanningInProgress = false
    
    init(appState: AppState) {
        self.appState = appState
        self.serverURL = "http://localhost:\(appState.serverPort)"
    }
    
    // MARK: - Authorization
    
    /// Request photo library authorization from the user
    func requestAuthorization() async {
        print("📸 Requesting photo library authorization...")
        
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        // Update current status
        updateAuthStatus(status)
        
        // If not determined, request authorization
        if status == .notDetermined {
            let newStatus = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            updateAuthStatus(newStatus)
        }
    }
    
    /// Check current authorization status
    func checkAuthorizationStatus() {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        updateAuthStatus(status)
    }
    
    private func updateAuthStatus(_ status: PHAuthorizationStatus) {
        switch status {
        case .notDetermined:
            appState?.photosAuthStatus = .notDetermined
        case .restricted:
            appState?.photosAuthStatus = .restricted
        case .denied:
            appState?.photosAuthStatus = .denied
        case .authorized:
            appState?.photosAuthStatus = .authorized
        case .limited:
            appState?.photosAuthStatus = .limited
        @unknown default:
            appState?.photosAuthStatus = .notDetermined
        }
        
        print("📸 Photo library authorization status: \(appState?.photosAuthStatus.rawValue ?? "unknown")")
    }
    
    // MARK: - Photo Scanning
    
    /// Start scanning the photo library
    func startScanning() async {
        guard let appState = appState else { return }
        
        // Check if already scanning
        guard !isScanningInProgress else {
            print("⚠️ Scanning already in progress")
            return
        }
        
        // Check authorization
        guard appState.photosAuthStatus.isAuthorized else {
            appState.photosError = "Photo library access not authorized"
            print("❌ Cannot scan: not authorized")
            return
        }
        
        // Check if server is running
        guard appState.serverStatus == .running else {
            appState.photosError = "Server must be running to scan photos"
            print("❌ Cannot scan: server not running")
            return
        }
        
        isScanningInProgress = true
        appState.photosScanStatus = .starting
        appState.photosError = nil
        appState.photosScannedCount = 0
        appState.photosTotalCount = 0
        
        print("📸 Starting photo library scan (limit: \(scanLimit))...")
        
        do {
            // Fetch photos
            let assets = try await fetchRecentPhotos(limit: scanLimit)
            appState.photosTotalCount = assets.count
            
            print("📸 Found \(assets.count) photos to process")
            appState.photosScanStatus = .running
            
            // Process each photo
            for (index, asset) in assets.enumerated() {
                let metadata = extractMetadata(from: asset)
                
                // Send to server
                do {
                    try await sendToServer(metadata)
                    appState.photosScannedCount = index + 1
                    print("📸 Processed \(index + 1)/\(assets.count): \(metadata.photoLibraryId)")
                } catch {
                    print("⚠️ Failed to send asset to server: \(error.localizedDescription)")
                    // Continue with next photo even if one fails
                }
                
                // Small delay to avoid overwhelming the server
                try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
            }
            
            appState.photosScanStatus = .stopped
            print("✅ Photo scan complete: \(appState.photosScannedCount)/\(appState.photosTotalCount) processed")
            
        } catch {
            appState.photosScanStatus = .error
            appState.photosError = error.localizedDescription
            print("❌ Photo scan failed: \(error.localizedDescription)")
        }
        
        isScanningInProgress = false
    }
    
    /// Stop scanning (if in progress)
    func stopScanning() {
        guard isScanningInProgress else { return }
        print("⏸️ Stopping photo scan...")
        appState?.photosScanStatus = .stopped
        isScanningInProgress = false
    }
    
    // MARK: - Private Helpers
    
    /// Fetch recent photos from the library
    private func fetchRecentPhotos(limit: Int) async throws -> [PHAsset] {
        return try await withCheckedThrowingContinuation { continuation in
            // Create fetch options
            let fetchOptions = PHFetchOptions()
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            fetchOptions.fetchLimit = limit
            
            // Fetch all assets
            let fetchResult = PHAsset.fetchAssets(with: fetchOptions)
            
            // Convert to array
            var assets: [PHAsset] = []
            fetchResult.enumerateObjects { asset, _, _ in
                assets.append(asset)
            }
            
            continuation.resume(returning: assets)
        }
    }
    
    /// Extract metadata from a PHAsset
    private func extractMetadata(from asset: PHAsset) -> UserAsset {
        // Extract location data
        var latitude: Double?
        var longitude: Double?
        var altitude: Double?
        
        if let location = asset.location {
            latitude = location.coordinate.latitude
            longitude = location.coordinate.longitude
            altitude = location.altitude
        }
        
        // Get filename from resources
        var filename: String?
        if let resource = PHAssetResource.assetResources(for: asset).first {
            filename = resource.originalFilename
        }
        
        // Media type
        let mediaType: String
        switch asset.mediaType {
        case .image:
            mediaType = "image"
        case .video:
            mediaType = "video"
        case .audio:
            mediaType = "audio"
        case .unknown:
            mediaType = "unknown"
        @unknown default:
            mediaType = "unknown"
        }
        
        return UserAsset(
            photoLibraryId: asset.localIdentifier,
            creationDate: asset.creationDate,
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            filename: filename,
            mediaType: mediaType,
            isFavorite: asset.isFavorite
        )
    }
    
    /// Send metadata to the Node server
    private func sendToServer(_ asset: UserAsset) async throws {
        let url = URL(string: "\(serverURL)/api/assets")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Create request payload
        let payload = CreateAssetRequest(
            photoLibraryId: asset.photoLibraryId,
            creationDate: asset.creationDate?.ISO8601Format(),
            latitude: asset.latitude,
            longitude: asset.longitude,
            altitude: asset.altitude,
            filename: asset.filename,
            mediaType: asset.mediaType,
            isFavorite: asset.isFavorite
        )
        
        request.httpBody = try JSONEncoder().encode(payload)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw PhotosManagerError.invalidResponse
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw PhotosManagerError.serverError(statusCode: httpResponse.statusCode)
        }
        
        // Optional: Parse response to verify success
        let _ = try JSONDecoder().decode(AssetResponse.self, from: data)
    }
}

// MARK: - Errors

enum PhotosManagerError: LocalizedError {
    case unauthorized
    case invalidResponse
    case serverError(statusCode: Int)
    case scanInProgress
    
    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Photo library access not authorized"
        case .invalidResponse:
            return "Invalid response from server"
        case .serverError(let statusCode):
            return "Server error: \(statusCode)"
        case .scanInProgress:
            return "A scan is already in progress"
        }
    }
}
