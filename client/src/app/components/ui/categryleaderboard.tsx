import React from 'react';
import { Badge } from "../../components/ui/badge";
import { type PerformanceData } from "../../components/ui/perfomanceleaderboard";

interface CategoryLeaderboardProps {
  title: string;
  performers: PerformanceData[];
}

export const CategoryLeaderboard = ({ title, performers }: CategoryLeaderboardProps) => {
  const getTrendColor = (trend: PerformanceData["trend"]) => {
    switch (trend) {
      case "up":
        return "emerald"; // Matches "performance-excellent" with emerald green
      case "down":
        return "red";     // Matches "destructive" with red
      default:
        return "amber";   // Matches "performance-good" with amber
    }
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return `#${rank}`;
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 ease-out">
      {/* Category Header */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500">Top 3 performers in this category</p>
      </div>

      {/* Top 3 Performers */}
      <div className="space-y-4">
        {performers.map((performer, index) => {
          const rank = index + 1;
          return (
            <div
              key={`${title}-${performer.name}`}
              className={`relative p-4 rounded-xl border transition-all duration-300 ease-out hover:-translate-y-0.5 ${
                rank === 1 
                  ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' 
                  : 'bg-white border-gray-100 hover:border-amber-200'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div className="flex-shrink-0">
                  <span className={`text-2xl font-bold ${rank === 1 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {getRankBadge(rank)}
                  </span>
                </div>

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className={`absolute inset-0 rounded-full opacity-20 scale-110 blur-sm ${
                    rank === 1 ? 'bg-amber-500/20' : 'bg-gray-200/20'
                  }`} />
                  <div className={`relative w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center ${
                    rank === 1 ? 'ring-2 ring-amber-200' : 'ring-1 ring-gray-200'
                  }`}>
                    {/* Placeholder for avatar; replace with actual image */}
                    <img
                      src="https://i.ibb.co/mC9DhHVL/Portrait-Placeholder.png"
                      alt={`${performer.name}'s profile`}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  </div>
                </div>

                {/* Performer Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className={`font-semibold truncate ${
                      rank === 1 ? 'text-gray-900 text-base' : 'text-gray-700 text-sm'
                    }`}>
                      {performer.name}
                    </h4>
                    <div className="flex items-center gap-3 ml-2">
                      <div className="text-right">
                        <div className={`font-bold ${
                          rank === 1 ? 'text-lg text-amber-600' : 'text-sm text-gray-600'
                        }`}>
                          {performer.score}
                        </div>
                        <div className={`text-xs ${
                          rank === 1 ? 'text-amber-600/70' : 'text-gray-500/70'
                        }`}>
                          {performer.hirings} hires
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    {/* <Badge 
                      variant="secondary" 
                      className={`text-xs bg-${getTrendColor(performer.trend)}-50 border-${getTrendColor(performer.trend)}-200 text-${getTrendColor(performer.trend)}-700`}
                    >
                      {performer.trend === "up" ? "↗️" : performer.trend === "down" ? "↘️" : "→"} {performer.trend}
                    </Badge> */}
                    
                    {/* Mini Performance Bar */}
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden ml-2">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          rank === 1 ? 'bg-gr adient-to-r from-amber-500 to-emerald-500' : 'bg-gray-400'
                        }`}
                        style={{ width: `${Math.min(performer.score, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};