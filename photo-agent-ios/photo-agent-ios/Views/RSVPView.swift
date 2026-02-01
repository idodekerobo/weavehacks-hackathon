//
//  RSVPView.swift
//  photo-agent-ios
//
//  RSVP automation view - select event flyers and trigger RSVP
//

import SwiftUI
import Photos

// MARK: - Models

struct RSVPAsset: Identifiable, Codable {
    let id: String
    let photoLibraryId: String
    let filename: String?
    let summary: String?
    let eventName: String
    let eventUrl: String?
    let eventDate: String?
    let eventLocation: String?
    let creationDate: String?
    let approvalId: String?
    let rsvpStatus: String?
    let confirmationNumber: String?
    let canRSVP: Bool
}

struct RSVPAssetsResponse: Codable {
    let success: Bool
    let assets: [RSVPAsset]
    let total: Int
}

struct RSVPStartResponse: Codable {
    let success: Bool
    let message: String?
    let jobId: String?
    let approvalId: String?
    let eventUrl: String?
    let eventName: String?
    let error: String?
}

struct RSVPStatusResponse: Codable {
    let success: Bool
    let approval: RSVPApprovalStatus?
}

struct RSVPApprovalStatus: Codable {
    let id: String
    let assetId: String
    let status: String
    let rsvpStatus: String?
    let sessionId: String?
    let recordingUrl: String?
    let confirmationNumber: String?
    let error: String?
    let updatedAt: String?
}

// MARK: - RSVP View

struct RSVPView: View {
    @EnvironmentObject var appState: AppState
    
    @State private var assets: [RSVPAsset] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedAsset: RSVPAsset?
    @State private var showingRSVPSheet = false
    @State private var thumbnails: [String: UIImage] = [:]
    
    var body: some View {
        NavigationView {
            Group {
                if isLoading && assets.isEmpty {
                    ProgressView("Loading event flyers...")
                } else if let error = errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 50))
                            .foregroundStyle(.orange)
                        
                        Text("Error")
                            .font(.headline)
                        
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        
                        Button("Retry") {
                            loadAssets()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else if assets.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "calendar.badge.plus")
                            .font(.system(size: 50))
                            .foregroundStyle(.blue)
                        
                        Text("No Event Flyers")
                            .font(.headline)
                        
                        Text("Upload photos of event flyers to get started. The system will automatically detect events and find RSVP links.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                } else {
                    ScrollView {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 16) {
                            ForEach(assets) { asset in
                                EventFlierCard(
                                    asset: asset,
                                    thumbnail: thumbnails[asset.photoLibraryId],
                                    onTap: {
                                        selectedAsset = asset
                                        showingRSVPSheet = true
                                    }
                                )
                            }
                        }
                        .padding()
                    }
                    .refreshable {
                        await loadAssetsAsync()
                    }
                }
            }
            .navigationTitle("RSVP")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        loadAssets()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(isLoading)
                }
            }
        }
        .onAppear {
            loadAssets()
        }
        .sheet(isPresented: $showingRSVPSheet) {
            if let asset = selectedAsset {
                RSVPDetailSheet(
                    asset: asset,
                    thumbnail: thumbnails[asset.photoLibraryId],
                    onDismiss: {
                        showingRSVPSheet = false
                        // Reload after RSVP to show updated status
                        loadAssets()
                    }
                )
                .environmentObject(appState)
            }
        }
    }
    
    private func loadAssets() {
        Task {
            await loadAssetsAsync()
        }
    }
    
    private func loadAssetsAsync() async {
        guard let baseURL = appState.tunnelURL,
              let url = URL(string: "\(baseURL)/api/rsvp/assets") else {
            errorMessage = "Not connected to server"
            return
        }
        
        isLoading = true
        errorMessage = nil
        
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw NSError(domain: "", code: 0, userInfo: [NSLocalizedDescriptionKey: "Server error"])
            }
            
            let decoded = try JSONDecoder().decode(RSVPAssetsResponse.self, from: data)
            assets = decoded.assets
            
            // Load thumbnails for each asset
            for asset in assets {
                await loadThumbnail(for: asset)
            }
            
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    private func loadThumbnail(for asset: RSVPAsset) async {
        // Try to load from Photos library
        let fetchOptions = PHFetchOptions()
        fetchOptions.predicate = NSPredicate(format: "localIdentifier == %@", asset.photoLibraryId)
        
        let results = PHAsset.fetchAssets(with: fetchOptions)
        guard let phAsset = results.firstObject else { return }
        
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        
        await withCheckedContinuation { continuation in
            PHImageManager.default().requestImage(
                for: phAsset,
                targetSize: CGSize(width: 200, height: 200),
                contentMode: .aspectFill,
                options: options
            ) { image, _ in
                if let image = image {
                    Task { @MainActor in
                        thumbnails[asset.photoLibraryId] = image
                    }
                }
                continuation.resume()
            }
        }
    }
}

