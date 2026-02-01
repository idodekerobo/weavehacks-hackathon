//
//  ApprovalsView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 2/1/26.
//

import SwiftUI

struct ApprovalsView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var approvalManager: ApprovalManager
    @State private var selectedFilter: ApprovalFilter = .pending
    @State private var selectedApproval: Approval?
    @State private var showDetailSheet = false
    
    init(appState: AppState) {
        _approvalManager = StateObject(wrappedValue: ApprovalManager(appState: appState))
    }
    
    var body: some View {
        NavigationView {
            VStack {
                // Filter picker
                Picker("Filter", selection: $selectedFilter) {
                    Text("Pending").tag(ApprovalFilter.pending)
                    Text("Approved").tag(ApprovalFilter.approved)
                    Text("Rejected").tag(ApprovalFilter.rejected)
                    Text("All").tag(ApprovalFilter.all)
                }
                .pickerStyle(.segmented)
                .padding()
                
                // Approvals list
                if approvalManager.isLoading {
                    ProgressView("Loading approvals...")
                        .frame(maxHeight: .infinity)
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
                        LazyVStack(spacing: 12) {
                            ForEach(filteredApprovals) { approval in
                                ApprovalCard(approval: approval)
                                    .onTapGesture {
                                        selectedApproval = approval
                                        showDetailSheet = true
                                    }
                            }
                        }
                        .padding()
                    }
                    .refreshable {
                        await loadApprovals()
                    }
                }
            }
            .navigationTitle("Approvals")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        Task {
                            await loadApprovals()
                        }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .sheet(item: $selectedApproval) { approval in
                ApprovalDetailView(
                    approval: approval,
                    approvalManager: approvalManager,
                    onDismiss: {
                        selectedApproval = nil
                    }
                )
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
    }
    
    private var filteredApprovals: [Approval] {
        approvalManager.approvals
    }
    
    private func loadApprovals() async {
        let status: String? = selectedFilter == .all ? nil : selectedFilter.rawValue
        await approvalManager.fetchApprovals(status: status)
    }
}

struct ApprovalCard: View {
    let approval: Approval
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: iconForIntentType(approval.intentType))
                    .font(.title2)
                    .foregroundStyle(.blue)
                
                VStack(alignment: .leading) {
                    Text(approval.intentType.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.headline)
                    
                    if let confidence = approval.confidence {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption2)
                            Text("\(Int(confidence * 100))% confident")
                                .font(.caption)
                        }
                        .foregroundStyle(.secondary)
                    }
                }
                
                Spacer()
                
                StatusBadge(status: approval.status)
            }
            
            // Summary
            if let extractedData = approval.extractedDataDecoded {
                Text(extractedData.summary)
                    .font(.body)
                    .lineLimit(3)
                    .foregroundStyle(.primary)
            }
            
            // Proposed action
            if let proposedAction = approval.proposedActionDecoded {
                HStack {
                    Image(systemName: "bolt.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                    
                    Text(proposedAction.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            
            // Footer
            HStack {
                Text(timeAgo(from: approval.createdAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.gray)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .cornerRadius(12)
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

struct StatusBadge: View {
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

struct EmptyStateView: View {
    let filter: ApprovalFilter
    
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: filter == .pending ? "checkmark.circle.fill" : "tray")
                .font(.system(size: 60))
                .foregroundStyle(filter == .pending ? .green : .gray)
            
            Text(emptyMessage)
                .font(.title2)
                .fontWeight(.semibold)
            
            Text(emptySubtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxHeight: .infinity)
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
                    .padding()
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .cornerRadius(10)
            }
        }
        .padding()
        .frame(maxHeight: .infinity)
    }
}

enum ApprovalFilter: String {
    case all = "all"
    case pending = "pending"
    case approved = "approved"
    case rejected = "rejected"
}

#Preview {
    ApprovalsView(appState: AppState())
        .environmentObject(AppState())
}
