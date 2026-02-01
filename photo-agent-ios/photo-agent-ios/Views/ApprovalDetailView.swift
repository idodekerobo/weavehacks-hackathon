//
//  ApprovalDetailView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 2/1/26.
//

import SwiftUI

struct ApprovalDetailView: View {
    let approval: Approval
    let approvalManager: ApprovalManager
    let onDismiss: () -> Void
    
    @State private var isApproving = false
    @State private var isRejecting = false
    @State private var showError = false
    @State private var errorMessage = ""
    
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header card
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Image(systemName: iconForIntentType)
                                .font(.title)
                                .foregroundStyle(.blue)
                            
                            VStack(alignment: .leading) {
                                Text(approval.intentType.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(.title2)
                                    .fontWeight(.bold)
                                
                                if let confidence = approval.confidence {
                                    HStack(spacing: 4) {
                                        Image(systemName: "checkmark.seal.fill")
                                            .font(.caption)
                                        Text("\(Int(confidence * 100))% confident")
                                            .font(.caption)
                                    }
                                    .foregroundStyle(.secondary)
                                }
                            }
                            
                            Spacer()
                            
                            StatusBadge(status: approval.status)
                        }
                    }
                    .padding()
                    .background(Color.gray.opacity(0.05))
                    .cornerRadius(12)
                    
                    // Summary section
                    if let extractedData = approval.extractedDataDecoded {
                        SectionCard(title: "What We Found", icon: "doc.text.fill") {
                            Text(extractedData.summary)
                                .font(.body)
                        }
                        
                        // OCR text if available
                        if let ocrText = extractedData.ocrText, !ocrText.isEmpty {
                            SectionCard(title: "Text Found in Image", icon: "text.viewfinder") {
                                Text(ocrText)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        
                        // Reasoning if available
                        if let reasoning = extractedData.reasoning, !reasoning.isEmpty {
                            SectionCard(title: "Why We Think This", icon: "brain") {
                                Text(reasoning)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    
                    // Proposed action section
                    if let proposedAction = approval.proposedActionDecoded {
                        SectionCard(title: "Proposed Action", icon: "bolt.fill") {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(proposedAction.description)
                                    .font(.body)
                                    .fontWeight(.semibold)
                                
                                Text("Action: \(proposedAction.action)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    
                    // Metadata section
                    SectionCard(title: "Details", icon: "info.circle.fill") {
                        VStack(alignment: .leading, spacing: 8) {
                            DetailRow(label: "Created", value: formatDate(approval.createdAt))
                            
                            if approval.status == "approved", let approvedAt = approval.approvedAt {
                                DetailRow(label: "Approved", value: formatDate(approvedAt))
                            }
                            
                            if approval.status == "rejected", let rejectedAt = approval.rejectedAt {
                                DetailRow(label: "Rejected", value: formatDate(rejectedAt))
                            }
                            
                            if let filename = approval.filename {
                                DetailRow(label: "File", value: filename)
                            }
                        }
                    }
                    
                    // Action buttons (only for pending)
                    if approval.status == "pending" {
                        VStack(spacing: 12) {
                            Button(action: {
                                Task {
                                    await approveAction()
                                }
                            }) {
                                if isApproving {
                                    ProgressView()
                                        .frame(maxWidth: .infinity)
                                } else {
                                    HStack {
                                        Image(systemName: "checkmark.circle.fill")
                                        Text("Approve")
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                            }
                            .padding()
                            .background(Color.green)
                            .foregroundStyle(.white)
                            .cornerRadius(12)
                            .disabled(isApproving || isRejecting)
                            
                            Button(role: .destructive, action: {
                                Task {
                                    await rejectAction()
                                }
                            }) {
                                if isRejecting {
                                    ProgressView()
                                        .frame(maxWidth: .infinity)
                                } else {
                                    HStack {
                                        Image(systemName: "xmark.circle.fill")
                                        Text("Reject")
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                            }
                            .padding()
                            .background(Color.red.opacity(0.1))
                            .foregroundStyle(.red)
                            .cornerRadius(12)
                            .disabled(isApproving || isRejecting)
                        }
                        .padding(.top, 8)
                    }
                    
                    Spacer(minLength: 40)
                }
                .padding()
            }
            .navigationTitle("Approval Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                        onDismiss()
                    }
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK") { }
            } message: {
                Text(errorMessage)
            }
        }
    }
    
    private var iconForIntentType: String {
        switch approval.intentType {
        case "event_flyer": return "calendar.badge.plus"
        case "receipt": return "receipt"
        case "screenshot": return "photo.on.rectangle"
        default: return "doc.text"
        }
    }
    
    private func approveAction() async {
        isApproving = true
        
        do {
            try await approvalManager.approve(approvalId: approval.id)
            dismiss()
            onDismiss()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
        
        isApproving = false
    }
    
    private func rejectAction() async {
        isRejecting = true
        
        do {
            try await approvalManager.reject(approvalId: approval.id)
            dismiss()
            onDismiss()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
        
        isRejecting = false
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: dateString) else {
            return dateString
        }
        
        let displayFormatter = DateFormatter()
        displayFormatter.dateStyle = .medium
        displayFormatter.timeStyle = .short
        return displayFormatter.string(from: date)
    }
}

struct SectionCard<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(.blue)
                Text(title)
                    .font(.headline)
            }
            
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(12)
    }
}

struct DetailRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
        }
    }
}
