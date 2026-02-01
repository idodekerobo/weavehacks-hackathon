import Foundation

@MainActor
class ModelManager {
    private let appState: AppState
    private let ollamaBaseURL = "http://localhost:11434"
    
    // Models to use (for checking status only)
    private let visionModel = "qwen3-vl:8b"
    private let embeddingModel = "nomic-embed-text"
    
    init(appState: AppState) {
        self.appState = appState
    }
    
    // MARK: - Public API
    
    /// Check if Ollama is running and which models are available
    func checkOllamaStatus() async {
        appState.ollamaStatus = .starting
        appState.ollamaError = nil
        
        do {
            let models = try await fetchAvailableModels()
            appState.loadedModels = models
            
            // Check if required models are available
            let hasVisionModel = models.contains(visionModel)
            let hasEmbeddingModel = models.contains(embeddingModel)
            
            if hasVisionModel && hasEmbeddingModel {
                appState.ollamaStatus = .running
                print("✅ Ollama is running with required models")
            } else {
                appState.ollamaStatus = .error
                var missingModels: [String] = []
                if !hasVisionModel { missingModels.append(visionModel) }
                if !hasEmbeddingModel { missingModels.append(embeddingModel) }
                appState.ollamaError = "Missing models: \(missingModels.joined(separator: ", "))"
                print("❌ Missing required models: \(missingModels.joined(separator: ", "))")
            }
        } catch {
            appState.ollamaStatus = .error
            appState.ollamaError = "Ollama not running. Please start Ollama service."
            print("❌ Failed to connect to Ollama: \(error)")
        }
    }
    
    // MARK: - Private Methods
    
    /// Fetch available models from Ollama
    private func fetchAvailableModels() async throws -> [String] {
        let url = URL(string: "\(ollamaBaseURL)/api/tags")!
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw OllamaError.serverError
        }
        
        struct ModelsResponse: Codable {
            struct Model: Codable {
                let name: String
            }
            let models: [Model]
        }
        
        let modelsResponse = try JSONDecoder().decode(ModelsResponse.self, from: data)
        return modelsResponse.models.map { $0.name }
    }
}

// MARK: - Error Types

enum OllamaError: LocalizedError {
    case serverError
    
    var errorDescription: String? {
        switch self {
        case .serverError:
            return "Failed to connect to Ollama server"
        }
    }
}
