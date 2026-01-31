//
//  ContentView.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                Image(systemName: "photo.on.rectangle.angled")
                    .imageScale(.large)
                    .font(.system(size: 60))
                    .foregroundStyle(.blue)
                
                Text("Photos Agent")
                    .font(.title)
                    .fontWeight(.bold)
                
                Text("Companion (iOS)")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                
                Spacer()
                
                VStack(spacing: 16) {
                    FeatureCard(icon: "tray.fill", title: "Inbox", subtitle: "0 approvals pending")
                    FeatureCard(icon: "magnifyingglass", title: "Search", subtitle: "Find your intent")
                    FeatureCard(icon: "clock.fill", title: "Timeline", subtitle: "Recent actions")
                }
                .padding(.horizontal)
                
                Spacer()
                
                Text("Connect to your Mac to get started")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle("Photos Agent")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct FeatureCard: View {
    let icon: String
    let title: String
    let subtitle: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.blue)
                .frame(width: 40)
            
            VStack(alignment: .leading) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .foregroundStyle(.gray)
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(10)
    }
}

#Preview {
    ContentView()
}
