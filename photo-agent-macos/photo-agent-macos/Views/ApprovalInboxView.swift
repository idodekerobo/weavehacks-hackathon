//
//  ApprovalInboxView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 2/1/26.
//

import SwiftUI

struct ApprovalInboxView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var approvalManager: ApprovalManager
    @State private var selectedFilter: ApprovalFilter = .pending
    @State private var selectedApproval: Approval?
    
    init(appState: AppState) {
        _approvalManager = StateObject(wrappedValue: ApprovalManager(appState: appState))
    }
    
    var body: some View {
        HSplitView {
            // Master: List of approvals
            VStack(spacing: 0) {
                // Filter picker
                Picker("Filter", selection: $selectedFilter) {
                    Text("Pending").tag(ApprovalFilter.pending)
                    Text("Approved").tag(ApprovalFilter.approved)
                    Text("Rejected").tag(ApprovalFilter.rejected)
                    Text("All").tag(ApprovalFilter.all)
                }
                .pickerStyle(.segmented)
                .padding()
                
                Divider()
                
                // Approvals list
                if approvalManager.isLoading {
                    VStack {
                        ProgressView("Loading approvals...")
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = approvalManager.error {
                    ErrorView(message: error) {
                        Task {
                            await loadApprovals()
                        }
                    }
                } else if filteredApprovals.isEmpty {
                    EmptyStateView(filter: selectedFilter)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(filteredApprovals) { approval in
                                ApprovalListItem(
                                    approval: approval,
                                    isSelected: selectedApproval?.id == approval.id
                                )
                                .onTapGesture {
                                    selectedApproval = approval
                                }
                            }
                        }
                        .padding(8)
                    }
                }
            }
            .frame(minWidth: 300, idealWidth: 350)
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button(action: {
                        Task {
                            await loadApprovals()
                        }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Refresh approvals")
                }
            }
            
            // Detail: Selected approval
            if let approval = selectedApproval {
                ApprovalDetailPane(
                    approval: approval,
                    approvalManager: approvalManager
                )
                .frame(minWidth: 400)
            } else {
                // Empty selection state
                VStack(spacing: 16) {
                    Image(systemName: "tray")
                        .font(.system(size: 60))
                        .foregroundStyle(.gray.opacity(0.5))
                    
                    Text("Select an approval")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .textBackgroundColor))
            }
        }
        .task {
            await loadApprovals()
        }
        .onChange(of: selectedFilter) { oldValue, newValue in
            Task {
                await loadApprovals()
            }
        }
    }
    
    private var filteredApprovals: [Approval] {
        approvalManager.approvals
    }
    
    private func loadApprovals() async {
        let status: String? = selectedFilter == .all ? nil : selectedFilter.rawValue
        await approvalManager.fetchApprovals(status: status)
    }
}

// MARK: - List Item

struct ApprovalListItem: View {
    let approval: Approval
    let isSelected: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Image(systemName: iconForIntentType(approval.intentType))
                    .font(.title3)
                    .foregroundStyle(.blue)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(approval.intentType.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    
                    if let confidence = approval.confidence {
                        Text("\(Int(confidence * 100))% confident")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                
                Spacer()
                
                ApprovalStatusBadge(status: approval.status)
            }
            
            // Summary
            if let extractedData = approval.extractedDataDecoded {
                Text(extractedData.summary)
                    .font(.caption)
                    .lineLimit(2)
                    .foregroundStyle(.primary)
            }
            
            // Footer
            Text(timeAgo(from: approval.createdAt))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(isSelected ? Color.accentColor.opacity(0.1) : Color.gray.opacity(0.05))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
        )
    }
    
    private func iconForIntentType(_ type: String) -> String {
        switch type {
        case "event_flyer": return "calendar.badge.plus"
        case "receipt": return "receipt"
        case "screenshot": return "photo.on.rectangle"
        default: return "doc.text"
        }
    }
    
    private func timeAgo(from dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: dateString) else {
            return "Recently"
        }
        
        let now = Date()
        let components = Calendar.current.dateComponents([.minute, .hour, .day], from: date, to: now)
        
        if let days = components.day, days > 0 {
            return "\(days)d ago"
        } else if let hours = components.hour, hours > 0 {
            return "\(hours)h ago"
        } else if let minutes = components.minute, minutes > 0 {
            return "\(minutes)m ago"
        } else {
            return "Just now"
        }
    }
}

// MARK: - Detail Pane

