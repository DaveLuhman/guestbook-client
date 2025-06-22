use hidapi::{HidApi, DeviceInfo};
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref HID_API: Mutex<HidApi> = Mutex::new(HidApi::new().expect("Failed to init HID API"));
}

pub fn list_devices() -> Vec<DeviceInfo> {
    let api = HID_API.lock().unwrap();
    api.device_list().cloned().collect()
}
