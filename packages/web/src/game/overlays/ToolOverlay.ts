import Phaser from 'phaser';

// Tool icon definitions - 12x12 pixel grids
// 0 = transparent, 1 = dark outline, 2 = fill color, 3 = highlight
const TOOL_ICONS: Record<string, { grid: number[][]; color: string; highlight: string }> = {
  magnify: {
    color: '#3498db',
    highlight: '#85c1e9',
    grid: [
      [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 2, 2, 2, 1, 0, 0, 0, 0],
      [0, 0, 1, 2, 3, 3, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 3, 2, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0, 0],
      [0, 0, 0, 1, 2, 2, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  terminal: {
    color: '#2ecc71',
    highlight: '#82e0aa',
    grid: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
      [1, 2, 3, 3, 2, 2, 2, 2, 2, 2, 1, 0],
      [1, 2, 2, 3, 3, 2, 2, 2, 2, 2, 1, 0],
      [1, 2, 3, 3, 2, 2, 2, 2, 2, 2, 1, 0],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
      [1, 2, 2, 2, 2, 3, 3, 3, 2, 2, 1, 0],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  document: {
    color: '#f39c12',
    highlight: '#f9e79f',
    grid: [
      [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 1, 1, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 3, 3, 3, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 3, 3, 3, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 3, 3, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  pencil: {
    color: '#e74c3c',
    highlight: '#f1948a',
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0],
      [0, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0],
      [0, 0, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  folder: {
    color: '#9b59b6',
    highlight: '#d2b4de',
    grid: [
      [0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      [1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0],
      [1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 0, 0],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0],
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  thinking: {
    // Generic "thinking" icon for inferred tool activity
    color: '#bdc3c7',
    highlight: '#ecf0f1',
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0, 0],
      [0, 0, 1, 2, 3, 2, 3, 2, 1, 0, 0, 0],
      [0, 0, 0, 1, 2, 2, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
};

// Map tool names to icon types
const TOOL_ICON_MAP: Record<string, string> = {
  WebSearch: 'magnify',
  Bash: 'terminal',
  Read: 'document',
  Write: 'document',
  Grep: 'magnify',
  Edit: 'pencil',
  Glob: 'folder',
  WebFetch: 'magnify',
  Agent: 'thinking',
};

function getIconKey(toolName: string): string {
  return TOOL_ICON_MAP[toolName] ?? 'thinking';
}

function generateIconTexture(scene: Phaser.Scene, iconKey: string): string {
  const textureKey = `tool-icon-${iconKey}`;
  if (scene.textures.exists(textureKey)) return textureKey;

  const icon = TOOL_ICONS[iconKey];
  if (!icon) return textureKey;

  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 12;
  const ctx = canvas.getContext('2d')!;

  const colorMap: Record<number, string> = {
    1: '#1a1a2e', // outline
    2: icon.color,
    3: icon.highlight,
  };

  for (let y = 0; y < icon.grid.length; y++) {
    for (let x = 0; x < icon.grid[y].length; x++) {
      const val = icon.grid[y][x];
      if (val === 0) continue;
      ctx.fillStyle = colorMap[val] ?? '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  scene.textures.addCanvas(textureKey, canvas);
  return textureKey;
}

export class ToolOverlay {
  static create(
    scene: Phaser.Scene,
    toolName: string,
    x: number,
    y: number,
  ): Phaser.GameObjects.Sprite {
    const iconKey = getIconKey(toolName);
    const textureKey = generateIconTexture(scene, iconKey);
    const sprite = scene.add.sprite(x, y, textureKey);
    sprite.setScale(0);
    // Pop-in animation
    scene.tweens.add({
      targets: sprite,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
    return sprite;
  }

  static createInferred(
    scene: Phaser.Scene,
    x: number,
    y: number,
  ): Phaser.GameObjects.Sprite {
    const textureKey = generateIconTexture(scene, 'thinking');
    const sprite = scene.add.sprite(x, y, textureKey);
    sprite.setScale(0);
    sprite.setAlpha(0.6);
    scene.tweens.add({
      targets: sprite,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
    // Gentle pulse for inferred
    scene.tweens.add({
      targets: sprite,
      alpha: { from: 0.4, to: 0.8 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    return sprite;
  }

  static dismiss(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): void {
    scene.tweens.add({
      targets: sprite,
      alpha: 0,
      scale: 0.5,
      duration: 150,
      onComplete: () => sprite.destroy(),
    });
  }
}
