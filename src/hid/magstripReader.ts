import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function startMagstripListener() {
  await invoke("start_magtek_listener");

  listen("hid-data", event => {
    console.log("Card swipe:", event.payload);
  });

  listen("magtek-data", event => {
    console.log("MagTek parsed:", event.payload);
  });

  listen("hid-error", event => {
    console.error("MagTek error:", event.payload);
  });
}
