//! SharedArrayBuffer Client Accessor
//!
//! 提供在 Rust 中访问 SharedArrayBuffer (SAB) 的线程局部视图。
//! 必须在每个 Worker 线程初始化时调用 `init_sab`。

use wasm_bindgen::prelude::*;
use js_sys::{SharedArrayBuffer, Uint8Array, Int32Array};
use std::cell::RefCell;

thread_local! {
    /// 线程局部的 Uint8Array 视图
    static SAB_VIEW: RefCell<Option<Uint8Array>> = RefCell::new(None);
    /// 线程局部的 Int32Array 视图
    static SAB_VIEW_I32: RefCell<Option<Int32Array>> = RefCell::new(None);
}

/// Initialize the SharedArrayBuffer view for this thread.
/// Must be called by each Worker (or Main thread) once.
#[wasm_bindgen]
pub fn init_sab(sab: SharedArrayBuffer) {
    let view = Uint8Array::new(&sab);
    let view_i32 = Int32Array::new(&sab);
    SAB_VIEW.with(|v| {
        *v.borrow_mut() = Some(view);
    });
    SAB_VIEW_I32.with(|v| {
        *v.borrow_mut() = Some(view_i32);
    });
}

/// 获取 SAB 的 Uint8Array 试图并执行闭包
pub fn get_sab_view_mut<F, R>(f: F) -> R 
where F: FnOnce(&Uint8Array) -> R {
    SAB_VIEW.with(|v| {
        let borrowed = v.borrow();
        let view = borrowed.as_ref().expect("SAB not initialized in this thread! Call init_sab first.");
        f(view)
    })
}

/// 获取 SAB 的 Int32Array 试图并执行闭包
pub fn get_sab_view_i32<F, R>(f: F) -> R 
where F: FnOnce(&Int32Array) -> R {
    SAB_VIEW_I32.with(|v| {
        let borrowed = v.borrow();
        let view = borrowed.as_ref().expect("SAB I32 not initialized in this thread! Call init_sab first.");
        f(view)
    })
}

/// Reads a single i32 from the SAB at the given index (index in Int32Array, not bytes).
pub fn read_i32(index: u32) -> i32 {
    get_sab_view_i32(|view| {
        view.get_index(index)
    })
}

// Writes a Rust slice into the SAB at byte offset.
/// Writes a Rust slice into the SAB at byte offset.
pub fn write_bytes(offset: u32, data: &[u8]) {
    get_sab_view_mut(|view| {
        unsafe {
            // Unsafe view creation is required to get a temporary JsValue-compatible 
            // reference to the Rust slice without copying it to JS heap first.
            // This is standard optimization for wasm-bindgen.
            let data_view = Uint8Array::view(data);
            view.set(&data_view, offset);
        }
    });
}

// Reads bytes from SAB into a Rust slice.
/// Reads bytes from SAB into a Rust slice.
pub fn read_bytes(offset: u32, out: &mut [u8]) {
    get_sab_view_mut(|view| {
        let len = out.len() as u32;
        let sub = view.subarray(offset, offset + len);
        sub.copy_to(out);
    });
}

