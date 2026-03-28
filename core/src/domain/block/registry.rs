//! # 方块模型注册表 (Block Registry)
//!
//! ## 职责 (Responsibility)
//! 集中管理所有方块的属性、模型、纹理映射和 ID 分配。作为渲染核心的"数据库"。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: 解析后的 Schema 数据（Blocks, Models, Textures）。
//! - 输出:统一的 `BlockId`，查询接口（`get_model`, `get_properties`）。
//!
//! ## MC 机制 (MC Mechanism)
//! - Flattening: 将 (Name + Properties) 映射为唯一的整数 ID。
//! - Transparency: 管理 Block 是否透明、是否发光等渲染属性。

use crate::domain::block::ids::IdSource;
use crate::domain::block::model::BlockModel;
use crate::domain::block::flags::{compute_block_key_id, compute_model_flags};
use crate::domain::block::def::*;
use rustc_hash::FxHashMap;
use std::cell::{RefCell, UnsafeCell};
use std::rc::Rc;

pub type PropId = u16;
pub type ValId = u16;
pub type CompactBlockState = Vec<(PropId, ValId)>;

// Culling Mask 常量
pub const FACE_UP: i32 = 1 << 0;
pub const FACE_DOWN: i32 = 1 << 1;
pub const FACE_NORTH: i32 = 1 << 2;
pub const FACE_SOUTH: i32 = 1 << 3;
pub const FACE_WEST: i32 = 1 << 4;
pub const FACE_EAST: i32 = 1 << 5;

// Render Layer 常量
pub const LAYER_SOLID: u8 = 0;
pub const LAYER_CUTOUT: u8 = 1;
pub const LAYER_CUTOUT_MIPPED: u8 = 2;
pub const LAYER_TRANSLUCENT: u8 = 3;

pub type BlockId = u32;

#[inline]
fn classify_translucent_material(key: &str) -> u8 {
    let name = key.split(':').last().unwrap_or(key);
    if name.contains("stained_glass") {
        2
    } else if name.contains("glass") {
        1
    } else if name.contains("ice") {
        3
    } else if name.contains("water") {
        0
    } else if name.contains("slime") {
        6
    } else if name.contains("honey") {
        7
    } else {
        0
    }
}

#[derive(Clone, Debug)]
pub struct CachedBlockProperties {
    pub render_layer: u8,
    pub cull_mask: i32,
    pub masks: [u64; 6],
    pub masks16: Option<[u64; 24]>,
    pub mask_res: u8,
    pub is_air: bool,
    pub block_key_id: u32,
    pub emissive_intensity: f32,
    pub emissive_color: [f32; 3],
    pub light_intensity: f32,
    pub light_color: [f32; 3],
    pub light_radius: f32,
    pub translucent_material_id: u8,
    pub has_variants: bool,
    pub name: Rc<String>,
    pub is_full_cube: bool,
    pub has_overlay_elements: bool,
    pub is_lab_pbr: bool,
    pub is_state_dependent_light: bool,
    // Optimization flags
    pub is_water_filled: bool,
    pub is_lava: bool,
    pub is_water_cauldron: bool,
    pub is_lava_cauldron: bool,
    /// Whether the block's texture should be randomly rotated/flipped in the shader.
    /// Used to allow greedy merging of "noisy" blocks like Stone/Bedrock/Grass.
    pub is_random_texture: bool,
    /// Whether the block is a full opaque cube that blocks light/vision completely.
    /// Used for AO and culling optimization.
    pub is_opaque_full_cube: bool,
    /// Whether this block should be rendered in the specialized "decal/cutout" pass.
    /// Includes blocks with complex geometry that shouldn't be greedy meshed and may need polygon offset.
    pub is_decal: bool,
}

/// Block Model 管理器。
pub struct BlockModelManager {
    pub(crate) blocks: BlocksJson,
    pub(crate) patterns: PatternsJson,
    pub(crate) templates: TemplatesJson,
    /// 纹理名称到索引的映射 (使用 FxHashMap 提升性能)
    pub(crate) culling_masks: FxHashMap<String, i32>,

    /// 简单查找表：Name -> BlockId (无属性方块)
    pub(crate) simple_lookup: RefCell<FxHashMap<String, BlockId>>,
    /// 复杂查找表：Name -> (SortedProps -> BlockId)
    /// # Optimization
    /// 使用两级 Map 避免构造 Tuple Key，减少 clone。
    pub(crate) complex_lookup: RefCell<FxHashMap<String, FxHashMap<Vec<(String, String)>, BlockId>>>,
    
