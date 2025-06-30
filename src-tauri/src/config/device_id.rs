use mac_address::get_mac_address;
use rand::distr::Alphanumeric;
use rand::Rng;

fn is_zero_mac(mac: &mac_address::MacAddress) -> bool {
    mac.bytes().iter().all(|&b| b == 0)
}

fn get_primary_mac_address() -> Option<String> {
    match get_mac_address() {
        Ok(Some(mac)) if !is_zero_mac(&mac) => Some(mac.to_string()),
        _ => None,
    }
}

pub fn compute_device_id() -> String {
    if let Some(mac) = get_primary_mac_address() {
        let mac_clean: String = mac.chars().filter(|&c| c != ':').collect();
        let len = mac_clean.len();
        let last_six = if len >= 6 {
            &mac_clean[len - 6..]
        } else {
            &mac_clean[..]
        };
        last_six.to_string()
    } else {
        let rng = rand::rng();
        rng.sample_iter(&Alphanumeric)
            .take(6)
            .map(char::from)
            .collect()
    }
}
