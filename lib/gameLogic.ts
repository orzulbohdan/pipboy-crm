export type Difficulty = 'easy' | 'medium' | 'hard';

export const XP_REWARDS: Record<Difficulty, number> = {
  easy: 25,
  medium: 50,
  hard: 100,
};

export function calculateLevelUp(currentXp: number, currentLevel: number) {
  let level = currentLevel;
  let xp = currentXp;
  
  while (xp >= level * 100) {
    xp -= level * 100;
    level += 1;
  }
  
  return { level, remainingXp: xp };
}