    /// ID -> Model (基础模型或 None)
    pub(crate) models: RefCell<Vec<Option<Rc<BlockModel>>>>,
    /// ID -> Properties
    /// # Optimization
    /// 使用 UnsafeCell 避免 RefCell 开销。Meshing 阶段保证只读。
    pub(crate) properties_registry: UnsafeCell<Vec<CachedBlockProperties>>,
    /// ID -> Original Properties Map
    pub(crate) block_states_registry: RefCell<Vec<CompactBlockState>>,
    pub(crate) id_source: Box<dyn IdSource>,

    /// Intern tables for fast property matching.
    pub(crate) prop_name_to_id: RefCell<FxHashMap<String, PropId>>,
    pub(crate) id_to_prop_name: RefCell<Vec<String>>,
    pub(crate) value_to_id: RefCell<FxHashMap<String, ValId>>,
    pub(crate) id_to_value: RefCell<Vec<String>>,

    pub(crate) empty_value_id: ValId,
    pub(crate) false_value_id: ValId,
    pub(crate) true_value_id: ValId,
}

impl BlockModelManager {
    /// 创建新的管理器实例。
    pub fn new(
        blocks: BlocksJson,
        patterns: PatternsJson,
        templates: TemplatesJson,
        culling_masks: FxHashMap<String, i32>,
        id_source: Box<dyn IdSource>,
    ) -> Self {
        let mut instance = Self {
            blocks,
            patterns,
            templates,
            culling_masks,
            simple_lookup: RefCell::new(FxHashMap::default()),
            complex_lookup: RefCell::new(FxHashMap::default()),
            models: RefCell::new(Vec::new()),
            properties_registry: UnsafeCell::new(Vec::new()),
            block_states_registry: RefCell::new(Vec::new()),
            id_source,

            prop_name_to_id: RefCell::new(FxHashMap::default()),
            id_to_prop_name: RefCell::new(Vec::new()),
            value_to_id: RefCell::new(FxHashMap::default()),
            id_to_value: RefCell::new(Vec::new()),

            empty_value_id: 0,
            false_value_id: 0,
            true_value_id: 0,
        };

        // Seed common values so missing-prop defaults are allocation-free.
        instance.empty_value_id = instance.intern_value("");
        instance.false_value_id = instance.intern_value("false");
        instance.true_value_id = instance.intern_value("true");

        // Pre-intern pattern keys/values so runtime matching stays read-only.
        instance.preintern_patterns();

        // 优化：不再预注册所有方块。
        // 这会显著降低初始化耗时（从数秒减至几乎瞬间）。
        // 方块将在首次被 chunk 解析遇到时按需注册。
        // 由于使用了全局 SAB 注册表，ID 稳定性由 Key 保证。

        instance
    }

    #[inline]
    pub(crate) fn lookup_prop_id(&self, name: &str) -> Option<PropId> {
        self.prop_name_to_id.borrow().get(name).copied()
    }

    #[inline]
    pub(crate) fn lookup_value_id(&self, value: &str) -> Option<ValId> {
        self.value_to_id.borrow().get(value).copied()
    }

    #[inline]
    pub(crate) fn with_value_str<R>(&self, id: ValId, f: impl FnOnce(&str) -> R) -> R {
        let values = self.id_to_value.borrow();
        let s = values.get(id as usize).map(|v| v.as_str()).unwrap_or("");
        f(s)
    }

    #[inline]
    pub(crate) fn with_prop_name_str<R>(&self, id: PropId, f: impl FnOnce(&str) -> R) -> R {
        let names = self.id_to_prop_name.borrow();
        let s = names.get(id as usize).map(|v| v.as_str()).unwrap_or("");
        f(s)
    }

    #[inline]
    pub(crate) fn empty_value_id(&self) -> ValId { self.empty_value_id }
    #[inline]
    pub(crate) fn false_value_id(&self) -> ValId { self.false_value_id }
    #[inline]
    pub(crate) fn true_value_id(&self) -> ValId { self.true_value_id }

    fn intern_prop_name(&self, name: &str) -> PropId {
        if let Some(id) = self.prop_name_to_id.borrow().get(name).copied() {
            return id;
        }
        let mut map = self.prop_name_to_id.borrow_mut();
        if let Some(id) = map.get(name).copied() {
            return id;
        }
        let mut id_to = self.id_to_prop_name.borrow_mut();
        let id = id_to.len() as PropId;
        id_to.push(name.to_string());
        map.insert(name.to_string(), id);
        id
    }

