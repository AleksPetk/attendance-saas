// macOS packaging artwork: keep the original mark untouched, add a white tile.
import AppKit

let directory = URL(fileURLWithPath: CommandLine.arguments[1])
guard let mark = NSImage(contentsOf: directory.appendingPathComponent("icon.png")) else { fatalError("Missing canonical icon.png") }
let size = NSSize(width: 1024, height: 1024)
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor.white.setFill()
NSBezierPath(roundedRect: NSRect(x: 16, y: 16, width: 992, height: 992), xRadius: 210, yRadius: 210).fill()
mark.draw(in: NSRect(origin: .zero, size: size), from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: directory.appendingPathComponent("app-icon.png"))
