//
//  TunnelManager.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import Foundation

class TunnelManager {
    private weak var appState: AppState?
    private var tunnelProcess: Process?
    private let cloudflaredBinaryPath = "/opt/homebrew/bin/cloudflared"
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    @MainActor
    func startTunnel() async {
        guard let appState = appState else { return }
        
        // Check if already running
        if appState.tunnelStatus == .running || appState.tunnelStatus == .starting {
            print("⚠️ Tunnel already running or starting")
            return
        }
        
        // Check if server is running first
        guard appState.serverStatus == .running else {
            appState.tunnelError = "Server must be running before starting tunnel"
            print("⚠️ Cannot start tunnel: server is not running")
            return
        }
        
        appState.tunnelStatus = .starting
        appState.tunnelError = nil
        
        do {
            // Check if cloudflared is installed
            guard isCloudflaredInstalled() else {
                throw TunnelError.cloudflaredNotInstalled
            }

            // Spawn the tunnel process
            try await spawnTunnelProcess()
            
            // Wait for tunnel to connect
            try await waitForTunnelConnection()
            
            appState.tunnelStatus = .running
            print("✅ Tunnel started successfully: \(appState.tunnelURL ?? "unknown URL")")
            
        } catch {
            await handleTunnelError(error)
        }
    }
    
    @MainActor
    func stopTunnel() {
        guard let appState = appState else { return }
        
        print("🛑 Stopping tunnel...")
        appState.tunnelStatus = .stopped
        appState.tunnelURL = nil
        
        // Terminate the process
        if let process = tunnelProcess, process.isRunning {
            process.terminate()
            
            // Wait for graceful shutdown
            DispatchQueue.global().async {
                for _ in 0..<50 {
                    if !process.isRunning {
                        print("✅ Tunnel stopped gracefully")
                        return
                    }
                    Thread.sleep(forTimeInterval: 0.1)
                }
                
                // Force kill if still running
                if process.isRunning {
                    print("⚠️ Force killing tunnel process")
                    kill(process.processIdentifier, SIGKILL)
                }
            }
        }
        
        tunnelProcess = nil
    }
    
    // MARK: - Private Methods
    
    private func isCloudflaredInstalled() -> Bool {
        return FileManager.default.fileExists(atPath: cloudflaredBinaryPath)
    }
    
    private func spawnTunnelProcess() async throws {
        guard let appState = appState else { return }
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: cloudflaredBinaryPath)
        process.arguments = [
            "tunnel",
            "--url", "http://localhost:\(appState.serverPort)"
        ]
        
        // Set up pipes for stdout and stderr
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        
        // Read output asynchronously to capture tunnel URL
        outputPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("📝 Tunnel: \(output.trimmingCharacters(in: .whitespacesAndNewlines))")
                self?.parseTunnelOutput(output)
            }
        }
        
        errorPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("📝 Tunnel Info: \(output.trimmingCharacters(in: .whitespacesAndNewlines))")
                self?.parseTunnelOutput(output)
            }
        }
        
        // Handle process termination
        process.terminationHandler = { [weak self] process in
            print("🔴 Tunnel process terminated with status: \(process.terminationStatus)")
            Task { @MainActor in
                if let appState = self?.appState, appState.tunnelStatus == .running {
                    appState.tunnelStatus = .error
                    appState.tunnelError = "Tunnel disconnected unexpectedly"
                }
            }
        }
        
        try process.run()
        tunnelProcess = process
        
        print("🚀 Tunnel process spawned (PID: \(process.processIdentifier))")
    }
    
    private func parseTunnelOutput(_ output: String) {
        // Look for connection messages and URL
        // Cloudflared outputs something like: "Connection registered" or URL info
        
        // Try to extract URL from various formats
        if output.contains("https://") {
            if let url = extractURL(from: output) {
                Task { @MainActor in
                    self.appState?.tunnelURL = url
                    print("🌐 Tunnel URL detected: \(url)")
                }
            }
        }
    }
    
    private func extractURL(from text: String) -> String? {
        // Use regex to find https:// URLs
        let pattern = "https://[a-zA-Z0-9.-]+\\.trycloudflare\\.com"
        
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
           let range = Range(match.range, in: text) {
            return String(text[range])
        }
        
        return nil
    }
    
    private func waitForTunnelConnection() async throws {
        let maxAttempts = 20 // 20 seconds
        
        for attempt in 1...maxAttempts {
            if let appState = appState, appState.tunnelStatus != .starting {
                // User stopped it
                throw TunnelError.startupCancelled
            }
            
            // Check if we have a URL
            if let url = appState?.tunnelURL, !url.isEmpty {
                print("✅ Tunnel connected on attempt \(attempt)")
                return
            }
            
            try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        }
    }
    
    @MainActor
    private func handleTunnelError(_ error: Error) {
        guard let appState = appState else { return }
        
        appState.tunnelStatus = .error
        
        if let tunnelError = error as? TunnelError {
            appState.tunnelError = tunnelError.description
        } else {
            appState.tunnelError = error.localizedDescription
        }
        
        print("❌ Tunnel error: \(appState.tunnelError ?? "Unknown error")")
    }
}

// MARK: - Errors

enum TunnelError: Error {
    case cloudflaredNotInstalled
    case connectionTimeout
    case startupCancelled
    
    var description: String {
        switch self {
        case .cloudflaredNotInstalled:
            return "cloudflared is not installed. Run: brew install cloudflared"
        case .connectionTimeout:
            return "Tunnel failed to connect within 20 seconds"
        case .startupCancelled:
            return "Tunnel startup was cancelled"
        }
    }
}

