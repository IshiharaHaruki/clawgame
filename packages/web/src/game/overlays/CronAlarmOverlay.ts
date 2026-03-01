import Phaser from 'phaser';

// 12x12 alarm clock pixel art
// 0 = transparent, 1 = dark outline, 2 = clock hands / accent
const ALARM_GRID = [
  [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 2, 2, 2, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

function generateAlarmTexture(scene: Phaser.Scene): string {
  const textureKey = 'cron-alarm-icon';
  if (scene.textures.exists(textureKey)) return textureKey;

  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 12;
  const ctx = canvas.getContext('2d')!;

  const colorMap: Record<number, string> = {
    1: '#1a1a2e', // outline
    2: '#3498db', // clock hands / fill
  };

  for (let y = 0; y < ALARM_GRID.length; y++) {
    for (let x = 0; x < ALARM_GRID[y].length; x++) {
      const val = ALARM_GRID[y][x];
      if (val === 0) continue;
      ctx.fillStyle = colorMap[val] ?? '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  scene.textures.addCanvas(textureKey, canvas);
  return textureKey;
}

export class CronAlarmOverlay {
  static create(
    scene: Phaser.Scene,
    x: number,
    y: number,
  ): Phaser.GameObjects.Sprite {
    const textureKey = generateAlarmTexture(scene);
    const sprite = scene.add.sprite(x, y, textureKey);
    sprite.setScale(0);

    // Pop-in
    scene.tweens.add({
      targets: sprite,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    // Shake animation
    scene.tweens.add({
      targets: sprite,
      x: { from: x - 2, to: x + 2 },
      yoyo: true,
      repeat: -1,
      duration: 80,
      ease: 'Sine.easeInOut',
    });

    return sprite;
  }

  static dismiss(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
  ): void {
    scene.tweens.killTweensOf(sprite);
    scene.tweens.add({
      targets: sprite,
      alpha: 0,
      scale: 0.5,
      duration: 150,
      onComplete: () => sprite.destroy(),
    });
  }
}
