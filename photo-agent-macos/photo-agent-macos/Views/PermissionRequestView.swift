//
//  PermissionRequestView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct PermissionRequestView: View {
    @EnvironmentObject var appState: AppState
    @State private var isRequestingPermission = false
    
    var body: some View {
        VStack(spacing: 30) {
            // Icon
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 80))
                .foregroundColor(.blue)
            
            // Title
            Text("Photos Access Required")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            // Description
            VStack(alignment: .leading, spacing: 16) {
                Text("This app needs access to your Photos library to:")
                    .font(.headline)
                
                PermissionReasonRow(
                    icon: "magnifyingglass",
                    text: "Analyze photos locally on your Mac"
                )
                
                PermissionReasonRow(
                    icon: "cpu",
                    text: "Extract text and intent using local AI models"
                )
                
                PermissionReasonRow(
                    icon: "lock.shield",
                    text: "Keep your data private - nothing is uploaded"
                )
                
                PermissionReasonRow(
                    icon: "calendar.badge.plus",
                    text: "Automate tasks like adding events to your calendar"
                )
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(12)
            
            // Privacy promise
            Text("Your photos are analyzed locally and never leave your Mac. Web actions require your approval.")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            // Status message
            if appState.photosAuthStatus == .denied {
                VStack(spacing: 12) {
                    Text("Photos access was denied")
                        .font(.headline)
                        .foregroundColor(.red)
                    
                    Text("Please grant access in System Settings → Privacy & Security → Photos")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                    
                    Button("Open System Settings") {
                        openSystemSettings()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
                .background(Color.red.opacity(0.1))
                .cornerRadius(12)
            }
            
            // Request button
            if appState.photosAuthStatus == .notDetermined || appState.photosAuthStatus == .denied {
                Button(action: requestPermission) {
                    HStack {
                        if isRequestingPermission {
                            ProgressView()
                                .scaleEffect(0.8)
                        }
                        Text(isRequestingPermission ? "Requesting..." : "Grant Access")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isRequestingPermission)
            }
        }
        .padding(40)
        .frame(maxWidth: 600)
    }
    
    private func requestPermission() {
        isRequestingPermission = true
        
        Task {
            await appState.photosManager.requestAuthorization()
            isRequestingPermission = false
        }
    }
    
    private func openSystemSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Photos") {
            NSWorkspace.shared.open(url)
        }
    }
}

struct PermissionReasonRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.blue)
                .frame(width: 24)
            
            Text(text)
                .font(.body)
        }
    }
}

#Preview {
    PermissionRequestView()
        .environmentObject(AppState())
}
