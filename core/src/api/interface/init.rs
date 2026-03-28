//! # 初始化与运行时配置接口 (Init Interface)
//!
//! ## 职责
//! 提供 Rust Core 的初始化入口，包括资源二进制加载、SAB 布局配置、Colormap 注入与运行时调试开关。
//!
//! ## 输入/输出
//! - 输入：压缩资源二进制、Colormap 像素、SAB 配置参数。
//! - 输出：更新后的全局 `BlockModelManager`、运行时配置状态，以及供 JS 调用的 `wasm_bindgen` 接口。
//!
//! ## 运行机制
//! 该模块会在资源重建时清理 TLS ID 缓存，并尝试与 SAB 注册表重新对齐，保证 BlockState ID 稳定。

use wasm_bindgen::prelude::*;
use std::io::Read;
use flate2::read::ZlibDecoder;
use crate::runtime::state::MANAGER;
use crate::utils::set_dev_logging_enabled;
use crate::domain::block::BlockModelManager;
use crate::runtime::sab::client::get_sab_view_i32;
use crate::runtime::sab::registry::{SabIds, REGISTRY_HEAD_INTS, clear_id_cache, describe_registered_key};
use crate::runtime::sab::layout::configure_layout;
use crate::domain::block::binary::BinaryReader;

const BLOCK_FLAG_FULL_CUBE: u32 = 1 << 1;
const BLOCK_FLAG_OPAQUE_FULL_CUBE: u32 = 1 << 2;
const BLOCK_FLAG_WATER_FILLED: u32 = 1 << 3;
const BLOCK_FLAG_LAVA: u32 = 1 << 4;
const BLOCK_FLAG_DECAL: u32 = 1 << 5;
const BLOCK_FLAG_SOLID_RENDER_LAYER: u32 = 1 << 6;
const BLOCK_FLAG_TRANSLUCENT_RENDER_LAYER: u32 = 1 << 7;
const BLOCK_FLAG_VARIANTS: u32 = 1 << 8;

/// 在 `MANAGER` 已初始化时执行回调，否则直接返回 fallback。
/// 用于避免重复书写 TLS borrow 与空值分支。
fn with_block_model_manager<T>(fallback: T, f: impl FnOnce(&BlockModelManager) -> T) -> T {
    MANAGER.with(|manager_cell| {
        let manager_ref = manager_cell.borrow();
        let Some(manager) = manager_ref.as_ref() else {
            return fallback;
        };

        f(manager)
    })
}

/// 初始化 Rust Core。
/// 当前主要用于确认 WASM 模块已成功装载，并建立最基础的调试日志通路。
#[wasm_bindgen]
pub fn init_core() {
    crate::dev_log!("Rust Core Initialized");
}

/// 开关开发期日志输出。
/// 关闭后仍保留关键错误路径，但常规调试日志会被抑制。
#[wasm_bindgen]
pub fn set_dev_logging(enabled: bool) {
    set_dev_logging_enabled(enabled);
}

/// 配置 SAB 内存布局。
/// 必须在初始化 SAB 视图前调用，否则 Rust/TS 双侧的 Slot 偏移会失配。
#[wasm_bindgen]
pub fn configure_sab_layout(max_slots: u32) {
    if max_slots < 100 {
        crate::runtime_warn!("SAB Max Slots too small, clamping to 100");
        configure_layout(100);
    } else {
        configure_layout(max_slots);
        crate::dev_log!("Rust SAB configured with {} slots", max_slots);
    }
}

