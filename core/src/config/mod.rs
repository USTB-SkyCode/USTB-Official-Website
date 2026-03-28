//! Lightweight configuration module placeholder
//!
//! Some previous refactor removed the `config` module but `lib.rs` still
//! exposes `pub mod config;`. Add a minimal module to satisfy the crate
//! public API and provide a safe place for global constants later.

/// Default shadow cascade distances (meters)
pub const DEFAULT_CASCADE_SPLITS: [f32; 4] = [30.0, 70.0, 200.0, 1000.0];

/// Initialize runtime config (no-op for now).
pub fn init_config() {
    // placeholder
}

use std::sync::atomic::{AtomicU32, Ordering};

/// Global flow UV angle offset (radians), stored as f32 bits in an AtomicU32.
static FLOW_UV_ANGLE_OFFSET: AtomicU32 = AtomicU32::new(0);

// Default texture indices match the legacy hardcoded values.
static WATER_FLOW_TEX: AtomicU32 = AtomicU32::new(1818);
static WATER_OVERLAY_TEX: AtomicU32 = AtomicU32::new(1819);
static WATER_STILL_TEX: AtomicU32 = AtomicU32::new(1820);
static LAVA_FLOW_TEX: AtomicU32 = AtomicU32::new(1148);
static LAVA_STILL_TEX: AtomicU32 = AtomicU32::new(1149);

/// Set the global flow UV angle offset (radians).
pub fn set_flow_uv_angle_offset(offset: f32) {
    FLOW_UV_ANGLE_OFFSET.store(offset.to_bits(), Ordering::SeqCst);
}

/// Get the global flow UV angle offset (radians).
pub fn get_flow_uv_angle_offset() -> f32 {
    f32::from_bits(FLOW_UV_ANGLE_OFFSET.load(Ordering::SeqCst))
}

/// Update runtime fluid texture indices from the host (data-driven).
pub fn set_fluid_texture_indices(
    water_flow: u32,
    water_overlay: u32,
    water_still: u32,
    lava_flow: u32,
    lava_still: u32,
) {
    WATER_FLOW_TEX.store(water_flow, Ordering::SeqCst);
    WATER_OVERLAY_TEX.store(water_overlay, Ordering::SeqCst);
    WATER_STILL_TEX.store(water_still, Ordering::SeqCst);
    LAVA_FLOW_TEX.store(lava_flow, Ordering::SeqCst);
    LAVA_STILL_TEX.store(lava_still, Ordering::SeqCst);
}

#[inline]
pub fn get_water_flow_tex() -> u32 {
    WATER_FLOW_TEX.load(Ordering::SeqCst)
}

#[inline]
pub fn get_water_overlay_tex() -> u32 {
    WATER_OVERLAY_TEX.load(Ordering::SeqCst)
}

#[inline]
pub fn get_water_still_tex() -> u32 {
    WATER_STILL_TEX.load(Ordering::SeqCst)
}

#[inline]
pub fn get_lava_flow_tex() -> u32 {
    LAVA_FLOW_TEX.load(Ordering::SeqCst)
}

#[inline]
pub fn get_lava_still_tex() -> u32 {
    LAVA_STILL_TEX.load(Ordering::SeqCst)
}
