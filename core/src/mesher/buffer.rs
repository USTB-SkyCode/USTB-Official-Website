//! Mesh Buffers
//!
//! 线程局部的重用缓冲区，用于减少 Mesh 生成过程中的内存分配。

use std::cell::RefCell;

// Thread-local buffers to reuse memory across mesh calls
thread_local! {
    /// 不透明几何体顶点缓冲
    static OPAQUE_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(1024 * 1024));
    /// 贴花/Cutout几何体顶点缓冲
    static DECAL_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(256 * 1024));
    /// 半透明几何体顶点缓冲
    static TRANSLUCENT_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(256 * 1024));
    // New index buffers
    /// 不透明几何体索引缓冲
    static OPAQUE_INDICES: RefCell<Vec<u32>> = RefCell::new(Vec::with_capacity(256 * 1024));
    /// 贴花/Cutout几何体索引缓冲
    static DECAL_INDICES: RefCell<Vec<u32>> = RefCell::new(Vec::with_capacity(64 * 1024));
    /// 半透明几何体索引缓冲
    static TRANSLUCENT_INDICES: RefCell<Vec<u32>> = RefCell::new(Vec::with_capacity(64 * 1024));
}

/// 在线程局部缓冲区上执行闭包，避免重复分配。
///
/// # Arguments
/// * `f` - 闭包，接收六个缓冲区
pub(crate) fn with_mesh_buffers<F, R>(f: F) -> R
where
    F: FnOnce(
        &mut Vec<u8>, &mut Vec<u32>, // Opaque
        &mut Vec<u8>, &mut Vec<u32>, // Decal
        &mut Vec<u8>, &mut Vec<u32>  // Translucent
    ) -> R,
{
    OPAQUE_BUFFER.with(|op_buf| {
        DECAL_BUFFER.with(|dec_buf| {
            TRANSLUCENT_BUFFER.with(|tr_buf| {
                OPAQUE_INDICES.with(|op_idx| {
                    DECAL_INDICES.with(|dec_idx| {
                        TRANSLUCENT_INDICES.with(|tr_idx| {
                            let mut opaque = op_buf.borrow_mut();
                            let mut decal = dec_buf.borrow_mut();
                            let mut translucent = tr_buf.borrow_mut();
                            let mut opaque_indices = op_idx.borrow_mut();
                            let mut decal_indices = dec_idx.borrow_mut();
                            let mut translucent_indices = tr_idx.borrow_mut();

                            opaque.clear();
                            decal.clear();
                            translucent.clear();
                            opaque_indices.clear();
                            decal_indices.clear();
                            translucent_indices.clear();

                            // Ensure capacity
                            if opaque.capacity() < 1024 * 1024 { opaque.reserve(1024 * 1024); }
                            if decal.capacity() < 256 * 1024 { decal.reserve(256 * 1024); }
                            if translucent.capacity() < 256 * 1024 { translucent.reserve(256 * 1024); }
                            
                            if opaque_indices.capacity() < 256 * 1024 { opaque_indices.reserve(256 * 1024); }
                            if decal_indices.capacity() < 64 * 1024 { decal_indices.reserve(64 * 1024); }
                            if translucent_indices.capacity() < 64 * 1024 { translucent_indices.reserve(64 * 1024); }

                            f(
                                &mut opaque, &mut opaque_indices,
                                &mut decal, &mut decal_indices,
                                &mut translucent, &mut translucent_indices
                            )
                        })
                    })
                })
            })
        })
    })
}