/// 从 Deflate 压缩的资源二进制初始化运行时资源。
/// 流程为：解压 -> BinaryReader 解析 -> 构建 BlockModelManager -> 尝试重建 SAB 内已有的 BlockState ID。
#[wasm_bindgen]
pub fn init_resources_binary(
    bin_data: &[u8],
) -> Result<(), JsValue> {
    // 强制清空 TLS ID 缓存，确保新 SAB 环境下的 ID 分配一致性。
    clear_id_cache();

    // 1. 解压资源数据。
    let mut decoder = ZlibDecoder::new(bin_data);
    let mut decompressed = Vec::with_capacity(bin_data.len() * 4);
    if let Err(e) = decoder.read_to_end(&mut decompressed) {
        let msg = format!("Failed to decompress binary resources: {}", e);
        return Err(JsValue::from_str(&msg));
    }

    // 2. 解析二进制容器。
    crate::dev_log!("Starting binary parsing. Size: {}", decompressed.len());
    
    let mut magic = [0u8; 4];
    if decompressed.len() >= 4 {
        magic.copy_from_slice(&decompressed[0..4]);
        crate::dev_log!("Magic: {:?} ({})", magic, String::from_utf8_lossy(&magic));
    }

    let mut reader = BinaryReader::new(&decompressed);
    let container = match reader.read_container() {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("Failed to parse binary: {}", e);
            return Err(JsValue::from_str(&msg));
        }
    };
    crate::dev_log!("Binary resource parsing completed successfully.");

    MANAGER.with(|m| {
        *m.borrow_mut() = Some(BlockModelManager::new(
            container.blocks,
            container.patterns,
            container.templates,
            container.culling_masks,
            Box::new(SabIds::new()),
        ));
    });

    let registered_upper_bound = get_sab_view_i32(|view| {
        let raw = view.get_index(REGISTRY_HEAD_INTS as u32);
        raw.max(0) as u32
    });

    let mut rehydrated = 0u32;
    MANAGER.with(|m| {
        let manager_ref = m.borrow();
        let Some(manager) = manager_ref.as_ref() else {
            return;
        };

        for id in 1..=registered_upper_bound {
            let Some(blockstate) = describe_registered_key(id) else {
                continue;
            };
            let Some((name, properties)) = parse_blockstate_input(&blockstate) else {
                continue;
            };

            let resolved_id = if properties.is_empty() {
                manager.lookup_simple_id(&name).unwrap_or_else(|| manager.get_or_create_id(&name, Vec::new()))
            } else {
                manager.get_or_create_id(&name, properties)
            };

            if resolved_id == id {
                rehydrated += 1;
            } else {
                crate::runtime_warn!(
                    "Rehydration id mismatch for {}: expected {}, got {}",
                    blockstate,
                    id,
                    resolved_id,
                );
            }
        }
    });

    crate::dev_log!(
        "Rust Manager Initialized. Rehydrated {} SAB block states (upperBound={})",
        rehydrated,
        registered_upper_bound,
    );
    Ok(())
}

/// 初始化生物群系 Colormap。
/// 输入为 RGBA8 行主序像素，WASM 侧会按原版温度/湿度逻辑进行采样。
#[wasm_bindgen]
pub fn init_colormaps(
    grass_rgba: &[u8],
    grass_width: u32,
    grass_height: u32,
    foliage_rgba: &[u8],
    foliage_width: u32,
    foliage_height: u32,
) {
    crate::domain::biome::set_grass_colormap(grass_rgba.to_vec(), grass_width, grass_height);
    crate::domain::biome::set_foliage_colormap(foliage_rgba.to_vec(), foliage_width, foliage_height);
    crate::dev_log!("Colormaps initialized (grass/foliage)");
}

/// 设置顶面流体 UV 的角度偏移（弧度）。
/// 用于在不改资源数据的前提下修正资源包的流向贴图朝向。
#[wasm_bindgen]
pub fn set_flow_uv_angle_offset(offset_rad: f32) {
    crate::config::set_flow_uv_angle_offset(offset_rad);
}

/// 获取当前顶面流体 UV 的角度偏移。
#[wasm_bindgen]
pub fn get_flow_uv_angle_offset() -> f32 {
    crate::config::get_flow_uv_angle_offset()
}

/// 设置流体相关贴图的纹理索引。
/// 这些索引来自纹理图集解析结果，供 mesher 写入运行时材质引用。
#[wasm_bindgen]
pub fn set_fluid_texture_indices(
    water_flow: u32,
    water_overlay: u32,
    water_still: u32,
    lava_flow: u32,
    lava_still: u32,
) {
    crate::config::set_fluid_texture_indices(
        water_flow,
        water_overlay,
        water_still,
        lava_flow,
        lava_still,
    );
}

