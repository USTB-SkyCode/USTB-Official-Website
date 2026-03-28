//! 缓存版网格生成服务
//! 职责：处理缓存逻辑、NBT 解析与网格生成流程。

use crate::io::anvil::chunk::{decompress_and_parse, ChunkData};
use crate::mesher::mesh_chunk_with_neighbors;
use crate::domain::resolve::{BiomeGlobal, ResolveMap};
use crate::runtime::state::{MANAGER, CHUNK_CACHE};
use crate::mesher::service::MeshResult;


/// 缓存区块数据
pub fn process_cache_chunk(cx: i32, cz: i32, data: &[u8]) -> bool {
    if !MANAGER.with(|m| m.borrow().is_some()) {
        crate::dev_warn!("cache_chunk called before resources initialized; skipping");
        return false;
    }

    if data.len() < 2 {
        return false;
    }

    let compression = data[0];
    let payload = &data[1..];

    let parsed = MANAGER.with(|mgr_opt| {
        let mgr_ref = mgr_opt.borrow();
        let mgr = match &*mgr_ref {
            Some(m) => m,
            None => return Err("Manager not initialized".to_string()),
        };
        let resolver = ResolveMap::new(mgr);
        let biome = BiomeGlobal;
        decompress_and_parse(compression, payload, &resolver, &biome)
    });

    match parsed {
        Ok(chunk) => {
            CHUNK_CACHE.with(|cache| {
                cache.borrow_mut().insert(cx, cz, chunk);
            });
            true
        }
        Err(_) => false,
    }
}

/// 检查区块是否已缓存
pub fn check_chunk_cached(cx: i32, cz: i32) -> bool {
    CHUNK_CACHE.with(|cache| cache.borrow().contains(cx, cz))
}

/// 使用缓存生成网格
pub fn process_mesh_cached(
    cx: i32,
    cz: i32,
    center_data: Option<Vec<u8>>,
    neighbor_coords: &[i32],
) -> Result<MeshResult, String> {
    // 0. 检查资源初始化
    let manager_initialized = MANAGER.with(|m| m.borrow().is_some());
    if !manager_initialized {
        return Err("Manager not initialized".to_string());
    }

    // 验证邻居坐标数组长度
    if neighbor_coords.len() != 16 {
        return Err("neighbor_coords must have 16 elements".to_string());
    }

    // 1. 获取或缓存中心区块
    let center_exists = CHUNK_CACHE.with(|cache| {
        let mut c = cache.borrow_mut();
        if c.get(cx, cz).is_some() {
            true
        } else if let Some(data) = &center_data {
            if data.len() >= 2 {
                let parsed = MANAGER.with(|mgr_opt| {
                    let mgr_ref = mgr_opt.borrow();
                    let mgr = match &*mgr_ref {
                        Some(m) => m,
                        None => return Err("Manager not initialized".to_string()),
                    };
                    let resolver = ResolveMap::new(mgr);
                    let biome = BiomeGlobal;
                    decompress_and_parse(data[0], &data[1..], &resolver, &biome)
                });

                match parsed {
                    Ok(chunk) => {
                        c.insert(cx, cz, chunk);
                        true
                    }
                    Err(_) => false,
                }
            } else {
                crate::dev_warn!("cache mesh source too short for {}, {}", cx, cz);
                false
            }
        } else {
            crate::dev_warn!("no center data provided for cached mesh {}, {}", cx, cz);
            false
        }
    });

    if !center_exists {
        return Err("Center chunk not available".to_string());
    }

    // 2. 提取邻居坐标
    let neighbor_positions = [
        (neighbor_coords[0], neighbor_coords[1]),   // north
        (neighbor_coords[2], neighbor_coords[3]),   // south
        (neighbor_coords[4], neighbor_coords[5]),   // east
        (neighbor_coords[6], neighbor_coords[7]),   // west
        (neighbor_coords[8], neighbor_coords[9]),   // ne
        (neighbor_coords[10], neighbor_coords[11]), // nw
        (neighbor_coords[12], neighbor_coords[13]), // se
        (neighbor_coords[14], neighbor_coords[15]), // sw
    ];

    // 3. 使用缓存进行 mesh
    let result = CHUNK_CACHE.with(|cache_cell| -> Result<MeshResult, String> {
        MANAGER.with(|mgr_opt| {
            let mgr_ref = mgr_opt.borrow();
            let mgr = match &*mgr_ref {
                Some(m) => m,
                None => return Err("Manager not initialized".to_string()),
            };

            let mut cache = cache_cell.borrow_mut();

            // 获取中心区块引用
            let center_ptr = cache.get(cx, cz).map(|c| c as *const ChunkData);
            
            if center_ptr.is_none() {
                return Err("Center chunk disappeared from cache".to_string());
            }

            // Safety: 我们持有 cache 的可变借用，center_ptr 指向的数据在作用域内有效
            let center = unsafe { &*center_ptr.unwrap() };

            // 获取邻居引用
            let neighbors: Vec<Option<*const ChunkData>> = neighbor_positions
                .iter()
                .map(|&(nx, nz)| cache.get(nx, nz).map(|c| c as *const ChunkData))
                .collect();

            // Safety: 同上
            let north = neighbors[0].map(|p| unsafe { &*p });
            let south = neighbors[1].map(|p| unsafe { &*p });
            let east = neighbors[2].map(|p| unsafe { &*p });
            let west = neighbors[3].map(|p| unsafe { &*p });
            let ne = neighbors[4].map(|p| unsafe { &*p });
            let nw = neighbors[5].map(|p| unsafe { &*p });
            let se = neighbors[6].map(|p| unsafe { &*p });
            let sw = neighbors[7].map(|p| unsafe { &*p });

            let (opaque, opaque_indices, decal, decal_indices, translucent, translucent_indices, lights) = mesh_chunk_with_neighbors(
                center,
                north, south, east, west,
                ne, nw, se, sw,
                mgr,
            );
            
            Ok(MeshResult {
                opaque,
                opaque_indices,
                decal,
                decal_indices,
                translucent,
                translucent_indices,
                lights,
            })
        })
    });
    
    result
}
