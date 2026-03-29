import seedrandom from 'seedrandom';

/**
 * Calculates the price of the asset at a specific tick using a seeded random walk.
 * 
 * @param seed The unique seed for the game session.
 * @param tick Current time step (0.5 - 1s intervals).
 * @param basePrice Starting price of the asset (default 100).
 * @returns The calculated price at the given tick.
 */
export const getPriceAtTime = (seed: string, tick: number, basePrice: number = 100): number => {
  // Use the seed combined with the tick for deterministic generation
  const rng = seedrandom(`${seed}-${tick}`);
  
  // Max move per tick (e.g., 2% volatility)
  const volatility = 0.02;
  const change = (rng() - 0.5) * 2 * volatility;
  
  // Return price relative to the previous price (this isn't truly Markovian 
  // without storing state, so let's use a simpler accumulation for MVP)
  // For a pure random walk, we'd need to iterate from 0 to tick,
  // but for high performance we can approximate or use a loop.
  
  let currentPrice = basePrice;
  for (let i = 1; i <= tick; i++) {
    const stepRng = seedrandom(`${seed}-${i}`);
    const stepChange = (stepRng() - 0.5) * 2 * volatility;
    currentPrice *= (1 + stepChange);
  }
  
  return currentPrice;
};

/**
 * Formats a number as a currency string.
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
