'use server';

import { supabase } from '@/lib/supabase';
import { getPriceAtTime } from '@/lib/game-engine';

export type Trade = {
  tick: number;
  type: 'buy' | 'sell';
  percentage: number;
  price: number;
};

/**
 * Validates the final score by re-simulating the trades.
 */
export async function submitScore(
  seed: string,
  trades: Trade[],
  reportedScore: number,
  accessToken?: string
) {
  if (accessToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: '' });
  }

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in to submit a score.' };
  }

  let balance = 1000;
  let holdings = 0;
  
  // Re-simulate trades based on the seed
  // Now 120 ticks for 60 seconds
  for (const trade of trades) {
    const actualPrice = getPriceAtTime(seed, trade.tick);
    
    if (Math.abs(actualPrice - trade.price) > 0.01) {
      return { success: false, error: 'Anti-cheat: Price verification failed.' };
    }

    if (trade.type === 'buy') {
      const amountToSpend = balance * trade.percentage;
      const unitsToBuy = amountToSpend / actualPrice;
      balance -= amountToSpend;
      holdings += unitsToBuy;
    } else {
      const unitsToSell = holdings * trade.percentage;
      const credit = unitsToSell * actualPrice;
      holdings -= unitsToSell;
      balance += credit;
    }
  }

  // Calculate final value at the end of the game (120 ticks = 60s)
  const finalPrice = getPriceAtTime(seed, 120);
  const finalValue = balance + holdings * finalPrice;

  if (Math.abs(finalValue - reportedScore) > 0.1) {
    return { success: false, error: 'Anti-cheat: Score verification failed.' };
  }

  // Save to Supabase with user_email for leaderboard display
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({ 
      user_id: user.id,
      user_email: user.email,
      seed, 
      final_score: finalValue, 
      is_verified: true,
      trades
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving score:', error);
    return { success: false, error: 'Failed to save score to leaderboard.' };
  }

  return { success: true, score: finalValue, id: data.id };
}

/**
 * Fetches the daily and weekly leaderboards.
 */
export async function getLeaderboards() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Start of the week (Monday)
  const startOfWeek = new Date(today);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  // Daily: Top scores for today
  const { data: dailyScores } = await supabase
    .from('game_sessions')
    .select('id, user_id, user_email, final_score, created_at')
    .gte('created_at', today.toISOString())
    .order('final_score', { ascending: false })
    .limit(10);

  // Weekly: Cumulative scores for the week
  const { data: weeklyScores } = await supabase
    .from('game_sessions')
    .select('user_email, final_score')
    .gte('created_at', startOfWeek.toISOString());

  // Aggregate weekly scores manually (since Supabase JS doesn't support GROUP BY well)
  const weeklyMap: Record<string, { user_email: string, total_score: number, games_played: number }> = {};
  
  (weeklyScores || []).forEach(score => {
    if (!weeklyMap[score.user_email]) {
      weeklyMap[score.user_email] = { user_email: score.user_email, total_score: 0, games_played: 0 };
    }
    weeklyMap[score.user_email].total_score += score.final_score;
    weeklyMap[score.user_email].games_played += 1;
  });

  const weeklyAggregated = Object.values(weeklyMap)
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10);

  return {
    daily: dailyScores || [],
    weekly: weeklyAggregated
  };
}
