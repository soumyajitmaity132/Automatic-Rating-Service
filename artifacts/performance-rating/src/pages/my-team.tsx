import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { useListUsers, useListRatings, useSendReminder, RatingQuarter } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Users, Bell } from "lucide-react";

const ROLE_BADGE: Record<string, string> = {
  "User":      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Team Lead": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Manager":   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

function MemberCard({ member, teamId }: { member: any; teamId: number }) {
  const { data: ratings } = useListRatings(
    { userId: member.userId, quarter: RatingQuarter.Q1, year: new Date().getFullYear() },
    { query: { enabled: true } }
  );

  return (
    <Card className="p-5 flex items-center gap-4 hover:border-primary/40 transition-colors">
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
        {member.displayName.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold truncate">{member.displayName}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ROLE_BADGE[member.role] ?? "bg-secondary text-secondary-foreground"}`}>
            {member.role}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{member.email}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Level: {member.level}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-2xl font-bold text-foreground">{ratings?.length ?? 0}</div>
        <div className="text-xs text-muted-foreground">ratings</div>
      </div>
    </Card>
  );
}

export default function MyTeam() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDeadline, setReminderDeadline] = useState("");
  const [reminderMsg, setReminderMsg] = useState("");

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role === "User") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const { data: members, isLoading: membersLoading } = useListUsers(
    user?.teamId ? { teamId: user.teamId } : undefined,
    { query: { enabled: !!user?.teamId } }
  );

  const { mutate: sendReminder, isPending: isSending } = useSendReminder();

  const handleSendReminder = () => {
    if (!user?.teamId) return;
    sendReminder({
      data: { teamId: user.teamId, deadline: reminderDeadline, customMessage: reminderMsg || undefined }
    }, {
      onSuccess: (data) => {
        toast({ title: data.message ?? "Reminder sent" });
        setReminderOpen(false);
        setReminderDeadline("");
        setReminderMsg("");
      }
    });
  };

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  const otherMembers = members?.filter(m => m.userId !== user.userId && m.role !== user.role) ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl border border-border/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">My Team</h1>
              <p className="text-muted-foreground text-sm">{user.teamName || "Your team"} · {otherMembers.length} member(s)</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setReminderOpen(true)} className="shrink-0">
            <Bell className="w-4 h-4 mr-2" /> Send Reminder
          </Button>
        </div>

        {membersLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading team members...</div>
        ) : otherMembers.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="font-semibold mb-1">No team members found</h3>
            <p className="text-sm text-muted-foreground">Your team has no other members yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {otherMembers.map(m => (
              <MemberCard key={m.userId} member={m} teamId={user.teamId!} />
            ))}
          </div>
        )}
      </div>

      {/* Reminder Dialog */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4" /> Send Rating Reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Deadline Date (optional)</Label>
              <Input type="date" value={reminderDeadline} onChange={e => setReminderDeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Custom Message (optional)</Label>
              <Textarea
                placeholder="Leave blank to send the default reminder message..."
                value={reminderMsg}
                onChange={e => setReminderMsg(e.target.value)}
                className="resize-none h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>Cancel</Button>
            <Button onClick={handleSendReminder} disabled={isSending}>
              {isSending ? "Sending..." : "Send Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
