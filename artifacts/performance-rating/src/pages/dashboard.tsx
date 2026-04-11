import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { RatingQuarter } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { UserView } from "@/components/dashboard/user-view";
import { EvaluationHistoryTable } from "@/components/dashboard/evaluation-history-table";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { useGetRatingsSummary } from "@workspace/api-client-react";

export default function Dashboard() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const currentYear = new Date().getFullYear();
  const [quarter, setQuarter] = useState<RatingQuarter>(RatingQuarter.Q1);
  const [year, setYear] = useState<number>(currentYear);
  const [viewMode, setViewMode] = useState<"self" | "team">("team");

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
  }, [isLoading, token, setLocation]);

  const { data: summary } = useGetRatingsSummary(
    { userId: user?.userId ?? "", quarter, year },
    { query: { queryKey: ["ratings-summary", user?.userId, quarter, year], enabled: !!user } }
  );

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome, {user.displayName.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {user.role} · {user.teamName || "No team assigned"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user.role === "Team Lead" && (
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as "self" | "team")}>
                <SelectTrigger className="w-[110px] bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={quarter} onValueChange={(v) => setQuarter(v as RatingQuarter)}>
              <SelectTrigger className="w-[110px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Q1","Q2","Q3","Q4"] as const).map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger className="w-[100px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {summary && summary.categoryScores.length > 0 && <SummaryCards summary={summary} />}

        {user.role === "Team Lead" && viewMode === "team" ? (
          <EvaluationHistoryTable quarter={quarter} year={year} />
        ) : (
          <UserView quarter={quarter} year={year} />
        )}
      </div>
    </Layout>
  );
}
