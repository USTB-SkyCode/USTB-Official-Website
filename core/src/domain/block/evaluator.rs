//! # BlockState 条件求值器 (Condition Evaluator)
//!
//! ## 职责
//! 评估 pattern / rule 中的 `when` 条件、固定 `values` 规则以及 weighted apply 选择逻辑。
//! 这是 blockstate 解析到最终模型选择之间的核心判定层。

use crate::domain::block::registry::{BlockModelManager, CompactBlockState, ValId};
use crate::domain::block::def::{Condition, ConditionValue, ConditionOrList, RuleDef, PatternDef, ApplyDef};

/// 判断单个条件值是否与实际属性值匹配。
/// 支持字符串、布尔、数字，以及 `a|b|c` 形式的多值匹配。
pub fn matches_value(mgr: &BlockModelManager, expected: &ConditionValue, actual_val_id: ValId) -> bool {
    match expected {
        ConditionValue::String(s) => {
            if s.contains('|') {
                for opt in s.split('|') {
                    if let Some(opt_id) = mgr.lookup_value_id(opt) {
                        if opt_id == actual_val_id {
                            return true;
                        }
                    }
                }
                false
            } else {
                mgr.lookup_value_id(s).map(|id| id == actual_val_id).unwrap_or(false)
            }
        }
        ConditionValue::Bool(b) => {
            let want = if *b { mgr.true_value_id() } else { mgr.false_value_id() };
            want == actual_val_id
        }
        ConditionValue::Number(n) => {
            mgr.with_value_str(actual_val_id, |s| {
                s.parse::<f64>()
                    .ok()
                    .map(|v| v == *n)
                    .unwrap_or(false)
            })
        }
        ConditionValue::Null(_) => true,
    }
}

/// 递归求值一个 `Condition`。
/// 支持 `OR` 与 `NOT` 这样的特殊键语义。
pub fn matches_condition(mgr: &BlockModelManager, cond: &Condition, properties: &CompactBlockState) -> bool {
    match cond {
        Condition::Map(map) => {
            for (key, val) in map {
                if key == "OR" {
                    if let ConditionOrList::List(list) = val {
                        if list.iter().any(|c| matches_condition(mgr, c, properties)) {
                            continue;
                        } else {
                            return false;
                        }
                    } else {
                        return false;
                    }
                }

                // 特殊键 `NOT`：列表中的任一条件命中都视为失败。
                if key == "NOT" {
                    if let ConditionOrList::List(list) = val {
                        if list.iter().any(|c| matches_condition(mgr, c, properties)) {
                            return false;
                        } else {
                            continue;
                        }
                    } else {
                        return false;
                    }
                }

                let matches = match val {
                    ConditionOrList::Value(v) => {
                        let prop_id = mgr.lookup_prop_id(key);
                        let actual_val_id = if let Some(pid) = prop_id {
                            let mut found = mgr.empty_value_id();
                            for (k, vv) in properties {
                                if *k == pid {
                                    found = *vv;
                                    break;
                                }
                            }
                            found
                        } else {
                            mgr.empty_value_id()
                        };
                        matches_value(mgr, v, actual_val_id)
                    }
                    ConditionOrList::List(list) => list.iter().any(|c| matches_condition(mgr, c, properties)),
                };

                if !matches {
                    return false;
                }
            }
            true
        }
    }
}

/// 判断一条 rule 是否命中当前属性集合。
/// 优先按 `values` 做位置匹配，其次回退到 `when` 条件表达式。
pub fn matches_rule(mgr: &BlockModelManager, rule: &RuleDef, pattern: &PatternDef, properties: &CompactBlockState) -> bool {
    if let Some(values) = &rule.values {
        if let Some(prop_names) = &pattern.properties {
            if values.len() != prop_names.len() { return false; }
            for (i, val) in values.iter().enumerate() {
                let key = &prop_names[i];
                let prop_id = match mgr.lookup_prop_id(key) {
                    Some(id) => id,
                    None => return false,
                };
                let mut actual_val_id = mgr.false_value_id();
                for (k, v) in properties {
                    if *k == prop_id {
                        actual_val_id = *v;
                        break;
                    }
                }
                
                let match_val = matches_value(mgr, val, actual_val_id);
                if !match_val { return false; }
            }
            return true;
        }
    }
    
    if let Some(when) = &rule.when {
        return matches_condition(mgr, when, properties);
    }

    true
}

/// 按权重从多个 apply 选项中选出一个。
/// 随机种子只依赖 `(x,y,z)`，保证同一坐标上的结果稳定。
pub fn pick_weighted<'a>(options: &'a Vec<ApplyDef>, x: i32, y: i32, z: i32) -> Option<&'a ApplyDef> {
    if options.is_empty() { return None; }
    if options.len() == 1 { return Some(&options[0]); }
    
    let total_weight: u32 = options.iter().map(|o| o.weight.unwrap_or(1)).sum();
    let mut seed = (x as i64).wrapping_mul(3129871) ^ (y as i64).wrapping_mul(116129781) ^ (z as i64).wrapping_mul(42317861);
    seed ^= seed >> 16;
    let val = (seed.abs() as u32) % total_weight;
    
    let mut current = 0;
    for opt in options {
        let w = opt.weight.unwrap_or(1);
        current += w;
        if val < current {
            return Some(opt);
        }
    }
    Some(&options[0])
}
