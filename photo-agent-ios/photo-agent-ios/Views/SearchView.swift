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
                                await performSearch()
                            }
                        }
                    
                    if !searchText.isEmpty {
                        Button(action: {
                            searchText = ""
                            results = []
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
                
                // Loading state
                if isSearching {
                    ProgressView("Searching...")
                        .frame(maxHeight: .infinity)
                }
                
                // Error state
                else if let error = errorMessage {
                    ErrorStateView(message: error) {
                        Task {
                            await performSearch()
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
    
    private func performSearch() async {
        guard !searchText.isEmpty else { return }
        guard let tunnelURL = appState.tunnelURL,
              let url = URL(string: tunnelURL)?
                .appendingPathComponent("api/search") else {
            errorMessage = "Invalid server URL"
            return
        }
        
        isSearching = true
        errorMessage = nil
        
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
            let (data, response) = try await URLSession.shared.data(from: searchURL)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                errorMessage = "Invalid server response"
                isSearching = false
                return
            }
            
            if httpResponse.statusCode == 404 {
                // Search endpoint not implemented yet
                errorMessage = "Search is coming soon!"
                isSearching = false
                return
            }
            
            guard (200...299).contains(httpResponse.statusCode) else {
                errorMessage = "Server error"
                isSearching = false
                return
            }
            
            let searchResponse = try JSONDecoder().decode(SearchResponse.self, from: data)
            results = searchResponse.results
            
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isSearching = false
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

#Preview {
    SearchView()
        .environmentObject(AppState())
}
