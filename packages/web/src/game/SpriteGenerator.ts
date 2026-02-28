import Phaser from 'phaser';

const PALETTES = [
  { shirt: '#3498db', pants: '#2c3e50', shoes: '#1a1a2e' }, // blue
  { shirt: '#e74c3c', pants: '#2c3e50', shoes: '#1a1a2e' }, // red
  { shirt: '#2ecc71', pants: '#2c3e50', shoes: '#1a1a2e' }, // green
  { shirt: '#e67e22', pants: '#34495e', shoes: '#1a1a2e' }, // orange
  { shirt: '#9b59b6', pants: '#2c3e50', shoes: '#1a1a2e' }, // purple
  { shirt: '#1abc9c', pants: '#2c3e50', shoes: '#1a1a2e' }, // teal
  { shirt: '#f39c12', pants: '#34495e', shoes: '#1a1a2e' }, // yellow
  { shirt: '#e84393', pants: '#2c3e50', shoes: '#1a1a2e' }, // pink
];

const OUTLINE = '#222034';
const SKIN = '#f5cfa0';
const EYES = '#222034';

// 16x16 standing character grid (0=transparent, 1=outline, 2=skin, 3=eyes, 4=shirt, 5=pants, 6=shoes)
// prettier-ignore
const STAND_GRID: number[][] = [
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
  [0,0,0,0,1,2,3,2,2,3,2,1,0,0,0,0],
  [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0],
  [0,0,1,2,1,4,4,4,4,4,4,1,2,1,0,0],
  [0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0],
  [0,0,0,0,0,1,5,5,5,5,1,0,0,0,0,0],
  [0,0,0,0,0,1,5,5,5,5,1,0,0,0,0,0],
  [0,0,0,0,0,1,5,1,5,5,1,0,0,0,0,0],
  [0,0,0,0,0,1,6,1,1,6,1,0,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0],
];

// 16x16 sitting character grid (shorter, no legs visible)
// prettier-ignore
const SIT_GRID: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
  [0,0,0,0,1,2,3,2,2,3,2,1,0,0,0,0],
  [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,1,4,4,4,4,4,4,4,4,1,0,0,0],
  [0,0,1,2,1,4,4,4,4,4,4,1,2,1,0,0],
  [0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0],
  [0,0,0,0,0,1,5,5,5,5,1,0,0,0,0,0],
  [0,0,0,0,1,5,5,5,5,5,5,1,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
];

function hashAgentId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function renderGrid(grid: number[][], palette: (typeof PALETTES)[number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  const colorMap: Record<number, string> = {
    1: OUTLINE,
    2: SKIN,
    3: EYES,
    4: palette.shirt,
    5: palette.pants,
    6: palette.shoes,
  };

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = grid[y][x];
      if (idx === 0) continue;
      ctx.fillStyle = colorMap[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  return canvas;
}

export function generateCharacterTextures(scene: Phaser.Scene, agentId: string): void {
  const paletteIndex = hashAgentId(agentId) % PALETTES.length;
  const palette = PALETTES[paletteIndex];

  const standKey = `agent-${agentId}-stand`;
  const sitKey = `agent-${agentId}-sit`;

  if (!scene.textures.exists(standKey)) {
    const standCanvas = renderGrid(STAND_GRID, palette);
    scene.textures.addCanvas(standKey, standCanvas);
  }

  if (!scene.textures.exists(sitKey)) {
    const sitCanvas = renderGrid(SIT_GRID, palette);
    scene.textures.addCanvas(sitKey, sitCanvas);
  }
}
