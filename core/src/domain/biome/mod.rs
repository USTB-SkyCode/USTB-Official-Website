//! # 生物群系运行时注册表 (Biome Runtime)
//!
//! ## 职责
//! 维护 biome 名称到 `BiomeId` 的稳定映射，并提供温度、湿度、固定草色/树叶色与水色查询。
//!
//! ## 运行机制
//! 使用 `thread_local!` 保存注册表，保证 WASM 单线程环境下的低成本访问。

use std::cell::RefCell;
use std::collections::HashMap;

pub type BiomeId = u16;

/// 单个生物群系的气候与颜色描述。
#[derive(Clone, Copy, Debug)]
pub struct BiomeClimate {
    pub temperature: f32,
    pub downfall: f32,
    pub fixed_grass_rgb: Option<[u8; 3]>,
    pub fixed_foliage_rgb: Option<[u8; 3]>,
    pub water_color: u32,
}

#[derive(Debug, Default)]
struct BiomeRegistry {
    name_to_id: HashMap<String, BiomeId>,
    climates: Vec<BiomeClimate>,
}

impl BiomeRegistry {
    fn new() -> Self {
        let mut reg = Self::default();
        // 先注册 plains，保证默认 biome id 稳定。
        let _ = reg.get_or_create("minecraft:plains");
        reg
    }

    fn get_or_create(&mut self, name: &str) -> BiomeId {
        if let Some(&id) = self.name_to_id.get(name) {
            return id;
        }

        let id = self.climates.len().min(BiomeId::MAX as usize) as BiomeId;
        self.name_to_id.insert(name.to_string(), id);
        self.climates.push(climate_for_name(name));
        id
    }

    fn climate(&self, id: BiomeId) -> BiomeClimate {
        self.climates
            .get(id as usize)
            .copied()
            .unwrap_or_else(|| climate_for_name("minecraft:plains"))
    }
}

thread_local! {
    static BIOME_REGISTRY: RefCell<BiomeRegistry> = RefCell::new(BiomeRegistry::new());
}

pub fn get_default_biome_id() -> BiomeId {
    get_or_create_biome_id("minecraft:plains")
}

pub fn get_or_create_biome_id(name: &str) -> BiomeId {
    BIOME_REGISTRY.with(|cell| cell.borrow_mut().get_or_create(name))
}

pub fn get_biome_climate(id: BiomeId) -> BiomeClimate {
    BIOME_REGISTRY.with(|cell| cell.borrow().climate(id))
}

fn climate_for_name(name: &str) -> BiomeClimate {
    // 这些值用于驱动接近原版的 colormap 采样。
    // swamp 等特例在原版中使用固定颜色修饰。
    
    // 默认水色（forest/plain 近似）：0x3F76E4
    let default_water = 0x3F76E4;

    match name {
        "minecraft:desert" => BiomeClimate {
            temperature: 2.0,
            downfall: 0.0,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x3F76E4,
        },
        "minecraft:savanna" => BiomeClimate {
            temperature: 2.0,
            downfall: 0.0,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x3F76E4,
        },
        "minecraft:snowy_plains" | "minecraft:snowy_taiga" | "minecraft:ice_spikes" => BiomeClimate {
            temperature: 0.0,
            downfall: 0.5,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x3D57D6,
        },
        "minecraft:jungle" | "minecraft:sparse_jungle" => BiomeClimate {
            temperature: 0.95,
            downfall: 0.9,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x3F76E4,
        },
        "minecraft:swamp" | "minecraft:mangrove_swamp" => BiomeClimate {
            temperature: 0.8,
            downfall: 0.9,
            // Vanilla swamp uses fixed (non-colormap) modifiers.
            fixed_grass_rgb: Some([0x6A, 0x70, 0x39]),
            fixed_foliage_rgb: Some([0x6A, 0x70, 0x39]),
            water_color: 0x617B64,
        },
        "minecraft:warm_ocean" => BiomeClimate {
            temperature: 0.5,
            downfall: 0.5,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x43D5EE,
        },
         "minecraft:lukewarm_ocean" => BiomeClimate {
            temperature: 0.5,
            downfall: 0.5,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x45AD62,
        },
        "minecraft:cold_ocean" => BiomeClimate {
            temperature: 0.5,
            downfall: 0.5,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x3D57D6,
        },
        "minecraft:frozen_ocean" => BiomeClimate {
            temperature: 0.0,
            downfall: 0.5,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: 0x3938C9,
        },
        _ => BiomeClimate {
            temperature: 0.8,
            downfall: 0.4,
            fixed_grass_rgb: None,
            fixed_foliage_rgb: None,
            water_color: default_water,
        },
    }
}

// -------------------------------
// Colormap textures (grass/foliage)
// -------------------------------

#[derive(Clone, Debug)]
struct ColorMap {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

thread_local! {
    static GRASS_COLORMAP: RefCell<Option<ColorMap>> = RefCell::new(None);
    static FOLIAGE_COLORMAP: RefCell<Option<ColorMap>> = RefCell::new(None);
}

pub fn set_grass_colormap(rgba: Vec<u8>, width: u32, height: u32) {
    GRASS_COLORMAP.with(|c| {
        *c.borrow_mut() = Some(ColorMap { width, height, rgba });
    });
}

pub fn set_foliage_colormap(rgba: Vec<u8>, width: u32, height: u32) {
    FOLIAGE_COLORMAP.with(|c| {
        *c.borrow_mut() = Some(ColorMap { width, height, rgba });
    });
}

fn sample_colormap(map: &ColorMap, temperature: f32, downfall: f32) -> [f32; 3] {
    // Vanilla uses humidity = downfall * temperature.
    let t = temperature.clamp(0.0, 1.0);
    let h = (downfall.clamp(0.0, 1.0) * t).clamp(0.0, 1.0);

    let w = map.width.max(1);
    let hgt = map.height.max(1);

    let x = ((1.0 - t) * (w - 1) as f32).round() as u32;
    let y = ((1.0 - h) * (hgt - 1) as f32).round() as u32;

    let idx = ((y * w + x) * 4) as usize;
    if idx + 2 >= map.rgba.len() {
        return [1.0, 1.0, 1.0];
    }

    // Match renderer behavior: textures are linearized via squaring.
    let sr = map.rgba[idx] as f32 / 255.0;
    let sg = map.rgba[idx + 1] as f32 / 255.0;
    let sb = map.rgba[idx + 2] as f32 / 255.0;
    [sr * sr, sg * sg, sb * sb]
}

pub fn sample_grass(temperature: f32, downfall: f32) -> Option<[f32; 3]> {
    GRASS_COLORMAP.with(|cell| cell.borrow().as_ref().map(|m| sample_colormap(m, temperature, downfall)))
}

pub fn sample_foliage(temperature: f32, downfall: f32) -> Option<[f32; 3]> {
    FOLIAGE_COLORMAP.with(|cell| cell.borrow().as_ref().map(|m| sample_colormap(m, temperature, downfall)))
}
