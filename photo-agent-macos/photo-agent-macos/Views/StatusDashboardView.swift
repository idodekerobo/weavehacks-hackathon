//
//  StatusDashboardView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI
import CoreImage.CIFilterBuiltins

struct StatusDashboardView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "photo.stack")
                        .font(.system(size: 50))
                        .foregroundStyle(.blue)
                    
                    Text("Photos Agent")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Home Base")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 20)
                
                Divider()
                
                // Server Status Card
                ServiceCard(
                    icon: "server.rack",
                    title: "Local Server",
                    status: appState.serverStatus,
                    detail: "Port \(appState.serverPort)",
                    errorMessage: appState.serverError,
                    onStart: {
                        Task {
                            await appState.serverManager.startServer()
                        }
                    },
                    onStop: {
                        appState.serverManager.stopServer()
                    }
                )
                
                // Tunnel Status Card
                ServiceCard(
                    icon: "network",
                    title: "Cloudflare Tunnel",
                    status: appState.tunnelStatus,
                    detail: appState.tunnelURL ?? "Not connected",
                    errorMessage: appState.tunnelError,
                    onStart: {
                        Task {
                            await appState.tunnelManager.startTunnel()
                        }
                    },
                    onStop: {
                        appState.tunnelManager.stopTunnel()
                    }
                )
                
                // Photo Scanning Card
                PhotoScanCard()
                
                // Model Analysis Card
                ModelAnalysisCard()
                
                // QR Code for iOS Pairing
                if let url = appState.tunnelURL, appState.tunnelStatus == .running {
                    VStack(spacing: 12) {
                        Text("Scan to Connect iOS App")
                            .font(.headline)
                        
                        QRCodeView(url: url)
                            .frame(width: 200, height: 200)
                            .background(Color.white)
                            .cornerRadius(12)
                            .shadow(radius: 4)
                        
                        Text(url)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                        
                        Button(action: {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(url, forType: .string)
                        }) {
                            Label("Copy URL", systemImage: "doc.on.doc")
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(12)
                }
                
                // Queue Status
                if appState.serverStatus == .running {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Queue Status")
                            .font(.headline)
                        
                        HStack(spacing: 20) {
                            QueueBadge(label: "Pending", count: appState.queuePending, color: .orange)
                            QueueBadge(label: "Running", count: appState.queueRunning, color: .blue)
                            QueueBadge(label: "Approvals", count: appState.queueWaitingApproval, color: .purple)
                        }
                    }
                    .padding()
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(12)
                }
            }
            .padding(32)
        }
        .frame(minWidth: 500, minHeight: 600)
    }
}

struct ServiceCard: View {
    let icon: String
    let title: String
    let status: ServiceStatus
    let detail: String
    let errorMessage: String?
    let onStart: () -> Void
    let onStop: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(.blue)
                
                Text(title)
                    .font(.headline)
                
                Spacer()
                
                StatusBadge(status: status)
            }
            
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.vertical, 4)
            }
            
            HStack(spacing: 12) {
                if status == .stopped || status == .error {
                    Button(action: onStart) {
                        Label("Start", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(status == .starting)
                }
                
                if status == .running || status == .starting {
                    Button(action: onStop) {
                        Label("Stop", systemImage: "stop.fill")
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
            }
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(status.color.opacity(0.3), lineWidth: 2)
        )
    }
}

struct StatusBadge: View {
    let status: ServiceStatus
    
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(status.color)
                .frame(width: 8, height: 8)
            
            Text(status.rawValue)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(status.color.opacity(0.15))
        .cornerRadius(12)
    }
}

struct QueueBadge: View {
    let label: String
    let count: Int
    let color: Color
    
    var body: some View {
        VStack(spacing: 4) {
            Text("\(count)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(color)
            
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct QRCodeView: View {
    let url: String
    
    var body: some View {
        if let qrImage = generateQRCode(from: url) {
            Image(nsImage: qrImage)
                .interpolation(.none)
                .resizable()
                .aspectRatio(contentMode: .fit)
        } else {
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .overlay(
                    Text("QR Code Error")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                )
        }
    }
    
    private func generateQRCode(from string: String) -> NSImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        
        guard let outputImage = filter.outputImage else { return nil }
        
        // Scale up the QR code
        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaledImage = outputImage.transformed(by: transform)
        
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else {
            return nil
        }
        
        return NSImage(cgImage: cgImage, size: NSSize(width: scaledImage.extent.width, height: scaledImage.extent.height))
    }
}

struct PhotoScanCard: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "photo.stack")
                    .font(.title2)
                    .foregroundStyle(.blue)
                
                Text("Photo Library")
                    .font(.headline)
                
                Spacer()
                
                StatusBadge(status: appState.photosScanStatus)
            }
            
