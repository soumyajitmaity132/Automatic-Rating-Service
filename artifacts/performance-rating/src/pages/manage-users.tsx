import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { useListUsers, useRegisterUser } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, Plus, Mail, User, ShieldCheck } from "lucide-react";

interface UserForm {
  displayName: string;
  username: string;
  email: string;
  password: string;
  level: string;
}

const emptyForm: UserForm = {
  displayName: "",
  username: "",
  email: "",
  password: "",
  level: "L1",
};

const LEVELS = ["L1", "L2", "L3"];

const ROLE_BADGE: Record<string, string> = {
  User: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Team Lead": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Manager: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

export default function ManageUsers() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role === "User") setLocation("/dashboard");
    if (!isLoading && user && user.role === "Manager") setLocation("/manage-leads");
  }, [isLoading, token, user, setLocation]);

  const { data: users, isLoading: usersLoading } = useListUsers(
    user?.teamId ? { teamId: user.teamId } : undefined,
    { query: { enabled: !!user?.teamId } }
  );

  const { mutate: registerUser, isPending: isRegistering } = useRegisterUser();

  const teamMembers = (users ?? []).filter(u => u.role === "User");

  const set = (field: keyof UserForm, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleCreate = () => {
    if (!form.displayName || !form.username || !form.email || !form.password) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    registerUser({
      data: {
        displayName: form.displayName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role: "User",
        level: form.level,
        teamId: user?.teamId ?? null,
      }
    }, {
      onSuccess: (newUser) => {
        toast({ title: `${newUser.displayName} added to your team` });
        setDialogOpen(false);
        setForm(emptyForm);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      },
      onError: (err: any) => toast({
        title: "Failed to create user",
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
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Manage Users</h1>
              <p className="text-muted-foreground text-sm">Create and view members of your team</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add User
          </Button>
        </div>

        {/* Users Table */}
        <Card className="overflow-hidden">
          {usersLoading ? (
            <div className="p-10 text-center text-muted-foreground">Loading users...</div>
          ) : teamMembers.length === 0 ? (
            <div className="p-12 text-center border-dashed text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No users in your team yet. Add the first one.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Level</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((u, i) => (
                  <tr key={u.userId} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
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
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] ?? ""}`}>
                        {u.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Create User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" /> Add New User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="u-displayName">Full Name <span className="text-destructive">*</span></Label>
              <Input id="u-displayName" placeholder="e.g. Jane Doe" value={form.displayName} onChange={e => set("displayName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-username">Username <span className="text-destructive">*</span></Label>
              <Input id="u-username" placeholder="e.g. jane.doe" value={form.username} onChange={e => set("username", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-email" className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email <span className="text-destructive">*</span>
              </Label>
              <Input id="u-email" type="email" placeholder="jane@example.com" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-password" className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Password <span className="text-destructive">*</span>
              </Label>
              <Input id="u-password" type="password" placeholder="Minimum 6 characters" value={form.password} onChange={e => set("password", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Level</Label>
              <Select value={form.level} onValueChange={v => set("level", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isRegistering}>
              {isRegistering ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
