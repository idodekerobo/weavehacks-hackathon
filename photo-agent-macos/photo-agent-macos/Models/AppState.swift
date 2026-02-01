//
//  AppState.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import Combine
import Foundation
import SwiftUI

@MainActor
class AppState: ObservableObject {
    @Published var serverStatus: ServiceStatus = .stopped
    @Published var serverPort: Int = 1738
    @Published var serverError: String?
    
    @Published var tunnelStatus: ServiceStatus = .stopped
    @Published var tunnelURL: String?
    @Published var tunnelError: String?
    
    @Published var queuePending: Int = 0
    @Published var queueRunning: Int = 0
    @Published var queueWaitingApproval: Int = 0
    
    // Photo scanning state
    @Published var photosAuthStatus: PhotoAuthStatus = .notDetermined
    @Published var photosScanStatus: ServiceStatus = .stopped
    @Published var photosScannedCount: Int = 0
    @Published var photosTotalCount: Int = 0
    @Published var photosError: String?
    
    // Approvals state
    @Published var pendingApprovalsCount: Int = 0
    
    // Device identifier for approvals
    let deviceId: String
    
    lazy var serverManager = ServerManager(appState: self)
    lazy var tunnelManager = TunnelManager(appState: self)
    lazy var photosManager = PhotosManager(appState: self)
    
    init() {
        // Generate or retrieve persistent device ID
        if let savedDeviceId = UserDefaults.standard.string(forKey: "macos_deviceId") {
            self.deviceId = savedDeviceId
        } else {
            let newDeviceId = "macos-\(UUID().uuidString)"
            UserDefaults.standard.set(newDeviceId, forKey: "macos_deviceId")
            self.deviceId = newDeviceId
        }
    }
}

enum PhotoAuthStatus: String {
    case notDetermined = "Not Determined"
    case restricted = "Restricted"
    case denied = "Denied"
    case authorized = "Authorized"
    case limited = "Limited"
    
    var isAuthorized: Bool {
        return self == .authorized || self == .limited
    }
}

enum ServiceStatus: String {
    case stopped = "Stopped"
    case starting = "Starting..."
    case running = "Running"
    case error = "Error"
    
    var color: Color {
        switch self {
        case .stopped: return .gray
        case .starting: return .orange
        case .running: return .green
        case .error: return .red
        }
    }
}

