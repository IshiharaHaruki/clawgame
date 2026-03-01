/**
 * Accessory overlay grids for agent personalization.
 *
 * Each accessory is a 16x16 grid where 0 = transparent.
 * Non-zero pixels use color indices:
 *   7 = accessory primary color
 *   8 = accessory secondary color
 *
 * Accessories are composited on top of the base sprite grid
 * after the main character is rendered.
 */

import type { AgentIdentity } from '../../types';

export type AccessoryId = 'glasses' | 'headphones' | 'hat' | 'coffee_mug';

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

function createEmptyGrid(): number[][] {
  return Array.from({ length: 16 }, () => Array(16).fill(0));
}

function setPixels(grid: number[][], pixels: [row: number, col: number, val: number][]): void {
  for (const [row, col, val] of pixels) {
    if (row >= 0 && row < 16 && col >= 0 && col < 16) {
      grid[row][col] = val;
    }
  }
}

// ---------------------------------------------------------------------------
// Accessory grids (designed for the standing-front pose layout)
//
// Standing pose reference (STAND_1):
//   Row 0:  head top outline  (cols 6-9)
//   Row 1:  head top skin     (cols 6-9)
//   Row 2:  head mid skin     (cols 4-11)
//   Row 3:  eyes              (cols 6,9 = eyes; 4,5,7,8,10 = skin)
//   Row 4:  lower face skin   (cols 4-11)
//   Row 5:  chin/neck         (cols 6-9)
//   Row 6:  neck outline      (cols 6-9)
// ---------------------------------------------------------------------------

// Glasses: frames around eye positions at row 3
const GLASSES_GRID: number[][] = createEmptyGrid();
setPixels(GLASSES_GRID, [
  // Left lens frame
  [2, 5, 7], [2, 6, 7], [2, 7, 7],
  [3, 5, 7],             [3, 7, 7],
  [4, 5, 7], [4, 6, 7], [4, 7, 7],
  // Bridge
  [2, 8, 7],
  // Right lens frame
  [2, 8, 7], [2, 9, 7], [2, 10, 7],
  [3, 8, 7],              [3, 10, 7],
  [4, 8, 7], [4, 9, 7], [4, 10, 7],
  // Lens tint (secondary color)
  [3, 6, 8], [3, 9, 8],
]);

// Headphones: band across top of head + ear cups on sides
const HEADPHONES_GRID: number[][] = createEmptyGrid();
setPixels(HEADPHONES_GRID, [
  // Headband across top
  [0, 5, 7], [0, 6, 7], [0, 7, 7], [0, 8, 7], [0, 9, 7], [0, 10, 7],
  // Side straps
  [1, 4, 7], [1, 11, 7],
  [2, 3, 7], [2, 12, 7],
  // Ear cups (secondary color)
  [3, 3, 8], [3, 12, 8],
  [4, 3, 8], [4, 12, 8],
]);

// Hat: beanie sitting on top of head
const HAT_GRID: number[][] = createEmptyGrid();
setPixels(HAT_GRID, [
  // Pom-pom / top
  [0, 7, 8], [0, 8, 8],
  // Hat crown -- drawn OVER the head outline/skin
  [1, 5, 7], [1, 6, 7], [1, 7, 8], [1, 8, 8], [1, 9, 7], [1, 10, 7],
  // Hat brim
  [2, 4, 7], [2, 5, 8], [2, 6, 8], [2, 7, 7], [2, 8, 7], [2, 9, 8], [2, 10, 8], [2, 11, 7],
]);

// Coffee mug: held in right hand area (only makes sense in non-sip standing poses)
const COFFEE_MUG_GRID: number[][] = createEmptyGrid();
setPixels(COFFEE_MUG_GRID, [
  // Steam
  [7, 13, 8],
  // Cup body
  [8, 12, 7], [8, 13, 7],
  [9, 12, 7], [9, 13, 8], [9, 14, 7],
  [10, 12, 7], [10, 13, 7],
]);

// ---------------------------------------------------------------------------
// Accessory definitions with default colors
// ---------------------------------------------------------------------------

export interface AccessoryDef {
  grid: number[][];
  primaryColor: string;   // index 7
  secondaryColor: string; // index 8
}

export const ACCESSORY_GRIDS: Record<AccessoryId, AccessoryDef> = {
  glasses:    { grid: GLASSES_GRID,    primaryColor: '#2c3e50', secondaryColor: '#85c1e9' },
  headphones: { grid: HEADPHONES_GRID, primaryColor: '#2c3e50', secondaryColor: '#e74c3c' },
  hat:        { grid: HAT_GRID,        primaryColor: '#8e44ad', secondaryColor: '#d2b4de' },
  coffee_mug: { grid: COFFEE_MUG_GRID, primaryColor: '#f5f5dc', secondaryColor: '#6f4e37' },
};

// ---------------------------------------------------------------------------
// Agent -> Accessory mapping
// ---------------------------------------------------------------------------

/**
 * Determine which accessories an agent should have based on identity.
 * Falls back to a deterministic hash of the agent ID.
 */
export function getAccessoriesForAgent(agentId: string, identity?: AgentIdentity): AccessoryId[] {
  if (identity?.theme) {
    const accessories: AccessoryId[] = [];

    if (identity.theme === 'research') accessories.push('glasses');
    if (identity.theme === 'ops') accessories.push('headphones');
    if (identity.theme === 'creative') accessories.push('hat');

    if (accessories.length > 0) return accessories;
  }

  // Default: deterministic from agent ID hash
  return getDefaultAccessories(agentId);
}

function getDefaultAccessories(agentId: string): AccessoryId[] {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
  }

  const allAccessories: AccessoryId[] = ['glasses', 'headphones', 'hat', 'coffee_mug'];
  // +2 gives roughly 1/3 chance of no accessories
  const idx = Math.abs(hash) % (allAccessories.length + 2);

  if (idx >= allAccessories.length) return [];
  return [allAccessories[idx]];
}
