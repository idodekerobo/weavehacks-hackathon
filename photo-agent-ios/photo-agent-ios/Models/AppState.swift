//
//  AppState.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import Combine
import Foundation
import SwiftUI

/// iOS-specific app state
@MainActor
class AppState: ObservableObject {
    // Connection state
    @Published var isPaired: Bool = false
    @Published var connectionStatus: ConnectionStatus = .disconnected
    @Published var tunnelURL: String?
    @Published var deviceId: String
    @Published var connectionError: String?
    
    // Queue/approval counts (polled from server)
    @Published var pendingApprovalsCount: Int = 0
    @Published var recentActionsCount: Int = 0
    
    // Photo monitoring state
    @Published var isMonitoringPhotos: Bool = false
    @Published var photosUploadedCount: Int = 0
    @Published var photosPendingCount: Int = 0
    @Published var photosFailedCount: Int = 0
    
    lazy var connectionManager = ConnectionManager(appState: self)
    lazy var photosMonitor = PhotosMonitor(appState: self)
    
    init() {
        // Generate or retrieve persistent device ID
        if let savedDeviceId = UserDefaults.standard.string(forKey: "deviceId") {
            self.deviceId = savedDeviceId
        } else {
            let newDeviceId = UUID().uuidString
            UserDefaults.standard.set(newDeviceId, forKey: "deviceId")
            self.deviceId = newDeviceId
        }
        
        // Check if already paired
        if let savedTunnelURL = KeychainHelper.retrieve(key: "tunnelURL") {
            self.tunnelURL = savedTunnelURL
            self.isPaired = true
        }
    }
    
    func unpair() {
        // Stop photo monitoring
        if isMonitoringPhotos {
            photosMonitor.stopMonitoring()
        }
        
        // Clear pairing data
        KeychainHelper.delete(key: "tunnelURL")
        UserDefaults.standard.removeObject(forKey: "pairingTimestamp")
        
        self.tunnelURL = nil
        self.isPaired = false
        self.connectionStatus = .disconnected
        self.isMonitoringPhotos = false
    }
}

enum ConnectionStatus: String {
    case disconnected = "Disconnected"
    case connecting = "Connecting..."
    case connected = "Connected"
    case error = "Error"
    
    var color: Color {
        switch self {
        case .disconnected: return .gray
        case .connecting: return .orange
        case .connected: return .green
        case .error: return .red
        }
    }
}
