import type Phaser from 'phaser';
import { getPoseIndex } from './SpriteSheet';

/**
 * Register all character animations for a given agent.
 * Animation keys follow the pattern `${agentId}-${name}`.
 */
export function registerAnimations(scene: Phaser.Scene, agentId: string): void {
  const key = (name: string) => `${agentId}-${name}`;
  const tex = `agent-${agentId}-sheet`;

  const create = (
    animKey: string,
    frames: number[],
    frameRate: number,
    repeat = -1,
  ) => {
    if (scene.anims.exists(animKey)) return;
    scene.anims.create({
      key: animKey,
      frames: frames.map((f) => ({ key: tex, frame: f })),
      frameRate,
      repeat,
    });
  };

  // Idle breathing
  create(key('idle'), [getPoseIndex('STAND_1'), getPoseIndex('STAND_2')], 2);

  // Typing at desk
  create(
    key('type'),
    [getPoseIndex('TYPE_1'), getPoseIndex('TYPE_2'), getPoseIndex('TYPE_3')],
    6,
  );

  // Walking in four directions
  create(
    key('walk-down'),
    [
      getPoseIndex('WALK_D_1'),
      getPoseIndex('WALK_D_2'),
      getPoseIndex('WALK_D_3'),
      getPoseIndex('WALK_D_4'),
    ],
    8,
  );
  create(
    key('walk-up'),
    [
      getPoseIndex('WALK_U_1'),
      getPoseIndex('WALK_U_2'),
      getPoseIndex('WALK_U_3'),
      getPoseIndex('WALK_U_4'),
    ],
    8,
  );
  create(
    key('walk-left'),
    [
      getPoseIndex('WALK_L_1'),
      getPoseIndex('WALK_L_2'),
      getPoseIndex('WALK_L_3'),
      getPoseIndex('WALK_L_4'),
    ],
    8,
  );
  create(
    key('walk-right'),
    [
      getPoseIndex('WALK_R_1'),
      getPoseIndex('WALK_R_2'),
      getPoseIndex('WALK_R_3'),
      getPoseIndex('WALK_R_4'),
    ],
    8,
  );

  // Coffee sip
  create(
    key('sip'),
    [getPoseIndex('SIP_1'), getPoseIndex('SIP_2'), getPoseIndex('SIP_3')],
    2,
  );

  // Error / confused
  create(
    key('error'),
    [getPoseIndex('ERROR_1'), getPoseIndex('ERROR_2')],
    3,
  );

  // Cron / alert
  create(
    key('cron'),
    [getPoseIndex('CRON_1'), getPoseIndex('CRON_2')],
    4,
  );
}
