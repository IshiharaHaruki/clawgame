/** Color palettes for agent characters. Extracted from SpriteGenerator.ts. */

export type Palette = [primary: string, secondary: string, accent: string];

/** 8 distinct color palettes for agent differentiation */
export const PALETTES: Palette[] = [
  ['#3498db', '#2c3e50', '#1a1a2e'], // blue
  ['#e74c3c', '#2c3e50', '#1a1a2e'], // red
  ['#2ecc71', '#2c3e50', '#1a1a2e'], // green
  ['#e67e22', '#34495e', '#1a1a2e'], // orange
  ['#9b59b6', '#2c3e50', '#1a1a2e'], // purple
  ['#1abc9c', '#2c3e50', '#1a1a2e'], // teal
  ['#f39c12', '#34495e', '#1a1a2e'], // yellow
  ['#e84393', '#2c3e50', '#1a1a2e'], // pink
];

export const OUTLINE = '#222034';
export const SKIN = '#f5cfa0';
export const EYES = '#222034';

/** Deterministic hash of agent ID to a positive integer */
export function hashAgentId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Return the full colour set for a given agent */
export const Palettes = {
  forAgent(agentId: string): {
    palette: Palette;
    outline: string;
    skin: string;
    eyes: string;
  } {
    const idx = hashAgentId(agentId) % PALETTES.length;
    return {
      palette: PALETTES[idx],
      outline: OUTLINE,
      skin: SKIN,
      eyes: EYES,
    };
  },
};
