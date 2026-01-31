//
//  ContentView.swift
//  photo-agent-macos
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        StatusDashboardView()
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
