//! SAB 消费者模块
//! 职责：负责从 SharedArrayBuffer (SAB) 中读取已解析的 Chunk 数据，重建为运行时结构，并驱动 Mesher 生成网格。
//! 
//! # Workflow
//! 1. `mesh_chunk_from_sab`: 入口函数，接收中心 Slot 和邻居 Slots 索引。
//! 2. `read_chunk`: 内部辅助函数，根据 `sab_layout` 规范从二进制 Payload 恢复 `ChunkData`。
//! 3. 组装 Neighborhood（中心+8个邻居）。
//! 4. 调用 Mesher 生成几何数据与并行 artifact。
//! 5. 将结果打包为 JS 对象 (TypedArray + artifact) 返回给 Worker 线程。
//!
//! # 优化
//! 具体的反序列化逻辑已提取到 `sab::codec` 模块。

use js_sys::{Date, Float32Array, Int32Array, Object, Reflect, Uint8Array, Uint32Array};
use wasm_bindgen::prelude::*;
use crate::io::anvil::chunk::ChunkData;
use crate::runtime::sab::client::get_sab_view_i32;
use crate::runtime::sab::layout::*;
use crate::runtime::sab::codec::decode_chunk;
use crate::mesher::artifacts::{ChunkBuildArtifact, MeshPass};
use crate::mesher::generator::mesh_chunk_with_neighbors_outputs_filtered;
use crate::mesher::types::{get_current_mesher_options, set_current_mesher_options, MesherOptions};
use crate::domain::resolve::{BiomeGlobal, BiomeResolver};
use crate::runtime::state::MANAGER;

/// Configure mesher lighting behavior for this WASM instance.
///
/// Note: each worker has its own WASM instance, so this is naturally per-worker.
#[wasm_bindgen]
pub fn set_mesher_options(vertex_lighting: bool, smooth_lighting: bool, vertex_ao: bool) {
    set_current_mesher_options(MesherOptions {
        vertex_lighting,
        smooth_lighting,
        vertex_ao,
    });
}

