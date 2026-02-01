//
//  QRScannerViewRepresentable.swift
//  photo-agent-ios
//
//  Created by Idode Kerobo on 1/31/26.
//

import SwiftUI
import AVFoundation

/// QR Scanner implementation using AVFoundation
class QRScanner: NSObject, ObservableObject, AVCaptureMetadataOutputObjectsDelegate {
    @Published var error: String?
    var captureSession: AVCaptureSession?
    var onScan: ((String) -> Void)?
    
    func setupScanner() {
        captureSession = AVCaptureSession()
        
        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video) else {
            error = "Camera not available"
            return
        }
        
        let videoInput: AVCaptureDeviceInput
        
        do {
            videoInput = try AVCaptureDeviceInput(device: videoCaptureDevice)
        } catch {
            self.error = "Camera access denied"
            return
        }
        
        if captureSession?.canAddInput(videoInput) == true {
            captureSession?.addInput(videoInput)
        } else {
            error = "Could not add camera input"
            return
        }
        
        let metadataOutput = AVCaptureMetadataOutput()
        
        if captureSession?.canAddOutput(metadataOutput) == true {
            captureSession?.addOutput(metadataOutput)
            
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]
        } else {
            error = "Could not add metadata output"
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession?.startRunning()
        }
    }
    
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        
        if let metadataObject = metadataObjects.first {
            guard let readableObject = metadataObject as? AVMetadataMachineReadableCodeObject else { return }
            guard let stringValue = readableObject.stringValue else { return }
            
            // Stop scanning after first successful scan
            captureSession?.stopRunning()
            
            // Trigger callback with scanned URL
            onScan?(stringValue)
        }
    }
    
    func stopScanning() {
        captureSession?.stopRunning()
    }
}

struct QRScannerViewRepresentable: UIViewControllerRepresentable {
    @ObservedObject var scanner: QRScanner
    let onScan: (String) -> Void
    
    func makeUIViewController(context: Context) -> UIViewController {
        let viewController = UIViewController()
        scanner.onScan = onScan
        scanner.setupScanner()
        
        if let captureSession = scanner.captureSession {
            let previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
            previewLayer.frame = UIScreen.main.bounds
            previewLayer.videoGravity = .resizeAspectFill
            viewController.view.layer.addSublayer(previewLayer)
        }
        
        return viewController
    }
    
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        // No updates needed
    }
    
    static func dismantleUIViewController(_ uiViewController: UIViewController, coordinator: ()) {
        // Cleanup handled by QRScanner.stopScanning()
    }
}
