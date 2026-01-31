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
    
    lazy var serverManager = ServerManager(appState: self)
    lazy var tunnelManager = TunnelManager(appState: self)
    
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

