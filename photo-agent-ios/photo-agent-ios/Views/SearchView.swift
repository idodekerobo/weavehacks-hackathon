//
//  SearchView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 2/1/26.
//

import SwiftUI

struct SearchView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var results: [SearchResult] = []
    @State private var isSearching = false
    @State private var errorMessage: String?
    @State private var searchStatus: String = ""
    @State private var toolCalls: [String] = []
    
    var body: some View {
        NavigationView {
            VStack {
                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.gray)
                    
                    TextField("Search your photos...", text: $searchText)
                        .textFieldStyle(.plain)
                        .onSubmit {
                            Task {
                                await performStreamingSearch()
                            }
                        }
                    
                    if !searchText.isEmpty {
                        Button(action: {
                            searchText = ""
                            results = []
                            searchStatus = ""
                            toolCalls = []
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.gray)
                        }
                    }
                }
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)
                .padding()
                
                // Search suggestions
                if searchText.isEmpty && results.isEmpty {
                    SearchSuggestionsView()
                }
                
                // Loading state with streaming status
                if isSearching {
                    VStack(spacing: 12) {
                        ProgressView()
                        
                        if !searchStatus.isEmpty {
                            Text(searchStatus)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        
                        if !toolCalls.isEmpty {
                            HStack(spacing: 4) {
                                ForEach(toolCalls, id: \.self) { tool in
                                    Text(tool)
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.blue.opacity(0.1))
                                        .foregroundStyle(.blue)
                                        .cornerRadius(4)
                                }
                            }
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
                
                // Error state
                else if let error = errorMessage {
                    ErrorStateView(message: error) {
                        Task {
                            await performStreamingSearch()
                        }
                    }
                }
                
                // Results
                else if !results.isEmpty {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(results) { result in
                                SearchResultCard(result: result)
                            }
                        }
                        .padding()
                    }
                }
                
                // Empty results
                else if !searchText.isEmpty && !isSearching {
                    EmptySearchResults()
                }
                
                Spacer()
            }
            .navigationTitle("Search")
        }
    }
    
    /// Performs search using Server-Sent Events (SSE) streaming endpoint
    private func performStreamingSearch() async {
        guard !searchText.isEmpty else { return }
        guard let tunnelURL = appState.tunnelURL,
              let url = URL(string: tunnelURL)?
                .appendingPathComponent("api/search/stream") else {
            errorMessage = "Invalid server URL"
            return
        }
        
        isSearching = true
        errorMessage = nil
        searchStatus = "Starting search..."
        toolCalls = []
        results = []
        
        var components = URLComponents(url: url, resolvingAgainstBaseURL: true)
        components?.queryItems = [
            URLQueryItem(name: "q", value: searchText),
            URLQueryItem(name: "deviceId", value: appState.deviceId)
        ]
        
        guard let searchURL = components?.url else {
            errorMessage = "Failed to construct search URL"
            isSearching = false
            return
        }
        
        do {
            var request = URLRequest(url: searchURL)
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                errorMessage = "Invalid server response"
                isSearching = false
                return
            }
            
            if httpResponse.statusCode == 404 {
                errorMessage = "Search is coming soon!"
                isSearching = false
                return
            }
            
            guard (200...299).contains(httpResponse.statusCode) else {
                errorMessage = "Server error"
                isSearching = false
                return
            }
            
            // Process SSE stream
            for try await line in bytes.lines {
                // SSE format: "data: {...json...}"
                guard line.hasPrefix("data: ") else { continue }
                
                let jsonString = String(line.dropFirst(6))
                guard let data = jsonString.data(using: .utf8) else { continue }
                
                do {
                    let event = try JSONDecoder().decode(StreamEvent.self, from: data)
                    await processStreamEvent(event)
                    
                    // Exit loop on terminal events
                    if event.type == "complete" || event.type == "error" {
                        break
                    }
                } catch {
                    print("Failed to decode stream event: \(error)")
                }
            }
            
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isSearching = false
        searchStatus = ""
    }
    
    @MainActor
    private func processStreamEvent(_ event: StreamEvent) {
        switch event.type {
        case "status":
            searchStatus = event.message ?? "Processing..."
            
        case "tool-call":
            if let toolName = event.toolName {
                toolCalls.append(toolName)
                searchStatus = "Using \(toolName)..."
            }
            
        case "partial-results":
            if let total = event.total {
                searchStatus = "Found \(total) results so far..."
            }
            
        case "text-delta":
            // Agent is thinking - could show this in UI if desired
            break
            
        case "complete":
            if let eventResults = event.results {
                results = eventResults
            }
            searchStatus = ""
            toolCalls = []
            
        case "error":
            errorMessage = event.error ?? "Search failed"
            searchStatus = ""
            toolCalls = []
            
        default:
            break
        }
    }
}

