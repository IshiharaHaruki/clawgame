import Phaser from 'phaser';

export class LayerManager {
  readonly background: Phaser.GameObjects.Container;
  readonly furniture: Phaser.GameObjects.Container;
  readonly agents: Phaser.GameObjects.Container;
  readonly overlays: Phaser.GameObjects.Container;
  readonly ui: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.background = scene.add.container(0, 0).setDepth(0);
    this.furniture = scene.add.container(0, 0).setDepth(10);
    this.agents = scene.add.container(0, 0).setDepth(20);
    this.overlays = scene.add.container(0, 0).setDepth(30);
    this.ui = scene.add.container(0, 0).setDepth(40);
  }
}