/// 解析 `minecraft:block[prop=value,...]` 形式的 BlockState 字符串。
/// 返回 `(name, properties)`，其中属性键按字典序排序，便于稳定生成 ID。
fn parse_blockstate_input(input: &str) -> Option<(String, Vec<(String, String)>)> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(open) = trimmed.find('[') {
        let close = trimmed.rfind(']')?;
        if close <= open {
            return None;
        }

        let name = trimmed[..open].trim().strip_prefix("minecraft:").unwrap_or(trimmed[..open].trim()).to_string();
        let props_raw = &trimmed[open + 1..close];
        let mut properties = Vec::new();

        if !props_raw.trim().is_empty() {
          for entry in props_raw.split(',') {
              let part = entry.trim();
              if part.is_empty() {
                  continue;
              }
              let (key, value) = part.split_once('=')?;
              properties.push((key.trim().to_string(), value.trim().to_string()));
          }
        }

        properties.sort_unstable_by(|left, right| left.0.cmp(&right.0));
        return Some((name, properties));
    }

    Some((trimmed.strip_prefix("minecraft:").unwrap_or(trimmed).to_string(), Vec::new()))
}

#[wasm_bindgen]
pub fn lookup_block_state_id(blockstate: &str) -> i32 {
    let Some((name, properties)) = parse_blockstate_input(blockstate) else {
        return -1;
    };

    with_block_model_manager(-1, |manager| {
        if properties.is_empty() {
            if let Some(id) = manager.lookup_simple_id(&name) {
                return id as i32;
            }

            return manager.get_or_create_id(&name, Vec::new()) as i32;
        }

        manager.get_or_create_id(&name, properties) as i32
    })
}

#[wasm_bindgen]
pub fn describe_block_state(block_id: u32) -> String {
    if let Some(block_state) = describe_registered_key(block_id) {
        return block_state;
    }

    with_block_model_manager(String::new(), |manager| {
        let Some(props) = manager.get_properties_by_id(block_id) else {
            return String::new();
        };

        let states = manager.get_block_states_registry();
        let Some(state) = states.get(block_id as usize) else {
            return format!("minecraft:{}", props.name.as_str());
        };

        if state.is_empty() {
            return format!("minecraft:{}", props.name.as_str());
        }

        let mut entries = Vec::with_capacity(state.len());
        for (prop_id, value_id) in state {
            let key = manager.with_prop_name_str(*prop_id, |name| name.to_string());
            let value = manager.with_value_str(*value_id, |name| name.to_string());
            if key.is_empty() {
                continue;
            }
            entries.push((key, value));
        }

        entries.sort_unstable_by(|left, right| left.0.cmp(&right.0));
        let suffix = entries
            .into_iter()
            .map(|(key, value)| format!("{}={}", key, value))
            .collect::<Vec<_>>()
            .join(",");

        format!("minecraft:{}[{}]", props.name.as_str(), suffix)
    })
}

#[wasm_bindgen]
pub fn describe_block_state_from_registry(block_id: u32) -> String {
    describe_registered_key(block_id).unwrap_or_default()
}

#[wasm_bindgen]
pub fn get_block_state_flags(block_id: u32) -> u32 {
    with_block_model_manager(0, |manager| {
        let Some(props) = manager.get_properties_by_id(block_id) else {
            return 0;
        };

        let mut flags = 0u32;
        if props.is_full_cube {
            flags |= BLOCK_FLAG_FULL_CUBE;
        }
        if props.is_opaque_full_cube {
            flags |= BLOCK_FLAG_OPAQUE_FULL_CUBE;
        }
        if props.is_water_filled {
            flags |= BLOCK_FLAG_WATER_FILLED;
        }
        if props.is_lava {
            flags |= BLOCK_FLAG_LAVA;
        }
        if props.is_decal {
            flags |= BLOCK_FLAG_DECAL;
        }
        if props.render_layer == crate::domain::block::registry::LAYER_SOLID {
            flags |= BLOCK_FLAG_SOLID_RENDER_LAYER;
        }
        if props.render_layer == crate::domain::block::registry::LAYER_TRANSLUCENT {
            flags |= BLOCK_FLAG_TRANSLUCENT_RENDER_LAYER;
        }
        if props.has_variants {
            flags |= BLOCK_FLAG_VARIANTS;
        }

        flags
    })
}