struct ApprovalDetailPane: View {
    let approval: Approval
    let approvalManager: ApprovalManager
    
    @State private var isApproving = false
    @State private var isRejecting = false
    @State private var showError = false
    @State private var errorMessage = ""
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header card
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: iconForIntentType)
                            .font(.largeTitle)
                            .foregroundStyle(.blue)
                        
                        VStack(alignment: .leading, spacing: 4) {
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
                        
                        ApprovalStatusBadge(status: approval.status)
                    }
                }
                .padding()
                .background(Color.gray.opacity(0.05))
                .cornerRadius(12)
                
                // Summary section
                if let extractedData = approval.extractedDataDecoded {
                    DetailSectionCard(title: "What We Found", icon: "doc.text.fill") {
                        Text(extractedData.summary)
                            .font(.body)
                    }
                    
                    // OCR text if available
                    if let ocrText = extractedData.ocrText, !ocrText.isEmpty {
                        DetailSectionCard(title: "Text Found in Image", icon: "text.viewfinder") {
                            Text(ocrText)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    
                    // Reasoning if available
                    if let reasoning = extractedData.reasoning, !reasoning.isEmpty {
                        DetailSectionCard(title: "Why We Think This", icon: "brain") {
                            Text(reasoning)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                
                // Proposed action section
                if let proposedAction = approval.proposedActionDecoded {
                    DetailSectionCard(title: "Proposed Action", icon: "bolt.fill") {
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
                DetailSectionCard(title: "Details", icon: "info.circle.fill") {
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
                                    .scaleEffect(0.8)
                                    .frame(maxWidth: .infinity)
                            } else {
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                    Text("Approve")
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        .controlSize(.large)
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(isApproving || isRejecting)
                        
                        Button(action: {
                            Task {
                                await rejectAction()
                            }
                        }) {
                            if isRejecting {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .frame(maxWidth: .infinity)
                            } else {
                                HStack {
                                    Image(systemName: "xmark.circle.fill")
                                    Text("Reject")
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        .controlSize(.large)
                        .buttonStyle(.bordered)
                        .tint(.red)
                        .disabled(isApproving || isRejecting)
                    }
                }
            }
            .padding()
        }
        .background(Color(nsColor: .textBackgroundColor))
        .alert("Error", isPresented: $showError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
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

// MARK: - Supporting Views

struct ApprovalStatusBadge: View {
    let status: String
    
    var body: some View {
        Text(status.capitalized)
            .font(.caption)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(backgroundColor)
            .foregroundStyle(foregroundColor)
            .cornerRadius(6)
    }
    
    private var backgroundColor: Color {
        switch status {
        case "pending": return .orange.opacity(0.2)
        case "approved": return .green.opacity(0.2)
        case "rejected": return .red.opacity(0.2)
        default: return .gray.opacity(0.2)
        }
    }
    
    private var foregroundColor: Color {
        switch status {
        case "pending": return .orange
        case "approved": return .green
        case "rejected": return .red
        default: return .gray
        }
    }
}

struct DetailSectionCard<Content: View>: View {
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

struct EmptyStateView: View {
    let filter: ApprovalFilter
    
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: filter == .pending ? "checkmark.circle.fill" : "tray")
                .font(.system(size: 60))
                .foregroundStyle(filter == .pending ? .green : .gray.opacity(0.5))
            
            Text(emptyMessage)
                .font(.title2)
                .fontWeight(.semibold)
            
            Text(emptySubtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var emptyMessage: String {
        switch filter {
        case .pending: return "No Pending Approvals"
        case .approved: return "No Approved Actions"
        case .rejected: return "No Rejected Actions"
        case .all: return "No Approvals Yet"
        }
    }
    
    private var emptySubtitle: String {
        switch filter {
        case .pending: return "You're all caught up!"
        case .approved: return "Approved actions will appear here"
        case .rejected: return "Rejected actions will appear here"
        case .all: return "Approvals will appear as photos are analyzed"
        }
    }
}

struct ErrorView: View {
    let message: String
    let retry: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 60))
                .foregroundStyle(.red)
            
            Text("Error Loading Approvals")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            
            Button(action: retry) {
                Label("Retry", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

enum ApprovalFilter: String {
    case all = "all"
    case pending = "pending"
    case approved = "approved"
    case rejected = "rejected"
}

#Preview {
    ApprovalInboxView(appState: AppState())
        .environmentObject(AppState())
        .frame(width: 900, height: 600)
}