/// 从 SAB 读取区块数据并执行网格化。
/// 
/// # Parameters
/// - `chunk_x`, `chunk_z`: 区块世界坐标。
/// - `slot_index`: 中心区块在 SAB 中的 Slot 索引。
/// - `neighbor_slots`: 8个邻居区块的 Slot 索引数组 [N, S, E, W, NE, NW, SE, SW]。若不存在则为 U32::MAX。
/// 
/// # Returns
/// - `JsValue`: 包含 opaque/translucent 顶点/索引数据、光源数据和 section artifact 的 JS 对象。
#[wasm_bindgen]
pub fn mesh_chunk_from_sab(
    chunk_x: i32, 
    chunk_z: i32, 
    slot_index: u32,
    neighbor_slots: &[u32],
    dirty_section_ys: &[i32],
    include_legacy_geometry: bool,
) -> Result<JsValue, JsValue> {
    fn now_ms() -> f64 {
        Date::now()
    }

    fn mesh_pass_code(pass: MeshPass) -> u8 {
        match pass {
            MeshPass::Opaque => 0,
            MeshPass::Decal => 1,
            MeshPass::Translucent => 2,
            MeshPass::Shadow => 3,
            MeshPass::Velocity => 4,
        }
    }

    fn build_artifact_js(artifact: &ChunkBuildArtifact) -> JsValue {
        let obj = Object::new();
        let _ = Reflect::set(&obj, &"chunk_x".into(), &JsValue::from_f64(artifact.chunk_x as f64));
        let _ = Reflect::set(&obj, &"chunk_z".into(), &JsValue::from_f64(artifact.chunk_z as f64));

        let mut section_ys = Vec::with_capacity(artifact.sections.len());
        let mut build_versions = Vec::with_capacity(artifact.sections.len());
        let mut bounds_mins = Vec::with_capacity(artifact.sections.len() * 3);
        let mut bounds_maxs = Vec::with_capacity(artifact.sections.len() * 3);
        let mut section_item_offsets = Vec::with_capacity(artifact.sections.len());
        let mut section_item_counts = Vec::with_capacity(artifact.sections.len());
        let mut item_kinds = Vec::new();
        let mut vertex_counts = Vec::new();

        // Flat blob: all vertex/index bytes concatenated into a single buffer.
        // Per-item byte offsets and lengths stored in separate metadata arrays.
        let mut payload_blob = Vec::new();
        let mut vertex_byte_offsets = Vec::new();
        let mut vertex_byte_lengths = Vec::new();
        let mut index_byte_offsets = Vec::new();
        let mut index_byte_lengths = Vec::new();

        for section in &artifact.sections {
            section_ys.push(section.section_y);
            build_versions.push(section.build_version);
            bounds_mins.extend_from_slice(section.bounds_min.as_slice());
            bounds_maxs.extend_from_slice(section.bounds_max.as_slice());
            section_item_offsets.push(item_kinds.len() as u32);
            section_item_counts.push(section.items.len() as u8);

            for item in &section.items {
                item_kinds.push(mesh_pass_code(item.item));
                vertex_counts.push(item.vertex_count);

                let v_offset = payload_blob.len() as u32;
                payload_blob.extend_from_slice(&item.vertex_bytes);
                vertex_byte_offsets.push(v_offset);
                vertex_byte_lengths.push(item.vertex_bytes.len() as u32);

                match &item.index_bytes {
                    Some(bytes) => {
                        let i_offset = payload_blob.len() as u32;
                        payload_blob.extend_from_slice(bytes);
                        index_byte_offsets.push(i_offset);
                        index_byte_lengths.push(bytes.len() as u32);
                    }
                    None => {
                        index_byte_offsets.push(0);
                        index_byte_lengths.push(0);
                    }
                };
            }
        }

        let _ = Reflect::set(&obj, &"section_ys".into(), &Int32Array::from(section_ys.as_slice()).into());
        let _ = Reflect::set(&obj, &"build_versions".into(), &Uint32Array::from(build_versions.as_slice()).into());
        let _ = Reflect::set(&obj, &"bounds_mins".into(), &Float32Array::from(bounds_mins.as_slice()).into());
        let _ = Reflect::set(&obj, &"bounds_maxs".into(), &Float32Array::from(bounds_maxs.as_slice()).into());
        let _ = Reflect::set(&obj, &"section_item_offsets".into(), &Uint32Array::from(section_item_offsets.as_slice()).into());
        let _ = Reflect::set(&obj, &"section_item_counts".into(), &Uint8Array::from(section_item_counts.as_slice()).into());
        let _ = Reflect::set(&obj, &"item_kinds".into(), &Uint8Array::from(item_kinds.as_slice()).into());
        let _ = Reflect::set(&obj, &"vertex_counts".into(), &Uint32Array::from(vertex_counts.as_slice()).into());
        let _ = Reflect::set(&obj, &"payload_blob".into(), &Uint8Array::from(payload_blob.as_slice()).into());
        let _ = Reflect::set(&obj, &"vertex_byte_offsets".into(), &Uint32Array::from(vertex_byte_offsets.as_slice()).into());
        let _ = Reflect::set(&obj, &"vertex_byte_lengths".into(), &Uint32Array::from(vertex_byte_lengths.as_slice()).into());
        let _ = Reflect::set(&obj, &"index_byte_offsets".into(), &Uint32Array::from(index_byte_offsets.as_slice()).into());
        let _ = Reflect::set(&obj, &"index_byte_lengths".into(), &Uint32Array::from(index_byte_lengths.as_slice()).into());

        obj.into()
    }

    
    // 内部函数：也就是反序列化过程
    // 从指定 Slot 读取并重建 ChunkData
    fn read_chunk(slot: u32, cx: i32, cz: i32) -> ChunkData {
        let header_offset = get_slot_header_offset(slot);
        let (block_index, block_count) = get_sab_view_i32(|view| {
             let idx = (header_offset / 4) as u32;
             let b_idx = view.get_index(idx + 4) as u32; // [4] is block_index
             let b_cnt = view.get_index(idx + 5) as u32; // [5] is block_count
             (b_idx, b_cnt)
        });
        
        let biome = BiomeGlobal;
        let default_biome = biome.default_biome();

        // Zero-Allocation Optimization check
        if block_count == 0 {
            // 返回一个全空的 ChunkData
            let empty_biomes = [default_biome; 256];
            return ChunkData {
                x: cx,
                z: cz,
                sections: (0..SECTIONS_PER_CHUNK).map(|_| None).collect(),
                biomes_2d: empty_biomes,
                min_y: -4,
                default_biome,
                status: None,
            };
        }

        let data_base = get_data_offset(block_index);
        
        // 调用 codec 进行解码
        decode_chunk(cx, cz, data_base, default_biome)
    }
    
    let decode_start = now_ms();

    // 读取中心区块
    let center = read_chunk(slot_index, chunk_x, chunk_z);
    
    // 读取邻居区块
    let get_n = |idx: usize, nx: i32, nz: i32| -> Option<ChunkData> {
        if idx >= neighbor_slots.len() { return None; }
        let s = neighbor_slots[idx];
        if s == u32::MAX { return None; } // Sentinel for missing neighbor

        // Hard Check: Ensure the neighbor slot is at least "Center Ready" (Bit 0).
        let header_offset = get_slot_header_offset(s);
        let ready_flag = get_sab_view_i32(|view| {
             let idx = (header_offset / 4) as u32;
             view.get_index(idx + 3) as i32 // [3] is readyFlag
        });
        
        // 1. If Center BlockData is not ready, the chunk is useless.
        if (ready_flag & 1) == 0 {
             return None;
        }

        let chunk = read_chunk(s, nx, nz);
        Some(chunk)
    };
    
    // 顺序: N, S, E, W, NE, NW, SE, SW (与 JS 端 chunk-worker 的顺序对应)
    let n = get_n(0, chunk_x, chunk_z - 1);
    let s = get_n(1, chunk_x, chunk_z + 1);
    let e = get_n(2, chunk_x + 1, chunk_z);
    let w = get_n(3, chunk_x - 1, chunk_z);
    let ne = get_n(4, chunk_x + 1, chunk_z - 1);
    let nw = get_n(5, chunk_x - 1, chunk_z - 1);
    let se = get_n(6, chunk_x + 1, chunk_z + 1);
    let sw = get_n(7, chunk_x - 1, chunk_z + 1);
    let decode_ms = now_ms() - decode_start;
    
    MANAGER.with(|mgr_cell| {
        let mgr_ref = mgr_cell.borrow();
        if mgr_ref.is_none() {
             return Err(JsValue::from_str("BlockModelManager not initialized"));
        }
        let mgr = mgr_ref.as_ref().unwrap();
        
        let options = get_current_mesher_options();
        let generate_start = now_ms();
        let outputs = mesh_chunk_with_neighbors_outputs_filtered(
            &center,
            n.as_ref(), s.as_ref(), e.as_ref(), w.as_ref(),
            ne.as_ref(), nw.as_ref(), se.as_ref(), sw.as_ref(), 
            mgr,
            options,
            Some(dirty_section_ys),
            include_legacy_geometry,
        );
        let generate_ms = now_ms() - generate_start;
        
        // 展平灯光数据结构以便传输
        let legacy_pack_start = now_ms();
        let mut flat_lights = Vec::with_capacity(outputs.lights.len() * 8);
        for l in &outputs.lights {
            flat_lights.push(l.x);
            flat_lights.push(l.y);
            flat_lights.push(l.z);
            flat_lights.push(l.r);
            flat_lights.push(l.g);
            flat_lights.push(l.b);
            flat_lights.push(l.intensity);
            flat_lights.push(l.radius);
        }
        let opaque = include_legacy_geometry.then(|| Uint8Array::from(&outputs.opaque[..]));
        let opaque_indices = include_legacy_geometry.then(|| Uint32Array::from(&outputs.opaque_indices[..]));
        let decal = include_legacy_geometry.then(|| Uint8Array::from(&outputs.decal[..]));
        let decal_indices = include_legacy_geometry.then(|| Uint32Array::from(&outputs.decal_indices[..]));
        let translucent = include_legacy_geometry.then(|| Uint8Array::from(&outputs.translucent[..]));
        let translucent_indices = include_legacy_geometry.then(|| Uint32Array::from(&outputs.translucent_indices[..]));
        let lights = Float32Array::from(&flat_lights[..]);
        let legacy_pack_ms = now_ms() - legacy_pack_start;

        let artifact_serialize_start = now_ms();
        let artifact = build_artifact_js(&outputs.artifact);
        let artifact_serialize_ms = now_ms() - artifact_serialize_start;

        // 构建 JS 返回对象
        let js_bridge_start = now_ms();
        let obj = Object::new();
        if let Some(opaque) = opaque {
            let _ = Reflect::set(&obj, &"opaque".into(), &opaque.into());
        }
        if let Some(opaque_indices) = opaque_indices {
            let _ = Reflect::set(&obj, &"opaqueIndices".into(), &opaque_indices.into());
        }
        if let Some(decal) = decal {
            let _ = Reflect::set(&obj, &"decal".into(), &decal.into());
        }
        if let Some(decal_indices) = decal_indices {
            let _ = Reflect::set(&obj, &"decalIndices".into(), &decal_indices.into());
        }
        if let Some(translucent) = translucent {
            let _ = Reflect::set(&obj, &"translucent".into(), &translucent.into());
        }
        if let Some(translucent_indices) = translucent_indices {
            let _ = Reflect::set(&obj, &"translucentIndices".into(), &translucent_indices.into());
        }
        let _ = Reflect::set(&obj, &"lights".into(), &lights.into());
        let _ = Reflect::set(&obj, &"artifact".into(), &artifact);
        let _ = Reflect::set(&obj, &"wasmDecodeMs".into(), &JsValue::from_f64(decode_ms));
        let _ = Reflect::set(&obj, &"wasmGenerateMs".into(), &JsValue::from_f64(generate_ms));
        let _ = Reflect::set(&obj, &"wasmLegacyPackMs".into(), &JsValue::from_f64(legacy_pack_ms));
        let _ = Reflect::set(&obj, &"wasmArtifactSerializeMs".into(), &JsValue::from_f64(artifact_serialize_ms));
        let _ = Reflect::set(&obj, &"wasmJsBridgeMs".into(), &JsValue::from_f64(now_ms() - js_bridge_start));
        
        Ok(obj.into())
    })
}

