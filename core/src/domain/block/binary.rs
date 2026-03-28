//! # 资源二进制读取器 (Binary Reader)
//!
//! ## 职责
//! 读取 Rust 资源二进制容器，恢复 blocks、patterns、templates 与 culling mask 数据。
//!
//! ## 格式约定
//! - Magic: `RUST`
//! - Version: 当前支持 1..=4
//! - 所有整数按 little-endian 编码

use std::io::{Cursor, Read};
use byteorder::{ReadBytesExt, LittleEndian};
use rustc_hash::FxHashMap;
use crate::domain::block::def::*;

/// 二进制资源读取器。
pub struct BinaryReader<'a> {
    cursor: Cursor<&'a [u8]>,
}

impl<'a> BinaryReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            cursor: Cursor::new(data),
        }
    }

    /// 读取整个注册表容器。
    /// 顺序固定为 magic -> version -> blocks -> patterns -> templates -> culling_masks。
    pub fn read_container(&mut self) -> Result<RegistryBinaryContainer, std::io::Error> {
        // 1. 读取 magic。
        let mut magic = [0u8; 4];
        self.cursor.read_exact(&mut magic)?;
        if &magic != b"RUST" {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid Magic Header"));
        }

        // 2. 读取版本号。
        let version = self.read_u32()?;
        if version != 1 && version != 2 && version != 3 && version != 4 {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Unsupported Version"));
        }
        
        // 3. 版本会影响 blocks / templates 的字段布局。
        let blocks = self.read_blocks(version)?;
        let patterns = self.read_patterns()?;
        let templates = self.read_templates(version)?;
        let culling_masks = self.read_culling_masks()?;

        Ok(RegistryBinaryContainer {
            blocks,
            patterns,
            templates,
            culling_masks,
        })
    }

    /// 读取 blocks 表。
    fn read_blocks(&mut self, version: u32) -> Result<BlocksJson, std::io::Error> {
        self.read_map_verbose("Blocks", |r: &mut BinaryReader| {
            let pattern = r.read_string()?;
            let flags = r.read_u16()?;
            let emission_color = r.read_option(|r: &mut BinaryReader| {
                Ok([r.read_u8()?, r.read_u8()?, r.read_u8()?])
            })?;
            let slots = r.read_vec_verbose("Slots", |r: &mut BinaryReader| {
                let template_name = r.read_string()?;
                let textures = r.read_vec(|r: &mut BinaryReader| r.read_i32())?;
                
                let emission = if version >= 3 {
                    r.read_option(|r: &mut BinaryReader| {
                         Ok([r.read_u8()?, r.read_u8()?, r.read_u8()?, r.read_u8()?])
                    })?
                } else {
                    None
                };

                Ok(SlotDef {
                    template: template_name,
                    textures,
                    emission,
                })
            })?;

            Ok(BlockDef {
                pattern,
                flags,
                emission_color,
                slots,
            })
        })
    }

    /// 读取字符串键到值对象的 map，并做有上限的 reserve。
    fn read_map_verbose<V, F>(&mut self, _name: &str, mut reader: F) -> Result<FxHashMap<String, V>, std::io::Error>
    where F: FnMut(&mut BinaryReader<'a>) -> Result<V, std::io::Error> {
        let len = self.read_u32()? as usize;
        let mut map = FxHashMap::default();
        map.reserve(std::cmp::min(len, 1024));
        for _ in 0..len {
            let key = self.read_string()?;
            let val = reader(self)?;
            map.insert(key, val);
        }
        Ok(map)
    }

    /// 读取 blockstate patterns。
    fn read_patterns(&mut self) -> Result<PatternsJson, std::io::Error> {
        self.read_map(|r: &mut BinaryReader| {
            let type_ = r.read_option(|r: &mut BinaryReader| r.read_string())?;
            let properties = r.read_option(|r: &mut BinaryReader| r.read_vec(|r: &mut BinaryReader| r.read_string()))?;
            let rules = r.read_vec_verbose("Rules", |r: &mut BinaryReader| {
                let values = r.read_option(|r: &mut BinaryReader| r.read_vec(|r: &mut BinaryReader| r.read_condition_value()))?;
                let when = r.read_option(|r: &mut BinaryReader| r.read_condition())?;
                let apply = r.read_vec(|r: &mut BinaryReader| {
                    Ok(ApplyDef {
                        slot: r.read_i32()?,
                        x: r.read_option(|r: &mut BinaryReader| r.read_f32())?,
                        y: r.read_option(|r: &mut BinaryReader| r.read_f32())?,
                        uvlock: r.read_option(|r: &mut BinaryReader| r.read_bool())?,
                        weight: r.read_option(|r: &mut BinaryReader| r.read_u32())?,
                    })
                })?;

                Ok(RuleDef {
                    values,
                    when,
                    apply,
                })
            })?;

            Ok(PatternDef {
                type_,
                properties,
                rules,
            })
        })
    }

    /// 读取模板数据。
    /// version>=2 支持 16x16 mask，version>=4 支持 element 级 render_layer。
    fn read_templates(&mut self, version: u32) -> Result<TemplatesJson, std::io::Error> {
        self.read_map(|r: &mut BinaryReader| {
            let elements = r.read_vec(|r: &mut BinaryReader| {
                let from = [r.read_f32()?, r.read_f32()?, r.read_f32()?];
                let to = [r.read_f32()?, r.read_f32()?, r.read_f32()?];
                let rotation = r.read_option(|r: &mut BinaryReader| {
                    Ok(RotationDef {
                        origin: [r.read_f32()?, r.read_f32()?, r.read_f32()?],
                        axis: r.read_u8()?,
                        angle: r.read_f32()?,
                        rescale: r.read_bool()?,
                    })
                })?;
                
                let mut faces: [Option<FaceDef>; 6] = Default::default();
                for i in 0..6 {
                    faces[i] = r.read_option(|r: &mut BinaryReader| {
                        Ok(FaceDef {
                            texture: r.read_i32()?,
                            uv_packed: r.read_u32()?,
                            cullface: r.read_option(|r: &mut BinaryReader| r.read_i32().map(|v| v as i8))?,
                            rotation: r.read_f32()?,
                            tintindex: r.read_i32()?,
                        })
                    })?;
                }

                let render_layer = if version >= 4 {
                    r.read_option(|r: &mut BinaryReader| r.read_u8())?
                } else {
                    None
                };

                Ok(ElementDef {
                    from,
                    to,
                    rotation,
                    faces,
                    render_layer,
                })
            })?;
 
            let mut masks = [0u64; 6];
            for i in 0..6 {
                let low = r.read_u32()? as u64;
                let high = r.read_u32()? as u64;
                masks[i] = (high << 32) | low;
            }

            // version >= 2 才支持 16x16 mask。
            let (mask_res, masks16) = if version >= 2 {
                let mask_res = r.read_u8()?;
                let has_m16 = r.read_u8()?;
                if has_m16 != 0 {
                    let mut m16 = [0u64; 24];
                    for i in 0..24 {
                        let low = r.read_u32()? as u64;
                        let high = r.read_u32()? as u64;
                        m16[i] = (high << 32) | low;
                    }
                    (mask_res, Some(m16))
                } else {
                    (mask_res, None)
                }
            } else {
                (0u8, None)
            };

            let texture_vars = r.read_vec(|r: &mut BinaryReader| r.read_string())?;

            Ok(TemplateDef {
                elements,
                texture_vars,
                masks,
                masks16,
                mask_res,
            })
        })
    }

    fn read_culling_masks(&mut self) -> Result<FxHashMap<String, i32>, std::io::Error> {
        self.read_map(|r: &mut BinaryReader| r.read_i32())
    }

    // ---- Primitives & Helpers ----

    fn read_u8(&mut self) -> Result<u8, std::io::Error> { self.cursor.read_u8() }
    fn read_u16(&mut self) -> Result<u16, std::io::Error> { self.cursor.read_u16::<LittleEndian>() }
    fn read_u32(&mut self) -> Result<u32, std::io::Error> { self.cursor.read_u32::<LittleEndian>() }
    fn read_i32(&mut self) -> Result<i32, std::io::Error> { self.cursor.read_i32::<LittleEndian>() }
    fn read_f32(&mut self) -> Result<f32, std::io::Error> { self.cursor.read_f32::<LittleEndian>() }
    fn read_f64(&mut self) -> Result<f64, std::io::Error> { self.cursor.read_f64::<LittleEndian>() }
    
    fn read_bool(&mut self) -> Result<bool, std::io::Error> {
        Ok(self.read_u8()? != 0)
    }

    /// 读取 UTF-8 字符串，长度以前置 u16 给出。
    fn read_string(&mut self) -> Result<String, std::io::Error> {
        let len = self.read_u16()? as usize;
        let mut buf = vec![0u8; len];
        self.cursor.read_exact(&mut buf)?;
        String::from_utf8(buf).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    fn read_option<T, F>(&mut self, reader: F) -> Result<Option<T>, std::io::Error>
    where F: FnOnce(&mut BinaryReader<'a>) -> Result<T, std::io::Error> {
        let has_val = self.read_u8()?;
        if has_val == 1 {
            Ok(Some(reader(self)?))
        } else {
            Ok(None)
        }
    }

    fn read_vec<T, F>(&mut self, mut reader: F) -> Result<Vec<T>, std::io::Error>
    where F: FnMut(&mut BinaryReader<'a>) -> Result<T, std::io::Error> {
        let len = self.read_u32()? as usize;
        // 对预分配做上限保护，避免损坏数据导致过大分配。
        let cap = std::cmp::min(len, 1024);
        let mut vec = Vec::with_capacity(cap);
        for _ in 0..len {
            vec.push(reader(self)?);
        }
        Ok(vec)
    }

    fn read_map<V, F>(&mut self, mut reader: F) -> Result<FxHashMap<String, V>, std::io::Error>
    where F: FnMut(&mut BinaryReader<'a>) -> Result<V, std::io::Error> {
        let len = self.read_u32()? as usize;
        let mut map = FxHashMap::default();
        // 对预分配做上限保护。
        map.reserve(std::cmp::min(len, 1024));
        for _ in 0..len {
            let key = self.read_string()?;
            let val = reader(self)?;
            map.insert(key, val);
        }
        Ok(map)
    }

    fn read_condition_value(&mut self) -> Result<ConditionValue, std::io::Error> {
        let type_id = self.read_u8()?;
        match type_id {
            0 => Ok(ConditionValue::String(self.read_string()?)),
            1 => Ok(ConditionValue::Number(self.read_f64()?)),
            2 => Ok(ConditionValue::Bool(self.read_bool()?)),
            3 => Ok(ConditionValue::Null(None)),
            _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid ConditionValue Type")),
        }
    }

    /// 读取 `Condition::Map`。
    fn read_condition(&mut self) -> Result<Condition, std::io::Error> {
        // Map<String, ConditionOrList>
        let map = self.read_map(|r: &mut BinaryReader| r.read_condition_or_list())?;
        Ok(Condition::Map(map))
    }

    /// 读取 `ConditionOrList`。
    fn read_condition_or_list(&mut self) -> Result<ConditionOrList, std::io::Error> {
        let type_id = self.read_u8()?;
        match type_id {
            0 => { // Value
                Ok(ConditionOrList::Value(self.read_condition_value()?))
            },
            1 => { // List
                let vec = self.read_vec(|r: &mut BinaryReader| r.read_condition())?;
                Ok(ConditionOrList::List(vec))
            },
            _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid ConditionOrList Type")),
        }
    }

    fn read_vec_verbose<T, F>(&mut self, _name: &str, mut reader: F) -> Result<Vec<T>, std::io::Error>
    where F: FnMut(&mut BinaryReader<'a>) -> Result<T, std::io::Error> {
        let len = self.read_u32()? as usize;
        let cap = std::cmp::min(len, 1024);
        let mut vec = Vec::with_capacity(cap);
        for _ in 0..len {
            vec.push(reader(self)?);
        }
        Ok(vec)
    }
}