struct SearchResultCard: View {
    let result: SearchResult
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "doc.text")
                    .font(.title2)
                    .foregroundStyle(.blue)
                
                VStack(alignment: .leading) {
                    if let intentType = result.intentType {
                        Text(intentType.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.headline)
                    } else {
                        Text("Photo")
                            .font(.headline)
                    }
                    
                    if let date = result.creationDate {
                        Text(formatDate(date))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                
                Spacer()
                
                if let confidence = result.confidence {
                    Text("\(Int(confidence * 100))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            
            if let summary = result.summary {
                Text(summary)
                    .font(.body)
                    .lineLimit(3)
            }
            
            if let ocrText = result.ocrText, !ocrText.isEmpty {
                Text(ocrText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(12)
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: dateString) else {
            return dateString
        }
        
        let displayFormatter = DateFormatter()
        displayFormatter.dateStyle = .medium
        return displayFormatter.string(from: date)
    }
}

struct SearchSuggestionsView: View {
    let suggestions = [
        "events I screenshotted",
        "concert flyer",
        "photos from this week",
        "receipts",
        "things I meant to buy"
    ]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Try searching for:")
                .font(.headline)
                .padding(.horizontal)
            
            ForEach(suggestions, id: \.self) { suggestion in
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.gray)
                    Text(suggestion)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding()
                .background(Color.gray.opacity(0.05))
                .cornerRadius(10)
                .padding(.horizontal)
            }
            
            Spacer()
        }
        .padding(.top, 20)
    }
}

struct EmptySearchResults: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 60))
                .foregroundStyle(.gray)
            
            Text("No Results Found")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Try a different search term")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxHeight: .infinity)
    }
}

struct ErrorStateView: View {
    let message: String
    let retry: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 60))
                .foregroundStyle(.red)
            
            Text("Search Error")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            
            if message != "Search is coming soon!" {
                Button(action: retry) {
                    Label("Retry", systemImage: "arrow.clockwise")
                        .padding()
                        .background(Color.blue)
                        .foregroundStyle(.white)
                        .cornerRadius(10)
                }
            }
        }
        .padding()
        .frame(maxHeight: .infinity)
    }
}

// MARK: - Models

struct SearchResult: Codable, Identifiable {
    let id: String
    let photoLibraryId: String?  // iOS Photos library local identifier for fetching images
    let intentType: String?
    let summary: String?
    let ocrText: String?
    let confidence: Double?
    let creationDate: String?
    let filename: String?
}

struct SearchResponse: Codable {
    let success: Bool
    let results: [SearchResult]
    let total: Int
}

/// Server-Sent Events stream event from search agent
struct StreamEvent: Codable {
    let type: String
    let message: String?
    let toolName: String?
    let args: AnyCodable?
    let count: Int?
    let total: Int?
    let text: String?
    let results: [SearchResult]?
    let toolCalls: [String]?
    let reasoning: String?
    let executionTime: Int?
    let error: String?
    let timestamp: Int?
}

/// Helper for decoding arbitrary JSON values
struct AnyCodable: Codable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}

#Preview {
    SearchView()
        .environmentObject(AppState())
}
