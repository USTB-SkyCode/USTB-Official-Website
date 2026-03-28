import { generateBlocks } from './build/generateBlocks'
import { mergeTextures } from './build/mergeTextures'
import { processRandomVariants } from './build/processVariants'
import { generateBlockProperties } from './build/generateProperties'
import { copyColormaps } from './build/copyColormaps'
import { optimizeContext } from './build/optimization'
import { getResourceContexts } from './build/core/config'
import type { ResourceContext } from './build/core/types'
import { Logger } from './build/core/Logger'

async function runBuildPipeline(context: ResourceContext): Promise<void> {
  Logger.info(`Processing resource: ${context.resource.key} (${context.resource.label})`)

  Logger.step('Step 1: Merging textures & analyzing properties')
  await mergeTextures(context)

  Logger.step('Step 2: Generating optimized blocks')
  await generateBlocks(context)

  Logger.step('Step 2.5: Processing random variants (LUT)')
  await processRandomVariants(context)

  Logger.step('Step 3: Generating block properties (layers & emission)')
  await generateBlockProperties(context)

  Logger.step('Step 4: Copying colormaps')
  await copyColormaps(context)

  Logger.step('Step 5: Optimizing resources (packaging)')
  await optimizeContext(context)

  Logger.success(`Completed resource processing: ${context.resource.key}`)
}

async function main(): Promise<void> {
  const contexts = getResourceContexts()

  for (const context of contexts) {
    try {
      await runBuildPipeline(context)
    } catch (error) {
      Logger.error(`Build failed for resource ${context.resource.key}:`, error)
    }
  }
}

main().catch(error => {
  Logger.error('An unrecoverable error occurred during the build process:', error)
})
