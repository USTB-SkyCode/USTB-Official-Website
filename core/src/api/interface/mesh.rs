//! # 网格生成导出接口 (Mesh Interface)
//!
//! ## 职责
//! 把 Rust 侧 mesher 的输出打包成 JS 可消费对象，并暴露单 Chunk / 邻域 Chunk 的网格生成入口。
//!
//! ## 输入/输出
//! - 输入：中心 Chunk 二进制、八邻域可选二进制。
//! - 输出：包含 opaque / decal / translucent 顶点与索引，以及点光源数组的 JS 对象。

use wasm_bindgen::prelude::*;
use crate::runtime::state::MANAGER;
use crate::mesher::service::{MeshResult, NeighborData, mesh_neighborhood_artifact_from_binary, mesh_xy_chunk_from_binary, mesh_neighborhood_from_binary};

/// 将 `MeshResult` 转换为 JS 对象。
/// 顶点缓冲保持 TypedArray 形式，避免 JS 侧二次拆包。
fn convert_to_js_mesh(result: MeshResult) -> js_sys::Object {
    let obj = js_sys::Object::new();
    
    let opaque_arr = js_sys::Uint8Array::from(result.opaque.as_slice());
    let opaque_indices = js_sys::Uint32Array::from(result.opaque_indices.as_slice());
    let decal_arr = js_sys::Uint8Array::from(result.decal.as_slice());
    let decal_indices = js_sys::Uint32Array::from(result.decal_indices.as_slice());
    let translucent_arr = js_sys::Uint8Array::from(result.translucent.as_slice());
    let translucent_indices = js_sys::Uint32Array::from(result.translucent_indices.as_slice());

    // 把结构化点光源拍平成 Float32Array，便于 JS 直接上传实例缓冲。
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
    let _ = js_sys::Reflect::set(&obj, &"decal".into(), &decal_arr);
    let _ = js_sys::Reflect::set(&obj, &"decal_indices".into(), &decal_indices);
    let _ = js_sys::Reflect::set(&obj, &"translucent".into(), &translucent_arr);
    let _ = js_sys::Reflect::set(&obj, &"translucent_indices".into(), &translucent_indices);
    let _ = js_sys::Reflect::set(&obj, &"lights".into(), &lights_arr);
    
    obj
}

/// 生成单个 Chunk 的渲染网格。
/// 该入口不考虑邻域遮挡信息，适合最小化调试或孤立 Chunk 预览。
#[wasm_bindgen]
pub fn mesh_chunk_raw(chunk_data: &[u8]) -> Result<JsValue, JsValue> {
    MANAGER.with(|mgr_opt| {
        let mgr_ref = mgr_opt.borrow();
        let mgr = match &*mgr_ref {
            Some(m) => m,
            None => return Err(JsValue::from_str("Resources not initialized")),
        };

        match mesh_xy_chunk_from_binary(chunk_data, mgr) {
            Ok(result) => Ok(convert_to_js_mesh(result).into()),
            Err(e) => Err(JsValue::from_str(&e)),
        }
    })
}

/// 生成中心 Chunk 及其八邻域的渲染网格。
/// 邻域信息会影响面剔除、连接面与局部可见性判断。
#[wasm_bindgen]
pub fn mesh_chunk_with_neighbors(
    center_data: &[u8],
    north_data: Option<Vec<u8>>,
    south_data: Option<Vec<u8>>,
    east_data: Option<Vec<u8>>,
    west_data: Option<Vec<u8>>,
    ne_data: Option<Vec<u8>>,
    nw_data: Option<Vec<u8>>,
    se_data: Option<Vec<u8>>,
    sw_data: Option<Vec<u8>>,
) -> Result<JsValue, JsValue> {
    MANAGER.with(|mgr_opt| {
        let mgr_ref = mgr_opt.borrow();
        let mgr = match &*mgr_ref {
            Some(m) => m,
            None => return Err(JsValue::from_str("Manager not initialized")),
        };

        let neighbors = NeighborData {
            north: north_data.as_deref(),
            south: south_data.as_deref(),
            east: east_data.as_deref(),
            west: west_data.as_deref(),
            ne: ne_data.as_deref(),
            nw: nw_data.as_deref(),
            se: se_data.as_deref(),
            sw: sw_data.as_deref(),
        };

        match mesh_neighborhood_from_binary(center_data, neighbors, mgr) {
            Ok(result) => Ok(convert_to_js_mesh(result).into()),
            Err(e) => Err(JsValue::from_str(&e)),
        }
    })
}

/// 生成中心 Chunk 及其邻域的 section artifact。
/// 该接口主要供新渲染架构调试接线，保留更细粒度的 section 中间产物。
#[wasm_bindgen]
pub fn mesh_chunk_with_neighbors_artifact(
    center_data: &[u8],
    north_data: Option<Vec<u8>>,
    south_data: Option<Vec<u8>>,
    east_data: Option<Vec<u8>>,
    west_data: Option<Vec<u8>>,
    ne_data: Option<Vec<u8>>,
    nw_data: Option<Vec<u8>>,
    se_data: Option<Vec<u8>>,
    sw_data: Option<Vec<u8>>,
) -> Result<JsValue, JsValue> {
    MANAGER.with(|mgr_opt| {
        let mgr_ref = mgr_opt.borrow();
        let mgr = match &*mgr_ref {
            Some(m) => m,
            None => return Err(JsValue::from_str("Manager not initialized")),
        };

        let neighbors = NeighborData {
            north: north_data.as_deref(),
            south: south_data.as_deref(),
            east: east_data.as_deref(),
            west: west_data.as_deref(),
            ne: ne_data.as_deref(),
            nw: nw_data.as_deref(),
            se: se_data.as_deref(),
            sw: sw_data.as_deref(),
        };

        match mesh_neighborhood_artifact_from_binary(center_data, neighbors, mgr) {
            Ok(result) => serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize artifact: {e}"))),
            Err(e) => Err(JsValue::from_str(&e)),
        }
    })
}


