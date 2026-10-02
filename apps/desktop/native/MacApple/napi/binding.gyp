{
  "targets": [
    {
      "target_name": "mac_apple_native",
      "sources": ["addon.cpp"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "13.0",
        "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"],
        "OTHER_LDFLAGS": ["-ldl"]
      }
    }
  ]
}
