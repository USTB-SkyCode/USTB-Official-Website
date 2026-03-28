//! # Region 提取接口 (Region Interface)
//!
//! ## 职责
//! 提供从 `.mca` Region 字节流中直接提取单个 Chunk payload 的导出函数。
//! 该接口主要服务调试、按需加载与 JS 侧自定义解压流程。

use wasm_bindgen::prelude::*;
use crate::io::anvil::region::Region;

/// 从 Region 数据中提取特定 Chunk 的原始 Payload。
///
/// # Parameters
/// - `region_data`: Region 文件完整数据
/// - `chunk_x`: Chunk 全局 X 坐标
/// - `chunk_z`: Chunk 全局 Z 坐标
///
/// # Returns
/// - `Result<Vec<u8>, JsValue>`: 成功返回 `[compression, payload...]`，失败返回错误信息。
#[wasm_bindgen]
pub fn get_chunk_payload_from_region(region_data: &[u8], chunk_x: i32, chunk_z: i32) -> Result<Vec<u8>, JsValue> {
    let region = Region::new(region_data);
    match region.get_chunk_payload(chunk_x, chunk_z) {
        Some((compression, payload)) => {
            let mut res = Vec::with_capacity(payload.len() + 1);
            res.push(compression); // 返回格式：[compression, payload...]
            res.extend_from_slice(payload);
            Ok(res)
        },
        None => Err(JsValue::from_str("Chunk not found in region")),
    }
}
