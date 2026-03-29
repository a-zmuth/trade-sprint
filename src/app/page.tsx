'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Play, RefreshCcw } from 'lucide-react';
import { getPriceAtTime, formatCurrency } from '@/lib/game-engine';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [tick, setTick] = useState(0);
  const [price, setPrice] = useState(100);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [balance, setBalance] = useState(1000);
  const [holdings, setHoldings] = useState(0);
  const [seed, setSeed] = useState('');
  const [user, setUser] = useState<any>(null);
  const [trades, setTrades] = useState<{tick: number, type: 'buy' | 'sell', percentage: number, price: number}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{success: boolean, error?: string} | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<{totalGames: number, totalScore: number, bestScore: number, avgScore: number, lastPlayed: string | null} | null>(null);
  const [view, setView] = useState<'game' | 'dashboard'>('game');
  
  const GAME_DURATION = 60; // seconds
  const TICK_RATE = 500; // ms

  // Fetch User Stats
  const fetchUserStats = useCallback(async (token: string) => {
    try {
      const { getUserStats } = await import('./actions');
      const stats = await getUserStats(token);
      setUserStats(stats);
    } catch (e) {
      console.error('Failed to fetch user stats:', e);
    }
  }, []);

  // Check for user session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user ?? null);
      if (session?.access_token) fetchUserStats(session.access_token);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      setUser(session?.user ?? null);
      if (session?.access_token) fetchUserStats(session.access_token);
      else setUserStats(null);
    });

    return () => subscription.unsubscribe();
  }, [fetchUserStats]);

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) alert(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Fetch Leaderboards
  const fetchLeaderboards = useCallback(async () => {
    try {
      const { getLeaderboards } = await import('./actions');
      const data = await getLeaderboards();
      setLeaderboard(data.daily);
      setWeeklyLeaderboard(data.weekly);
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboards();
  }, [fetchLeaderboards]);

  // Start the game
  const startGame = () => {
    const newSeed = Math.random().toString(36).substring(7);
    setSeed(newSeed);
    setTick(0);
    setPrice(100);
    setPriceHistory([100]);
    setBalance(1000);
    setHoldings(0);
    setTrades([]);
    setVerificationResult(null);
    setGameState('playing');
    setView('game');
  };

  // Submit score to server
  const finishGame = async (finalPortfolioValue: number, currentTrades: typeof trades) => {
    setIsSubmitting(true);
    try {
      const { submitScore } = await import('./actions');
      const { data: { session } } = await supabase.auth.getSession();
      const result = await submitScore(seed, currentTrades, finalPortfolioValue, session?.access_token);
      setVerificationResult(result);
      fetchLeaderboards();
      if (session?.access_token) fetchUserStats(session.access_token);
    } catch (e) {
      setVerificationResult({ success: false, error: 'Failed to connect to server.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Game Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setTick((prev) => {
          const nextTick = prev + 1;
          if (nextTick > GAME_DURATION * 2) {
            setGameState('finished');
            // Use functional state updates to get current values
            setBalance((currBalance) => {
              setHoldings((currHoldings) => {
                setPrice((currPrice) => {
                  setTrades((currTrades) => {
                    const finalValue = currBalance + currHoldings * currPrice;
                    finishGame(finalValue, currTrades);
                    return currTrades;
                  });
                  return currPrice;
                });
                return currHoldings;
              });
              return currBalance;
            });
            clearInterval(interval);
            return prev;
          }
          
          const nextPrice = getPriceAtTime(seed, nextTick);
          setPrice(nextPrice);
          setPriceHistory((history) => [...history, nextPrice].slice(-20));
          return nextTick;
        });
      }, TICK_RATE);
    }
    
    return () => clearInterval(interval);
  }, [gameState, seed]);

  const buy = (percentage: number) => {
    const amountToSpend = balance * percentage;
    const unitsToBuy = amountToSpend / price;
    setBalance((prev) => prev - amountToSpend);
    setHoldings((prev) => prev + unitsToBuy);
    setTrades((prev) => [...prev, { tick, type: 'buy', percentage, price }]);
  };

  const sell = (percentage: number) => {
    const unitsToSell = holdings * percentage;
    const credit = unitsToSell * price;
    setHoldings((prev) => prev - unitsToSell);
    setBalance((prev) => prev + credit);
    setTrades((prev) => [...prev, { tick, type: 'sell', percentage, price }]);
  };

  const portfolioValue = balance + holdings * price;
  const pnl = portfolioValue - 1000;
  const pnlPercent = (pnl / 1000) * 100;

  return (
    <main className="min-h-screen bg-black text-white p-4 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-emerald-500 w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight uppercase">Trade Sprint</h1>
          </div>
          <div className="flex items-center gap-4">
            {gameState === 'playing' && (
              <div className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-mono font-bold">
                {Math.max(0, Math.ceil(GAME_DURATION - tick / 2))}s
              </div>
            )}
            {user && (
              <button 
                onClick={() => setView(view === 'game' ? 'dashboard' : 'game')}
                className="text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-tighter"
              >
                {view === 'game' ? 'Dashboard' : 'Game'}
              </button>
            )}
            {!user ? (
              <button onClick={signIn} className="text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-tighter">Sign In</button>
            ) : (
              <button onClick={signOut} className="text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-tighter">Sign Out</button>
            )}
          </div>
        </header>

        {view === 'dashboard' ? (
           <div className="space-y-6">
              <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800">
                <div className="flex items-center gap-4 mb-4">
                   <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-2xl font-bold text-black">
                      {user.email?.[0].toUpperCase()}
                   </div>
                   <div>
                      <div className="text-zinc-400 text-xs uppercase tracking-widest">Signed in as</div>
                      <div className="text-lg font-bold">{user.email}</div>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
                   <div>
                      <div className="text-zinc-400 text-[10px] uppercase tracking-widest">Member Since</div>
                      <div className="font-mono text-sm">{new Date(user.created_at).toLocaleDateString()}</div>
                   </div>
                   <div>
                      <div className="text-zinc-400 text-[10px] uppercase tracking-widest">Status</div>
                      <div className="text-emerald-500 text-sm font-bold">PRO TRADER</div>
                   </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 px-2">Your Performance</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
                    <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">Games Played</div>
                    <div className="font-mono font-bold text-lg">{userStats?.totalGames ?? 0}</div>
                  </div>
                  <div className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
                    <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">Best Score</div>
                    <div className="font-mono font-bold text-lg text-emerald-500">{formatCurrency(userStats?.bestScore ?? 0)}</div>
                  </div>
                  <div className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
                    <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">Avg Score</div>
                    <div className="font-mono font-bold text-lg">{formatCurrency(userStats?.avgScore ?? 0)}</div>
                  </div>
                  <div className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
                    <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">Last Played</div>
                    <div className="font-mono font-bold text-[10px]">
                      {userStats?.lastPlayed ? new Date(userStats.lastPlayed).toLocaleDateString() : 'Never'}
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setView('game')}
                className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                BACK TO GAME
              </button>
           </div>
        ) : (
        <>
        {/* Portfolio Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase mb-1">
              <Wallet className="w-3 h-3" />
              <span>Balance</span>
            </div>
            <div className="text-lg font-bold">{formatCurrency(balance)}</div>
          </div>
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase mb-1">
              <TrendingUp className="w-3 h-3" />
              <span>PnL</span>
            </div>
            <div className={`text-lg font-bold ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Price Display */}
        <div className="text-center py-8">
          <div className="text-sm text-zinc-400 uppercase font-medium mb-1 tracking-widest">BTC / USD</div>
          <div className="text-5xl font-black font-mono tracking-tighter">
            {price.toFixed(2)}
          </div>
          <div className="flex justify-center mt-2">
             <div className="flex items-center gap-1 text-zinc-500 text-sm">
                <span>Holdings:</span>
                <span className="font-mono text-white">{holdings.toFixed(4)}</span>
             </div>
          </div>
        </div>

        {/* Mini Chart (Simplified) */}
        <div className="h-32 flex items-end justify-between gap-1 px-2">
          {priceHistory.map((p, i) => {
            const min = Math.min(...priceHistory);
            const max = Math.max(...priceHistory);
            const range = max - min || 1;
            const height = ((p - min) / range) * 100;
            return (
              <div 
                key={i} 
                className={`w-full rounded-t-sm transition-all duration-300 ${p >= (priceHistory[i-1] || p) ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ height: `${Math.max(10, height)}%` }}
              />
            );
          })}
        </div>

        {/* Actions */}
        {gameState === 'idle' ? (
          <button 
            onClick={startGame}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Play className="fill-current" />
            START SPRINT
          </button>
        ) : gameState === 'playing' ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input 
                type="number"
                placeholder="Custom % (e.g. 50)"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 font-mono text-sm focus:outline-none focus:border-emerald-500"
              />
              <button 
                onClick={() => {
                  const val = parseFloat(customAmount);
                  if (!isNaN(val) && val > 0 && val <= 100) buy(val / 100);
                  setCustomAmount('');
                }}
                className="bg-emerald-500/10 text-emerald-500 px-4 rounded-xl text-xs font-bold uppercase hover:bg-emerald-500/20"
              >
                Buy Custom
              </button>
              <button 
                onClick={() => {
                  const val = parseFloat(customAmount);
                  if (!isNaN(val) && val > 0 && val <= 100) sell(val / 100);
                  setCustomAmount('');
                }}
                className="bg-rose-500/10 text-rose-500 px-4 rounded-xl text-xs font-bold uppercase hover:bg-rose-500/20"
              >
                Sell Custom
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => buy(1)}
                className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-4 rounded-2xl active:scale-95 transition-all uppercase tracking-widest"
              >
                Buy All
              </button>
              <button 
                onClick={() => sell(1)}
                className="bg-rose-500 hover:bg-rose-600 text-black font-bold py-4 rounded-2xl active:scale-95 transition-all uppercase tracking-widest"
              >
                Sell All
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center p-6 bg-zinc-900 rounded-3xl border-2 border-emerald-500/20">
              <div className="text-zinc-400 uppercase text-sm mb-1">Final Portfolio Value</div>
              <div className="text-4xl font-black text-emerald-500">{formatCurrency(portfolioValue)}</div>
              
              <div className="mt-4 pt-4 border-t border-zinc-800">
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
                    <RefreshCcw className="w-4 h-4 animate-spin" />
                    Verifying score...
                  </div>
                ) : verificationResult?.success ? (
                  <div className="text-emerald-500 text-sm font-bold flex items-center justify-center gap-1">
                    <ArrowUpRight className="w-4 h-4" />
                    Score Verified & Saved
                  </div>
                ) : verificationResult?.error ? (
                  <div className="text-rose-500 text-sm font-bold px-4">
                    {verificationResult.error}
                  </div>
                ) : !user ? (
                   <div className="text-zinc-400 text-xs italic px-4">
                      take a screenshot to share with your friends, but you won't be on the leaderboard if you're not signed in
                   </div>
                ) : null}
              </div>
            </div>
            <button 
              onClick={startGame}
              className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <RefreshCcw className="w-5 h-5" />
              PLAY AGAIN
            </button>
          </div>
        )}

        {/* Leaderboards */}
        <div className="pt-8 space-y-8">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4 px-2">Daily Leaderboard</h2>
            <div className="space-y-2">
              {leaderboard.length > 0 ? leaderboard.map((entry, pos) => (
                <div key={entry.id} className="flex items-center justify-between p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-600 font-mono font-bold">#{pos + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                       {entry.user_email?.[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-zinc-300">{entry.user_email?.split('@')[0]}</span>
                  </div>
                  <span className="font-mono text-emerald-500 font-bold">{formatCurrency(entry.final_score)}</span>
                </div>
              )) : (
                <div className="text-center text-zinc-600 text-sm py-4">No scores yet today</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4 px-2">
               <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Weekly Tournament</h2>
               <div className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded uppercase">Live</div>
            </div>
            <div className="space-y-2">
              {weeklyLeaderboard.length > 0 ? weeklyLeaderboard.map((entry, pos) => (
                <div key={pos} className="flex items-center justify-between p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-900 font-mono font-bold">#{pos + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-500">
                       {entry.user_email?.[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-zinc-300">{entry.user_email?.split('@')[0]}</span>
                  </div>
                  <div className="text-right">
                     <div className="font-mono text-emerald-500 font-bold">{formatCurrency(entry.total_score)}</div>
                     <div className="text-[10px] text-zinc-500 uppercase">{entry.games_played} games</div>
                  </div>
                </div>
              )) : (
                <div className="text-center text-zinc-600 text-sm py-4">Tournament starts now!</div>
              )}
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </main>
  );
}
