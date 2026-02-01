//
//  PairingView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI
import AVFoundation

struct PairingView: View {
    @EnvironmentObject var appState: AppState
    @State private var showQRScanner = false
    @State private var manualURL = ""
    @State private var showManualEntry = false
    @State private var isConnecting = false
    @State private var errorMessage: String?
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                // Header
                VStack(spacing: 12) {
                    Image(systemName: "link.circle.fill")
                        .font(.system(size: 80))
                        .foregroundStyle(.blue)
                    
                    Text("Pair with Mac")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    Text("Connect to your Mac to start analyzing photos")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)
                
                Spacer()
                
                // Instructions
                VStack(alignment: .leading, spacing: 16) {
                    InstructionRow(number: "1", text: "Open Photos Agent on your Mac")
                    InstructionRow(number: "2", text: "Make sure the tunnel is online")
                    InstructionRow(number: "3", text: "Scan the QR code shown on your Mac")
                }
                .padding(.horizontal)
                
                Spacer()
                
                // Error message
                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                
                // Action buttons
                VStack(spacing: 12) {
                    Button(action: {
                        showQRScanner = true
                    }) {
                        HStack {
                            Image(systemName: "qrcode.viewfinder")
                            Text("Scan QR Code")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundStyle(.white)
                        .cornerRadius(10)
                    }
                    .disabled(isConnecting)
                    
                    Button(action: {
                        showManualEntry.toggle()
                    }) {
                        Text("Enter URL Manually")
                            .foregroundStyle(.blue)
                    }
                    .disabled(isConnecting)
                }
                .padding(.horizontal)
                
                // Manual URL entry
                if showManualEntry {
                    VStack(spacing: 12) {
                        TextField("https://tunnel-url.trycloudflare.com", text: $manualURL)
                            .textFieldStyle(.roundedBorder)
                            .autocapitalization(.none)
                            .keyboardType(.URL)
                        
                        Button(action: {
                            Task {
                                await connectWithURL(manualURL)
                            }
                        }) {
                            if isConnecting {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text("Connect")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .padding()
                        .background(manualURL.isEmpty ? Color.gray : Color.blue)
                        .foregroundStyle(.white)
                        .cornerRadius(10)
                        .disabled(manualURL.isEmpty || isConnecting)
                    }
                    .padding(.horizontal)
                }
                
                Spacer()
            }
            .navigationTitle("Pairing")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showQRScanner) {
                QRScannerView { scannedURL in
                    showQRScanner = false
                    Task {
                        await connectWithURL(scannedURL)
                    }
                }
            }
        }
    }
    
    private func connectWithURL(_ url: String) async {
        isConnecting = true
        errorMessage = nil
        
        do {
            try await appState.connectionManager.pair(tunnelURL: url)
            // Success - appState.isPaired will trigger navigation change
            appState.connectionManager.startPolling()
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isConnecting = false
    }
}

struct InstructionRow: View {
    let number: String
    let text: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(number)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(Color.blue)
                .clipShape(Circle())
            
            Text(text)
                .font(.body)
                .foregroundStyle(.primary)
            
            Spacer()
        }
    }
}

struct QRScannerView: View {
    let onScan: (String) -> Void
    @Environment(\.dismiss) var dismiss
    @StateObject private var scanner = QRScanner()
    
    var body: some View {
        NavigationView {
            ZStack {
                QRScannerViewRepresentable(scanner: scanner, onScan: onScan)
                    .edgesIgnoringSafeArea(.all)
                
                VStack {
                    Spacer()
                    
                    if let error = scanner.error {
                        Text(error)
                            .foregroundStyle(.white)
                            .padding()
                            .background(Color.black.opacity(0.7))
                            .cornerRadius(10)
                            .padding()
                    }
                }
            }
            .navigationTitle("Scan QR Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    PairingView()
        .environmentObject(AppState())
}
