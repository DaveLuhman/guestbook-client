import { invoke } from "@tauri-apps/api/core";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

async function greet() {
  if (greetMsgEl && greetInputEl) {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });
});

import { listen } from "@tauri-apps/api/event";

(async () => {
  await invoke("start_barcode_listener");
  await invoke("start_magtek_listener");

  listen("hid-data", event => {
    console.log("Scanned:", event.payload); // should be digits-only
  });

  listen("magtek-data", event => {
    console.log("MagTek card:", event.payload);
  });

  listen("hid-error", event => {
    console.error("Scan error:", event.payload);
  });
})();
