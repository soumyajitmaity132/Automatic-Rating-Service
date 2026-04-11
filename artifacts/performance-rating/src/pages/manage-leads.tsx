import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { useListUsers, useListTeams, useRegisterUser } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { UserCheck, Plus, Mail, User, ShieldCheck } from "lucide-react";

interface LeadForm {
  displayName: string;
  username: string;
  email: string;
  password: string;
  level: string;
  teamId: string;
}

const emptyForm: LeadForm = {
  displayName: "",
  username: "",
  email: "",
  password: "",
  level: "L2",
  teamId: "",
};

const LEVELS = ["L1", "L2", "L3"];

export default function ManageLeads() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(emptyForm);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role !== "Manager") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const { data: allUsers, isLoading: usersLoading } = useListUsers(
    undefined,
    { query: { enabled: user?.role === "Manager" } }
  );

  const { data: teams } = useListTeams({ query: { enabled: user?.role === "Manager" } });

  const { mutate: registerUser, isPending: isRegistering } = useRegisterUser();

  const leads = (allUsers ?? []).filter(u => u.role === "Team Lead");
  const teamMap = new Map((teams ?? []).map(t => [t.teamId, t.teamName]));

  const set = (field: keyof LeadForm, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleCreate = () => {
    if (!form.displayName || !form.username || !form.email || !form.password) {
      toast({ title: "All fields except Team are required", variant: "destructive" });
      return;
    }
    registerUser({
      data: {
        displayName: form.displayName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role: "Team Lead",
        level: form.level,
        teamId: form.teamId ? Number(form.teamId) : null,
      }
    }, {
      onSuccess: (newUser) => {
        toast({ title: `${newUser.displayName} created as Team Lead` });
        setDialogOpen(false);
        setForm(emptyForm);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      },
      onError: (err: any) => toast({
        title: "Failed to create Team Lead",
        description: err?.message ?? "An error occurred",
        variant: "destructive"
      })
    });
  };

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Manage Team Leads</h1>
              <p className="text-muted-foreground text-sm">Create and view Team Leads across your organization</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Team Lead
          </Button>
        </div>

        {/* Leads Table */}
        <Card className="overflow-hidden">
          {usersLoading ? (
            <div className="p-10 text-center text-muted-foreground">Loading Team Leads...</div>
          ) : leads.length === 0 ? (
            <div className="p-12 text-center border-dashed text-muted-foreground">
              <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No Team Leads yet. Create the first one.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Level</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Team</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((u, i) => (
                  <tr key={u.userId} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex items-center justify-center text-xs font-bold shrink-0">
                          {u.displayName.charAt(0)}
                        </div>
                        <span className="font-medium">{u.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.username}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{u.level}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.teamId ? teamMap.get(u.teamId) ?? `Team #${u.teamId}` : <span className="italic opacity-50">Unassigned</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Create Lead Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5" /> Add New Team Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="l-displayName">Full Name <span className="text-destructive">*</span></Label>
              <Input id="l-displayName" placeholder="e.g. John Smith" value={form.displayName} onChange={e => set("displayName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-username">Username <span className="text-destructive">*</span></Label>
              <Input id="l-username" placeholder="e.g. john.smith" value={form.username} onChange={e => set("username", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-email" className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email <span className="text-destructive">*</span>
              </Label>
              <Input id="l-email" type="email" placeholder="john@example.com" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-password" className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Password <span className="text-destructive">*</span>
              </Label>
              <Input id="l-password" type="password" placeholder="Minimum 6 characters" value={form.password} onChange={e => set("password", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Level</Label>
                <Select value={form.level} onValueChange={v => set("level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Assign to Team</Label>
                <Select value={form.teamId} onValueChange={v => set("teamId", v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {(teams ?? []).map(t => (
                      <SelectItem key={t.teamId} value={t.teamId.toString()}>{t.teamName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isRegistering}>
              {isRegistering ? "Creating..." : "Create Team Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
