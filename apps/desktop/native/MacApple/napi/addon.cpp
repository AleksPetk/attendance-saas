/**
 * Thin N-API wrapper around libCheckStationMacApple.dylib (Swift SIWA + StoreKit 2).
 * Runs inside Electron main; Apple identity is the host MAS app.
 */
#include <node_api.h>
#include <dlfcn.h>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string>

using InvokeFn = void (*)(const char* requestJson, void* context, void (*callback)(void*, const char*));
using PingFn = int32_t (*)();

static void* g_handle = nullptr;
static InvokeFn g_invoke = nullptr;
static PingFn g_ping = nullptr;
static std::mutex g_load_mutex;

struct InvokeState {
  napi_env env;
  napi_deferred deferred;
  napi_threadsafe_function tsfn;
  bool settled;
};

static void TsfnFinalize(napi_env, void*, void*) {}

struct TsPayload {
  InvokeState* state;
  char* json;
};

static void TsfnDeliver(napi_env env, napi_value /*js_cb*/, void* /*context*/, void* data) {
  auto* payload = static_cast<TsPayload*>(data);
  if (!payload) return;
  InvokeState* state = payload->state;
  char* json = payload->json;
  delete payload;

  if (!state || state->settled) {
    free(json);
    return;
  }
  state->settled = true;

  napi_value result;
  napi_create_string_utf8(env, json ? json : "", NAPI_AUTO_LENGTH, &result);
  free(json);

  napi_resolve_deferred(state->env, state->deferred, result);

  if (state->tsfn) {
    napi_release_threadsafe_function(state->tsfn, napi_tsfn_release);
    state->tsfn = nullptr;
  }
  delete state;
}

static void ResponseCallback(void* context, const char* responseJson) {
  auto* state = static_cast<InvokeState*>(context);
  if (!state || !state->tsfn) return;

  auto* payload = new TsPayload();
  payload->state = state;
  payload->json = strdup(responseJson ? responseJson : "");

  napi_status st = napi_call_threadsafe_function(state->tsfn, payload, napi_tsfn_blocking);
  if (st != napi_ok) {
    free(payload->json);
    delete payload;
  }
}

static bool EnsureLoaded(const std::string& dylibPath, std::string* errorOut) {
  std::lock_guard<std::mutex> lock(g_load_mutex);
  if (g_invoke && g_ping) return true;
  if (dylibPath.empty()) {
    if (errorOut) *errorOut = "Missing libCheckStationMacApple.dylib path.";
    return false;
  }
  dlerror();
  void* handle = dlopen(dylibPath.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!handle) {
    const char* err = dlerror();
    if (errorOut) *errorOut = std::string("dlopen failed: ") + (err ? err : "unknown");
    return false;
  }
  auto invoke = reinterpret_cast<InvokeFn>(dlsym(handle, "cs_mac_apple_invoke"));
  auto ping = reinterpret_cast<PingFn>(dlsym(handle, "cs_mac_apple_ping"));
  if (!invoke || !ping) {
    dlclose(handle);
    if (errorOut) *errorOut = "Missing cs_mac_apple_invoke / cs_mac_apple_ping exports.";
    return false;
  }
  g_handle = handle;
  g_invoke = invoke;
  g_ping = ping;
  return true;
}

static napi_value Load(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "load(dylibPath) requires a string.");
    return nullptr;
  }
  size_t len = 0;
  napi_get_value_string_utf8(env, args[0], nullptr, 0, &len);
  std::string path(len, '\0');
  napi_get_value_string_utf8(env, args[0], path.data(), len + 1, &len);

  std::string err;
  if (!EnsureLoaded(path, &err)) {
    napi_throw_error(env, nullptr, err.c_str());
    return nullptr;
  }
  napi_value out;
  napi_get_boolean(env, true, &out);
  return out;
}

static napi_value Ping(napi_env env, napi_callback_info) {
  if (!g_ping) {
    napi_throw_error(env, nullptr, "Native Apple module not loaded.");
    return nullptr;
  }
  napi_value out;
  napi_create_int32(env, g_ping(), &out);
  return out;
}

static napi_value Invoke(napi_env env, napi_callback_info info) {
  if (!g_invoke) {
    napi_throw_error(env, nullptr, "Native Apple module not loaded. Call load(dylibPath) first.");
    return nullptr;
  }

  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "invoke(requestJson) requires a string.");
    return nullptr;
  }

  size_t len = 0;
  napi_get_value_string_utf8(env, args[0], nullptr, 0, &len);
  std::string request(len, '\0');
  napi_get_value_string_utf8(env, args[0], request.data(), len + 1, &len);

  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);

  auto* state = new InvokeState();
  state->env = env;
  state->deferred = deferred;
  state->tsfn = nullptr;
  state->settled = false;

  napi_value resource_name;
  napi_create_string_utf8(env, "cs_mac_apple_invoke", NAPI_AUTO_LENGTH, &resource_name);
  napi_status st = napi_create_threadsafe_function(
      env,
      nullptr,
      nullptr,
      resource_name,
      0,
      1,
      nullptr,
      TsfnFinalize,
      nullptr,
      TsfnDeliver,
      &state->tsfn);
  if (st != napi_ok) {
    napi_value err;
    napi_create_string_utf8(env, "Could not create threadsafe function.", NAPI_AUTO_LENGTH, &err);
    napi_reject_deferred(env, deferred, err);
    delete state;
    return promise;
  }

  g_invoke(request.c_str(), state, ResponseCallback);
  return promise;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
      {"load", nullptr, Load, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"ping", nullptr, Ping, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"invoke", nullptr, Invoke, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 3, props);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
