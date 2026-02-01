//
//  PhotosManager.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import Combine
import Foundation
import Photos
import CoreLocation
import CryptoKit
import AppKit

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
    
    /// Get all scanned assets for analysis
    func getAllScannedAssets() async -> [PHAsset] {
        do {
            let assets = try await fetchRecentPhotos(limit: scanLimit)
            print("📸 Retrieved \(assets.count) assets for analysis")
            return assets
        } catch {
            print("❌ Failed to fetch assets for analysis: \(error.localizedDescription)")
            return []
        }
    }
    
    // MARK: - Private Helpers
    
    /// Fetch recent photos from the library
    private func fetchRecentPhotos(limit: Int) async throws -> [PHAsset] {
        return try await withCheckedThrowingContinuation { continuation in
            // Create fetch options
            let fetchOptions = PHFetchOptions()
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            fetchOptions.fetchLimit = limit
            
            // Prefetch the properties we'll need to avoid on-demand fetching
            fetchOptions.includeAssetSourceTypes = [.typeUserLibrary, .typeCloudShared, .typeiTunesSynced]
            
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
    
    /// Get image data from PHAsset
    private func getImageData(from asset: PHAsset) async throws -> Data {
        return try await withCheckedThrowingContinuation { continuation in
            let options = PHImageRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = true
            options.isSynchronous = false
            options.version = .current  // Use current version (edited if available)
            
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, dataUTI, orientation, info in
                // Check for errors
                if let error = info?[PHImageErrorKey] as? Error {
                    continuation.resume(throwing: error)
                    return
                }
                
                // Check if request was cancelled
                if let cancelled = info?[PHImageCancelledKey] as? Bool, cancelled {
                    continuation.resume(throwing: PhotosManagerError.requestCancelled)
                    return
                }
                
                // Check if image is in iCloud and needs to be downloaded
                if let isInCloud = info?[PHImageResultIsInCloudKey] as? Bool, isInCloud {
                    print("⚠️ Asset is in iCloud, downloading...")
                }
                
                guard let data = data else {
                    continuation.resume(throwing: PhotosManagerError.invalidResponse)
                    return
                }
                
                continuation.resume(returning: data)
            }
        }
    }
    
    /// Compress image to 70% JPEG quality
    private func compressImage(_ data: Data) -> Data? {
        guard let nsImage = NSImage(data: data),
              let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return nil
        }
        let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
        return bitmapRep.representation(using: .jpeg, properties: [.compressionFactor: 0.7])
    }
    
    /// Compute SHA-256 hash of data
    private func computeSHA256(_ data: Data) -> String {
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
    
    /// Send image data to the Node server via multipart upload
    private func sendToServer(_ asset: UserAsset) async throws {
        // This is the new upload endpoint that accepts image data
        let url = URL(string: "\(serverURL)/api/assets/upload")!
        
        // We need to fetch the image data for this asset
        // Get the PHAsset from the photo library
        let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [asset.photoLibraryId], options: nil)
        guard let phAsset = fetchResult.firstObject else {
            throw PhotosManagerError.invalidResponse
        }
        
        // Get image data
        let imageData = try await getImageData(from: phAsset)
        
        // Compress image
        guard let compressedData = compressImage(imageData) else {
            throw PhotosManagerError.invalidResponse
        }
        
        // Compute content hash
        let contentHash = computeSHA256(compressedData)
        
        // Create multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add metadata fields
        let fields: [String: String] = [
            "photoLibraryId": asset.photoLibraryId,
            "deviceId": "macos-\(ProcessInfo.processInfo.hostName)",
            "creationDate": asset.creationDate?.ISO8601Format() ?? "",
            "latitude": asset.latitude.map { String($0) } ?? "",
            "longitude": asset.longitude.map { String($0) } ?? "",
            "altitude": asset.altitude.map { String($0) } ?? "",
            "filename": asset.filename ?? "",
            "mediaType": asset.mediaType,
            "isFavorite": asset.isFavorite ? "true" : "false"
        ]
        
        for (key, value) in fields where !value.isEmpty {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        // Add image data
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"\(asset.filename ?? "image.jpg")\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(compressedData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw PhotosManagerError.invalidResponse
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw PhotosManagerError.serverError(statusCode: httpResponse.statusCode)
        }
        
        // Parse response
        struct UploadResponse: Codable {
            let success: Bool
            let assetId: String?
            let jobId: Int?
            let deduplicated: Bool?
        }
        
        let uploadResponse = try JSONDecoder().decode(UploadResponse.self, from: data)
        
        if uploadResponse.deduplicated == true {
            print("ℹ️ Asset deduplicated (already exists): \(asset.photoLibraryId)")
        } else {
            print("✅ Asset uploaded successfully: \(asset.photoLibraryId)")
        }
    }
}

// MARK: - Errors

enum PhotosManagerError: LocalizedError {
    case unauthorized
    case invalidResponse
    case serverError(statusCode: Int)
    case scanInProgress
    case requestCancelled
    
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
        case .requestCancelled:
            return "Image request was cancelled"
        }
    }
}
