//
//  ContentView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var appState = AppState()
    
    var body: some View {
        Group {
            if appState.isPaired {
                MainTabView()
                    .environmentObject(appState)
            } else {
                PairingView()
                    .environmentObject(appState)
            }
        }
        .task {
            // Test connection on app launch if paired
            if appState.isPaired {
                let connected = await appState.connectionManager.testConnection()
                if connected {
                    appState.connectionManager.startPolling()
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
