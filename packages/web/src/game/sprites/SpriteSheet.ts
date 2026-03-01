import Phaser from 'phaser';
import { Palettes } from './Palettes';
import { ALL_POSES } from './PoseGrids';

function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: number[][],
  palette: string[],
  outline: string,
  skin: string,
  eyes: string,
  ox: number,
  oy: number,
): void {
  const colorMap: Record<number, string> = {
    1: outline,
    2: palette[0], // primary (shirt)
    3: palette[1], // secondary (pants)
    4: skin,
    5: eyes,
    6: palette[2] ?? '#4a3728', // accent (shoes)
  };
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const val = grid[y][x];
      if (val === 0) continue;
      ctx.fillStyle = colorMap[val] ?? '#ff00ff';
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

/**
 * Generate a sprite sheet atlas for the given agent ID.
 * All poses are laid out in a grid on a single canvas texture.
 * Returns the Phaser texture key.
 */
export function generateSpriteSheet(scene: Phaser.Scene, agentId: string): string {
  const textureKey = `agent-${agentId}-sheet`;
  if (scene.textures.exists(textureKey)) return textureKey;

  const { palette, outline, skin, eyes } = Palettes.forAgent(agentId);
  const frameSize = 16;
  const poses = ALL_POSES;
  const cols = 8;
  const rows = Math.ceil(poses.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * frameSize;
  canvas.height = rows * frameSize;
  const ctx = canvas.getContext('2d')!;

  poses.forEach((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * frameSize;
    const oy = row * frameSize;
    renderGrid(ctx, entry.grid, palette, outline, skin, eyes, ox, oy);
  });

  scene.textures.addCanvas(textureKey, canvas);
  // Register individual frame data so Phaser can reference them by index
  const texture = scene.textures.get(textureKey);
  poses.forEach((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    texture.add(i + 1, 0, col * frameSize, row * frameSize, frameSize, frameSize);
  });

  return textureKey;
}

// ---------------------------------------------------------------------------
// Pose index lookup (frame numbers are 1-based to match Phaser convention)
// ---------------------------------------------------------------------------

const POSE_INDEX_MAP = new Map<string, number>();

/** Get the 1-based frame index for a named pose. Falls back to frame 1. */
export function getPoseIndex(name: string): number {
  if (POSE_INDEX_MAP.size === 0) {
    ALL_POSES.forEach((p, i) => POSE_INDEX_MAP.set(p.name, i + 1));
  }
  return POSE_INDEX_MAP.get(name) ?? 1;
}