            // Progress info
            if appState.photosTotalCount > 0 {
                HStack {
                    ProgressView(
                        value: Double(appState.photosScannedCount),
                        total: Double(appState.photosTotalCount)
                    )
                    
                    Text("\(appState.photosScannedCount) / \(appState.photosTotalCount)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Scan your photo library to analyze photos locally")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            
            if let error = appState.photosError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.vertical, 4)
            }
            
            HStack(spacing: 12) {
                if appState.photosScanStatus == .stopped || appState.photosScanStatus == .error {
                    Button(action: {
                        Task {
                            await appState.photosManager.startScanning()
                        }
                    }) {
                        Label("Start Scan", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        appState.photosScanStatus == .starting ||
                        appState.serverStatus != .running ||
                        !appState.photosAuthStatus.isAuthorized
                    )
                }
                
                if appState.photosScanStatus == .running || appState.photosScanStatus == .starting {
                    Button(action: {
                        appState.photosManager.stopScanning()
                    }) {
                        Label("Stop Scan", systemImage: "stop.fill")
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
                
                // Info text
                if appState.serverStatus != .running {
                    Text("Start server first")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(appState.photosScanStatus.color.opacity(0.3), lineWidth: 2)
        )
    }
}

struct ModelAnalysisCard: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "brain")
                    .font(.title2)
                    .foregroundStyle(.purple)
                
                Text("Model Analysis")
                    .font(.headline)
                
                Spacer()
                
                StatusBadge(status: appState.ollamaStatus)
            }
            
            // Model info
            if appState.ollamaStatus == .running {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Models Loaded:")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    
                    ForEach(appState.loadedModels.prefix(5), id: \.self) { model in
                        HStack {
                            Image(systemName: "cube.fill")
                                .font(.caption)
                                .foregroundStyle(.purple)
                            Text(model)
                                .font(.caption)
                                .fontDesign(.monospaced)
                        }
                        .padding(.leading, 20)
                    }
                    
                    Text("Analysis happens automatically on the server after photo upload")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                }
            } else if appState.ollamaStatus == .error {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text(appState.ollamaError ?? "Ollama not available")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Check if Ollama is running and models are loaded")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            // Queue status (replaces analysis progress)
            if appState.serverStatus == .running {
                Divider()
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Server Queue Status")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    
                    HStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Upload")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text("\(appState.queuePending)")
                                .font(.caption)
                                .fontWeight(.semibold)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Analyzing")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text("\(appState.queueRunning)")
                                .font(.caption)
                                .fontWeight(.semibold)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Complete")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text("\(appState.photosScannedCount)")
                                .font(.caption)
                                .fontWeight(.semibold)
                        }
                    }
                }
            }
            
            Divider()
            
            HStack(spacing: 12) {
                // Check Status button
                Button(action: {
                    Task {
                        await appState.modelManager.checkOllamaStatus()
                    }
                }) {
                    Label("Check Status", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(appState.ollamaStatus == .starting)
                
                // Info text
                if appState.ollamaStatus != .running {
                    Text("Ollama required for server-side analysis")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            
            // Installation instructions
            if appState.ollamaStatus == .error {
                Divider()
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Installation:")
                        .font(.caption)
                        .fontWeight(.semibold)
                    
                    Text("brew install ollama")
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .textSelection(.enabled)
                    
                    Text("ollama pull qwen3-vl:8b")
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .textSelection(.enabled)
                    
                    Text("ollama pull nomic-embed-text")
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .textSelection(.enabled)
                }
                .padding(8)
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(appState.ollamaStatus.color.opacity(0.3), lineWidth: 2)
        )
        .onAppear {
            // Check Ollama status on appear
            Task {
                await appState.modelManager.checkOllamaStatus()
            }
        }
    }
}

#Preview {
    StatusDashboardView()
        .environmentObject(AppState())
}

