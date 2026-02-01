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
    
    var body: some View {
        NavigationView {
            List {
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
                    LabeledContent("Build", value: "Milestone P+Q")
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState())
}
