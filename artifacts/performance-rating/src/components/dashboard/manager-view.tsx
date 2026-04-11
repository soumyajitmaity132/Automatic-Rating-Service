import { useAuth } from "@/lib/auth";
import { 
  useListTeams, useListApprovals, useUpdateApproval,
  RatingQuarter 
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import { StarRating } from "@/components/star-rating";

export function ManagerView({ quarter, year }: { quarter: RatingQuarter, year: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teams } = useListTeams();
  const { data: approvals } = useListApprovals({ quarter, year });
  const { mutate: updateApproval, isPending } = useUpdateApproval();

  const pendingApprovals = approvals?.filter(a => a.finalLgtmStatus === 'Pending' && a.tlLgtmStatus === 'Approved') || [];

  const handleFinalLgtm = (approvalId: number, status: 'Approved' | 'Rejected') => {
    updateApproval({
      approvalId,
      data: { finalLgtmStatus: status }
    }, {
      onSuccess: () => {
        toast({ title: `Final approval ${status}` });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-gradient-to-br from-primary to-primary-border text-primary-foreground">
          <h3 className="font-medium opacity-80 mb-2">Total Teams</h3>
          <div className="text-4xl font-display font-bold">{teams?.length || 0}</div>
        </Card>
        <Card className="p-6">
          <h3 className="font-medium text-muted-foreground mb-2">Pending Final Approvals</h3>
          <div className="text-4xl font-display font-bold text-amber-500">{pendingApprovals.length}</div>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" /> Final Approvals Queue
        </h2>
        
        {pendingApprovals.length > 0 ? (
          <Card className="overflow-hidden border-border/50">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-secondary/50 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Employee</th>
                  <th className="px-6 py-4 font-medium">Item</th>
                  <th className="px-6 py-4 font-medium text-center">TL Rating</th>
                  <th className="px-6 py-4 font-medium text-right">Final Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pendingApprovals.map(approval => (
                  <tr key={approval.approvalId} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-foreground">
                      {approval.ratedUserName}
                    </td>
                    <td className="px-6 py-4">
                      {approval.itemName}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <StarRating value={approval.tlRatingValue || 0} readOnly size="sm" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover-elevate"
                        onClick={() => handleFinalLgtm(approval.approvalId, 'Approved')}
                        disabled={isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" /> Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-destructive border-destructive/20 hover:bg-destructive/10 hover-elevate"
                        onClick={() => handleFinalLgtm(approval.approvalId, 'Rejected')}
                        disabled={isPending}
                      >
                        <XCircle className="w-4 h-4 mr-1.5" /> Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="p-12 text-center text-muted-foreground border-dashed">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Queue is empty</h3>
            <p>All evaluations have been processed for the selected quarter.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
