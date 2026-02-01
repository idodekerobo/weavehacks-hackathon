//
//  ServerManager.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import Foundation

class ServerManager {
    private weak var appState: AppState?
    private var serverProcess: Process?
    private var healthCheckTimer: Timer?
    
    // TODO: bundle this all together so its automatic OR enable file explorer to find the folder
    private let serverPath = "/Users/idodekerobo/Documents/baby_mogul/Young_Zuckerberg/weavehacks/photo-agent-server"
    // TODO: Replace hardcoded Node path with dynamic resolution (PATH lookup or user setting).
    private let nodeBinaryPath = "/Users/idodekerobo/.nvm/versions/node/v20.17.0/bin/node"
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    @MainActor
    func startServer() async {
        guard let appState = appState else { return }
        
        // Check if already running
        if appState.serverStatus == .running || appState.serverStatus == .starting {
            print("⚠️ Server already running or starting")
            return
        }
        
        appState.serverStatus = .starting
        appState.serverError = nil
        
        do {
            // Check if Node.js is installed
            guard isNodeInstalled() else {
                throw ServerError.nodeNotInstalled
            }
            
            // Check if server path exists
            guard FileManager.default.fileExists(atPath: serverPath) else {
                throw ServerError.serverPathNotFound(serverPath)
            }
            
            // Smart server detection: Check if server already exists and is healthy
            print("🔍 Checking for existing server on port \(appState.serverPort)...")
            if try await checkServerHealth() {
                // Server exists and is healthy - reuse it!
                print("✅ Found existing healthy server, reusing it")
                appState.serverStatus = .running
                startHealthChecks()
                return
            }
            
            // Server doesn't exist or is unhealthy
            print("🔧 No healthy server found, starting fresh...")
            
            // Kill any existing processes on the port before starting
            killProcessOnPort(appState.serverPort)
            
            // Spawn the Node server
            try await spawnServerProcess()
            
            // Wait for server to be ready
            try await waitForServerReady()
            
            appState.serverStatus = .running
            print("✅ Server started successfully on port \(appState.serverPort)")
            
            // Start periodic health checks
            startHealthChecks()
            
        } catch {
            await handleServerError(error)
        }
    }
    
    @MainActor
    func stopServer() {
        guard let appState = appState else { return }
        
        print("🛑 Stopping server...")
        appState.serverStatus = .stopped
        
        // Stop health checks
        healthCheckTimer?.invalidate()
        healthCheckTimer = nil
        
        // Terminate the process
        if let process = serverProcess, process.isRunning {
            process.terminate()
            
            // Wait for graceful shutdown (max 5 seconds)
            DispatchQueue.global().async {
                for _ in 0..<50 {
                    if !process.isRunning {
                        print("✅ Server stopped gracefully")
                        return
                    }
                    Thread.sleep(forTimeInterval: 0.1)
                }
                
                // Force kill if still running
                if process.isRunning {
                    print("⚠️ Force killing server process")
                    kill(process.processIdentifier, SIGKILL)
                }
            }
        }
        
        serverProcess = nil
    }
    
    // MARK: - Private Methods
    
    private func isNodeInstalled() -> Bool {
        return FileManager.default.fileExists(atPath: nodeBinaryPath)
    }
    
