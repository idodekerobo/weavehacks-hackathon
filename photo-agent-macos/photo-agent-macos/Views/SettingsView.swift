//
//  SettingsView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 2/1/26.
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    
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
