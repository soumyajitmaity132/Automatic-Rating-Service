import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListRatings, useListApprovals, RatingQuarter
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

function StatusBadge({ done }: { done: boolean }) {
  if (done) {
    return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Done</span>;
  }

  return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Pending</span>;
}

export function UserView({ quarter, year }: { quarter: RatingQuarter; year: number }) {
  const { user } = useAuth();

  const { data: ratings, isLoading } = useListRatings(
    { userId: user?.userId, quarter, year },
    { query: {
      enabled: !!user,
      queryKey: ["dashboard-user-ratings", user?.userId, quarter, year],
    } }
  );
  const { data: approvals } = useListApprovals(
    { ratedUserId: user?.userId, quarter, year },
    { query: {
      enabled: !!user,
      queryKey: ["dashboard-user-approvals", user?.userId, quarter, year],
    } }
  );

  const evaluationRows = useMemo(() => {
    type RatingRow = NonNullable<typeof ratings>[number];
    type ApprovalRow = NonNullable<typeof approvals>[number];

    const ratingsByItem = new Map<number, RatingRow[]>();
    for (const rating of ratings ?? []) {
      const list = ratingsByItem.get(rating.itemId) ?? [];
      list.push(rating);
      ratingsByItem.set(rating.itemId, list);
    }

    const approvalsByItem = new Map<number, ApprovalRow[]>();
    for (const approval of approvals ?? []) {
      const list = approvalsByItem.get(approval.itemId) ?? [];
      list.push(approval);
      approvalsByItem.set(approval.itemId, list);
    }

    return Array.from(ratingsByItem.entries()).map(([itemId, itemRatings]) => {
      const firstRating = itemRatings[0];
      const yourValues = itemRatings
        .map((rating) => Number(rating.ratingValue))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
      const yourRating = yourValues.length > 0
        ? yourValues.reduce((sum, value) => sum + value, 0) / yourValues.length
        : null;

      const itemApprovals = approvalsByItem.get(itemId) ?? [];
      const leadValues = itemApprovals
        .map((approval) => Number(approval.tlRatingValue))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
      const leadRating = leadValues.length > 0
        ? leadValues.reduce((sum, value) => sum + value, 0) / leadValues.length
        : null;

      const actionableApproval = itemApprovals.find(
        (approval) =>
          approval.tlRatingValue != null &&
          !approval.disputeStatus &&
          approval.finalLgtmStatus !== "Approved",
      );

      const hasAnyComment = itemRatings.some((rating) => !!rating.comment);

      return {
        itemId,
        itemName: firstRating?.itemName ?? "—",
        category: firstRating?.category ?? "—",
        yourRating,
        leadRating,
        done: leadRating != null,
        commentPreview: hasAnyComment ? itemRatings.find((rating) => !!rating.comment)?.comment ?? "" : "",
      };
    });
  }, [ratings, approvals]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Evaluation History</h2>
        <span className="text-sm text-muted-foreground">— {quarter} {year}</span>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : !ratings?.length ? (
          <div className="p-10 text-center">
            <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No evaluations submitted for {quarter} {year}.</p>
            <p className="text-sm text-muted-foreground mt-1">Go to "Submit Rating" to add your self-evaluations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-secondary/50 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">KPI Item</th>
                  <th className="px-5 py-3 text-center font-medium">Category</th>
                  <th className="px-5 py-3 text-center font-medium">Your Rating</th>
                  <th className="px-5 py-3 text-center font-medium">Lead Rating</th>
                  <th className="px-5 py-3 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {evaluationRows.map((row) => {
                  return (
                    <tr key={row.itemId} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium">{row.itemName}</p>
                        {row.commentPreview && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">{row.commentPreview}</p>}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{row.category}</span>
                      </td>
                      <td className="px-5 py-4 text-center font-bold font-mono text-primary">
                        {row.yourRating != null ? row.yourRating.toFixed(1) : "—"}
                      </td>
                      <td className="px-5 py-4 text-center font-mono font-bold">
                        {row.leadRating != null ? row.leadRating.toFixed(1) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <StatusBadge done={row.done} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
