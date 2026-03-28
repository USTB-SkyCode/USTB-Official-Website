//! 网格生成服务层
//! 职责：编排"解析 -> 组装 -> 生成"的完整流程，解耦 WASM 接口与核心算法。

use crate::io::anvil::chunk::{decompress_and_parse, ChunkData};
use crate::mesher::{mesh_chunk, mesh_chunk_artifact_with_neighbors_opts, mesh_chunk_with_neighbors, ChunkBuildArtifact, ExtractedLight, MesherOptions};
use crate::domain::block::BlockModelManager;
use crate::domain::resolve::{BiomeGlobal, ResolveMap};

/// 网格生成结果
pub struct MeshResult {
    pub opaque: Vec<u8>,
    pub opaque_indices: Vec<u32>,
    pub decal: Vec<u8>,
    pub decal_indices: Vec<u32>,
    pub translucent: Vec<u8>,
    pub translucent_indices: Vec<u32>,
    pub lights: Vec<ExtractedLight>,
}

/// 邻居数据包
pub struct NeighborData<'a> {
    pub north: Option<&'a [u8]>,
    pub south: Option<&'a [u8]>,
    pub east: Option<&'a [u8]>,
    pub west: Option<&'a [u8]>,
    pub ne: Option<&'a [u8]>,
    pub nw: Option<&'a [u8]>,
    pub se: Option<&'a [u8]>,
    pub sw: Option<&'a [u8]>,
}

/// 从二进制数据生成单个 Chunk 的网格
pub fn mesh_xy_chunk_from_binary(
    chunk_data: &[u8],
    manager: &BlockModelManager,
) -> Result<MeshResult, String> {
    if chunk_data.len() < 2 {
        return Err("Data too short".to_string());
    }
    let compression = chunk_data[0];
    let data = &chunk_data[1..];

    let resolver = ResolveMap::new(manager);
    let biome = BiomeGlobal;

    let chunk = decompress_and_parse(compression, data, &resolver, &biome)
        .map_err(|e| e.to_string())?;

    let (opaque, opaque_indices, decal, decal_indices, translucent, translucent_indices, lights) = mesh_chunk(&chunk, manager);

    Ok(MeshResult {
        opaque,
        opaque_indices,
        decal,
        decal_indices,
        translucent,
        translucent_indices,
        lights,
    })
}

/// 从二进制数据生成带邻居的完整网格
pub fn mesh_neighborhood_from_binary(
    center_data: &[u8],
    neighbors: NeighborData,
    manager: &BlockModelManager,
) -> Result<MeshResult, String> {
    if center_data.len() < 2 {
        return Err("Center data too short".to_string());
    }
    
    let resolver = ResolveMap::new(manager);
    let biome = BiomeGlobal;

    // Helper to parse optional binary chunks
    let parse_chunk = |data: Option<&[u8]>| -> Option<ChunkData> {
        if let Some(d) = data {
            if d.len() >= 2 {
                return decompress_and_parse(d[0], &d[1..], &resolver, &biome).ok();
            }
        }
        None
    };

    let center = decompress_and_parse(center_data[0], &center_data[1..], &resolver, &biome)
        .map_err(|e| e.to_string())?;

    let n = parse_chunk(neighbors.north);
    let s = parse_chunk(neighbors.south);
    let e = parse_chunk(neighbors.east);
    let w = parse_chunk(neighbors.west);
    let ne = parse_chunk(neighbors.ne);
    let nw = parse_chunk(neighbors.nw);
    let se = parse_chunk(neighbors.se);
    let sw = parse_chunk(neighbors.sw);

    let (opaque, opaque_indices, decal, decal_indices, translucent, translucent_indices, lights) = mesh_chunk_with_neighbors(
        &center,
        n.as_ref(), s.as_ref(), e.as_ref(), w.as_ref(),
        ne.as_ref(), nw.as_ref(), se.as_ref(), sw.as_ref(),
        manager,
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
}

/// 从二进制数据生成带邻居的 section artifact 结果。
pub fn mesh_neighborhood_artifact_from_binary(
    center_data: &[u8],
    neighbors: NeighborData,
    manager: &BlockModelManager,
) -> Result<ChunkBuildArtifact, String> {
    if center_data.len() < 2 {
        return Err("Center data too short".to_string());
    }

    let resolver = ResolveMap::new(manager);
    let biome = BiomeGlobal;

    let parse_chunk = |data: Option<&[u8]>| -> Option<ChunkData> {
        if let Some(d) = data {
            if d.len() >= 2 {
                return decompress_and_parse(d[0], &d[1..], &resolver, &biome).ok();
            }
        }
        None
    };

    let center = decompress_and_parse(center_data[0], &center_data[1..], &resolver, &biome)
        .map_err(|e| e.to_string())?;

    let n = parse_chunk(neighbors.north);
    let s = parse_chunk(neighbors.south);
    let e = parse_chunk(neighbors.east);
    let w = parse_chunk(neighbors.west);
    let ne = parse_chunk(neighbors.ne);
    let nw = parse_chunk(neighbors.nw);
    let se = parse_chunk(neighbors.se);
    let sw = parse_chunk(neighbors.sw);

    Ok(mesh_chunk_artifact_with_neighbors_opts(
        &center,
        n.as_ref(), s.as_ref(), e.as_ref(), w.as_ref(),
        ne.as_ref(), nw.as_ref(), se.as_ref(), sw.as_ref(),
        manager,
        MesherOptions::default(),
    ))
}