// MARK: - Event Flier Card

struct EventFlierCard: View {
    let asset: RSVPAsset
    let thumbnail: UIImage?
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                // Thumbnail
                ZStack {
                    if let thumbnail = thumbnail {
                        Image(uiImage: thumbnail)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(height: 120)
                            .clipped()
                    } else {
                        Rectangle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(height: 120)
                            .overlay {
                                Image(systemName: "photo")
                                    .foregroundStyle(.gray)
                            }
                    }
                    
                    // Status badge
                    VStack {
                        HStack {
                            Spacer()
                            statusBadge
                                .padding(6)
                        }
                        Spacer()
                    }
                }
                
                // Event info
                VStack(alignment: .leading, spacing: 4) {
                    Text(asset.eventName)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .lineLimit(2)
                        .foregroundStyle(.primary)
                    
                    if let date = asset.eventDate {
                        HStack(spacing: 4) {
                            Image(systemName: "calendar")
                                .font(.caption2)
                            Text(date)
                                .font(.caption)
                        }
                        .foregroundStyle(.secondary)
                    }
                    
                    if let location = asset.eventLocation {
                        HStack(spacing: 4) {
                            Image(systemName: "mappin")
                                .font(.caption2)
                            Text(location)
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
        }
        .buttonStyle(.plain)
    }
    
    @ViewBuilder
    private var statusBadge: some View {
        let (text, color, icon) = statusInfo
        
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(text)
                .font(.caption2)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.9))
        .foregroundStyle(.white)
        .cornerRadius(8)
    }
    
    private var statusInfo: (String, Color, String) {
        switch asset.rsvpStatus {
        case "completed":
            return ("RSVP'd", .green, "checkmark.circle.fill")
        case "in_progress":
            return ("In Progress", .orange, "hourglass")
        case "failed":
            return ("Failed", .red, "xmark.circle.fill")
        case "payment_required":
            return ("Paid Event", .purple, "dollarsign.circle.fill")
        default:
            if asset.canRSVP {
                return ("Ready", .blue, "arrow.right.circle.fill")
            } else {
                return ("No URL", .gray, "questionmark.circle.fill")
            }
        }
    }
}

// MARK: - RSVP Detail Sheet

struct RSVPDetailSheet: View {
    @EnvironmentObject var appState: AppState
    let asset: RSVPAsset
    let thumbnail: UIImage?
    let onDismiss: () -> Void
    
