//
//  ConnectionManager.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import Combine
import Foundation
import UIKit

/// Manages connection to the Mac server via tunnel
@MainActor
class ConnectionManager: ObservableObject {
    private let appState: AppState
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    /// Pair with Mac by testing tunnel URL and storing it
    func pair(tunnelURL: String) async throws {
        // Clean up URL (remove trailing slash)
        var cleanURL = tunnelURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanURL.hasSuffix("/") {
            cleanURL.removeLast()
        }
        
        // Validate URL format
        guard let url = URL(string: cleanURL),
              (url.scheme == "http" || url.scheme == "https") else {
            throw ConnectionError.invalidURL
        }
        
        appState.connectionStatus = .connecting
        appState.connectionError = nil
        
        // Test connection with /health endpoint
        let healthURL = url.appendingPathComponent("health")
        
        do {
            let (data, response) = try await URLSession.shared.data(from: healthURL)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw ConnectionError.serverUnreachable
            }
            
            let healthResponse = try JSONDecoder().decode(HealthResponse.self, from: data)
            
            guard healthResponse.status == "healthy" else {
                throw ConnectionError.serverUnhealthy
            }
            
            // Connection successful - store in Keychain
            KeychainHelper.save(key: "tunnelURL", value: cleanURL)
            
            // Register device with server
            try await registerDevice(baseURL: url)
            
            // Update app state
            appState.tunnelURL = cleanURL
            appState.isPaired = true
            appState.connectionStatus = .connected
            
        } catch let error as ConnectionError {
            appState.connectionStatus = .error
            appState.connectionError = error.localizedDescription
            throw error
        } catch {
            appState.connectionStatus = .error
            appState.connectionError = "Connection failed: \(error.localizedDescription)"
            throw ConnectionError.networkError(error)
        }
    }
    
    /// Register this device with the server
    private func registerDevice(baseURL: URL) async throws {
        let registerURL = baseURL.appendingPathComponent("api/devices")
        
        var request = URLRequest(url: registerURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let deviceInfo = DeviceRegistration(
            deviceId: appState.deviceId,
            deviceType: "ios",
            deviceName: UIDevice.current.name,
            systemVersion: UIDevice.current.systemVersion
        )
        
        request.httpBody = try JSONEncoder().encode(deviceInfo)
        
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            // Non-critical error - device registration endpoint may not exist yet
            print("⚠️ Device registration failed (non-critical)")
            return
        }
    }
    
    /// Test current connection
    func testConnection() async -> Bool {
        guard let tunnelURL = appState.tunnelURL,
              let url = URL(string: tunnelURL) else {
            appState.connectionStatus = .disconnected
            return false
        }
        
        let healthURL = url.appendingPathComponent("health")
        
        do {
            let (data, response) = try await URLSession.shared.data(from: healthURL)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                appState.connectionStatus = .error
                appState.connectionError = "Server returned status: \((response as? HTTPURLResponse)?.statusCode ?? 0)"
                return false
            }
            
            let healthResponse = try JSONDecoder().decode(HealthResponse.self, from: data)
            
            if healthResponse.status == "healthy" {
                appState.connectionStatus = .connected
                appState.connectionError = nil
                return true
            } else {
                appState.connectionStatus = .error
                appState.connectionError = "Server unhealthy"
                return false
            }
            
        } catch {
            appState.connectionStatus = .error
            appState.connectionError = error.localizedDescription
            return false
        }
    }
    
    /// Start periodic polling for approvals count (fallback until SSE is implemented)
    func startPolling() {
        Task {
            while appState.isPaired {
                // Poll every 10 seconds
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                await pollApprovals()
            }
        }
    }
    
    /// Poll server for pending approvals count
    private func pollApprovals() async {
        guard let tunnelURL = appState.tunnelURL,
              let url = URL(string: tunnelURL) else {
            return
        }
        
        // Get approval counts by status
        let countsURL = url.appendingPathComponent("api/approvals/stats/counts")
            .appending(queryItems: [URLQueryItem(name: "deviceId", value: appState.deviceId)])
        
        do {
            let (data, _) = try await URLSession.shared.data(from: countsURL)
            let response = try JSONDecoder().decode(ApprovalCountsResponse.self, from: data)
            appState.pendingApprovalsCount = response.counts.pending
        } catch {
            // Silently fail - endpoint may not exist yet or network issue
            print("⚠️ Polling failed (non-critical): \(error)")
        }
    }
}

// MARK: - Models

struct HealthResponse: Codable {
    let status: String
    let timestamp: String
}

struct DeviceRegistration: Codable {
    let deviceId: String
    let deviceType: String
    let deviceName: String
    let systemVersion: String
}

struct ApprovalCountsResponse: Codable {
    let success: Bool
    let counts: ApprovalCounts
}

struct ApprovalCounts: Codable {
    let pending: Int
    let approved: Int
    let rejected: Int
}

enum ConnectionError: LocalizedError {
    case invalidURL
    case serverUnreachable
    case serverUnhealthy
    case networkError(Error)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL format. Please scan the QR code again."
        case .serverUnreachable:
            return "Cannot reach the server. Make sure your Mac is running the Photos Agent."
        case .serverUnhealthy:
            return "Server is running but not healthy. Please restart the Mac app."
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}