/// Mesh a chunk and write the payload blob directly into a pre-allocated SAB arena
/// data region, eliminating the intermediate JS heap allocation.
///
/// The `arena_data_view` must be a `Uint8Array` view into the SAB arena's data region
/// (starting at `dataByteOffset`). The caller is responsible for pre-allocating an
/// arena large enough to hold the mesh output.
///
/// Returns a metadata-only JS object (no `payload_blob` field), plus `arenaUsedBytes`
/// indicating how many bytes were written into the arena. The artifact field contains
/// section metadata and byte offset/length arrays referencing positions within the arena.
///
/// If the arena is too small, returns an error.
#[wasm_bindgen]
pub fn mesh_chunk_from_sab_into_arena(
    chunk_x: i32,
    chunk_z: i32,
    slot_index: u32,
    neighbor_slots: &[u32],
    dirty_section_ys: &[i32],
    arena_data_view: &Uint8Array,
) -> Result<JsValue, JsValue> {
    fn now_ms() -> f64 {
        Date::now()
    }

    fn mesh_pass_code(pass: MeshPass) -> u8 {
        match pass {
            MeshPass::Opaque => 0,
            MeshPass::Decal => 1,
            MeshPass::Translucent => 2,
            MeshPass::Shadow => 3,
            MeshPass::Velocity => 4,
        }
    }

    fn read_chunk(slot: u32, cx: i32, cz: i32) -> ChunkData {
        let header_offset = get_slot_header_offset(slot);
        let (block_index, block_count) = get_sab_view_i32(|view| {
             let idx = (header_offset / 4) as u32;
             let b_idx = view.get_index(idx + 4) as u32;
             let b_cnt = view.get_index(idx + 5) as u32;
             (b_idx, b_cnt)
        });

        let biome = BiomeGlobal;
        let default_biome = biome.default_biome();

        if block_count == 0 {
            let empty_biomes = [default_biome; 256];
            return ChunkData {
                x: cx,
                z: cz,
                sections: (0..SECTIONS_PER_CHUNK).map(|_| None).collect(),
                biomes_2d: empty_biomes,
                min_y: -4,
                default_biome,
                status: None,
            };
        }

        let data_base = get_data_offset(block_index);
        decode_chunk(cx, cz, data_base, default_biome)
    }

    let decode_start = now_ms();
    let center = read_chunk(slot_index, chunk_x, chunk_z);

    let get_n = |idx: usize, nx: i32, nz: i32| -> Option<ChunkData> {
        if idx >= neighbor_slots.len() { return None; }
        let s = neighbor_slots[idx];
        if s == u32::MAX { return None; }
        let header_offset = get_slot_header_offset(s);
        let ready_flag = get_sab_view_i32(|view| {
            let idx = (header_offset / 4) as u32;
            view.get_index(idx + 0) as u32
        });
        if ready_flag & 1 == 0 { return None; }
        let chunk = read_chunk(s, nx, nz);
        Some(chunk)
    };

    let n = get_n(0, chunk_x, chunk_z - 1);
    let s = get_n(1, chunk_x, chunk_z + 1);
    let e = get_n(2, chunk_x + 1, chunk_z);
    let w = get_n(3, chunk_x - 1, chunk_z);
    let ne = get_n(4, chunk_x + 1, chunk_z - 1);
    let nw = get_n(5, chunk_x - 1, chunk_z - 1);
    let se = get_n(6, chunk_x + 1, chunk_z + 1);
    let sw = get_n(7, chunk_x - 1, chunk_z + 1);
    let decode_ms = now_ms() - decode_start;

    MANAGER.with(|mgr_cell| {
        let mgr_ref = mgr_cell.borrow();
        if mgr_ref.is_none() {
            return Err(JsValue::from_str("BlockModelManager not initialized"));
        }
        let mgr = mgr_ref.as_ref().unwrap();

        let options = get_current_mesher_options();
        let generate_start = now_ms();
        let outputs = mesh_chunk_with_neighbors_outputs_filtered(
            &center,
            n.as_ref(), s.as_ref(), e.as_ref(), w.as_ref(),
            ne.as_ref(), nw.as_ref(), se.as_ref(), sw.as_ref(),
            mgr,
            options,
            Some(dirty_section_ys),
            false, // never include legacy geometry in arena path
        );
        let generate_ms = now_ms() - generate_start;

        // Flatten lights
        let legacy_pack_start = now_ms();
        let mut flat_lights = Vec::with_capacity(outputs.lights.len() * 8);
        for l in &outputs.lights {
            flat_lights.push(l.x);
            flat_lights.push(l.y);
            flat_lights.push(l.z);
            flat_lights.push(l.r);
            flat_lights.push(l.g);
            flat_lights.push(l.b);
            flat_lights.push(l.intensity);
            flat_lights.push(l.radius);
        }
        let lights = Float32Array::from(&flat_lights[..]);
        let legacy_pack_ms = now_ms() - legacy_pack_start;

        // Build flat blob + metadata (same as build_artifact_js but keep blob in wasm memory)
        let artifact_serialize_start = now_ms();
        let artifact = &outputs.artifact;

        let mut section_ys = Vec::with_capacity(artifact.sections.len());
        let mut build_versions = Vec::with_capacity(artifact.sections.len());
        let mut bounds_mins = Vec::with_capacity(artifact.sections.len() * 3);
        let mut bounds_maxs = Vec::with_capacity(artifact.sections.len() * 3);
        let mut section_item_offsets = Vec::with_capacity(artifact.sections.len());
        let mut section_item_counts = Vec::with_capacity(artifact.sections.len());
        let mut item_kinds = Vec::new();
        let mut vertex_counts = Vec::new();
        let mut payload_blob = Vec::new();
        let mut vertex_byte_offsets = Vec::new();
        let mut vertex_byte_lengths = Vec::new();
        let mut index_byte_offsets = Vec::new();
        let mut index_byte_lengths = Vec::new();

        for section in &artifact.sections {
            section_ys.push(section.section_y);
            build_versions.push(section.build_version);
            bounds_mins.extend_from_slice(section.bounds_min.as_slice());
            bounds_maxs.extend_from_slice(section.bounds_max.as_slice());
            section_item_offsets.push(item_kinds.len() as u32);
            section_item_counts.push(section.items.len() as u8);

            for item in &section.items {
                item_kinds.push(mesh_pass_code(item.item));
                vertex_counts.push(item.vertex_count);

                let v_offset = payload_blob.len() as u32;
                payload_blob.extend_from_slice(&item.vertex_bytes);
                vertex_byte_offsets.push(v_offset);
                vertex_byte_lengths.push(item.vertex_bytes.len() as u32);

                match &item.index_bytes {
                    Some(bytes) => {
                        let i_offset = payload_blob.len() as u32;
                        payload_blob.extend_from_slice(bytes);
                        index_byte_offsets.push(i_offset);
                        index_byte_lengths.push(bytes.len() as u32);
                    }
                    None => {
                        index_byte_offsets.push(0);
                        index_byte_lengths.push(0);
                    }
                };
            }
        }
        let artifact_serialize_ms = now_ms() - artifact_serialize_start;

        // Write blob directly into arena SAB view (single copy: wasm linear memory → SAB)
        let js_bridge_start = now_ms();
        let arena_capacity = arena_data_view.length() as usize;
        let blob_len = payload_blob.len();
        if blob_len > arena_capacity {
            return Err(JsValue::from_str(&format!(
                "Arena too small: need {} bytes, have {}",
                blob_len, arena_capacity
            )));
        }

        if blob_len > 0 {
            // copy_from internally uses unsafe Uint8Array::view + set,
            // performing a single memcpy from wasm linear memory → SAB.
            arena_data_view.copy_from(&payload_blob);
        }

        // Build metadata-only return object
        let obj = Object::new();
        let _ = Reflect::set(&obj, &"lights".into(), &lights.into());
        let _ = Reflect::set(&obj, &"arenaUsedBytes".into(), &JsValue::from_f64(blob_len as f64));

        // Artifact metadata (no payload bytes on JS side)
        let meta = Object::new();
        let _ = Reflect::set(&meta, &"chunk_x".into(), &JsValue::from_f64(artifact.chunk_x as f64));
        let _ = Reflect::set(&meta, &"chunk_z".into(), &JsValue::from_f64(artifact.chunk_z as f64));
        let _ = Reflect::set(&meta, &"section_ys".into(), &Int32Array::from(section_ys.as_slice()).into());
        let _ = Reflect::set(&meta, &"build_versions".into(), &Uint32Array::from(build_versions.as_slice()).into());
        let _ = Reflect::set(&meta, &"bounds_mins".into(), &Float32Array::from(bounds_mins.as_slice()).into());
        let _ = Reflect::set(&meta, &"bounds_maxs".into(), &Float32Array::from(bounds_maxs.as_slice()).into());
        let _ = Reflect::set(&meta, &"section_item_offsets".into(), &Uint32Array::from(section_item_offsets.as_slice()).into());
        let _ = Reflect::set(&meta, &"section_item_counts".into(), &Uint8Array::from(section_item_counts.as_slice()).into());
        let _ = Reflect::set(&meta, &"item_kinds".into(), &Uint8Array::from(item_kinds.as_slice()).into());
        let _ = Reflect::set(&meta, &"vertex_counts".into(), &Uint32Array::from(vertex_counts.as_slice()).into());
        let _ = Reflect::set(&meta, &"vertex_byte_offsets".into(), &Uint32Array::from(vertex_byte_offsets.as_slice()).into());
        let _ = Reflect::set(&meta, &"vertex_byte_lengths".into(), &Uint32Array::from(vertex_byte_lengths.as_slice()).into());
        let _ = Reflect::set(&meta, &"index_byte_offsets".into(), &Uint32Array::from(index_byte_offsets.as_slice()).into());
        let _ = Reflect::set(&meta, &"index_byte_lengths".into(), &Uint32Array::from(index_byte_lengths.as_slice()).into());
        let _ = Reflect::set(&obj, &"artifact".into(), &meta.into());

        let _ = Reflect::set(&obj, &"wasmDecodeMs".into(), &JsValue::from_f64(decode_ms));
        let _ = Reflect::set(&obj, &"wasmGenerateMs".into(), &JsValue::from_f64(generate_ms));
        let _ = Reflect::set(&obj, &"wasmLegacyPackMs".into(), &JsValue::from_f64(legacy_pack_ms));
        let _ = Reflect::set(&obj, &"wasmArtifactSerializeMs".into(), &JsValue::from_f64(artifact_serialize_ms));
        let _ = Reflect::set(&obj, &"wasmJsBridgeMs".into(), &JsValue::from_f64(now_ms() - js_bridge_start));

        Ok(obj.into())
    })
}
