#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default, serde::Serialize)]
pub enum MeshPass {
    #[default]
    Opaque,
    Decal,
    Translucent,
    Shadow,
    Velocity,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default, serde::Serialize)]
pub enum QuadFacing {
    #[default]
    Unassigned,
    Up,
    Down,
    North,
    South,
    West,
    East,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct DrawSegment {
    pub facing: QuadFacing,
    pub vertex_count: u32,
    pub first_vertex: u32,
    pub index_count: u32,
    pub first_index: u32,
    pub base_vertex: i32,
}