import React, { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

type LeaderboardEntry = {
  userId: string;
  username: string;
  color: string | null;
  gold: number;
  dodgeBestScore: number;
  catchBestScore: number;
  invadersBestWave: number;
  brawlWins: number;
};

const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadLeaderboards = async () => {
      try {
        const { data: statsRows, error: statsError } = await supabase
          .from("game_stats")
          .select("user_id, dodge_best_score, catch_best_score, invaders_best_wave, brawl_wins");

        if (statsError) {
          throw statsError;
        }

        const userIds = Array.from(new Set((statsRows ?? []).map((row) => row.user_id)));
        if (!userIds.length) {
          setEntries([]);
          return;
        }

        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, color, gold")
          .in("id", userIds);

        if (profileError) {
          throw profileError;
        }

        const profileById = new Map(
          (profileRows ?? []).map((profile) => [
            profile.id,
            {
              username: profile.username ?? "Player",
              color: profile.color ?? null,
              gold: Number(profile.gold ?? 0)
            }
          ])
        );

        setEntries(
          (statsRows ?? []).map((row) => {
            const profile = profileById.get(row.user_id);
            return {
              userId: row.user_id,
              username: profile?.username ?? "Player",
              color: profile?.color ?? null,
              gold: profile?.gold ?? 0,
              dodgeBestScore: Number(row.dodge_best_score ?? 0),
              catchBestScore: Number(row.catch_best_score ?? 0),
              invadersBestWave: Number(row.invaders_best_wave ?? 0),
              brawlWins: Number(row.brawl_wins ?? 0)
            };
          })
        );
      } catch (error) {
        setMessage("Could not load leaderboard data.");
      } finally {
        setLoading(false);
      }
    };

    void loadLeaderboards();
  }, []);

  const renderBoard = (
    title: string,
    keyName: keyof Pick<
      LeaderboardEntry,
      "gold" | "dodgeBestScore" | "catchBestScore" | "invadersBestWave" | "brawlWins"
    >,
    suffix = ""
  ) => {
    const sorted = [...entries]
      .sort((a, b) => Number(b[keyName]) - Number(a[keyName]))
      .filter((entry) => Number(entry[keyName]) > 0)
      .slice(0, 10);

    return (
      <div className="leaderboard-card">
        <h3>{title}</h3>
        {sorted.length === 0 ? (
          <p className="info">No scores posted yet.</p>
        ) : (
          <div className="leaderboard-list">
            {sorted.map((entry, index) => (
              <div key={`${title}-${entry.userId}`} className="leaderboard-row">
                <span>{index + 1}</span>
                <strong>{entry.username}</strong>
                <span>
                  {Number(entry[keyName])}
                  {suffix}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 980 }}>
        <h2>Leaderboard House</h2>
        <p>Top performers across Focusland. Brawl wins, arcade bests, invader runs, and richest players all live here.</p>
        {loading ? <p className="info">Loading standings...</p> : null}
        {message ? <div className="error">{message}</div> : null}
        {!loading && !message ? (
          <div className="leaderboard-grid">
            {renderBoard("Most Gold", "gold", "g")}
            {renderBoard("Brawl Wins", "brawlWins")}
            {renderBoard("Best Catch Score", "catchBestScore")}
            {renderBoard("Best Dodge Score", "dodgeBestScore")}
            {renderBoard("Best Invader Wave", "invadersBestWave")}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Leaderboard;