    /// Kill any process listening on the specified port
    private func killProcessOnPort(_ port: Int) {
        print("🔪 Checking for processes on port \(port)...")
        
        // Use lsof to find process IDs using the port
        let lsofProcess = Process()
        lsofProcess.executableURL = URL(fileURLWithPath: "/usr/bin/lsof")
        lsofProcess.arguments = ["-ti", ":\(port)"]
        
        let pipe = Pipe()
        lsofProcess.standardOutput = pipe
        
        do {
            try lsofProcess.run()
            lsofProcess.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                // Parse PIDs from output (one per line)
                let pids = output.split(separator: "\n").compactMap { Int32($0.trimmingCharacters(in: .whitespaces)) }
                
                if !pids.isEmpty {
                    print("🔪 Found \(pids.count) process(es) on port \(port), terminating...")
                    for pid in pids {
                        print("   Killing PID: \(pid)")
                        kill(pid, SIGTERM)
                    }
                    
                    // Give processes time to terminate gracefully
                    Thread.sleep(forTimeInterval: 1.0)
                    
                    // Force kill any remaining
                    for pid in pids {
                        kill(pid, SIGKILL)
                    }
                    
                    print("✅ Cleaned up processes on port \(port)")
                } else {
                    print("✅ No processes found on port \(port)")
                }
            }
        } catch {
            print("⚠️ Failed to check/kill processes on port \(port): \(error.localizedDescription)")
        }
    }
    
    private func spawnServerProcess() async throws {
        let process = Process()
        process.currentDirectoryURL = URL(fileURLWithPath: serverPath)
        
        // Use the full path to npm instead of relying on /usr/bin/env
        let nodeBinDirectory = (nodeBinaryPath as NSString).deletingLastPathComponent
        let npmPath = "\(nodeBinDirectory)/npm"
        
        print("🔧 DEBUG: Node binary path: \(nodeBinaryPath)")
        print("🔧 DEBUG: NPM path: \(npmPath)")
        print("🔧 DEBUG: Server path: \(serverPath)")
        
        // Check if npm exists at the expected path
        guard FileManager.default.fileExists(atPath: npmPath) else {
            print("❌ DEBUG: npm not found at \(npmPath)")
            throw ServerError.npmNotFound(npmPath)
        }
        
        // Use npm directly instead of going through /usr/bin/env
        process.executableURL = URL(fileURLWithPath: npmPath)
        process.arguments = ["run", "dev"]
        
        // Set up environment with proper PATH
        var environment = ProcessInfo.processInfo.environment
        if let existingPath = environment["PATH"] {
            environment["PATH"] = "\(nodeBinDirectory):\(existingPath)"
        } else {
            environment["PATH"] = nodeBinDirectory
        }
        process.environment = environment
        
        print("🔧 DEBUG: PATH set to: \(environment["PATH"] ?? "nil")")
        
        // Set up pipes for stdout and stderr
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        
        // Read output asynchronously
        outputPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("📝 Server: \(output.trimmingCharacters(in: .whitespacesAndNewlines))")
            }
        }
        
        errorPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("⚠️ Server Error: \(output.trimmingCharacters(in: .whitespacesAndNewlines))")
            }
        }
        
        // Handle process termination
        process.terminationHandler = { [weak self] process in
            let status = process.terminationStatus
            print("🔴 Server process terminated with status: \(status)")
            
            // Provide more helpful error messages based on exit code
            var errorMessage = "Server crashed unexpectedly"
            if status == 126 {
                errorMessage = "Permission denied. Disable App Sandbox in Xcode: Target → Signing & Capabilities → Remove App Sandbox"
            } else if status == 127 {
                errorMessage = "Command not found. Check that npm/node paths are correct."
            }
            
            Task { @MainActor in
                if let appState = self?.appState, appState.serverStatus == .running || appState.serverStatus == .starting {
                    appState.serverStatus = .error
                    appState.serverError = errorMessage
                }
            }
        }
        
        try process.run()
        serverProcess = process
        
        print("🚀 Server process spawned (PID: \(process.processIdentifier))")
        
        // Give the process a moment to fail if it's going to fail immediately
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
        
        // Check if process died immediately
        if !process.isRunning {
            let status = process.terminationStatus
            print("❌ DEBUG: Process died immediately with status \(status)")
            if status == 126 {
                throw ServerError.sandboxBlocking
            } else if status == 127 {
                throw ServerError.npmNotFound(npmPath)
            }
        }
    }
    
    private func waitForServerReady() async throws {
        let maxAttempts = 30 // 30 seconds
        
        for attempt in 1...maxAttempts {
            if let appState = appState, appState.serverStatus != .starting {
                // User stopped it
                throw ServerError.startupCancelled
            }
            
            if try await checkServerHealth() {
                print("✅ Server health check passed on attempt \(attempt)")
                return
            }
            
            try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        }
        
        throw ServerError.healthCheckTimeout
    }
    
    private func checkServerHealth() async throws -> Bool {
        guard let url = URL(string: "http://localhost:\(appState?.serverPort ?? 3001)/health") else {
            return false
        }
        
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return false
            }
            
            // Parse the JSON response
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let status = json["status"] as? String,
               status == "healthy" {
                return true
            }
            
            return false
        } catch {
            return false
        }
    }
    
    private func startHealthChecks() {
        // Check health every 10 seconds
        healthCheckTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
            Task {
                guard let self = self else { return }
                let isHealthy = try? await self.checkServerHealth()
                
                await MainActor.run {
                    if isHealthy == false, let appState = self.appState, appState.serverStatus == .running {
                        appState.serverStatus = .error
                        appState.serverError = "Server health check failed"
                    }
                }
            }
        }
    }
    
    @MainActor
    private func handleServerError(_ error: Error) {
        guard let appState = appState else { return }
        
        appState.serverStatus = .error
        
        if let serverError = error as? ServerError {
            appState.serverError = serverError.description
        } else {
            appState.serverError = error.localizedDescription
        }
        
        print("❌ Server error: \(appState.serverError ?? "Unknown error")")
    }
}

// MARK: - Errors

enum ServerError: Error {
    case nodeNotInstalled
    case npmNotFound(String)
    case serverPathNotFound(String)
    case healthCheckTimeout
    case startupCancelled
    case sandboxBlocking
    
    var description: String {
        switch self {
        case .nodeNotInstalled:
            return "Node.js is not installed. Please install from nodejs.org"
        case .npmNotFound(let path):
            return "npm not found at: \(path)"
        case .serverPathNotFound(let path):
            return "Server not found at: \(path)"
        case .healthCheckTimeout:
            return "Server failed to start within 30 seconds. Check Xcode console for details."
        case .startupCancelled:
            return "Server startup was cancelled"
        case .sandboxBlocking:
            return "App Sandbox is blocking execution. In Xcode: Target → Signing & Capabilities → Remove 'App Sandbox'"
        }
    }
}