    fn intern_value(&self, value: &str) -> ValId {
        if let Some(id) = self.value_to_id.borrow().get(value).copied() {
            return id;
        }
        let mut map = self.value_to_id.borrow_mut();
        if let Some(id) = map.get(value).copied() {
            return id;
        }
        let mut id_to = self.id_to_value.borrow_mut();
        let id = id_to.len() as ValId;
        id_to.push(value.to_string());
        map.insert(value.to_string(), id);
        id
    }

    fn preintern_condition(&self, cond: &crate::domain::block::def::Condition) {
        use crate::domain::block::def::{Condition, ConditionOrList, ConditionValue};
        match cond {
            Condition::Map(map) => {
                for (key, val) in map {
                    if key != "OR" && key != "NOT" {
                        self.intern_prop_name(key);
                    }
                    match val {
                        ConditionOrList::Value(v) => {
                            if let ConditionValue::String(s) = v {
                                if s.contains('|') {
                                    for opt in s.split('|') {
                                        self.intern_value(opt);
                                    }
                                } else {
                                    self.intern_value(s);
                                }
                            }
                        }
                        ConditionOrList::List(list) => {
                            for c in list {
                                self.preintern_condition(c);
                            }
                        }
                    }
                }
            }
        }
    }

    fn preintern_patterns(&self) {
        use crate::domain::block::def::ConditionValue;
        for (_pid, pattern) in &self.patterns {
            if let Some(props) = &pattern.properties {
                for p in props {
                    self.intern_prop_name(p);
                }
            }
            for rule in &pattern.rules {
                if let Some(values) = &rule.values {
                    for v in values {
                        if let ConditionValue::String(s) = v {
                            if s.contains('|') {
                                for opt in s.split('|') {
                                    self.intern_value(opt);
                                }
                            } else {
                                self.intern_value(s);
                            }
                        }
                    }
                }
                if let Some(when) = &rule.when {
                    self.preintern_condition(when);
                }
            }
        }
    }

    /// 获取属性注册表的只读引用（不安全）。
    /// # Safety
    /// 调用者需保证无并发写入。
    pub fn get_properties_registry_unsafe(&self) -> &Vec<CachedBlockProperties> {
        unsafe { &*self.properties_registry.get() }
    }

