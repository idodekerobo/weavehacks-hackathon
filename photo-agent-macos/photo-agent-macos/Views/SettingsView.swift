//
//  SettingsView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 2/1/26.
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var isCalendarConnected = false
    @State private var connectedAt: String?
    @State private var isCheckingConnection = false
    @State private var showingError = false
    @State private var errorMessage = ""
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text("Settings")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Configure your Photos Agent")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 20)
                
                Divider()
                
                // Google Calendar Integration
                SettingsSection(title: "Google Calendar", icon: "calendar") {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Calendar Integration")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                
                                if isCalendarConnected {
                                    HStack(spacing: 4) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(.green)
                                            .font(.caption)
                                        Text("Connected")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        if let connectedAt = connectedAt {
                                            Text("• \(formatDate(connectedAt))")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                } else {
                                    HStack(spacing: 4) {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundStyle(.red)
                                            .font(.caption)
                                        Text("Not connected")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            
                            Spacer()
                            
                            if isCalendarConnected {
                                Button("Disconnect") {
                                    disconnectCalendar()
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            } else {
                                Button("Connect") {
                                    connectCalendar()
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                            }
                        }
                        
                        Text("Automatically add approved events to your Google Calendar")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                
                // Device Info
                SettingsSection(title: "Device", icon: "desktopcomputer") {
                    VStack(alignment: .leading, spacing: 8) {
                        SettingRow(label: "Device ID", value: appState.deviceId)
                        SettingRow(label: "Server Port", value: "\(appState.serverPort)")
                    }
                }
                
                // Photo Library
                SettingsSection(title: "Photo Library", icon: "photo.stack") {
                    VStack(alignment: .leading, spacing: 8) {
                        SettingRow(label: "Authorization", value: appState.photosAuthStatus.rawValue)
                        SettingRow(label: "Photos Scanned", value: "\(appState.photosScannedCount)")
                    }
                }
                
                // Connection
                SettingsSection(title: "Connection", icon: "network") {
                    VStack(alignment: .leading, spacing: 8) {
                        if let tunnelURL = appState.tunnelURL {
                            SettingRow(label: "Tunnel URL", value: tunnelURL)
                        } else {
                            Text("No tunnel active")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                
                Spacer(minLength: 40)
            }
            .padding(32)
        }
        .frame(minWidth: 500, minHeight: 400)
        .onAppear {
            checkCalendarConnection()
        }
        .alert("Error", isPresented: $showingError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
    }
    
    private func checkCalendarConnection() {
        guard !isCheckingConnection else { return }
        isCheckingConnection = true
        
        let baseURL = appState.tunnelURL ?? "http://localhost:\(appState.serverPort)"
        guard let url = URL(string: "\(baseURL)/api/oauth/google/status") else {
            isCheckingConnection = false
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                isCheckingConnection = false
                
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let connected = json["connected"] as? Bool else {
                    return
                }
                
                isCalendarConnected = connected
                connectedAt = json["connectedAt"] as? String
            }
        }.resume()
    }
    
    private func connectCalendar() {
        let baseURL = appState.tunnelURL ?? "http://localhost:\(appState.serverPort)"
        guard let url = URL(string: "\(baseURL)/api/oauth/google/authorize") else {
            errorMessage = "Invalid server URL"
            showingError = true
            return
        }
        
        // Open OAuth flow in system browser
        NSWorkspace.shared.open(url)
        
        // Check connection after a delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            checkCalendarConnection()
        }
    }
    
    private func disconnectCalendar() {
        let baseURL = appState.tunnelURL ?? "http://localhost:\(appState.serverPort)"
        guard let url = URL(string: "\(baseURL)/api/oauth/google/disconnect") else {
            errorMessage = "Invalid server URL"
            showingError = true
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if error != nil {
                    errorMessage = "Failed to disconnect calendar"
                    showingError = true
                    return
                }
                
                isCalendarConnected = false
                connectedAt = nil
            }
        }.resume()
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: dateString) else {
            return dateString
        }
        
        let displayFormatter = DateFormatter()
        displayFormatter.dateStyle = .medium
        displayFormatter.timeStyle = .short
        return displayFormatter.string(from: date)
    }
}

struct SettingsSection<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(.blue)
                Text(title)
                    .font(.headline)
            }
            
            content
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.05))
                .cornerRadius(8)
        }
    }
}

struct SettingRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
                .textSelection(.enabled)
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(AppState())
}
