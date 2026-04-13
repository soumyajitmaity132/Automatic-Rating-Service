import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useListUsers, useListApprovals, RatingQuarter } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

interface TeamMemberRatings {
  userId: string;
  username: string;
  displayName: string;
  ratings: Record<string, number | null>;
}

function getLastFourQuarters(quarter: RatingQuarter, year: number): Array<{ quarter: RatingQuarter; year: number }> {
  const quarters: RatingQuarter[] = ["Q1", "Q2", "Q3", "Q4"];
  const currentQuarterIndex = quarters.indexOf(quarter);
  const result: Array<{ quarter: RatingQuarter; year: number }> = [];

  for (let i = 0; i < 4; i++) {
    const idx = currentQuarterIndex - i;
    if (idx >= 0) {
      result.push({ quarter: quarters[idx], year });
    } else {
      const prevYear = year - 1;
      const quarterInPrevYear = 4 + idx;
      result.push({ quarter: quarters[quarterInPrevYear], year: prevYear });
    }
  }

  return result;
}

export function EvaluationHistoryTable({ quarter, year }: { quarter: RatingQuarter; year: number }) {
  const { user } = useAuth();

  const { data: teamMembers } = useListUsers(
    user?.teamId ? { teamId: user.teamId } : undefined,
    { query: { enabled: !!user?.teamId, queryKey: ["team-members", user?.teamId] } }
  );

  const lastFourQuarters = useMemo(() => getLastFourQuarters(quarter, year), [quarter, year]);

  // Fetch approvals for each of the last 4 quarters
  const approvalsQueries = lastFourQuarters.map((q) =>
    useListApprovals(
      { quarter: q.quarter, year: q.year },
      { query: { enabled: !!user?.teamId, queryKey: ["approvals", q.quarter, q.year] } }
    )
  );

  // Aggregate all approvals — use total_weighted_rating stored on the row (same value for all rows per user/quarter/year)
  const allApprovals = useMemo(() => {
    const result: Record<string, Record<string, number | null>> = {};

    approvalsQueries.forEach((query, idx) => {
      const quarterYear = lastFourQuarters[idx];
      const key = `${quarterYear.quarter} ${quarterYear.year}`;

      query.data?.forEach((approval) => {
        if (approval.tlLgtmStatus !== "Approved") {
          return;
        }

        if (!result[approval.ratedUserId]) {
          result[approval.ratedUserId] = {};
        }
        // Only overwrite if we haven't set a value yet, or the existing value is null
        // totalWeightedRating is identical for all rows of the same user/quarter/year
        if (
          result[approval.ratedUserId][key] === undefined ||
          result[approval.ratedUserId][key] === null
        ) {
          const twr = (approval as any).totalWeightedRating;
          result[approval.ratedUserId][key] =
            twr !== null && twr !== undefined ? (twr as number) : null;
        }
      });
    });

    return result;
  }, [approvalsQueries, lastFourQuarters]);

  // Build the table data
  const tableData = useMemo<TeamMemberRatings[]>(() => {
    const members = teamMembers?.filter((m) => m.userId !== user?.userId && m.role !== user?.role) || [];

    return members.map((member) => ({
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      ratings: {
        [lastFourQuarters[0].quarter + " " + lastFourQuarters[0].year]:
          allApprovals[member.userId]?.[lastFourQuarters[0].quarter + " " + lastFourQuarters[0].year] ?? null,
        [lastFourQuarters[1].quarter + " " + lastFourQuarters[1].year]:
          allApprovals[member.userId]?.[lastFourQuarters[1].quarter + " " + lastFourQuarters[1].year] ?? null,
        [lastFourQuarters[2].quarter + " " + lastFourQuarters[2].year]:
          allApprovals[member.userId]?.[lastFourQuarters[2].quarter + " " + lastFourQuarters[2].year] ?? null,
        [lastFourQuarters[3].quarter + " " + lastFourQuarters[3].year]:
          allApprovals[member.userId]?.[lastFourQuarters[3].quarter + " " + lastFourQuarters[3].year] ?? null,
      },
    }));
  }, [teamMembers, user?.userId, allApprovals, lastFourQuarters]);

  const isLoading = approvalsQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Evaluation History</h2>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading evaluation data...</div>
        ) : tableData.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No team members found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-secondary/50 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Username</th>
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  {lastFourQuarters.map((q) => (
                    <th key={`${q.quarter}-${q.year}`} className="px-5 py-3 text-center font-medium">
                      {q.quarter} {q.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {tableData.map((member) => (
                  <tr key={member.userId} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-4 font-mono text-sm">{member.username}</td>
                    <td className="px-5 py-4 font-medium">{member.displayName}</td>
                    {lastFourQuarters.map((q) => {
                      const rating = member.ratings[`${q.quarter} ${q.year}`];
                      return (
                        <td key={`${q.quarter}-${q.year}`} className="px-5 py-4 text-center">
                          {rating !== null ? (
                            <span className="font-bold font-mono text-primary">{rating.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
