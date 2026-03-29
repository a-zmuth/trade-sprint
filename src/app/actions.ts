'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { getPriceAtTime } from '@/lib/game-engine';
import { revalidatePath } from 'next/cache';

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
  if (!accessToken) {
    return { success: false, error: 'Access token missing. Please sign in again.' };
  }

  const supabase = createServerSupabaseClient(accessToken);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Auth error in submitScore:', authError);
    return { success: false, error: 'You must be logged in to submit a score.' };
  }

  let balance = 1000;
  let holdings = 0;
  
  // Re-simulate trades based on the seed
  // Now 120 ticks for 60 seconds
  for (const trade of trades) {
    const actualPrice = getPriceAtTime(seed, trade.tick);
    
    // Allow a small margin for floating point errors or minor timing diffs
    if (Math.abs(actualPrice - trade.price) > 0.05) {
      return { success: false, error: `Anti-cheat: Price verification failed. Expected ${actualPrice.toFixed(2)}, got ${trade.price.toFixed(2)}` };
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

  if (Math.abs(finalValue - reportedScore) > 0.5) {
    return { success: false, error: `Anti-cheat: Score verification failed. Calculated ${finalValue.toFixed(2)}, reported ${reportedScore.toFixed(2)}` };
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
    return { success: false, error: 'Failed to save score to leaderboard. Error: ' + error.message };
  }

  revalidatePath('/');
  return { success: true, score: finalValue, id: data.id };
}

/**
 * Fetches the daily and weekly leaderboards.
 */
export async function getLeaderboards() {
  const supabase = createServerSupabaseClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Start of the week (Monday)
  const startOfWeek = new Date(today);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  // Daily: Top scores for today
  // We use .select() with no parameters to ensure we get all columns if needed, 
  // but explicitly naming them is better for performance.
  const { data: dailyScores, error: dailyError } = await supabase
    .from('game_sessions')
    .select('id, user_id, user_email, final_score, created_at')
    .gte('created_at', today.toISOString())
    .order('final_score', { ascending: false })
    .limit(10);

  if (dailyError) console.error('Error fetching daily leaderboard:', dailyError);

  // Weekly: Cumulative scores for the week
  const { data: weeklyScores, error: weeklyError } = await supabase
    .from('game_sessions')
    .select('user_email, final_score')
    .gte('created_at', startOfWeek.toISOString());

  if (weeklyError) console.error('Error fetching weekly leaderboard:', weeklyError);

  // Aggregate weekly scores manually
  const weeklyMap: Record<string, { user_email: string, total_score: number, games_played: number }> = {};
  
  (weeklyScores || []).forEach(score => {
    // Fallback if user_email is somehow null
    const email = score.user_email || 'Anonymous';
    if (!weeklyMap[email]) {
      weeklyMap[email] = { user_email: email, total_score: 0, games_played: 0 };
    }
    weeklyMap[email].total_score += score.final_score;
    weeklyMap[email].games_played += 1;
  });

  const weeklyAggregated = Object.values(weeklyMap)
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10);

  return {
    daily: dailyScores || [],
    weekly: weeklyAggregated
  };
}

/**
 * Fetches statistics for the current user.
 */
export async function getUserStats(accessToken: string) {
  if (!accessToken) return null;
  const supabase = createServerSupabaseClient(accessToken);
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('Auth error in getUserStats:', authError);
    return null;
  }

  const { data: sessions, error: sessionError } = await supabase
    .from('game_sessions')
    .select('final_score, created_at')
    .eq('user_id', user.id);

  if (sessionError) {
    console.error('Error fetching user sessions:', sessionError);
    return null;
  }

  if (!sessions || sessions.length === 0) return {
    totalGames: 0,
    totalScore: 0,
    bestScore: 0,
    avgScore: 0,
    lastPlayed: null
  };

  const totalGames = sessions.length;
  const totalScore = sessions.reduce((acc, s) => acc + s.final_score, 0);
  const bestScore = Math.max(0, ...sessions.map(s => s.final_score));
  const avgScore = totalScore / totalGames;

  return {
    totalGames,
    totalScore,
    bestScore,
    avgScore,
    lastPlayed: [...sessions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
  };
}
