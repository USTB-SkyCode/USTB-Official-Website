
import { BinaryWriter } from './BinaryWriter';

export function serializeRegistry(
    blocks: any,
    patterns: any,
    templates: any,
    cullingMasks: any
): Buffer {
    const writer = new BinaryWriter();

    // Magic "RUST"
    writer.writeU8(0x52);
    writer.writeU8(0x55);
    writer.writeU8(0x53);
    writer.writeU8(0x54);
    // Version 4 (adds element render_layer)
    writer.writeU32(4);

    // 1. Blocks
    writer.writeMap(blocks, (block: any) => {
        writer.writeString(block.p); // pattern
        writer.writeU16(block.f); // flags
        writer.writeOption(block.c, (rgb: number[]) => {
            writer.writeU8(rgb[0]);
            writer.writeU8(rgb[1]);
            writer.writeU8(rgb[2]);
        }); // emission_color
        writer.writeVec(block.s, (slot: any) => {
            writer.writeString(slot.t); // template
            writer.writeVec(slot.x, (texId: number) => {
                writer.writeI32(texId);
            }); // textures
            // NEW: Per-slot emission
            writer.writeOption(slot.e, (em: number[]) => {
                writer.writeU8(em[0]);
                writer.writeU8(em[1]);
                writer.writeU8(em[2]);
                writer.writeU8(em[3]);
            });
        }); // slots
    });

    // 2. Patterns
    writer.writeMap(patterns, (pattern: any) => {
        writer.writeOption(pattern.type, (v: string) => writer.writeString(v));
        writer.writeOption(pattern.properties, (v: string[]) => {
            writer.writeVec(v, (s: string) => writer.writeString(s));
        });
        writer.writeVec(pattern.rules, (rule: any) => {
            // RuleDef
            writer.writeOption(rule.values, (vals: any[]) => {
                writer.writeVec(vals, (val: any) => writeConditionValue(writer, val));
            });
            writer.writeOption(rule.when, (cond: any) => writeCondition(writer, cond));
            writer.writeVec(rule.apply, (apply: any) => {
                // ApplyDef
                writer.writeI32(apply.slot);
                writer.writeOption(apply.x, (v: number) => writer.writeF32(v));
                writer.writeOption(apply.y, (v: number) => writer.writeF32(v));
                writer.writeOption(apply.uvlock, (v: boolean) => writer.writeBool(v));
                writer.writeOption(apply.weight, (v: number) => writer.writeU32(v));
            });
        });
    });

    // 3. Templates
    writer.writeMap(templates, (template: any) => {
        writer.writeVec(template.e, (el: any) => {
            // ElementDef
            writeVec3(writer, el.f); // from
            writeVec3(writer, el.t); // to
            writer.writeOption(el.r, (rot: any) => {
                // RotationDef
                writeVec3(writer, rot.o); // origin
                writer.writeU8(rot.a); // axis
                writer.writeF32(rot.angle);
                writer.writeBool(rot.re); // rescale
            });
            // Faces [Option<FaceDef>; 6]
            for (let i = 0; i < 6; i++) {
                writer.writeOption(el.fa[i], (face: any) => {
                    // FaceDef
                    writer.writeI32(face.t); // texture
                    writer.writeU32(face.u); // uv_packed
                    writer.writeOption(face.c, (c: number) => writer.writeI32(c)); // cullface (i8 as i32 for safe)
                    writer.writeF32(face.r); // rotation
                    // tintindex: default must be -1 (NOT 0), otherwise non-tinted faces become tinted.
                    writer.writeI32(face.ti ?? -1);
                });
            }

            // Optional element render layer (u8)
            writer.writeOption(el.l, (layer: number) => writer.writeU8(layer));
        });

        // Masks [u64; 6]
        // In JSON it is stored as hex string "0x..." or just string
        const masks = template.m || ["0x0", "0x0", "0x0", "0x0", "0x0", "0x0"];
        for(let i=0; i<6; i++) {
            const valStr = masks[i];
            const val = BigInt(valStr);
            // Write u64 (Little Endian)
            // BigInt to two u32
            const low = Number(val & 0xFFFFFFFFn);
            const high = Number((val >> 32n) & 0xFFFFFFFFn);
            writer.writeU32(low);
            writer.writeU32(high);
        }

        // Mask resolution bitset (bit=1 -> 16x16)
        const maskRes = template.mr ?? 0;
        writer.writeU8(maskRes);

        // Optional 16x16 masks (6 faces * 4 tiles)
        const masks16 = template.m16;
        if (maskRes && Array.isArray(masks16) && masks16.length === 24) {
            writer.writeU8(1);
            for (let i = 0; i < 24; i++) {
                const valStr = masks16[i];
                const val = BigInt(valStr);
                const low = Number(val & 0xFFFFFFFFn);
                const high = Number((val >> 32n) & 0xFFFFFFFFn);
                writer.writeU32(low);
                writer.writeU32(high);
            }
        } else {
            writer.writeU8(0);
        }

        writer.writeVec(template.v, (v: string) => writer.writeString(v));
    });

    // 4. Culling Masks
    writer.writeMap(cullingMasks, (mask: number) => {
        writer.writeI32(mask);
    });

    return writer.toBuffer();
}

function writeVec3(writer: BinaryWriter, v: number[]) {
    writer.writeF32(v[0]);
    writer.writeF32(v[1]);
    writer.writeF32(v[2]);
}

function writeConditionValue(writer: BinaryWriter, val: any) {
    if (typeof val === 'string') {
        writer.writeU8(0);
        writer.writeString(val);
    } else if (typeof val === 'number') {
        writer.writeU8(1);
        // Note: Number in JSON could be int or float. f64 cover both.
        writer.writeF64(val);
    } else if (typeof val === 'boolean') {
        writer.writeU8(2);
        writer.writeBool(val);
    } else {
        // Null
        writer.writeU8(3);
    }
}

// Helper to handle Condition recursive structure
function writeCondition(writer: BinaryWriter, cond: any) {
    // Condition is Map<String, ConditionOrList>
    // Since input is generic object, treat as map
    writer.writeMap(cond, (val: any) => writeConditionOrList(writer, val));
}

function writeConditionOrList(writer: BinaryWriter, val: any) {
    if (Array.isArray(val)) {
        writer.writeU8(1); // List
        writer.writeVec(val, (v: any) => writeCondition(writer, v));
    } else if (typeof val === 'object' && val !== null && !('values' in val) && (Object.keys(val).length > 0)) {
         // It might be a nested condition (Map) if not a value?
         // No, ConditionOrList::Value(ConditionValue).
         // Wait, ConditionOrList is Value OR List.
         // A JS object here likely means a Value (ConditionValue) if it matches primitive types,
         // BUT wait. ConditionValue is primitive.
         // If it's an object, it's NOT a ConditionValue unless it's null.
         // Logic check:
         // Condition = Map<String, ConditionOrList>
         // ConditionOrList = Value | List<Condition>

         // In serialized JSON:
         // "OR": [ { "prop": "val" }, { "prop": "val2" } ] -> List of Conditions
         // "prop": "value" -> Value

         writer.writeU8(0); // Value
         writeConditionValue(writer, val);
    } else {
         // Primitive -> Value
         writer.writeU8(0); // Value
         writeConditionValue(writer, val);
    }
}
