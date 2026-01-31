//
//  ContentView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "photo.stack")
                .imageScale(.large)
                .font(.system(size: 60))
                .foregroundStyle(.blue)
            
            Text("Photos Agent")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            Text("Home Base (macOS)")
                .font(.title2)
                .foregroundStyle(.secondary)
            
            Divider()
                .padding(.vertical)
            
            VStack(alignment: .leading, spacing: 12) {
                StatusRow(icon: "circle.fill", text: "Agent: Ready", color: .green)
                StatusRow(icon: "circle.fill", text: "Tunnel: Offline", color: .gray)
                StatusRow(icon: "circle.fill", text: "Queue: 0 pending", color: .blue)
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(10)
        }
        .padding(40)
        .frame(minWidth: 400, minHeight: 400)
    }
}

struct StatusRow: View {
    let icon: String
    let text: String
    let color: Color
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(text)
                .font(.body)
        }
    }
}

#Preview {
    ContentView()
}
