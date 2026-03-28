import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../../core/Logger';

export interface LightRuleSimple {
    intensity: number;
    color?: [number, number, number];
}

export interface LightRuleComplex {
    property: string;
    values: Record<string, number>;
    color?: [number, number, number];
}

interface LightSources {
    simple: Record<string, number | LightRuleSimple>;
    complex: Record<string, LightRuleComplex>;
}

// Load emission rules from JSON
const __filename = fileURLToPath(import.meta.url);
// 这里的 dirname 是 build/logic/ 而非 build/
const __dirname = path.dirname(__filename);
// data 在 build/logic/../../data -> BlockPaser/data/light_sources.json
const LIGHT_SOURCES_PATH = path.resolve(__dirname, '../../../data/light_sources.json');

let LIGHT_SOURCES: LightSources = { simple: {}, complex: {} };

if (fs.existsSync(LIGHT_SOURCES_PATH)) {
    try {
        LIGHT_SOURCES = JSON.parse(fs.readFileSync(LIGHT_SOURCES_PATH, 'utf-8'));
        Logger.info(`[LightSource] Loaded ${Object.keys(LIGHT_SOURCES.simple).length} simple light rules, ${Object.keys(LIGHT_SOURCES.complex).length} complex.`);
    } catch (e) {
        Logger.error(`[LightSource] Failed to parse light_sources.json rules:`, e);
    }
} else {
    Logger.warn(`[LightSource] Warning: light_sources.json not found at ${LIGHT_SOURCES_PATH}`);
}

export function getLightSources(): LightSources {
    return LIGHT_SOURCES;
}

export function getSimpleRule(key: string): number | LightRuleSimple | undefined {
    // Try explicit full key first
    if (LIGHT_SOURCES.simple[key] !== undefined) return LIGHT_SOURCES.simple[key];

    // Try namespaced key
    const namespacedKey = key.includes(':') ? key : `minecraft:${key}`;
    return LIGHT_SOURCES.simple[namespacedKey];
}

export function getComplexRule(key: string): { rule: LightRuleComplex, key: string } | null {
    // Try explicit full key first
    if (LIGHT_SOURCES.complex[key]) {
        return { rule: LIGHT_SOURCES.complex[key], key };
    }

    // Try namespaced key
    const namespacedKey = key.includes(':') ? key : `minecraft:${key}`;
    if (LIGHT_SOURCES.complex[namespacedKey]) {
        return { rule: LIGHT_SOURCES.complex[namespacedKey], key: namespacedKey };
    }

    return null;
}