    /// 获取 BlockStates 注册表的只读引用（绕过 RefCell 检查，仅供内部使用）
    /// 注意：调用此方法时必须确保没有其他地方在进行可变借用（即没有在注册新方块）。
    /// 在 meshing 阶段，这是安全的，因为 meshing 时不会注册新方块。
    pub fn get_block_states_registry(&self) -> std::cell::Ref<'_, Vec<CompactBlockState>> {
        self.block_states_registry.borrow()
    }

    /// 获取或创建 BlockState 的全局 ID。
    /// 这是连接 MCA 解析和渲染的核心方法。
    pub fn get_or_create_id(&self, name: &str, properties: Vec<(String, String)>) -> BlockId {
        let key_str = name.strip_prefix("minecraft:").unwrap_or(name);
        
        // 1. 快速路径：无属性方块 (Air, Stone, Dirt 等)
        if properties.is_empty() {
            let lookup = self.simple_lookup.borrow();
            if let Some(&id) = lookup.get(key_str) {
                return id;
            }
        }

        // 2. 复杂路径：有属性方块 或 新方块
        // 优化：使用两级查找，避免 clone key 和 move properties
        {
            let lookup = self.complex_lookup.borrow();
            if let Some(inner) = lookup.get(key_str) {
                if let Some(&id) = inner.get(&properties) {
                    return id;
                }
            }
        }
        
        // 未找到，注册新方块
        self.register_new_block(key_str.to_string(), properties)
    }

    /// Fast lookup for a simple (no-properties) block id.
    ///
    /// Returns `None` if the block was not registered during registry build.
    /// This method never registers new blocks and does not allocate.
    pub fn lookup_simple_id(&self, name: &str) -> Option<BlockId> {
        let key_str = name.strip_prefix("minecraft:").unwrap_or(name);
        self.simple_lookup.borrow().get(key_str).copied()
    }

    fn register_new_block(&self, key: String, properties: Vec<(String, String)>) -> BlockId {
        // Compact interned state for fast matching in the hot path.
        let mut compact: CompactBlockState = Vec::with_capacity(properties.len());
        for (k, v) in &properties {
            let pid = self.intern_prop_name(k);
            let vid = self.intern_value(v);
            compact.push((pid, vid));
        }
        compact.sort_unstable_by_key(|(k, _)| *k);
        let block_def = self.blocks.get(&key);
        
        let has_variants = self.has_variants(&key);
        let render_layer = block_def.map(|d| d.get_render_layer()).unwrap_or(LAYER_SOLID);
        let is_air = key == "air" || key == "cave_air" || key == "void_air";
        
        let (mut emissive_intensity, mut emissive_color, mut light_intensity, mut light_color, light_radius, is_lab_pbr, is_state_dependent_light) = if let Some(d) = block_def {
            let color = d.emission_color.unwrap_or([255, 255, 255]);
            let base_intensity = d.get_emission_intensity();
            let base_color = [
                color[0] as f32 / 255.0,
                color[1] as f32 / 255.0,
                color[2] as f32 / 255.0,
            ];
            let lab_pbr = d.is_lab_pbr();
            (
                if lab_pbr { 0.0 } else { base_intensity },
                base_color,
                base_intensity,
                base_color,
                d.get_emission_radius(),
                lab_pbr,
                d.is_state_dependent_light(),
            )
        } else {
            (0.0, [1.0, 1.0, 1.0], 0.0, [1.0, 1.0, 1.0], 0.0, false, false)
        };

        // Determine if this block is a "noisy" block suitable for random shader rotation.
        let safe_key_str = key.as_str();
        let simple_key = safe_key_str.split(':').last().unwrap_or(safe_key_str);
        
        let is_random_text = matches!(
            simple_key,
            "grass_block" | "dirt" | "coarse_dirt" | "podzol" | "stone" | "bedrock" | "sand" | "red_sand" |
            "netherrack" | "end_stone" | "granite" | "diorite" | "andesite" |
            "tuff" | "deepslate" | "calcite" | "gravel" | "mycelium" |
            "rooted_dirt" | "mud" | "packed_mud" | "moss_block" | "clay"
        );
        
        // Random Type Classification
        // 10: Rotated Random (Sand, Grass) - Uses 0, 90, 180, 270 deg rotation.
        // 11: Mirrored Random (Stone, Bedrock) - Uses 0, 180 deg + Mirroring.
        let random_type_id = if is_random_text {
            match simple_key {
               "grass_block" | "dirt" | "coarse_dirt" | "podzol" | "sand" | "red_sand" | "mycelium" |
               "rooted_dirt" | "moss_block" | "clay" => 10,
               
               "stone" | "bedrock" | "deepslate" | "granite" | "diorite" | "andesite" |
               "tuff" | "calcite" | "netherrack" | "end_stone" | "gravel" |
               "mud" | "packed_mud" => 11,
               
               _ => 10, // Default to rotated
            }
        } else {
            0
        };

        let model = if !has_variants || is_random_text {
            // Force compute model for random text blocks even if they have variants,
            // so greedy meshing can access geometry/texture info.
            self.compute_model(&key, &compact, 0, 0, 0).map(Rc::new)
        } else {
            None
        };

        let temp_model = if let Some(m) = &model {
            Some(m.clone())
        } else if has_variants {
            self.compute_model(&key, &compact, 0, 0, 0).map(Rc::new)
        } else {
            None
        };

        let cull_mask = if let Some(m) = &temp_model {
            self.compute_cull_mask(m)
        } else {
            self.get_cull_mask(&key)
        };

        let masks = if let Some(m) = &temp_model {
            m.masks
        } else {
            [0; 6]
        };

        let full_key = if properties.is_empty() {
             key.clone()
        } else {
             let mut s = String::with_capacity(key.len() + 32);
             s.push_str(&key);
             s.push('[');
             for (i, (k, v)) in properties.iter().enumerate() {
                 if i > 0 { s.push(','); }
                 s.push_str(k);
                 s.push('=');
                 s.push_str(v);
             }
             s.push(']');
             s
        };
        
        let id = self.id_source.id(&full_key);
        if id == u32::MAX {
            return id;
        }
        let global_id = id as usize;

        let mut models = self.models.borrow_mut();
        let props_reg = unsafe { &mut *self.properties_registry.get() };
        let mut states_reg = self.block_states_registry.borrow_mut();

        if global_id >= models.len() {
             let new_len = global_id + 1;
                 models.resize(new_len, None);
                 props_reg.resize_with(new_len, || CachedBlockProperties {
                     render_layer: LAYER_SOLID,
                     cull_mask: 0,
                     masks: [0; 6],
                    masks16: None,
                    mask_res: 0,
                     is_air: true,
                     block_key_id: 0,
                     is_opaque_full_cube: false,
                     emissive_intensity: 0.0,
                     emissive_color: [0.0; 3],
                     light_intensity: 0.0,
                     light_color: [0.0; 3],
                     light_radius: 0.0,
                     translucent_material_id: 0,
                     has_variants: false,
                     name: Rc::new("unknown".to_string()),
                     is_full_cube: false,
                     has_overlay_elements: false,
                     is_lab_pbr: false,
                     is_state_dependent_light: false,
                     is_water_filled: false,
                     is_lava: false,
                     is_water_cauldron: false,
                     is_lava_cauldron: false,
                     is_random_texture: false,
                     is_decal: false,
                 });
               states_reg.resize_with(new_len, || Vec::new());
        }

        models[global_id] = model;
        let is_waterlogged = properties.iter().any(|(k, v)| k == "waterlogged" && v == "true");
        let safe_key = key.as_str();
        let is_inherently_water = matches!(safe_key, "seagrass" | "tall_seagrass" | "kelp" | "kelp_plant" | "bubble_column");
        let block_key_id = compute_block_key_id(&key);
        let flags = compute_model_flags(temp_model.as_deref());
        
        if is_state_dependent_light {
            if let Some(m) = &temp_model {
                if let Some(e) = m.emission {
                    let intensity = std::cmp::min(15, e[3]) as f32 / 15.0;
                    let color = [
                        e[0] as f32 / 255.0,
                        e[1] as f32 / 255.0,
                        e[2] as f32 / 255.0,
                    ];
                    light_intensity = intensity;
                    light_color = color;
                    if !is_lab_pbr {
                        emissive_intensity = intensity;
                        emissive_color = color;
                    }
                } else {
                    light_intensity = 0.0;
                    if !is_lab_pbr {
                        emissive_intensity = 0.0;
                    }
                }
            } else {
                light_intensity = 0.0;
                if !is_lab_pbr {
                    emissive_intensity = 0.0;
                }
            }
        }

        props_reg[global_id] = CachedBlockProperties {
            render_layer,
            cull_mask,
            masks,
            masks16: temp_model.as_ref().and_then(|m| m.masks16.clone()),
            mask_res: temp_model.as_ref().map(|m| m.mask_res).unwrap_or(0),
            is_air,
            block_key_id,
            emissive_intensity,
            emissive_color,
            light_intensity,
            light_color,
            light_radius,
            translucent_material_id: if random_type_id > 0 {
                // Priority: If it's a random texture block (Grass, Stone, etc.), 
                // force its ID to enable shader-based rotation/merging.
                random_type_id
            } else if render_layer == LAYER_TRANSLUCENT {
                classify_translucent_material(&key)
            } else {
                0
            },
            has_variants,
            name: Rc::new(key.clone()),
            is_full_cube: flags.is_full_cube,
            has_overlay_elements: flags.has_overlay_elements,
            is_lab_pbr,
            is_state_dependent_light,
            is_water_filled: safe_key == "water" || is_waterlogged || is_inherently_water,
            is_lava: safe_key == "lava",
            is_water_cauldron: safe_key == "water_cauldron",
            is_lava_cauldron: safe_key == "lava_cauldron",
            is_random_texture: is_random_text,
            is_opaque_full_cube: flags.is_full_cube && render_layer == LAYER_SOLID,
            is_decal: block_def.map(|d| d.is_decal()).unwrap_or(false),
        };
        states_reg[global_id] = compact;
        
        if properties.is_empty() {
            self.simple_lookup.borrow_mut().insert(key, id);
        } else {
            self.complex_lookup
                .borrow_mut()
                .entry(key)
                .or_default()
                .insert(properties, id);
        }

        id
    }

    pub fn get_model_by_id(&self, id: BlockId) -> Option<Rc<BlockModel>> {
        self.models.borrow().get(id as usize).and_then(|m| m.clone())
    }

    pub fn get_model_dynamic(&self, id: BlockId, x: i32, y: i32, z: i32) -> Option<Rc<BlockModel>> {
        let props = self.get_properties_by_id(id)?;
        if !props.has_variants {
            return self.get_model_by_id(id);
        }
        
        let states = self.block_states_registry.borrow();
        let properties = states.get(id as usize)?;
        
        self.compute_model(&props.name, properties, x, y, z).map(Rc::new)
    }

    pub fn get_properties_by_id(&self, id: BlockId) -> Option<&CachedBlockProperties> {
        unsafe { (&*self.properties_registry.get()).get(id as usize) }
    }

    pub fn get_tint(&self, id: BlockId, tint_index: i32, biome_id: crate::domain::biome::BiomeId) -> [f32; 3] {
        if tint_index == -1 {
            return [1.0, 1.0, 1.0];
        }
        
        let props = match self.get_properties_by_id(id) {
            Some(p) => p,
            None => return [1.0, 1.0, 1.0],
        };
        
        let name = props.name.as_str();

        #[inline]
        fn find_value_id(state: &CompactBlockState, key_id: PropId) -> Option<ValId> {
            for (k, v) in state {
                if *k == key_id {
                    return Some(*v);
                }
            }
            None
        }
        
        if name == "redstone_wire" {
            let states = self.block_states_registry.borrow();
            if let Some(state) = states.get(id as usize) {
                let power = self.lookup_prop_id("power")
                    .and_then(|pid| find_value_id(state, pid))
                    .and_then(|vid| self.with_value_str(vid, |s| s.parse::<f32>().ok()))
                    .unwrap_or(0.0);
                let f = (power / 15.0).clamp(0.0, 1.0);
                let mut r = f * 0.8 + 0.2;
                if power == 0.0 { r = 0.2; }
                return [r as f32, 0.0, 0.0];
            }
        }
        
        if name == "pumpkin_stem" || name == "melon_stem" {
            let states = self.block_states_registry.borrow();
            if let Some(state) = states.get(id as usize) {
                let age = self.lookup_prop_id("age")
                    .and_then(|pid| find_value_id(state, pid))
                    .and_then(|vid| self.with_value_str(vid, |s| s.parse::<f32>().ok()))
                    .unwrap_or(0.0);
                return [age * 32.0 / 255.0, (255.0 - age * 8.0) / 255.0, age * 4.0 / 255.0];
            }
        }

        if name == "spruce_leaves" { return [0.38, 0.6, 0.38]; }
        if name == "birch_leaves" { return [0.5, 0.65, 0.33]; }
        if name == "lily_pad" { return [0.13, 0.55, 0.13]; }

        // Vanilla-style biome tinting via colormaps.
        // Note: tint_index is only a "tinted" flag; the actual colormap depends on block family.
        let biome = crate::domain::biome::get_biome_climate(biome_id);

        if name.contains("leaves") || name.contains("vine") {
            if let Some(rgb) = biome.fixed_foliage_rgb {
                return [
                    (rgb[0] as f32 / 255.0).powi(2),
                    (rgb[1] as f32 / 255.0).powi(2),
                    (rgb[2] as f32 / 255.0).powi(2),
                ];
            }
            if let Some(c) = crate::domain::biome::sample_foliage(biome.temperature, biome.downfall) {
                return c;
            }
            return [0.57, 0.74, 0.35];
        }

        if name.contains("grass") || name.contains("fern") || name == "sugar_cane" || name == "tall_grass" || name == "short_grass" {
            if let Some(rgb) = biome.fixed_grass_rgb {
                return [
                    (rgb[0] as f32 / 255.0).powi(2),
                    (rgb[1] as f32 / 255.0).powi(2),
                    (rgb[2] as f32 / 255.0).powi(2),
                ];
            }
            if let Some(c) = crate::domain::biome::sample_grass(biome.temperature, biome.downfall) {
                return c;
            }
            return [0.57, 0.74, 0.35];
        }

        if name == "water" {
            let water_color = biome.water_color;
            let r = ((water_color >> 16) & 0xFF) as f32 / 255.0;
            let g = ((water_color >> 8) & 0xFF) as f32 / 255.0;
            let b = (water_color & 0xFF) as f32 / 255.0;
            // Linearize
            return [r * r, g * g, b * b];
        }
        
        [1.0, 1.0, 1.0]
    }

    pub fn get_cull_mask(&self, name: &str) -> i32 {
        *self.culling_masks.get(name).unwrap_or(&0)
    }

    pub fn has_variants(&self, name: &str) -> bool {
        let key = name.strip_prefix("minecraft:").unwrap_or(name);
        if let Some(block_def) = self.blocks.get(key) {
            if let Some(pattern) = self.patterns.get(&block_def.pattern) {
                for rule in &pattern.rules {
                    if rule.apply.len() > 1 {
                        return true;
                    }
                }
            }
        }
        false
    }
}
