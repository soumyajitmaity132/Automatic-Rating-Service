import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { useListTeams, useListUsers, useUpdateTeam } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { GitBranch, CheckCircle2 } from "lucide-react";

export default function ReassignLeads() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role !== "Manager") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const { data: teams, isLoading: teamsLoading } = useListTeams();
  const { data: allUsers } = useListUsers(undefined, { query: {
    enabled: !!user,
    queryKey: []
  } });
  const { mutate: updateTeam, isPending } = useUpdateTeam();

  const tls = allUsers?.filter(u => u.role === "Team Lead") ?? [];

  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (teams) {
      const initial: Record<number, string> = {};
      teams.forEach(t => { if (t.tlUserId) initial[t.teamId] = t.tlUserId; });
      setAssignments(initial);
    }
  }, [teams]);

  const handleSave = (teamId: number) => {
    const newTlId = assignments[teamId];
    if (!newTlId) return;
    updateTeam({ teamId, data: { tlUserId: newTlId } }, {
      onSuccess: () => {
        toast({ title: "Team Lead reassigned successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
        setSaved(prev => ({ ...prev, [teamId]: true }));
        setTimeout(() => setSaved(prev => ({ ...prev, [teamId]: false })), 2000);
      },
      onError: () => toast({ title: "Failed to reassign", variant: "destructive" })
    });
  };

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Reassign Leads</h1>
              <p className="text-muted-foreground text-sm">Change Team Lead assignments across teams</p>
            </div>
          </div>
        </div>

        {teamsLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading teams...</div>
        ) : (
          <div className="space-y-4">
            {teams?.map(team => {
              const currentTl = tls.find(t => t.userId === team.tlUserId);
              const selectedTlId = assignments[team.teamId] ?? "";
              const isChanged = selectedTlId !== (team.tlUserId ?? "");

              return (
                <Card key={team.teamId} className="p-5 space-y-4">
                  <div>
                    <h3 className="font-semibold text-base">{team.teamName}</h3>
                    <p className="text-sm text-muted-foreground">
                      Current TL: <span className="font-medium text-foreground">{team.tlDisplayName ?? "None"}</span>
                    </p>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Assign New Team Lead</Label>
                      <Select
                        value={selectedTlId}
                        onValueChange={(v) => {
                          setAssignments(prev => ({ ...prev, [team.teamId]: v }));
                          setSaved(prev => ({ ...prev, [team.teamId]: false }));
                        }}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select a Team Lead..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tls.map(tl => (
                            <SelectItem key={tl.userId} value={tl.userId}>
                              {tl.displayName} ({tl.teamName ?? "Unassigned"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => handleSave(team.teamId)}
                      disabled={isPending || !isChanged || !selectedTlId}
                      variant={saved[team.teamId] ? "outline" : "default"}
                      className={saved[team.teamId] ? "text-emerald-600 border-emerald-300" : ""}
                    >
                      {saved[team.teamId] ? (
                        <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Saved</>
                      ) : "Save"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
