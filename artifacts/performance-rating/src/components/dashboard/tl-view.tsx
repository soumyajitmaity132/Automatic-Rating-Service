import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { 
  useListUsers, useListRatings, useCreateApproval, 
  useListDisputes, useResolveDispute, useSendReminder,
  RatingQuarter, UserProfile, Rating
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/star-rating";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Bell, Users, CheckCircle, XCircle } from "lucide-react";

export function TeamLeadView({ quarter, year }: { quarter: RatingQuarter, year: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teamMembers } = useListUsers(
    user?.teamId ? { teamId: user.teamId } : undefined, 
    { query: { enabled: !!user?.teamId } }
  );
  
  const { data: disputes } = useListDisputes(
    user?.teamId ? { teamId: user.teamId } : undefined, 
    { query: { enabled: !!user?.teamId } }
  );

  const { mutate: createApproval, isPending: isApproving } = useCreateApproval();
  const { mutate: resolveDispute, isPending: isResolving } = useResolveDispute();
  const { mutate: sendReminder, isPending: isReminding } = useSendReminder();

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDate, setReminderDate] = useState("");

  const { data: userRatings } = useListRatings(
    { userId: selectedUser?.userId, quarter, year }, 
    { query: { enabled: !!selectedUser } }
  );

  const [tlRatings, setTlRatings] = useState<Record<number, number>>({});

  const handleApproveRating = (rating: Rating) => {
    const val = tlRatings[rating.itemId];
    if (!val) return;
    
    createApproval({
      data: {
        itemId: rating.itemId,
        teamId: user!.teamId!,
        ratedUserId: rating.userId,
        tlRatingValue: val,
        quarter,
        year
      }
    }, {
      onSuccess: () => {
        toast({ title: "Rating evaluated" });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      }
    });
  };

  const handleResolve = (approvalId: number, resolution: 'Approved'|'Rejected') => {
    resolveDispute({
      approvalId,
      data: { resolution, comment: "Resolved by Team Lead" }
    }, {
      onSuccess: () => {
        toast({ title: `Dispute ${resolution}` });
        queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      }
    });
  };

  const handleSendReminder = () => {
    if (!user?.teamId) return;
    sendReminder({
      data: { teamId: user.teamId, deadline: reminderDate }
    }, {
      onSuccess: () => {
        toast({ title: "Reminder sent to team members" });
        setReminderOpen(false);
      }
    });
  };

  const members = teamMembers?.filter(m => m.userId !== user?.userId) || [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> My Team
        </h2>
        <Button variant="outline" onClick={() => setReminderOpen(true)} className="hover-elevate">
          <Bell className="w-4 h-4 mr-2" /> Send Reminder
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {members.map(member => (
          <Card 
            key={member.userId} 
            className="p-6 cursor-pointer hover:border-primary/50 transition-colors hover-elevate"
            onClick={() => setSelectedUser(member)}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                {member.displayName.charAt(0)}
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{member.displayName}</h3>
                <p className="text-sm text-muted-foreground">{member.role} • {member.level}</p>
              </div>
            </div>
          </Card>
        ))}
        {members.length === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground border border-dashed rounded-2xl">
            No team members found.
          </div>
        )}
      </div>

      {disputes && disputes.length > 0 && (
        <div className="space-y-4 pt-8 border-t border-border/50">
          <h2 className="text-xl font-display font-semibold text-amber-600">Active Disputes</h2>
          <div className="grid gap-4">
            {disputes.map(d => (
              <Card key={d.approvalId} className="p-4 border-amber-200 bg-amber-50/30 dark:bg-amber-900/10">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{d.itemName} - {d.ratedUserName}</h4>
                    <p className="text-sm mt-2 text-foreground/80"><span className="font-medium">User Comment:</span> {d.disputeComment}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => handleResolve(d.approvalId, 'Approved')} disabled={isResolving}>
                      <CheckCircle className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => handleResolve(d.approvalId, 'Rejected')} disabled={isResolving}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Evaluate User Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Evaluate {selectedUser?.displayName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {userRatings && userRatings.length > 0 ? (
              userRatings.map(rating => (
                <Card key={rating.ratingId} className="p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-semibold">{rating.itemName}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{rating.comment}</p>
                      {rating.artifactLinks && (
                        <a href={rating.artifactLinks} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-2 inline-block">View Artifacts</a>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Self Rating</span>
                      <div className="flex justify-end mt-1"><StarRating value={rating.ratingValue} readOnly size="sm" /></div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-secondary/30 rounded-xl border border-border/50">
                    <Label className="mb-2 block text-sm">Your Rating (TL)</Label>
                    <div className="flex items-center justify-between">
                      <StarRating 
                        value={tlRatings[rating.itemId] || 0} 
                        onChange={(v) => setTlRatings(prev => ({ ...prev, [rating.itemId]: v }))} 
                      />
                      <Button 
                        size="sm" 
                        onClick={() => handleApproveRating(rating)}
                        disabled={!tlRatings[rating.itemId] || isApproving}
                      >
                        Submit
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center p-8 text-muted-foreground">User hasn't submitted any ratings for this quarter.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reminder Dialog */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Deadline Date</Label>
              <Input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>Cancel</Button>
            <Button onClick={handleSendReminder} disabled={isReminding || !reminderDate}>Send to Team</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
