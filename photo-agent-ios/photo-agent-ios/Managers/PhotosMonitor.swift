//
//  PhotosMonitor.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 2/1/26.
//

import Combine
import Foundation
import Photos
import UIKit
import CryptoKit

/// Monitors Photos library for new images after pairing
@MainActor
class PhotosMonitor: NSObject, ObservableObject {
    private let appState: AppState
    @Published var isMonitoring: Bool = false
    @Published var uploadedCount: Int = 0
    @Published var pendingCount: Int = 0
    @Published var failedCount: Int = 0
    
    private var pairingTimestamp: Date?
    private var fetchResult: PHFetchResult<PHAsset>?
    
    init(appState: AppState) {
        self.appState = appState
        super.init()
        
        // Load pairing timestamp
        if let timestamp = UserDefaults.standard.object(forKey: "pairingTimestamp") as? Date {
            self.pairingTimestamp = timestamp
        }
    }
    
    /// Request Photos library authorization
    func requestAuthorization() async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        return status == .authorized || status == .limited
    }
    
    /// Start monitoring for new photos
    func startMonitoring() async throws {
        guard appState.isPaired else {
            throw PhotoMonitorError.notPaired
        }
        
        // Request authorization if needed
        let authorized = await requestAuthorization()
        guard authorized else {
            throw PhotoMonitorError.authorizationDenied
        }
        
        // Set pairing timestamp if not already set
        if pairingTimestamp == nil {
            pairingTimestamp = Date()
            UserDefaults.standard.set(pairingTimestamp, forKey: "pairingTimestamp")
        }
        
        // Register for photo library changes
        PHPhotoLibrary.shared().register(self)
        
        // Fetch initial photos created after pairing
        await fetchNewPhotos()
        
        isMonitoring = true
        print("✅ Photo monitoring started (pairing timestamp: \(pairingTimestamp!))")
    }
    
    /// Stop monitoring
    func stopMonitoring() {
        PHPhotoLibrary.shared().unregisterChangeObserver(self)
        isMonitoring = false
        print("⚠️ Photo monitoring stopped")
    }
    
    /// Fetch photos created after pairing timestamp
    private func fetchNewPhotos() async {
        guard let pairingTimestamp = pairingTimestamp else { return }
        
        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "creationDate >= %@", pairingTimestamp as NSDate)
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        
        fetchResult = PHAsset.fetchAssets(with: .image, options: options)
        
        guard let fetchResult = fetchResult else { return }
        
        print("📸 Found \(fetchResult.count) photos since pairing")
        
        // Upload each photo
        for i in 0..<fetchResult.count {
            let asset = fetchResult.object(at: i)
            await uploadPhoto(asset: asset)
        }
    }
    
    /// Upload a single photo
    private func uploadPhoto(asset: PHAsset) async {
        do {
            pendingCount += 1
            
            // Get image data
            let imageData = try await fetchImageData(for: asset)
            
            // Compute hash
            let hash = SHA256.hash(data: imageData)
            let contentHash = hash.compactMap { String(format: "%02x", $0) }.joined()
            
            // Extract metadata
            let metadata = extractMetadata(from: asset)
            
            // Compress image
            guard let image = UIImage(data: imageData),
                  let compressedData = image.jpegData(compressionQuality: 0.7) else {
                throw PhotoMonitorError.compressionFailed
            }
            
            // Upload to server
            try await uploadToServer(
                photoLibraryId: asset.localIdentifier,
                contentHash: contentHash,
                imageData: compressedData,
                metadata: metadata
            )
            
            uploadedCount += 1
            pendingCount -= 1
            
            print("✅ Uploaded photo: \(asset.localIdentifier)")
            
        } catch {
            pendingCount -= 1
            failedCount += 1
            print("❌ Failed to upload photo: \(error.localizedDescription)")
        }
    }
    
    /// Fetch image data from PHAsset
    private func fetchImageData(for asset: PHAsset) async throws -> Data {
        return try await withCheckedThrowingContinuation { continuation in
            let options = PHImageRequestOptions()
            options.isSynchronous = false
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = true
            
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, info in
                if let error = info?[PHImageErrorKey] as? Error {
                    continuation.resume(throwing: error)
                    return
                }
                
                guard let data = data else {
                    continuation.resume(throwing: PhotoMonitorError.imageDataUnavailable)
                    return
                }
                
                continuation.resume(returning: data)
            }
        }
    }
    
    /// Extract metadata from PHAsset
    private func extractMetadata(from asset: PHAsset) -> PhotoMetadata {
        return PhotoMetadata(
            creationDate: asset.creationDate,
            latitude: asset.location?.coordinate.latitude,
            longitude: asset.location?.coordinate.longitude,
            altitude: asset.location?.altitude,
            filename: PHAssetResource.assetResources(for: asset).first?.originalFilename,
            mediaType: asset.mediaType.stringValue,
            isFavorite: asset.isFavorite
        )
    }
    
    /// Upload image to server
    private func uploadToServer(
        photoLibraryId: String,
        contentHash: String,
        imageData: Data,
        metadata: PhotoMetadata
    ) async throws {
        guard let tunnelURL = appState.tunnelURL,
              let url = URL(string: tunnelURL)?.appendingPathComponent("api/assets/upload") else {
            throw PhotoMonitorError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        // Create multipart form data
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add form fields
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"photoLibraryId\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(photoLibraryId)\r\n".data(using: .utf8)!)
        
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"deviceId\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(appState.deviceId)\r\n".data(using: .utf8)!)
        
        if let creationDate = metadata.creationDate {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"creationDate\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(creationDate.ISO8601Format())\r\n".data(using: .utf8)!)
        }
        
        if let latitude = metadata.latitude {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"latitude\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(latitude)\r\n".data(using: .utf8)!)
        }
        
        if let longitude = metadata.longitude {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"longitude\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(longitude)\r\n".data(using: .utf8)!)
        }
        
        if let altitude = metadata.altitude {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"altitude\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(altitude)\r\n".data(using: .utf8)!)
        }
        
        if let filename = metadata.filename {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"filename\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(filename)\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"mediaType\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(metadata.mediaType)\r\n".data(using: .utf8)!)
        
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"isFavorite\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(metadata.isFavorite)\r\n".data(using: .utf8)!)
        
        // Add image file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"image.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw PhotoMonitorError.uploadFailed
        }
        
        let result = try JSONDecoder().decode(UploadResponse.self, from: data)
        
        if !result.success {
            throw PhotoMonitorError.uploadFailed
        }
    }
}

