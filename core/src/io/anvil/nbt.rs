//! # NBT 解析器 (NBT Parser)
//!
//! ## 职责 (Responsibility)
//! 解析 Minecraft Named Binary Tag (NBT) 格式。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: 二进制 NBT 数据流。
//! - 输出: `NbtTag` 枚举树。
//!
//! ## MC 机制 (MC Mechanism)
//! - Tag ID: 每个 Tag 开头有一个字节标识类型。
//! - Recursive: Compound 和 List 类型支持递归嵌套。

use byteorder::{BigEndian, ByteOrder};
use std::collections::HashMap;

/// NBT 数据结构枚举。
/// 
/// # Note
/// NBT (Named Binary Tag) 是 Minecraft 的标准二进制存储格式。
#[derive(Debug, Clone)]
pub enum NbtTag {
    /// 结束标记，用于标识 Compound 类型的结尾
    End,
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    ByteArray(Vec<i8>),
    String(String),
    List(Vec<NbtTag>),
    Compound(HashMap<String, NbtTag>),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
}

/// 解析 NBT 二进制数据。
/// 
/// # Parameters
/// - `data`: 解压后的 NBT 字节数据。
/// 
/// # Returns
/// - `(root_name, root_tag)`: 根标签名称及根节点。
pub fn parse_nbt(data: &[u8]) -> Result<(String, NbtTag), String> {
    let mut pos = 0;
    if data.is_empty() {
        return Err("Data is empty".to_string());
    }
    // 读取根标签 ID
    let tag_id = data[pos];
    pos += 1;
    
    if tag_id == 0 {
        return Ok(("".to_string(), NbtTag::End));
    }
    // 读取根标签名称
    let name = read_string_slice(data, &mut pos)?;
    // 递归读取 Payload
    let tag = read_payload_slice(data, &mut pos, tag_id)?;
    Ok((name, tag))
}

/// 读取字符串切片。
fn read_string_slice(data: &[u8], pos: &mut usize) -> Result<String, String> {
    if *pos + 2 > data.len() {
        return Err("Unexpected EOF reading string length".to_string());
    }
    let len = BigEndian::read_u16(&data[*pos..*pos+2]) as usize;
    *pos += 2;
    
    if *pos + len > data.len() {
        return Err("Unexpected EOF reading string data".to_string());
    }
    let s = String::from_utf8_lossy(&data[*pos..*pos+len]).to_string();
    *pos += len;
    Ok(s)
}

/// 递归读取 NBT 标签的内容。
/// 根据 tag_id 分发到具体类型的读取逻辑。
fn read_payload_slice(data: &[u8], pos: &mut usize, tag_id: u8) -> Result<NbtTag, String> {
    match tag_id {
        0 => Ok(NbtTag::End),
        1 => {
            if *pos + 1 > data.len() { return Err("EOF".to_string()); }
            let v = data[*pos] as i8;
            *pos += 1;
            Ok(NbtTag::Byte(v))
        }
        2 => {
            if *pos + 2 > data.len() { return Err("EOF".to_string()); }
            let v = BigEndian::read_i16(&data[*pos..*pos+2]);
            *pos += 2;
            Ok(NbtTag::Short(v))
        }
        3 => {
            if *pos + 4 > data.len() { return Err("EOF".to_string()); }
            let v = BigEndian::read_i32(&data[*pos..*pos+4]);
            *pos += 4;
            Ok(NbtTag::Int(v))
        }
        4 => {
            if *pos + 8 > data.len() { return Err("EOF".to_string()); }
            let v = BigEndian::read_i64(&data[*pos..*pos+8]);
            *pos += 8;
            Ok(NbtTag::Long(v))
        }
        5 => {
            if *pos + 4 > data.len() { return Err("EOF".to_string()); }
            let v = BigEndian::read_f32(&data[*pos..*pos+4]);
            *pos += 4;
            Ok(NbtTag::Float(v))
        }
        6 => {
            if *pos + 8 > data.len() { return Err("EOF".to_string()); }
            let v = BigEndian::read_f64(&data[*pos..*pos+8]);
            *pos += 8;
            Ok(NbtTag::Double(v))
        }
        7 => {
            if *pos + 4 > data.len() { return Err("EOF".to_string()); }
            let len = BigEndian::read_i32(&data[*pos..*pos+4]) as usize;
            *pos += 4;
            if *pos + len > data.len() { return Err("EOF".to_string()); }
            // 直接拷贝，避免逐字节读取
            let buf = data[*pos..*pos+len].iter().map(|&b| b as i8).collect();
            *pos += len;
            Ok(NbtTag::ByteArray(buf))
        }
        8 => Ok(NbtTag::String(read_string_slice(data, pos)?)),
        9 => {
            if *pos + 5 > data.len() { return Err("EOF".to_string()); }
            let type_id = data[*pos];
            *pos += 1;
            let len = BigEndian::read_i32(&data[*pos..*pos+4]) as usize;
            *pos += 4;
            
            let mut list = Vec::with_capacity(len);
            for _ in 0..len {
                list.push(read_payload_slice(data, pos, type_id)?);
            }
            Ok(NbtTag::List(list))
        }
        10 => {
            let mut map = HashMap::new();
            loop {
                if *pos + 1 > data.len() { return Err("EOF".to_string()); }
                let tag_id = data[*pos];
                *pos += 1;
                if tag_id == 0 {
                    break;
                }
                let name = read_string_slice(data, pos)?;
                let tag = read_payload_slice(data, pos, tag_id)?;
                map.insert(name, tag);
            }
            Ok(NbtTag::Compound(map))
        }
        11 => {
            if *pos + 4 > data.len() { return Err("EOF".to_string()); }
            let len = BigEndian::read_i32(&data[*pos..*pos+4]) as usize;
            *pos += 4;
            if *pos + len * 4 > data.len() { return Err("EOF".to_string()); }
            
            let mut buf = Vec::with_capacity(len);
            for _ in 0..len {
                buf.push(BigEndian::read_i32(&data[*pos..*pos+4]));
                *pos += 4;
            }
            Ok(NbtTag::IntArray(buf))
        }
        12 => {
            if *pos + 4 > data.len() { return Err("EOF".to_string()); }
            let len = BigEndian::read_i32(&data[*pos..*pos+4]) as usize;
            *pos += 4;
            if *pos + len * 8 > data.len() { return Err("EOF".to_string()); }
            
            let mut buf = Vec::with_capacity(len);
            for _ in 0..len {
                buf.push(BigEndian::read_i64(&data[*pos..*pos+8]));
                *pos += 8;
            }
            Ok(NbtTag::LongArray(buf))
        }
        _ => Err(format!("Unknown tag type: {}", tag_id)),
    }
}

// 保留旧函数签名以兼容（如果需要），或者直接删除旧函数
/* fn read_string(cursor: &mut Cursor<&[u8]>) -> Result<String, std::io::Error> {
    let len = cursor.read_u16::<BigEndian>()?;
    let mut buf = vec![0u8; len as usize];
    cursor.read_exact(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).to_string())
} */
