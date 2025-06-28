use mac_address::{MacAddress, MacAddressIterator};
use rand::distr::Alphanumeric;
use rand::Rng;

fn get_primary_mac_address() -> Option<String> {
    // Try eth0 or wlan0 first
    if let Ok(iter) = MacAddressIterator::new() {
        for iface in iter {
            if let Ok((name, mac_result)) = iface {
                if let Ok(mac) = mac_result {
                    if (name == "eth0" || name == "wlan0") && !mac.is_zero() {
                        return Some(mac.to_string());
                    }
                }
            }
        }
    }
    // Otherwise, any non-loopback, non-zero MAC
    if let Ok(iter) = MacAddressIterator::new() {
        for iface in iter {
            if let Ok((_, mac_result)) = iface {
                if let Ok(mac) = mac_result {
                    if !mac.is_zero() {
                        return Some(mac.to_string());
                    }
                }
            }
        }
    }
    None
}

pub fn compute_device_id() -> String {
    if let Some(mac) = get_primary_mac_address() {
        mac.replace(":", "")
            .chars()
            .rev()
            .take(6)
            .collect::<String>()
            .chars()
            .rev()
            .collect()
    } else {
        let mut rng = rand::rng();
        (&mut rng)
            .sample_iter(Alphanumeric)
            .take(6)
            .map(char::from)
            .collect()
    }
}
