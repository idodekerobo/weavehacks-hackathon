//
//  MainTabView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        TabView {
            // Inbox (Approvals)
            ApprovalsView(appState: appState)
                .tabItem {
                    Label("Inbox", systemImage: "tray.fill")
                }
                .badge(appState.pendingApprovalsCount > 0 ? appState.pendingApprovalsCount : 0)
            
            // Search
            SearchView()
                .tabItem {
                    Label("Search", systemImage: "magnifyingglass")
                }
            
            // Settings
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
    }
}

// MARK: - Placeholder Views

struct ApprovalsPlaceholderView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                if appState.pendingApprovalsCount > 0 {
                    Text("\(appState.pendingApprovalsCount) approvals pending")
                        .font(.headline)
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 60))
                        .foregroundStyle(.green)
                    
                    Text("No Approvals Pending")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("You're all caught up!")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                
                Text("Milestone Q: iOS Approvals UI")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 20)
                
                Text("Coming after Phase 2 Milestone H (Intent Pipeline) is complete")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .navigationTitle("Inbox")
        }
    }
}

struct SearchPlaceholderView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 60))
                    .foregroundStyle(.blue)
                
                Text("Search Your Photos")
                    .font(.title2)
                    .fontWeight(.semibold)
                
                Text("Natural language search coming soon")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                
                Text("Milestone Q: iOS Search UI")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 20)
            }
            .navigationTitle("Search")
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var isCalendarConnected = false
    @State private var connectedAt: String?
    @State private var isCheckingConnection = false
    @State private var showingError = false
    @State private var errorMessage = ""
    
    var body: some View {
        NavigationView {
            List {
                Section("Google Calendar") {
                    VStack(alignment: .leading, spacing: 8) {
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
                    .padding(.vertical, 4)
                }
                
                Section("Photo Upload") {
                    UploadStatusView()
                }
                
                Section("Connection") {
                    ConnectionStatusView()
                }
                
                Section("Device") {
                    LabeledContent("Device ID", value: appState.deviceId)
                        .font(.caption)
                }
                
                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    LabeledContent("Build", value: "Milestone M")
                }
            }
            .navigationTitle("Settings")
        }
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
        guard !isCheckingConnection,
              let baseURL = appState.tunnelURL,
              let url = URL(string: "\(baseURL)/api/oauth/google/status") else {
            return
        }
        
        isCheckingConnection = true
        
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
        guard let baseURL = appState.tunnelURL,
              let url = URL(string: "\(baseURL)/api/oauth/google/authorize") else {
            errorMessage = "Invalid server URL. Make sure tunnel is connected."
            showingError = true
            return
        }
        
        // Open OAuth flow in Safari
        UIApplication.shared.open(url)
        
        // Check connection after a delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            checkCalendarConnection()
        }
    }
    
    private func disconnectCalendar() {
        guard let baseURL = appState.tunnelURL,
              let url = URL(string: "\(baseURL)/api/oauth/google/disconnect") else {
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

#Preview {
    MainTabView()
        .environmentObject(AppState())
}
