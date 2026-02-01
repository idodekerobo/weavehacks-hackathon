//
//  UploadStatusView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 2/1/26.
//

import SwiftUI

struct UploadStatusView: View {
    @EnvironmentObject var appState: AppState
    @State private var isStarting = false
    @State private var errorMessage: String?
    
    var body: some View {
        VStack(spacing: 16) {
            // Status header
            HStack {
                Image(systemName: appState.isMonitoringPhotos ? "photo.badge.checkmark.fill" : "photo.badge.plus")
                    .font(.title2)
                    .foregroundStyle(appState.isMonitoringPhotos ? .green : .gray)
                
                VStack(alignment: .leading) {
                    Text(appState.isMonitoringPhotos ? "Monitoring Photos" : "Photo Upload")
                        .font(.headline)
                    Text(appState.isMonitoringPhotos ? "New photos will auto-upload" : "Not monitoring")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                Spacer()
                
                if appState.isMonitoringPhotos {
                    Circle()
                        .fill(.green)
                        .frame(width: 8, height: 8)
                }
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(10)
            
            // Stats
            if appState.isMonitoringPhotos {
                HStack(spacing: 20) {
                    StatCard(
                        icon: "checkmark.circle.fill",
                        label: "Uploaded",
                        value: "\(appState.photosUploadedCount)",
                        color: .green
                    )
                    
                    StatCard(
                        icon: "clock.fill",
                        label: "Pending",
                        value: "\(appState.photosPendingCount)",
                        color: .orange
                    )
                    
                    StatCard(
                        icon: "xmark.circle.fill",
                        label: "Failed",
                        value: "\(appState.photosFailedCount)",
                        color: .red
                    )
                }
            }
            
            // Error message
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding()
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(10)
            }
            
            // Action button
            if !appState.isMonitoringPhotos {
                Button(action: {
                    Task {
                        await startMonitoring()
                    }
                }) {
                    if isStarting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        HStack {
                            Image(systemName: "play.fill")
                            Text("Start Monitoring")
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding()
                .background(Color.blue)
                .foregroundStyle(.white)
                .cornerRadius(10)
                .disabled(isStarting)
            } else {
                Button(role: .destructive, action: {
                    appState.photosMonitor.stopMonitoring()
                    appState.isMonitoringPhotos = false
                }) {
                    HStack {
                        Image(systemName: "stop.fill")
                        Text("Stop Monitoring")
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding()
                .background(Color.red.opacity(0.1))
                .foregroundStyle(.red)
                .cornerRadius(10)
            }
            
            // Info text
            Text("Photos taken after pairing will automatically upload and analyze.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .onChange(of: appState.photosMonitor.uploadedCount) { oldValue, newValue in
            appState.photosUploadedCount = newValue
        }
        .onChange(of: appState.photosMonitor.pendingCount) { oldValue, newValue in
            appState.photosPendingCount = newValue
        }
        .onChange(of: appState.photosMonitor.failedCount) { oldValue, newValue in
            appState.photosFailedCount = newValue
        }
        .onChange(of: appState.photosMonitor.isMonitoring) { oldValue, newValue in
            appState.isMonitoringPhotos = newValue
        }
    }
    
    private func startMonitoring() async {
        isStarting = true
        errorMessage = nil
        
        do {
            try await appState.photosMonitor.startMonitoring()
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isStarting = false
    }
}

struct StatCard: View {
    let icon: String
    let label: String
    let value: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
            
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(10)
    }
}

#Preview {
    UploadStatusView()
        .environmentObject(AppState())
}
