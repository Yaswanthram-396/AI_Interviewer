import { Badge } from "../../components/ui/badge";

export interface PerformanceData {
  name: string;
//   avatar: string;
  score: number;
  trend: "up" | "down" | "stable";
  hirings: number;
}

interface PerformanceCardProps {
  title: string;
  performer: PerformanceData;
  rank: number;
}

export const PerformanceCard = ({ title, performer, rank }: PerformanceCardProps) => {
  const getTrendColor = (trend: PerformanceData["trend"]) => {
    switch (trend) {
      case "up":
        return "performance-excellent";
      case "down":
        return "destructive";
      default:
        return "performance-good";
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
    <div className="group relative h-full">
      <div className="absolute inset-0 bg-gradient-primary rounded-2xl opacity-0 group-hover:opacity-10 transition-all duration-500 ease-out" />
      <div className="relative bg-gradient-card backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 ease-out transform hover:-translate-y-1 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
            {title}
          </h3>
          <span className="text-2xl font-bold text-primary">
            {getRankBadge(rank)}
          </span>
        </div>

        {/* Performer Info */}
        <div className="flex items-center gap-4 mb-4 flex-grow">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-primary rounded-full opacity-20 scale-110 blur-sm" />
            <img
            //   src={performer.avatar}
              alt={`${performer.name}'s profile`}
              className="relative w-16 h-16 rounded-full object-cover ring-2 ring-primary/20 shadow-lg"
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-xl font-bold text-foreground truncate">
              {performer.name}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              {/* <Badge 
                variant="secondary" 
                className={`text-${getTrendColor(performer.trend)} bg-${getTrendColor(performer.trend)}/10 border-${getTrendColor(performer.trend)}/20`}
              >
                {performer.trend === "up" ? "↗️" : performer.trend === "down" ? "↘️" : "→"} Trending {performer.trend}
              </Badge> */}
            </div>
          </div>
        </div>

        {/* Performance Score */}
        <div className="mt-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Performance Score
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full bg-${getTrendColor(performer.trend)}`} />
                <span className={`text-2xl font-bold text-${getTrendColor(performer.trend)}`}>
                  {performer.score}
                </span>
              </div>
            </div>
          </div>
          
          {/* Performance Bar */}
          <div className="mt-3 relative">
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full bg-gradient-performance rounded-full transition-all duration-1000 ease-out`}
                style={{ width: `${Math.min(performer.score, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};