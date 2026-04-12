import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useListTeams, useUpdateUser } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserX, RefreshCw } from "lucide-react";

interface NoLeadUser {
  userId: string;
  displayName: string;
  username: string;
  email: string;
  role: string;
  level: string;
  process: string | null;
}

export default function NoLeads() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [noLeadUsers, setNoLeadUsers] = useState<NoLeadUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedTeamByUser, setSelectedTeamByUser] = useState<Record<string, string>>({});
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

  const { data: teams } = useListTeams({
    query: { enabled: user?.role === "Manager" } as any,
  });
  const { mutateAsync: updateUserAsync } = useUpdateUser();

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role !== "Manager") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const assignableTeams = teams ?? [];

  const loadNoLeadUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await fetch("/api/users/no-leads");
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? "Failed to load users with no leads");
      }

      const data = (await response.json()) as NoLeadUser[];
      setNoLeadUsers(data);
      setSelectedTeamByUser((prev) => {
        const next: Record<string, string> = {};
        for (const item of data) {
          if (prev[item.userId]) {
            next[item.userId] = prev[item.userId];
          }
        }
        return next;
      });
    } catch (error) {
      toast({
        title: "Failed to load users",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (user?.role === "Manager") {
      loadNoLeadUsers();
    }
  }, [user?.role]);

  const handleAssign = async (targetUserId: string) => {
    const selectedTeamId = selectedTeamByUser[targetUserId];
    if (!selectedTeamId) {
      toast({ title: "Please select a team", variant: "destructive" });
      return;
    }

    try {
      setAssigningUserId(targetUserId);
      await updateUserAsync({
        userId: targetUserId,
        data: {
          teamId: Number(selectedTeamId),
        } as any,
      });

      const assignedTeam = assignableTeams.find((team: any) => String(team.teamId) === selectedTeamId);
      toast({
        title: "Team assigned",
        description: assignedTeam ? `Assigned to ${assignedTeam.teamName}` : "User assigned successfully.",
      });

      setNoLeadUsers((prev) => prev.filter((member) => member.userId !== targetUserId));
      setSelectedTeamByUser((prev) => {
        const next = { ...prev };
        delete next[targetUserId];
        return next;
      });
    } catch (error) {
      toast({
        title: "Failed to assign team",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAssigningUserId(null);
    }
  };

  if (isLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <UserX className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">No Leads</h1>
              <p className="text-muted-foreground text-sm">
                Users in your process who currently have no team lead
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={loadNoLeadUsers} disabled={loadingUsers}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> {loadingUsers ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {loadingUsers ? (
          <Card className="p-8 text-center text-muted-foreground">Loading users...</Card>
        ) : noLeadUsers.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No users without leads in your process.</Card>
        ) : assignableTeams.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No teams found to assign.</Card>
        ) : (
          <div className="space-y-3">
            {noLeadUsers.map((member) => (
              <Card key={member.userId} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="font-semibold">{member.displayName}</p>
                  <p className="text-sm text-muted-foreground">{member.email} · {member.level}</p>
                  <p className="text-xs text-muted-foreground/80">Process: {member.process ?? "-"}</p>
                </div>

                <div className="w-full md:w-auto flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="space-y-1.5 min-w-[220px]">
                    <Label>Assign Team</Label>
                    <Select
                      value={selectedTeamByUser[member.userId] ?? ""}
                      onValueChange={(value) => {
                        setSelectedTeamByUser((prev) => ({ ...prev, [member.userId]: value }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableTeams.map((team: any) => (
                          <SelectItem key={team.teamId} value={String(team.teamId)}>
                            {team.teamName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => handleAssign(member.userId)}
                    disabled={!selectedTeamByUser[member.userId] || assigningUserId === member.userId}
                  >
                    {assigningUserId === member.userId ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
