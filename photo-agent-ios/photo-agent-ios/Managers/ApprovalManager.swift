//
//  ApprovalManager.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 2/1/26.
//

import Combine
import Foundation

/// Manages approvals - fetching, updating, and handling user actions
@MainActor
class ApprovalManager: ObservableObject {
    private let appState: AppState
    @Published var approvals: [Approval] = []
    @Published var isLoading: Bool = false
    @Published var error: String?
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    /// Fetch approvals from server
    func fetchApprovals(status: String? = nil) async {
        guard let tunnelURL = appState.tunnelURL,
              let baseURL = URL(string: tunnelURL) else {
            error = "Invalid server URL"
            return
        }
        
        isLoading = true
        error = nil
        
        var components = URLComponents(url: baseURL.appendingPathComponent("api/approvals"), resolvingAgainstBaseURL: true)
        var queryItems = [URLQueryItem(name: "deviceId", value: appState.deviceId)]
        
        if let status = status {
            queryItems.append(URLQueryItem(name: "status", value: status))
        }
        
        components?.queryItems = queryItems
        
        guard let url = components?.url else {
            error = "Failed to construct URL"
            isLoading = false
            return
        }
        
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                error = "Server error"
                isLoading = false
                return
            }
            
            let result = try JSONDecoder().decode(ApprovalsResponse.self, from: data)
            self.approvals = result.approvals
            
        } catch {
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
    
    /// Approve an approval
    func approve(approvalId: String, editedData: [String: Any]? = nil) async throws {
        try await updateApprovalStatus(approvalId: approvalId, status: "approved", editedData: editedData)
    }
    
    /// Reject an approval
    func reject(approvalId: String) async throws {
        try await updateApprovalStatus(approvalId: approvalId, status: "rejected")
    }
    
    /// Update approval status
    private func updateApprovalStatus(approvalId: String, status: String, editedData: [String: Any]? = nil) async throws {
        guard let tunnelURL = appState.tunnelURL,
              let url = URL(string: tunnelURL)?
                .appendingPathComponent("api/approvals")
                .appendingPathComponent(approvalId) else {
            throw ApprovalError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        var payload: [String: Any] = ["status": status]
        if let editedData = editedData {
            payload["editedData"] = editedData
        }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw ApprovalError.updateFailed
        }
        
        let result = try JSONDecoder().decode(UpdateResponse.self, from: data)
        
        if !result.success {
            throw ApprovalError.updateFailed
        }
        
        // Refresh approvals list
        await fetchApprovals()
    }
}

// MARK: - Models

struct Approval: Codable, Identifiable {
    let id: String
    let assetId: String
    let deviceId: String?
    let intentType: String
    let extractedData: String?
    let proposedAction: String?
    let confidence: Double?
    let status: String
    let editedData: String?
    let approvedAt: String?
    let rejectedAt: String?
    let createdAt: String
    let updatedAt: String
    
    // Joined fields from assets table
    let filename: String?
    let creationDate: String?
    let ocrText: String?
    let summary: String?
    
    // Computed properties
    var extractedDataDecoded: ExtractedData? {
        guard let extractedData = extractedData,
              let data = extractedData.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(ExtractedData.self, from: data)
    }
    
    var proposedActionDecoded: ProposedAction? {
        guard let proposedAction = proposedAction,
              let data = proposedAction.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(ProposedAction.self, from: data)
    }
}

struct ExtractedData: Codable {
    let summary: String
    let ocrText: String?
    let reasoning: String?
}

struct ProposedAction: Codable {
    let action: String
    let description: String
}

struct ApprovalsResponse: Codable {
    let success: Bool
    let approvals: [Approval]
    let total: Int
    let limit: Int
    let offset: Int
}

struct UpdateResponse: Codable {
    let success: Bool
    let message: String
}

enum ApprovalError: LocalizedError {
    case invalidURL
    case updateFailed
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .updateFailed:
            return "Failed to update approval"
        }
    }
}
