// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}

// node_modules/@tauri-apps/api/core.js
var _Channel_onmessage;
var _Channel_nextMessageIndex;
var _Channel_pendingMessages;
var _Channel_messageEndIndex;
var _Resource_rid;
var SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
var Channel = class {
  constructor(onmessage) {
    _Channel_onmessage.set(this, void 0);
    _Channel_nextMessageIndex.set(this, 0);
    _Channel_pendingMessages.set(this, []);
    _Channel_messageEndIndex.set(this, void 0);
    __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
    }), "f");
    this.id = transformCallback((rawMessage) => {
      const index = rawMessage.index;
      if ("end" in rawMessage) {
        if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
          this.cleanupCallback();
        } else {
          __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
        }
        return;
      }
      const message = rawMessage.message;
      if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
        __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
        __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
        while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
          const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
          delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
        }
        if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
          this.cleanupCallback();
        }
      } else {
        __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
      }
    });
  }
  cleanupCallback() {
    window.__TAURI_INTERNALS__.unregisterCallback(this.id);
  }
  set onmessage(handler) {
    __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
  }
  get onmessage() {
    return __classPrivateFieldGet(this, _Channel_onmessage, "f");
  }
  [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
    return `__CHANNEL__:${this.id}`;
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
};
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
_Resource_rid = /* @__PURE__ */ new WeakMap();

// src/firstRun.ts
var submitButton = document.getElementById("submit");
var deviceNameInput = document.getElementById("device_name");
var deviceLocationInput = document.getElementById("device_location");
var serverUrlInput = document.getElementById("server_url");
var errorTextEl = document.getElementById("error-text");
var validateAndSanitizeUrl = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { isValid: false, error: "Server URL is required" };
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { isValid: false, error: "Invalid URL format" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { isValid: false, error: "Only http:// and https:// URLs are allowed" };
  }
  if (!parsed.hostname) {
    return { isValid: false, error: "URL must include a valid hostname" };
  }
  let normalized = parsed.toString();
  normalized = normalized.replace(/\/+$/, "") || normalized;
  return { isValid: true, url: normalized };
};
var submit = async (e) => {
  e.preventDefault();
  if (!deviceNameInput || !deviceLocationInput || !serverUrlInput || !errorTextEl) {
    throw new Error("Missing elements");
  }
  const deviceName = deviceNameInput.value.trim();
  const deviceLocation = deviceLocationInput.value.trim();
  const serverUrlRaw = serverUrlInput.value;
  if (!deviceName || !deviceLocation || !serverUrlRaw) {
    errorTextEl.textContent = "Please fill in all fields";
    return;
  }
  const basicValidation = validateAndSanitizeUrl(serverUrlRaw);
  if (!basicValidation.isValid || !basicValidation.url) {
    errorTextEl.textContent = basicValidation.error || "Invalid server URL";
    return;
  }
  let serverUrl;
  try {
    serverUrl = await invoke("validate_and_sanitize_url_command", {
      url: basicValidation.url
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Invalid server URL";
    errorTextEl.textContent = errorMsg;
    return;
  }
  console.log(deviceName, deviceLocation, serverUrl);
  await invoke("submit_first_run_config", { deviceName, deviceLocation, serverUrl });
  window.close();
};
document.addEventListener("DOMContentLoaded", async () => {
  if (!submitButton || !deviceNameInput || !deviceLocationInput || !serverUrlInput || !errorTextEl) {
    console.error("Missing elements:", {
      submitButton: !!submitButton,
      deviceNameInput: !!deviceNameInput,
      deviceLocationInput: !!deviceLocationInput,
      serverUrlInput: !!serverUrlInput,
      errorTextEl: !!errorTextEl
    });
    return;
  }
  try {
    const config = await invoke("get_full_config");
    if (config.server_url) {
      serverUrlInput.value = config.server_url;
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
  deviceNameInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      submit(e);
    }
  });
  deviceLocationInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      submit(e);
    }
  });
  serverUrlInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      submit(e);
    }
  });
  submitButton.addEventListener("click", (e) => {
    console.log("Submit button clicked");
    submit(e);
  });
  console.log("Event listeners attached successfully");
});
