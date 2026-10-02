// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "CheckStationMacApple",
  platforms: [
    .macOS(.v13),
  ],
  products: [
    .library(
      name: "CheckStationMacApple",
      type: .static,
      targets: ["CheckStationMacApple"]
    ),
  ],
  targets: [
    .target(
      name: "CheckStationMacApple",
      path: "Sources"
    ),
  ]
)
