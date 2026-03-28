import { CUTOUT_MIPPED_BLOCKS, RENDER_LAYER_OVERRIDES } from './constants';

export type RenderLayer = 'solid' | 'cutout' | 'cutout_mipped' | 'translucent';

export interface TextureProperties {
    transparency: 'solid' | 'cutout' | 'translucent'
    // Normalized bounds [minU, minV, maxU, maxV] in 0..1, optional.
    alpha_bounds?: [number, number, number, number]
    partial_alpha_bounds?: [number, number, number, number]
}

export interface TextureUsage {
    usedTextures: Set<string>
    unionUvBounds: Record<string, [number, number, number, number]>
}

export interface FaceLike {
    uv?: [number, number, number, number]
    texture: string
}

export function createTextureUsage(): TextureUsage {
    return {
        usedTextures: new Set<string>(),
        unionUvBounds: {}
    };
}

export function normalizeTextureName(name: string): string {
    return name
        .replace(/^minecraft:/, '')
        .replace(/^block\//, '')
        .replace(/\.png$/u, '');
}

function expandBounds(usage: TextureUsage, key: string, uv: [number, number, number, number]): void {
    const u0 = Math.min(uv[0], uv[2]) / 16;
    const v0 = Math.min(uv[1], uv[3]) / 16;
    const u1 = Math.max(uv[0], uv[2]) / 16;
    const v1 = Math.max(uv[1], uv[3]) / 16;
    const existing = usage.unionUvBounds[key];
    if (!existing) {
        usage.unionUvBounds[key] = [u0, v0, u1, v1];
        return;
    }
    existing[0] = Math.min(existing[0], u0);
    existing[1] = Math.min(existing[1], v0);
    existing[2] = Math.max(existing[2], u1);
    existing[3] = Math.max(existing[3], v1);
}

export function addFaceTextureUsage(
    usage: TextureUsage,
    face: FaceLike,
    textures?: Record<string, string>
): void {
    if (!face || !face.texture) return;
    const uv = face.uv ?? [0, 0, 16, 16];
    const texRef = face.texture;

    let resolved: string | undefined;
    if (texRef.startsWith('#')) {
        const varName = texRef.substring(1);
        resolved = textures?.[varName];
    } else {
        resolved = texRef;
    }

    if (!resolved) return;
    const norm = normalizeTextureName(resolved);
    usage.usedTextures.add(norm);
    expandBounds(usage, norm, uv);
}

function intersects(a?: [number, number, number, number], b?: [number, number, number, number]): boolean {
    if (!a || !b) return false;
    return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

export function classifyLayerFromUsage(
    usage: TextureUsage,
    textureProps: Record<string, TextureProperties>
): RenderLayer {
    let hasTranslucent = false;
    let hasCutout = false;

    for (const [texName, usedUv] of Object.entries(usage.unionUvBounds)) {
        const props = textureProps[texName];
        if (!props) continue;
        if (intersects(props.partial_alpha_bounds, usedUv)) {
            hasTranslucent = true;
        } else if (intersects(props.alpha_bounds, usedUv)) {
            hasCutout = true;
        }
    }

    if (!hasTranslucent) {
        for (const texName of usage.usedTextures) {
            const props = textureProps[texName];
            if (!props || props.transparency !== 'translucent') continue;
            if (!props.partial_alpha_bounds && !props.alpha_bounds) {
                hasTranslucent = true;
                break;
            }
        }
    }

    if (!hasTranslucent) {
        // Fallback by texture name for known translucent families (e.g., beacon glass).
        for (const texName of usage.usedTextures) {
            // Fix: packed_ice and blue_ice should not be translucent
            if (texName.includes('glass') || (texName.includes('ice') && !texName.includes('packed_ice') && !texName.includes('blue_ice'))) {
                hasTranslucent = true;
                break;
            }
        }
    }

    if (hasTranslucent) return 'translucent';
    if (hasCutout) return 'cutout';
    return 'solid';
}

export function determineBlockLayer(
    blockName: string,
    cleanName: string,
    def: { slots: Array<{ template: string; textures: Record<string, string> }> },
    textureProps: Record<string, TextureProperties>,
    templates: Record<string, { elements: Array<{ faces: Record<string, { uv?: [number, number, number, number]; texture: string }> }> }>
): RenderLayer {
    let layer: RenderLayer = 'solid';

    // 1. 优先应用手动覆盖
    for (const rule of RENDER_LAYER_OVERRIDES) {
        const hit = rule.mode === 'exact'
            ? cleanName === rule.key
            : cleanName.includes(rule.key);
        if (hit) {
            return rule.layer;
        }
    }

    // 2. 处理 Cutout Mipped 名单 (Leaves/etc)
    if (layer === 'solid' || layer === 'cutout') {
        const isCutoutMipped = CUTOUT_MIPPED_BLOCKS.some(k => cleanName.includes(k));
        if (isCutoutMipped) {
            return 'cutout_mipped';
        }
    }

    // 3. 未命中覆盖时再基于纹理扫描
    // 当纹理属性中存在半透明/Cutout时，提升层级
    // 只有在 solid 的情况下才进行扫描，避免覆盖之前的 override
    if (layer === 'solid') {
        const usage = createTextureUsage();

        if (def.slots && def.slots.length > 0) {
            for (const slot of def.slots) {
                if (!slot.textures || !slot.template) continue;
                const template = templates[slot.template];
                if (!template || !template.elements) continue;

                for (const el of template.elements) {
                    if (!el.faces) continue;
                    for (const face of Object.values(el.faces)) {
                        if (!face || !face.texture) continue;
                        addFaceTextureUsage(usage, face, slot.textures);
                    }
                }
            }
        }

        const scanLayer = classifyLayerFromUsage(usage, textureProps);
        if (scanLayer !== 'solid') layer = scanLayer;

        // 4. Fallback heuristics keywords (Compatible with Rust logic)
        // Only if still solid and texture properties were ambiguous or missing
        if (layer === 'solid') {
            const n = cleanName;
            if (n.includes('glass') || n.includes('ice') || n.includes('slime') || (n.includes('honey') && !n.includes('honeycomb'))) {
                layer = 'translucent';
            } else if (
                n.includes('leaves') || n.includes('sapling') || n.includes('flower') || n.includes('rail') ||
                n.includes('torch') || n.includes('fire') || n.includes('door') || n.includes('trapdoor') ||
                n.includes('ladder') || n.includes('pane') || n.includes('bars') || n.includes('mushroom')
            ) {
                layer = 'cutout';
            }
        }
    }

    return layer;
}
