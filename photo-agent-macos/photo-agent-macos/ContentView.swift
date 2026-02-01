//
//  ContentView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        Group {
            // Show permission request if not authorized
            if !appState.photosAuthStatus.isAuthorized {
                PermissionRequestView()
            } else {
                // Show main dashboard if authorized
                StatusDashboardView()
            }
        }
        .onAppear {
            // Check authorization status on appear
            appState.photosManager.checkAuthorizationStatus()
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
