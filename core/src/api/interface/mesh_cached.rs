//! 缓存版网格生成接口
//!
//! 职责：提供带缓存的网格生成 API，避免重复 NBT 解压/解析。
//! 机制：
//!   1. 首次加载：解压 → 解析 → 缓存 → mesh
//!   2. 后续访问：直接从缓存获取 ChunkData → mesh
//!   3. 邻居查找：优先使用缓存

use wasm_bindgen::prelude::*;
use crate::mesher::cache_service::{process_cache_chunk, check_chunk_cached, process_mesh_cached};
use crate::mesher::service::MeshResult;

/// 将 MeshResult 转换为 JS 对象
fn convert_to_js_mesh(result: MeshResult) -> js_sys::Object {
    let obj = js_sys::Object::new();
    
    let opaque_arr = js_sys::Uint8Array::from(result.opaque.as_slice());
    let opaque_indices = js_sys::Uint32Array::from(result.opaque_indices.as_slice());
    let translucent_arr = js_sys::Uint8Array::from(result.translucent.as_slice());
    let translucent_indices = js_sys::Uint32Array::from(result.translucent_indices.as_slice());

    // Flatten lights
    let mut flat_lights = Vec::with_capacity(result.lights.len() * 8);
    for l in result.lights {
        flat_lights.push(l.x);
        flat_lights.push(l.y);
        flat_lights.push(l.z);
        flat_lights.push(l.r);
        flat_lights.push(l.g);
        flat_lights.push(l.b);
        flat_lights.push(l.intensity);
        flat_lights.push(l.radius);
    }
    let lights_arr = js_sys::Float32Array::from(flat_lights.as_slice());

    let _ = js_sys::Reflect::set(&obj, &"opaque".into(), &opaque_arr);
    let _ = js_sys::Reflect::set(&obj, &"opaque_indices".into(), &opaque_indices);
    let _ = js_sys::Reflect::set(&obj, &"translucent".into(), &translucent_arr);
    let _ = js_sys::Reflect::set(&obj, &"translucent_indices".into(), &translucent_indices);
    let _ = js_sys::Reflect::set(&obj, &"lights".into(), &lights_arr);
    
    obj
}

/// 缓存区块数据（仅解压和解析，不生成网格）
#[wasm_bindgen]
pub fn cache_chunk(cx: i32, cz: i32, data: &[u8]) -> bool {
    process_cache_chunk(cx, cz, data)
}

/// 检查区块是否已缓存
#[wasm_bindgen]
pub fn is_chunk_cached(cx: i32, cz: i32) -> bool {
    check_chunk_cached(cx, cz)
}

/// 使用缓存生成网格（核心优化接口）
#[wasm_bindgen]
pub fn mesh_chunk_cached(
    cx: i32,
    cz: i32,
    center_data: Option<Vec<u8>>,
    neighbor_coords: &[i32],
) -> Result<JsValue, JsValue> {
    crate::dev_log!("WASM mesh_chunk_cached called for {}, {}", cx, cz);
    
    match process_mesh_cached(cx, cz, center_data, neighbor_coords) {
        Ok(result) => Ok(convert_to_js_mesh(result).into()),
        Err(e) => Err(JsValue::from_str(&e))
    }
}
