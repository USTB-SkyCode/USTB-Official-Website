import * as fs from 'fs';
import * as path from 'path';
import type { ResourceContext } from '../core/types';
import { Logger } from '../core/Logger';

export async function copyColormaps(context: ResourceContext): Promise<void> {
    const colormapDir = 'assets/minecraft/textures/colormap';
    const targets = ['grass.png', 'foliage.png'];

    const outputDir = context.assestDir;
    const legacyIntermediateDir = path.resolve(context.intermediateDir, 'colormap');
    const legacyNestedDir = path.resolve(context.outputModelDir, colormapDir);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    if (fs.existsSync(legacyIntermediateDir)) {
        fs.rmSync(legacyIntermediateDir, { recursive: true, force: true });
    }
    if (fs.existsSync(legacyNestedDir)) {
        fs.rmSync(legacyNestedDir, { recursive: true, force: true });
    }

    // Iterate through packs to find colormaps.
    // We assume later packs in the list override earlier ones if they contain the file.
    // NOTE: Based on config.ts, 'minecraft' is often last, which means it might override custom packs
    // if we iterate in order. If custom packs are meant to override minecraft, we should check relevant order.
    // However, usually only minecraft has colormaps unless a specific pack provides them.
    for (const packPath of context.packPaths) {
        const srcDir = path.resolve(packPath, colormapDir);

        if (fs.existsSync(srcDir)) {
            for (const file of targets) {
                const srcFile = path.resolve(srcDir, file);
                const destFile = path.resolve(outputDir, file);

                if (fs.existsSync(srcFile)) {
                    // Copy file
                    fs.copyFileSync(srcFile, destFile);
                    Logger.debug(`[Colormap] Copied ${file} from ${path.basename(packPath)} to output.`);
                }
            }
        }
    }
}
