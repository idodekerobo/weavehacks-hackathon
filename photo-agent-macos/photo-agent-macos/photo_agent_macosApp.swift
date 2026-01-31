//
//  photo_agent_macosApp.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

@main
struct photo_agent_macosApp: App {
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onDisappear {
                    // TODO: confirm that this is needed
                    appState.serverManager.stopServer()
                    appState.tunnelManager.stopTunnel()
                }
        }
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About Photos Agent") {
                    // TODO: Show about window
                }
            }
        }
    }
}
