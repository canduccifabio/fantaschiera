import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    print("[]")
    exit(0)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: url),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("[]")
    exit(1)
}

struct OCRItem: Codable {
    let text: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

var items: [OCRItem] = []

let request = VNRecognizeTextRequest { req, _ in
    guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
    for obs in observations {
        if let candidate = obs.topCandidates(1).first {
            let box = obs.boundingBox
            items.append(OCRItem(
                text: candidate.string,
                x: box.origin.x,
                y: box.origin.y,
                w: box.size.width,
                h: box.size.height
            ))
        }
    }
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["it-IT", "en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])

let encoder = JSONEncoder()
if let jsonData = try? encoder.encode(items), let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("[]")
}
