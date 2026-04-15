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
  const [viewMode, setViewMode] = useState<"self" | "team" | "other-teams">("team");
  const [leadScore, setLeadScore] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
  }, [isLoading, token, setLocation]);

  const { data: summary } = useGetRatingsSummary(
    { userId: user?.userId ?? "", quarter, year },
    { query: { queryKey: ["ratings-summary", user?.userId, quarter, year], enabled: !!user } }
  );

  useEffect(() => {
    let cancelled = false;

    if (!user || user.role !== "User") {
      setLeadScore(null);
      return () => {
        cancelled = true;
      };
    }

    const loadLeadScore = async () => {
      try {
        const itemTargetRole = user.role === "Team Lead" || user.role === "Manager" ? "Team Lead" : "User";
        const itemParams = new URLSearchParams({
          targetRole: itemTargetRole,
          level: user.level,
        });
        if (user.teamId) {
          itemParams.set("teamId", String(user.teamId));
        }

        const approvalParams = new URLSearchParams({
          ratedUserId: user.userId,
          quarter,
          year: String(year),
        });

        const sentFeedbackParams = new URLSearchParams({
          quarter,
          year: String(year),
        });

        const [itemsResponse, approvalsResponse, sentFeedbackResponse] = await Promise.all([
          fetch(`/api/items?${itemParams.toString()}`),
          fetch(`/api/approvals?${approvalParams.toString()}`),
          fetch(`/api/tl-drafts/sent-feedback?${sentFeedbackParams.toString()}`),
        ]);

        if (!itemsResponse.ok || !approvalsResponse.ok || !sentFeedbackResponse.ok) {
          throw new Error("Failed to load lead score data");
        }

        const items = (await itemsResponse.json()) as Array<{ itemId: number; weight?: number | null }>;
        const approvals = (await approvalsResponse.json()) as Array<{ itemId: number; tlLgtmStatus?: string | null; tlRatingValue?: number | null }>;
        const sentFeedbackRows = (await sentFeedbackResponse.json()) as Array<{ itemId: number; ratingValue?: number | null; status?: string | null }>;

        const submittedLeadFeedback = approvals.filter(
          (row) => row.tlLgtmStatus === "Approved" && row.tlRatingValue !== null && row.tlRatingValue !== undefined
        );
        const sentLeadFeedback = sentFeedbackRows.filter(
          (row) => (row.status === "send_to_user" || row.status === "dispute raised" || row.status === "dispute fixed") && row.ratingValue !== null && row.ratingValue !== undefined
        );
        const effectiveLeadFeedback = sentLeadFeedback.length > 0
          ? sentLeadFeedback.map((row) => ({ itemId: row.itemId, tlRatingValue: row.ratingValue ?? null }))
          : submittedLeadFeedback.map((row) => ({ itemId: row.itemId, tlRatingValue: row.tlRatingValue ?? null }));

        const leadApprovedRowsByItem = effectiveLeadFeedback.reduce<Record<number, Array<{ tlRatingValue: number }>>>((acc, row) => {
          const itemId = Number(row.itemId);
          if (!Number.isFinite(itemId) || row.tlRatingValue == null) {
            return acc;
          }
          if (!acc[itemId]) {
            acc[itemId] = [];
          }
          acc[itemId].push({ tlRatingValue: Number(row.tlRatingValue) });
          return acc;
        }, {});

        const getAverageLeadRatingForItem = (itemId: number) => {
          const itemRows = leadApprovedRowsByItem[itemId] ?? [];
          const valid = itemRows
            .map((row) => row.tlRatingValue)
            .filter((value) => Number.isFinite(value) && value >= 0.1 && value <= 5.0);

          if (valid.length === 0) {
            return null;
          }

          return valid.reduce((sum, value) => sum + value, 0) / valid.length;
        };

        const leadWeightedScore = (items ?? []).reduce((sum, item) => {
          const itemWeight = Number(item.weight ?? 0);
          if (!Number.isFinite(itemWeight) || itemWeight <= 0) {
            return sum;
          }

          const itemAverageRating = getAverageLeadRatingForItem(item.itemId);
          if (itemAverageRating == null) {
            return sum;
          }

          return sum + itemWeight * itemAverageRating;
        }, 0);

        if (!cancelled) {
          setLeadScore(leadWeightedScore);
        }
      } catch {
        if (!cancelled) {
          setLeadScore(null);
        }
      }
    };

    loadLeadScore();

    return () => {
      cancelled = true;
    };
  }, [user, quarter, year]);

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
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as "self" | "team" | "other-teams")}>
                <SelectTrigger className="w-[140px] bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="other-teams">Other Teams</SelectItem>
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

        {summary && summary.categoryScores.length > 0 && <SummaryCards summary={summary} leadScore={leadScore} />}

        {user.role === "Team Lead" && (viewMode === "team" || viewMode === "other-teams") ? (
          <EvaluationHistoryTable quarter={quarter} year={year} showOtherTeams={viewMode === "other-teams"} />
        ) : (
          <UserView quarter={quarter} year={year} />
        )}
      </div>
    </Layout>
  );
}