// MARK: - PHPhotoLibraryChangeObserver

extension PhotosMonitor: PHPhotoLibraryChangeObserver {
    nonisolated func photoLibraryDidChange(_ changeInstance: PHChange) {
        Task { @MainActor in
            guard let fetchResult = fetchResult,
                  let changes = changeInstance.changeDetails(for: fetchResult) else {
                return
            }
            
            // Update fetch result
            self.fetchResult = changes.fetchResultAfterChanges
            
            // Check for new photos
            if changes.hasIncrementalChanges {
                let inserted = changes.insertedObjects
                print("📸 Detected \(inserted.count) new photos")
                
                for asset in inserted {
                    await uploadPhoto(asset: asset)
                }
            }
        }
    }
}

// MARK: - Models

struct PhotoMetadata {
    let creationDate: Date?
    let latitude: Double?
    let longitude: Double?
    let altitude: Double?
    let filename: String?
    let mediaType: String
    let isFavorite: Bool
}

struct UploadResponse: Codable {
    let success: Bool
    let jobId: Int?
    let assetId: String?
    let deduplicated: Bool?
}

enum PhotoMonitorError: LocalizedError {
    case notPaired
    case authorizationDenied
    case imageDataUnavailable
    case compressionFailed
    case invalidURL
    case uploadFailed
    
    var errorDescription: String? {
        switch self {
        case .notPaired:
            return "Device is not paired. Please pair with your Mac first."
        case .authorizationDenied:
            return "Photos access denied. Please enable in Settings."
        case .imageDataUnavailable:
            return "Could not fetch image data."
        case .compressionFailed:
            return "Failed to compress image."
        case .invalidURL:
            return "Invalid server URL."
        case .uploadFailed:
            return "Upload failed. Check your connection."
        }
    }
}

// MARK: - Extensions

extension PHAssetMediaType {
    var stringValue: String {
        switch self {
        case .image: return "image"
        case .video: return "video"
        case .audio: return "audio"
        default: return "unknown"
        }
    }
}
