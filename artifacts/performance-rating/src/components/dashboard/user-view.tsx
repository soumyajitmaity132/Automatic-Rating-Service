import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListRatings, useListApprovals, useRaiseDispute, RatingQuarter
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ClipboardList } from "lucide-react";

function StatusBadge({ tlStatus, finalStatus }: { tlStatus?: string; finalStatus?: string }) {
  if (finalStatus === "Approved") return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Finalized</span>;
  if (finalStatus === "Rejected") return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Rejected</span>;
  if (tlStatus === "Approved") return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">TL Approved</span>;
  return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Pending</span>;
}

export function UserView({ quarter, year }: { quarter: RatingQuarter; year: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ratings, isLoading } = useListRatings(
    { userId: user?.userId, quarter, year },
    { query: {
      enabled: !!user,
      queryKey: []
    } }
  );
  const { data: approvals } = useListApprovals(
    { ratedUserId: user?.userId, quarter, year },
    { query: {
      enabled: !!user,
      queryKey: []
    } }
  );
  const { mutate: raiseDispute, isPending: isDisputing } = useRaiseDispute();

  const [disputeApprovalId, setDisputeApprovalId] = useState<number | null>(null);
  const [disputeComment, setDisputeComment] = useState("");

  const approvalByItem = new Map(approvals?.map(a => [a.itemId, a]) ?? []);

  const handleDispute = () => {
    if (!disputeApprovalId || !disputeComment) return;
    raiseDispute({ approvalId: disputeApprovalId, data: { disputeComment } }, {
      onSuccess: () => {
        toast({ title: "Dispute raised successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        setDisputeApprovalId(null);
        setDisputeComment("");
      }
    });
  };

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
                  <th className="px-5 py-3 text-center font-medium">Self</th>
                  <th className="px-5 py-3 text-center font-medium">TL Rating</th>
                  <th className="px-5 py-3 text-center font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {ratings.map(rating => {
                  const approval = approvalByItem.get(rating.itemId);
                  const canDispute = approval && approval.tlRatingValue != null && !approval.disputeStatus && approval.finalLgtmStatus !== "Approved";

                  return (
                    <tr key={rating.ratingId} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium">{rating.itemName}</p>
                        {rating.comment && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">{rating.comment}</p>}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{rating.category ?? "—"}</span>
                      </td>
                      <td className="px-5 py-4 text-center font-bold font-mono text-primary">
                        {rating.ratingValue?.toFixed(1)}
                      </td>
                      <td className="px-5 py-4 text-center font-mono font-bold">
                        {approval?.tlRatingValue != null ? approval.tlRatingValue.toFixed(1) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <StatusBadge tlStatus={approval?.tlLgtmStatus} finalStatus={approval?.finalLgtmStatus} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        {canDispute && (
                          <Button
                            variant="ghost" size="sm"
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            onClick={() => setDisputeApprovalId(approval.approvalId)}
                          >
                            <AlertCircle className="w-4 h-4 mr-1" /> Dispute
                          </Button>
                        )}
                        {approval?.disputeStatus && (
                          <span className="text-xs text-amber-600 font-medium">Disputed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Dispute Dialog */}
      <Dialog open={!!disputeApprovalId} onOpenChange={(o) => !o && setDisputeApprovalId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise a Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              If you disagree with the Team Lead's rating, provide your justification below. This will be reviewed.
            </p>
            <Textarea
              placeholder="Why do you believe this rating should be changed?"
              className="h-32 resize-none"
              value={disputeComment}
              onChange={e => setDisputeComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeApprovalId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDispute} disabled={!disputeComment || isDisputing}>
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
