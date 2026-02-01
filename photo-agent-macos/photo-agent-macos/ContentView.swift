//
//  ContentView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: NavigationTab = .dashboard
    
    var body: some View {
        Group {
            // Show permission request if not authorized
            if !appState.photosAuthStatus.isAuthorized {
                PermissionRequestView()
            } else {
                // Show main app with sidebar navigation
                NavigationSplitView {
                    // Sidebar
                    List(NavigationTab.allCases, id: \.self, selection: $selectedTab) { tab in
                        Label(tab.title, systemImage: tab.icon)
                            .badge(tab == .approvals && appState.pendingApprovalsCount > 0 ? appState.pendingApprovalsCount : 0)
                    }
                    .navigationTitle("Photos Agent")
                    .frame(minWidth: 200)
                } detail: {
                    // Detail view
                    switch selectedTab {
                    case .dashboard:
                        StatusDashboardView()
                    case .approvals:
                        ApprovalInboxView(appState: appState)
                    case .settings:
                        SettingsView()
                    }
                }
                .navigationSplitViewStyle(.balanced)
            }
        }
        .onAppear {
            // Check authorization status on appear
            appState.photosManager.checkAuthorizationStatus()
        }
    }
}

enum NavigationTab: String, CaseIterable {
    case dashboard
    case approvals
    case settings
    
    var title: String {
        switch self {
        case .dashboard: return "Dashboard"
        case .approvals: return "Approvals"
        case .settings: return "Settings"
        }
    }
    
    var icon: String {
        switch self {
        case .dashboard: return "square.grid.2x2"
        case .approvals: return "tray.2"
        case .settings: return "gear"
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
