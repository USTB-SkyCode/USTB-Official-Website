import { DEFAULT_WARM_COLOR } from './constants';
import { getLightSources, getSimpleRule, getComplexRule } from './lightSource';
// import { LightRuleSimple, LightRuleComplex } from './lightSource'; // Not strictly needed unless mapping

export type EmissionData = {
    color: [number, number, number];
    intensity: number;
    radius: number;
    is_lab_pbr: boolean;
};

export interface BlockEmissionResult {
    emission: EmissionData | null;
    slot_emissions: (EmissionData | null)[];
    state_dependent_light: boolean;
}

export function calculateBlockEmission(
    blockName: string,
    cleanName: string,
    def: { slots: Array<{ textures: Record<string, string>, template: string }> }
): BlockEmissionResult {
    let emission: EmissionData | null = null;
    let maxIntensity = 0;
    const slotEmissions: (EmissionData | null)[] = [];
    let stateDependentLight = false;

    // Check "Simple" rules (Always on)
    const fullKey = blockName;
    const namespacedKey = cleanName.includes(':') ? cleanName : `minecraft:${cleanName}`;

    let ruleIntensity = 0;
    let ruleColor: [number, number, number] = DEFAULT_WARM_COLOR;

    // 2.1 Check Simple Rules (Exact Match)
    const simpleRule = getSimpleRule(fullKey) || getSimpleRule(namespacedKey);

    // DEBUG LOGGING
    if (cleanName.includes('redstone_block') || cleanName.includes('repeater') || cleanName.includes('comparator')) {
         // console.log(`[EmissionDebug] ${blockName} | Simple: ${!!simpleRule} | Complex: ${!!getComplexRule(fullKey)}`);
         if (def.slots) {
             // console.log(`   Slots: ${def.slots.length} | Templates: ${def.slots.map(s => s.template).join(', ')}`);
         }
    }

    if (simpleRule !== undefined) {
        if (typeof simpleRule === 'number') {
            ruleIntensity = simpleRule;
        } else {
            ruleIntensity = simpleRule.intensity;
            if (simpleRule.color) ruleColor = simpleRule.color;
        }
    }

    // 2.3 Apply Rule to Global Emission (if simple rule exists)
    if (ruleIntensity > 0) {
        emission = {
            color: ruleColor,
            intensity: ruleIntensity / 15.0,
            radius: ruleIntensity,
            is_lab_pbr: false
        };
        maxIntensity = emission.intensity;
    }

    // 2.4 Check Slots (Based on Template Names / Model Names)
    // We infer state from the *model template name* used in each slot.
    // e.g. "repeater_on" implies powered=true.

    const simpleBaseName = fullKey.replace('minecraft:', '').split('[')[0];
    const simpleNSKey = `minecraft:${simpleBaseName}`;

    // Note: getComplexRule can take specific key (e.g. redstone_lamp) or generic name
    let targetRule = getComplexRule(fullKey);
    // Safety check: is it in simple list?
    const inSimple = (simpleRule !== undefined);

    if (def.slots && !inSimple) {
      if (!targetRule) targetRule = getComplexRule(simpleNSKey);

      if (targetRule) {
          stateDependentLight = true;
          const { rule, key: targetKey } = targetRule;
          const complexColor = rule.color || DEFAULT_WARM_COLOR;

          for (const slot of def.slots) {
              let slotEmission: EmissionData | null = null;
              let isActive = false;

              const tName = slot.template || '';
              // Combine template name and all texture names for detection
              const textureNames = slot.textures ? Object.values(slot.textures).join(' ') : '';
              const lowerT = (tName + ' ' + textureNames).toLowerCase();

              // Normalize Target Key for Checks (remove namespace)
              const baseTarget = targetKey.replace('minecraft:', '');

              if (baseTarget.includes('torch')) {
                   if (baseTarget.includes('redstone')) {
                       isActive = !lowerT.includes('_off') && !lowerT.includes('idle');
                   } else {
                       isActive = true; // Normal torches always lit
                   }
              } else if (baseTarget.includes('lamp')) {
                   isActive = lowerT.includes('_on');
              } else if (baseTarget.includes('repeater') || baseTarget.includes('comparator')) {
                   isActive = lowerT.includes('_on');
              } else if (baseTarget.includes('copper_bulb')) {
                   isActive = lowerT.includes('lit') || lowerT.includes('_on') || lowerT.includes('powered');
              } else if (baseTarget.includes('campfire')) {
                   isActive = !lowerT.includes('_off') && !lowerT.includes('extinguished');
                   if (baseTarget.includes('soul')) isActive = isActive && lowerT.includes('soul');
              } else if (baseTarget.includes('furnace') || baseTarget.includes('smoker')) {
                   isActive = lowerT.includes('_on') || lowerT.includes('lit');
              } else if (baseTarget.includes('candle')) {
                   isActive = lowerT.includes('lit') || lowerT.includes('_on');
              } else if (baseTarget.includes('sculk')) {
                   if (baseTarget === 'sculk_catalyst') isActive = lowerT.includes('bloom');
                   else if (baseTarget.includes('shrieker')) isActive = lowerT.includes('can_summon');
                   else isActive = true; // Sensor default?
              } else if (baseTarget.includes('respawn_anchor')) {
                   isActive = !lowerT.includes('_0') && !lowerT.includes('off');
              }

              if (isActive) {
                // DEBUG LOG
                if (simpleBaseName === 'repeater' || simpleBaseName === 'comparator') {
                     // console.log(`   [DEBUG] Slot Activated! Template: ${tName}`);
                }

                let maxVal = 0;
                if (rule.values) {
                     for (const v of Object.values(rule.values)) {
                        if (typeof v === 'number' && v > maxVal) maxVal = v;
                     }
                } else {
                    maxVal = 15;
                }

                if (maxVal > 0) {
                    const eData: EmissionData = {
                        color: complexColor,
                        intensity: maxVal / 15.0,
                        radius: maxVal,
                        is_lab_pbr: false
                    };

                    // Update global emission if not set or lower intensity
                    // This ensures blocks like furnace emit light even if we skip slot emission below
                    if (!emission || eData.intensity > emission.intensity) {
                        emission = eData;
                    }

                    // For furnace/smoker (block-like geometry with single slot),
                    // avoid applying surface emission to the whole block (which causes glowing sides).
                    // We rely on the texture brightness (vanilla behavior) or PBR maps.
                    if (baseTarget.includes('furnace') || baseTarget.includes('smoker') || baseTarget.includes('blast_furnace')) {
                        slotEmission = null;
                    } else {
                        slotEmission = eData;
                    }
                }
              }

              slotEmissions.push(slotEmission);
              if (slotEmission && slotEmission.intensity > maxIntensity) {
                  maxIntensity = slotEmission.intensity;
                  // if (!targetRule) emission = slotEmission;
              }
          }
      }
    }

    // 3. Post-Process (Color Corrections)
    if (emission) {
        // ... handled by baseColor logic mostly, but keep special cases
        if (cleanName.includes('nether_portal')) {
            const c: [number, number, number] = [0.6, 0.0, 0.8];
            if (emission) emission.color = c;
            for (const s of slotEmissions) if (s) s.color = c;
        }
    }

    return {
        emission,
        slot_emissions: slotEmissions,
        state_dependent_light: stateDependentLight
    };
}
