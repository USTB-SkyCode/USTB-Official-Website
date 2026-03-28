// 渲染层手动兜底（从 Rust 迁移）
// 当纹理扫描无法判断或需强制覆盖时使用
export const RENDER_LAYER_OVERRIDES: Array<{ key: string; mode: 'exact' | 'contains'; layer: 'solid' | 'cutout' | 'cutout_mipped' | 'translucent' }> = [
    // --- Exact-name overrides (avoid collateral damage like water_cauldron) ---
    { key: 'water', mode: 'exact', layer: 'translucent' },
    { key: 'lava', mode: 'exact', layer: 'solid' },
    { key: 'bubble_column', mode: 'exact', layer: 'translucent' },
    { key: 'slime_block', mode: 'exact', layer: 'translucent' },
    { key: 'honey_block', mode: 'exact', layer: 'translucent' },

    // --- Family overrides ---
    // Glass/ice families are broadly translucent.
    { key: 'glass', mode: 'contains', layer: 'translucent' },
    { key: 'ice', mode: 'contains', layer: 'translucent' },

    // Cauldrons: the block body should stay solid.
    // Water/Lava content must be split at runtime (Rust), build script can't do it.
    { key: 'cauldron', mode: 'contains', layer: 'solid' },

    // Respawn Anchor: uses nether portal texture but renders opaque
    { key: 'respawn_anchor', mode: 'contains', layer: 'solid' },

    { key:'beacon', mode: 'contains', layer: 'solid' }
];

export const DEFAULT_WARM_COLOR: [number, number, number] = [1.0, 0.9, 0.8];

// 以下方块即便检测到 LabPBR 也强制使用原版发光逻辑
// 处理 Rust 网格生成器 is_lab_pbr=true 时顶点发光被清零的问题
export const FORCE_VANILLA_EMISSION = [
    'sea_lantern',
    'fire',
    'soul_fire',
    'lava',
    'glowstone',
    'magma_block',
    'shroomlight',
    'froglight',
    'beacon',
    'ochre_froglight',
    'verdant_froglight',
    'pearlescent_froglight',
    'torch',
    'lantern',
    'campfire',
    'redstone_block',
    'redstone_lamp',
    'copper_bulb'
];

export const CUTOUT_MIPPED_BLOCKS = [
    'leaves', // 匹配所有树叶
    'spawner',
    'vault',
    'trial_spawner',
    'iron_bars',
    'chain',
    'cobweb'
];
