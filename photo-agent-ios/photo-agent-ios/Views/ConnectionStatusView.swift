//
//  ConnectionStatusView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct ConnectionStatusView: View {
    @EnvironmentObject var appState: AppState
    @State private var showUnpairConfirmation = false
    
    var body: some View {
        VStack(spacing: 20) {
            // Status indicator
            HStack(spacing: 12) {
                Circle()
                    .fill(appState.connectionStatus.color)
                    .frame(width: 12, height: 12)
                
                Text(appState.connectionStatus.rawValue)
                    .font(.subheadline)
                    .foregroundStyle(appState.connectionStatus.color)
                
                Spacer()
                
                Button(action: {
                    Task {
                        await appState.connectionManager.testConnection()
                    }
                }) {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline)
                }
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(10)
            
            // Connection details
            if let tunnelURL = appState.tunnelURL {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Connected to:")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    
                    Text(tunnelURL)
                        .font(.caption)
                        .foregroundStyle(.blue)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)
            }
            
            // Error message
            if let error = appState.connectionError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding()
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(10)
            }
            
            // Unpair button
            Button(role: .destructive, action: {
                showUnpairConfirmation = true
            }) {
                Text("Unpair Device")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.red.opacity(0.1))
                    .foregroundStyle(.red)
                    .cornerRadius(10)
            }
            .confirmationDialog(
                "Unpair Device?",
                isPresented: $showUnpairConfirmation,
                titleVisibility: .visible
            ) {
                Button("Unpair", role: .destructive) {
                    appState.unpair()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll need to scan the QR code again to reconnect.")
            }
        }
        .padding()
    }
}

#Preview {
    ConnectionStatusView()
        .environmentObject(AppState())
}
