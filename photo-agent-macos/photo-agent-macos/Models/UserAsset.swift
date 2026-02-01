//
//  UserAsset.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import Foundation
import CoreLocation

/// Represents a photo asset with extracted metadata
struct UserAsset: Codable, Identifiable {
    let id: String
    let photoLibraryId: String
    let creationDate: Date?
    let latitude: Double?
    let longitude: Double?
    let altitude: Double?
    let filename: String?
    let mediaType: String
    let isFavorite: Bool
    
    // Populated by local model analysis (Ollama)
    var ocrText: String?
    var summary: String?
    var embedding: [Double]?
    var intentLabels: [String]?
    var confidence: Double?
    
    init(
        id: String = UUID().uuidString,
        photoLibraryId: String,
        creationDate: Date?,
        latitude: Double?,
        longitude: Double?,
        altitude: Double?,
        filename: String?,
        mediaType: String,
        isFavorite: Bool
    ) {
        self.id = id
        self.photoLibraryId = photoLibraryId
        self.creationDate = creationDate
        self.latitude = latitude
        self.longitude = longitude
        self.altitude = altitude
        self.filename = filename
        self.mediaType = mediaType
        self.isFavorite = isFavorite
    }
}

/// API request payload for creating a new asset
struct CreateAssetRequest: Codable {
    let photoLibraryId: String
    let creationDate: String?
    let latitude: Double?
    let longitude: Double?
    let altitude: Double?
    let filename: String?
    let mediaType: String
    let isFavorite: Bool
    let ocrText: String?
    let summary: String?
    let embedding: [Double]?
}

/// API response for asset operations
struct AssetResponse: Codable {
    let success: Bool
    let asset: UserAsset?
    let error: String?
}