    @State private var isStartingRSVP = false
    @State private var rsvpStarted = false
    @State private var approvalId: String?
    @State private var rsvpStatus: RSVPApprovalStatus?
    @State private var errorMessage: String?
    @State private var pollTimer: Timer?
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Thumbnail
                    if let thumbnail = thumbnail {
                        Image(uiImage: thumbnail)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxHeight: 250)
                            .cornerRadius(12)
                    }
                    
                    // Event Details
                    VStack(alignment: .leading, spacing: 12) {
                        Text(asset.eventName)
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        if let date = asset.eventDate {
                            Label(date, systemImage: "calendar")
                                .font(.subheadline)
                        }
                        
                        if let location = asset.eventLocation {
                            Label(location, systemImage: "mappin.and.ellipse")
                                .font(.subheadline)
                        }
                        
                        if let url = asset.eventUrl {
                            Label(url, systemImage: "link")
                                .font(.caption)
                                .foregroundStyle(.blue)
                                .lineLimit(2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(12)
                    
                    // RSVP Status / Action
                    if rsvpStarted {
                        RSVPProgressView(status: rsvpStatus)
                    } else if let error = errorMessage {
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.largeTitle)
                                .foregroundStyle(.red)
                            
                            Text("Error")
                                .font(.headline)
                            
                            Text(error)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                            
                            Button("Try Again") {
                                errorMessage = nil
                            }
                            .buttonStyle(.bordered)
                        }
                        .padding()
                    } else {
                        // Show existing status or start button
                        if asset.rsvpStatus == "completed" {
                            VStack(spacing: 12) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 50))
                                    .foregroundStyle(.green)
                                
                                Text("RSVP Complete!")
                                    .font(.headline)
                                
                                if let confirmation = asset.confirmationNumber {
                                    Text("Confirmation: \(confirmation)")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding()
                        } else if asset.rsvpStatus == "in_progress" {
                            VStack(spacing: 12) {
                                ProgressView()
                                    .scaleEffect(1.5)
                                
                                Text("RSVP in progress...")
                                    .font(.headline)
                            }
                            .padding()
                            .onAppear {
                                // Start polling for status
                                if let approvalId = asset.approvalId {
                                    self.approvalId = approvalId
                                    rsvpStarted = true
                                    startPolling()
                                }
                            }
                        } else if !asset.canRSVP {
                            VStack(spacing: 12) {
                                Image(systemName: "questionmark.circle")
                                    .font(.system(size: 50))
                                    .foregroundStyle(.gray)
                                
                                Text("No Event URL")
                                    .font(.headline)
                                
                                Text("This event flyer doesn't have a detected URL. Try running web search first.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                            }
                            .padding()
                        } else {
                            VStack(spacing: 16) {
                                Text("Ready to RSVP")
                                    .font(.headline)
                                
                                Text("The agent will automatically fill out the registration form using your profile information.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                                
                                Button {
                                    startRSVP()
                                } label: {
                                    HStack {
                                        Image(systemName: "paperplane.fill")
                                        Text("Start RSVP Automation")
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.large)
                                .disabled(isStartingRSVP)
                            }
                            .padding()
                        }
                    }
                    
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Event Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        stopPolling()
                        onDismiss()
                    }
                }
            }
        }
        .onDisappear {
            stopPolling()
        }
    }
    
    private func startRSVP() {
        guard let baseURL = appState.tunnelURL,
              let url = URL(string: "\(baseURL)/api/rsvp/start") else {
            errorMessage = "Not connected to server"
            return
        }
        
        isStartingRSVP = true
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "assetId": asset.id,
            "deviceId": appState.deviceId
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                isStartingRSVP = false
                
                if let error = error {
                    errorMessage = error.localizedDescription
                    return
                }
                
                guard let data = data else {
                    errorMessage = "No response from server"
                    return
                }
                
                do {
                    let decoded = try JSONDecoder().decode(RSVPStartResponse.self, from: data)
                    
                    if decoded.success {
                        approvalId = decoded.approvalId
                        rsvpStarted = true
                        startPolling()
                    } else {
                        errorMessage = decoded.error ?? "Failed to start RSVP"
                    }
                } catch {
                    // Try to parse error response
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let errorMsg = json["error"] as? String {
                        errorMessage = errorMsg
                    } else {
                        errorMessage = "Failed to parse response"
                    }
                }
            }
        }.resume()
    }
    
    private func startPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
            pollStatus()
        }
        // Also poll immediately
        pollStatus()
    }
    
    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }
    
    private func pollStatus() {
        guard let approvalId = approvalId,
              let baseURL = appState.tunnelURL,
              let url = URL(string: "\(baseURL)/api/rsvp/status/\(approvalId)") else {
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            guard let data = data,
                  let decoded = try? JSONDecoder().decode(RSVPStatusResponse.self, from: data),
                  let status = decoded.approval else {
                return
            }
            
            DispatchQueue.main.async {
                rsvpStatus = status
                
                // Stop polling if completed or failed
                if let rsvpStatusString = status.rsvpStatus,
                   ["completed", "failed", "payment_required"].contains(rsvpStatusString) {
                    stopPolling()
                }
            }
        }.resume()
    }
}

// MARK: - RSVP Progress View

struct RSVPProgressView: View {
    let status: RSVPApprovalStatus?
    
    var body: some View {
        VStack(spacing: 16) {
            if let status = status {
                switch status.rsvpStatus {
                case "in_progress":
                    ProgressView()
                        .scaleEffect(1.5)
                    
                    Text("RSVP in progress...")
                        .font(.headline)
                    
                    Text("The agent is filling out the registration form")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    
                case "completed":
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 50))
                        .foregroundStyle(.green)
                    
                    Text("RSVP Complete!")
                        .font(.headline)
                    
                    if let confirmation = status.confirmationNumber {
                        Text("Confirmation: \(confirmation)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    
                    if let recordingUrl = status.recordingUrl {
                        Link(destination: URL(string: recordingUrl)!) {
                            Label("View Recording", systemImage: "play.rectangle")
                        }
                        .font(.subheadline)
                    }
                    
                case "failed":
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 50))
                        .foregroundStyle(.red)
                    
                    Text("RSVP Failed")
                        .font(.headline)
                    
                    if let error = status.error {
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    
                    if let recordingUrl = status.recordingUrl {
                        Link(destination: URL(string: recordingUrl)!) {
                            Label("View Recording", systemImage: "play.rectangle")
                        }
                        .font(.subheadline)
                    }
                    
                case "payment_required":
                    Image(systemName: "dollarsign.circle.fill")
                        .font(.system(size: 50))
                        .foregroundStyle(.purple)
                    
                    Text("Payment Required")
                        .font(.headline)
                    
                    Text("This event requires payment. Please complete registration manually.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    
                default:
                    ProgressView()
                    Text("Processing...")
                        .font(.subheadline)
                }
            } else {
                ProgressView()
                    .scaleEffect(1.5)
                
                Text("Starting RSVP...")
                    .font(.headline)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

#Preview {
    RSVPView()
        .environmentObject(AppState())
}
