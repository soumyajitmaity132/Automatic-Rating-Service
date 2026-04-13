import { Card } from "@/components/ui/card";
import { RatingSummary } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Award, Target, TrendingUp } from "lucide-react";

export function SummaryCards({ summary, leadScore }: { summary?: RatingSummary; leadScore?: number | null }) {
  if (!summary) return null;

  const chartData = summary.categoryScores.map(cat => ({
    subject: cat.category,
    A: cat.avgRating,
    fullMark: 5,
  }));

  const getLabelColor = (score: number) => {
    if (score >= 4.0) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    if (score >= 3.0) return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    if (score >= 2.0) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    return "text-destructive bg-destructive/10 border-destructive/20";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-1">
        <Card className="p-6 h-full flex flex-col justify-center items-center text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent z-0" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <Award className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">User Score</h3>
            <div className="text-6xl font-display font-bold text-foreground mb-4">
              {summary.weightedScore.toFixed(2)}
            </div>
            <div className={`px-4 py-2 rounded-full border text-sm font-semibold ${getLabelColor(summary.weightedScore)}`}>
              {summary.performanceLabel}
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="lg:col-span-1">
        <Card className="p-6 h-full flex flex-col justify-center items-center text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent z-0" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <TrendingUp className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Lead Score</h3>
            <div className="text-6xl font-display font-bold text-foreground mb-4">
              {leadScore != null ? leadScore.toFixed(2) : "0.00"}
            </div>
            <div className={`px-4 py-2 rounded-full border text-sm font-semibold ${getLabelColor(leadScore ?? 0)}`}>
              {leadScore != null ? "Lead Rating" : "Pending"}
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2">
        <Card className="p-6 h-full">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Category Performance</h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Radar name="Rating" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
