import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { useListUsers, useUpdateUser, useRegisterUser, useSendReminder, RatingQuarter } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Settings, UserMinus, Plus, Pencil, Mail, ShieldCheck, Bell, CalendarClock } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserForm {
  displayName: string;
  username: string;
  email: string;
  password: string;
  level: string;
  ldap: string;
  process: string;
  vacoEmployeeCode: string;
  joiningDate: string;
}

const emptyForm: UserForm = {
  displayName: "",
  username: "",
  email: "",
  password: "",
  level: "L1",
  ldap: "",
  process: "",
  vacoEmployeeCode: "",
  joiningDate: "",
};

const LEVELS = ["L1", "L2", "L3"];

export default function ManageTeam() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [removingId, setRemovingId] = useState<string | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<UserForm>(emptyForm);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserForm>(emptyForm);

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDeadline, setReminderDeadline] = useState("");
  const [reminderMsg, setReminderMsg] = useState("");
  const [pendingReminderMembers, setPendingReminderMembers] = useState<Array<{
    userId: string;
    displayName: string;
    email: string;
    level?: string;
  }>>([]);
  const [isLoadingPendingReminders, setIsLoadingPendingReminders] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(true);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role === "User") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const { data: members, isLoading: loadingMembers } = useListUsers(
    user?.teamId ? { teamId: user.teamId } : undefined,
    { query: { enabled: !!user?.teamId } as any }
  );

  const { mutate: updateUser, isPending } = useUpdateUser();
  const { mutate: registerUser, isPending: isRegistering } = useRegisterUser();
  const { mutateAsync: sendReminderAsync, isPending: isSending } = useSendReminder();

  const currentYear = new Date().getFullYear();
  const [cycleQ, setCycleQ] = useState<RatingQuarter>(RatingQuarter.Q1);
  const [cycleY, setCycleY] = useState<number>(currentYear);
  const [isCycleOpen, setIsCycleOpen] = useState(false);
  const [isCycleLoading, setIsCycleLoading] = useState(false);
  const [isCycleUpdating, setIsCycleUpdating] = useState(false);
  const [cycleConfirmOpen, setCycleConfirmOpen] = useState(false);
  const [pendingCycleState, setPendingCycleState] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!user?.teamId) {
      setIsCycleOpen(false);
      return () => {
        cancelled = true;
      };
    }

    const loadCycle = async () => {
      try {
        setIsCycleLoading(true);
        const params = new URLSearchParams({
          teamId: String(user.teamId),
          quarter: cycleQ,
          year: String(cycleY),
        });
        const response = await fetch(`/api/rating-cycles?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to load cycle status");
        }
        const data = await response.json();
        if (!cancelled) {
          setIsCycleOpen(!!data.isOpen);
        }
      } catch {
        if (!cancelled) {
          setIsCycleOpen(false);
          toast({ title: "Unable to load cycle status", variant: "destructive" });
        }
      } finally {
        if (!cancelled) {
          setIsCycleLoading(false);
        }
      }
    };

    loadCycle();

    return () => {
      cancelled = true;
    };
  }, [user?.teamId, cycleQ, cycleY]);

  const handleToggleCycle = (checked: boolean) => {
    setPendingCycleState(checked);
    setCycleConfirmOpen(true);
  };

  const confirmCycleToggle = async () => {
    if (!user?.teamId || pendingCycleState === null) {
      setCycleConfirmOpen(false);
      return;
    }

    try {
      setIsCycleUpdating(true);
      const response = await fetch("/api/rating-cycles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId: user.teamId,
          quarter: cycleQ,
          year: cycleY,
          isOpen: pendingCycleState,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? "Failed to update cycle status");
      }

      const data = await response.json();
      setIsCycleOpen(!!data.isOpen);
      setCycleConfirmOpen(false);
      setPendingCycleState(null);

      const notificationSummary = data?.notificationSummary as
        | { attempted: number; sent: number; failed: number }
        | undefined;

      if (data.isOpen) {
        toast({
          title: `Ratings opened for ${cycleQ} ${cycleY}`,
          description: notificationSummary
            ? `Email sent: ${notificationSummary.sent}/${notificationSummary.attempted}${notificationSummary.failed ? ` (${notificationSummary.failed} failed)` : ""}`
            : undefined,
        });
      } else {
        const summary = data.autoSubmitSummary;
        const cycleDetail = summary
          ? `${summary.ratingsProcessed} ratings processed, ${summary.approvalsCreated} approvals created, ${summary.approvalsUpdated} approvals updated.`
          : "Team ratings were processed.";
        const emailDetail = notificationSummary
          ? ` Email sent: ${notificationSummary.sent}/${notificationSummary.attempted}${notificationSummary.failed ? ` (${notificationSummary.failed} failed)` : ""}.`
          : "";
        toast({
          title: `Ratings closed for ${cycleQ} ${cycleY}`,
          description: `${cycleDetail}${emailDetail}`,
        });
      }
    } catch (error) {
      toast({
        title: "Failed to update cycle status",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setCycleConfirmOpen(false);
      setPendingCycleState(null);
    } finally {
      setIsCycleUpdating(false);
    }
  };

  const teamMembers = members?.filter(m => m.userId !== user?.userId && m.role === "User") ?? [];

  const openReminderModal = async () => {
    if (!user?.teamId) return;

    try {
      setReminderOpen(true);
      setIsLoadingPendingReminders(true);
      setPendingReminderMembers([]);
      setSelectedUserIds([]);
      setSelectAll(false);
      const params = new URLSearchParams({
        teamId: String(user.teamId),
        quarter: cycleQ,
        year: String(cycleY),
      });
      const response = await fetch(`/api/reminder/pending-users?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load pending users");
      }

      const pendingUsers = (await response.json()) as Array<{
        userId: string;
        displayName: string;
        email: string;
        level?: string;
      }>;

      const ids = pendingUsers.map((member) => member.userId);
      setPendingReminderMembers(pendingUsers);
      setSelectedUserIds(ids);
      setSelectAll(ids.length > 0);
      setReminderDeadline("");
      setReminderMsg("");
    } catch (error) {
      toast({
        title: "Unable to load pending users",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPendingReminders(false);
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setSelectedUserIds(checked ? pendingReminderMembers.map(m => m.userId) : []);
  };

  const handleToggleMember = (userId: string, checked: boolean) => {
    setSelectedUserIds(prev =>
      checked ? [...prev, userId] : prev.filter(id => id !== userId)
    );
    setSelectAll(false);
  };

  const handleSendReminder = async () => {
    if (!user?.teamId || selectedUserIds.length === 0) return;
    try {
      await Promise.all(
        selectedUserIds.map((selectedUserId) =>
          sendReminderAsync({
            data: {
              userId: selectedUserId,
              deadline: reminderDeadline || undefined,
              customMessage: reminderMsg || undefined,
            }
          })
        )
      );

      toast({ title: `Reminder sent to ${selectedUserIds.length} member(s)` });
      setReminderOpen(false);
    } catch {
      toast({ title: "Failed to send reminders", variant: "destructive" });
    }
  };

  const handleRemove = () => {
    if (!removingId) return;
    updateUser({ userId: removingId, data: { teamId: null } }, {
      onSuccess: () => {
        toast({ title: "Member removed from team" });
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        setRemovingId(null);
      },
      onError: () => toast({ title: "Failed to remove member", variant: "destructive" })
    });
  };

  const setAdd = (field: keyof UserForm, value: string) =>
    setAddForm(prev => ({ ...prev, [field]: value }));

  const handleCreate = () => {
    if (!addForm.displayName || !addForm.username || !addForm.email || !addForm.password) {
      toast({ title: "Full Name, Username, Email, and Password are required", variant: "destructive" });
      return;
    }
    registerUser({
      data: {
        displayName: addForm.displayName.trim(),
        username: addForm.username.trim(),
        email: addForm.email.trim(),
        password: addForm.password,
        role: "User",
        level: addForm.level,
        teamId: user?.teamId ?? null,
        ldap: addForm.ldap.trim() || null,
        process: addForm.process.trim() || null,
        vacoEmployeeCode: addForm.vacoEmployeeCode.trim() || null,
        joiningDate: addForm.joiningDate || null,
      } as any
    }, {
      onSuccess: (newUser) => {
        toast({ title: `${newUser.displayName} added to your team` });
        setAddDialogOpen(false);
        setAddForm(emptyForm);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      },
      onError: (err: any) => toast({
        title: "Failed to create user",
        description: err?.message ?? "An error occurred",
        variant: "destructive"
      })
    });
  };

  const openEdit = (m: typeof teamMembers[0]) => {
    setEditingId(m.userId);
    setEditForm({
      displayName: m.displayName,
      username: m.username,
      email: m.email,
      password: "",
      level: m.level,
      ldap: (m as any).ldap ?? "",
      process: (m as any).process ?? "",
      vacoEmployeeCode: (m as any).vacoEmployeeCode ?? "",
      joiningDate: (m as any).joiningDate ?? "",
    });
    setEditDialogOpen(true);
  };

  const setEdit = (field: keyof UserForm, value: string) =>
    setEditForm(prev => ({ ...prev, [field]: value }));

  const handleUpdate = () => {
    if (!editingId) return;
    if (!editForm.displayName || !editForm.username || !editForm.email) {
      toast({ title: "Full Name, Username, and Email are required", variant: "destructive" });
      return;
    }
    updateUser({
      userId: editingId,
      data: {
        displayName: editForm.displayName.trim(),
        username: editForm.username.trim(),
        email: editForm.email.trim(),
        level: editForm.level,
        ldap: editForm.ldap.trim() || null,
        process: editForm.process.trim() || null,
        vacoEmployeeCode: editForm.vacoEmployeeCode.trim() || null,
        joiningDate: editForm.joiningDate || null,
      } as any
    }, {
      onSuccess: () => {
        toast({ title: "Member updated successfully" });
        setEditDialogOpen(false);
        setEditingId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      },
      onError: (err: any) => toast({
        title: "Failed to update member",
        description: err?.message ?? "An error occurred",
        variant: "destructive"
      })
    });
  };

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  const memberToRemove = members?.find(m => m.userId === removingId);

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="bg-card p-5 rounded-2xl border border-border/50 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Manage Team</h1>
                <p className="text-muted-foreground text-sm">{user.teamName || "Your team"} · {teamMembers.length} member(s)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={openReminderModal}
                id="send-reminder-btn"
              >
                <Bell className="w-4 h-4 mr-1.5" /> Send Reminder
              </Button>
              <Button
                onClick={() => { setAddForm(emptyForm); setAddDialogOpen(true); }}
                id="add-user-btn"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add User
              </Button>
            </div>
          </div>
        </div>

        <Card className="p-5 border-border/50 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Submission Cycle Management</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Toggle the status to Open or Close the submission window for a specific quarter. When closed, members cannot submit or edit ratings for that quarter.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-secondary/20 rounded-xl border">
            <div className="flex items-center gap-3">
              <Select value={cycleQ} onValueChange={(v) => setCycleQ(v as RatingQuarter)}>
                <SelectTrigger className="w-[100px] bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Q1","Q2","Q3","Q4"] as const).map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cycleY.toString()} onValueChange={(v) => setCycleY(parseInt(v))}>
                <SelectTrigger className="w-[100px] bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="cycle-toggle" className="text-sm font-medium">
                {isCycleOpen ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Open</span>
                ) : (
                  <span className="text-muted-foreground">Closed</span>
                )}
              </Label>
              <Switch
                id="cycle-toggle"
                checked={isCycleOpen}
                onCheckedChange={handleToggleCycle}
                disabled={isCycleLoading || isCycleUpdating}
              />
            </div>
          </div>
        </Card>

        {loadingMembers ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : teamMembers.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Settings className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No team members yet. Add the first one using the button above.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {teamMembers.map(m => (
              <Card key={m.userId} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                    {m.displayName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{m.displayName}</p>
                    <p className="text-sm text-muted-foreground truncate">{m.email} · {m.level}</p>
                    {(m as any).ldap && (
                      <p className="text-xs text-muted-foreground/70 truncate">LDAP: {(m as any).ldap}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-primary border-primary/20 hover:bg-primary/10"
                    onClick={() => openEdit(m)}
                    id={`edit-user-${m.userId}`}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/20 hover:bg-destructive/10"
                    onClick={() => setRemovingId(m.userId)}
                    id={`remove-user-${m.userId}`}
                  >
                    <UserMinus className="w-3.5 h-3.5 mr-1.5" /> Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!removingId} onOpenChange={(o) => !o && setRemovingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.displayName}</strong> from your team? They will no longer be assigned to a team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cycleConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCycleConfirmOpen(false);
            setPendingCycleState(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCycleState
                ? "Open Ratings"
                : "Close Ratings"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCycleState
                ? `Are you sure you want to open Ratings for Quarter ${cycleQ} and Year ${cycleY}?`
                : `Are you sure you want to close the Ratings for Quarter ${cycleQ} and Year ${cycleY}? On close, saved/submitted ratings for your team will be auto-submitted into approvals.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCycleToggle} disabled={isCycleUpdating}>
              {isCycleUpdating ? "Updating..." : "Yes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addDialogOpen} onOpenChange={v => { if (!v) { setAddDialogOpen(false); setAddForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Add New User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="a-displayName">Full Name <span className="text-destructive">*</span></Label>
                <Input id="a-displayName" placeholder="e.g. Jane Doe" value={addForm.displayName} onChange={e => setAdd("displayName", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="a-username">Username <span className="text-destructive">*</span></Label>
                <Input id="a-username" placeholder="e.g. jane.doe" value={addForm.username} onChange={e => setAdd("username", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-email" className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email <span className="text-destructive">*</span>
              </Label>
              <Input id="a-email" type="email" placeholder="jane@example.com" value={addForm.email} onChange={e => setAdd("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-password" className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Password <span className="text-destructive">*</span>
              </Label>
              <Input id="a-password" type="password" placeholder="Minimum 6 characters" value={addForm.password} onChange={e => setAdd("password", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Level</Label>
                <Select value={addForm.level} onValueChange={v => setAdd("level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="a-ldap">LDAP</Label>
                <Input id="a-ldap" placeholder="e.g. jane.doe@corp" value={addForm.ldap} onChange={e => setAdd("ldap", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="a-process">Process</Label>
                <Input id="a-process" placeholder="e.g. SCIM" value={addForm.process} onChange={e => setAdd("process", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="a-vaco">Vaco Employee Code</Label>
                <Input id="a-vaco" placeholder="e.g. EMP-1234" value={addForm.vacoEmployeeCode} onChange={e => setAdd("vacoEmployeeCode", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-joiningDate">Joining Date</Label>
              <Input id="a-joiningDate" type="date" value={addForm.joiningDate} onChange={e => setAdd("joiningDate", e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); setAddForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isRegistering}>
              {isRegistering ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={v => { if (!v) { setEditDialogOpen(false); setEditingId(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" /> Edit User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="e-displayName">Full Name <span className="text-destructive">*</span></Label>
                <Input id="e-displayName" placeholder="e.g. Jane Doe" value={editForm.displayName} onChange={e => setEdit("displayName", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-username">Username <span className="text-destructive">*</span></Label>
                <Input id="e-username" placeholder="e.g. jane.doe" value={editForm.username} onChange={e => setEdit("username", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-email" className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email <span className="text-destructive">*</span>
              </Label>
              <Input id="e-email" type="email" placeholder="jane@example.com" value={editForm.email} onChange={e => setEdit("email", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Level</Label>
                <Select value={editForm.level} onValueChange={v => setEdit("level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-ldap">LDAP</Label>
                <Input id="e-ldap" placeholder="e.g. jane.doe@corp" value={editForm.ldap} onChange={e => setEdit("ldap", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="e-process">Process</Label>
                <Input id="e-process" placeholder="e.g. SCIM" value={editForm.process} onChange={e => setEdit("process", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-vaco">Vaco Employee Code</Label>
                <Input id="e-vaco" placeholder="e.g. EMP-1234" value={editForm.vacoEmployeeCode} onChange={e => setEdit("vacoEmployeeCode", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-joiningDate">Joining Date</Label>
              <Input id="e-joiningDate" type="date" value={editForm.joiningDate} onChange={e => setEdit("joiningDate", e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reminderOpen} onOpenChange={(v) => { if (!v) setReminderOpen(false); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4" /> Send Rating Reminder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              Showing only users who have not submitted ratings for {cycleQ} {cycleY}.
            </p>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Select Recipients</Label>
              <div className="border rounded-lg overflow-hidden">
                <label className="flex items-center gap-3 px-3 py-2.5 bg-secondary/30 border-b cursor-pointer hover:bg-secondary/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectAll && selectedUserIds.length === pendingReminderMembers.length}
                    onChange={e => handleToggleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm font-medium">Select All ({pendingReminderMembers.length})</span>
                </label>
                <div className="max-h-48 overflow-y-auto divide-y">
                  {pendingReminderMembers.map(m => (
                    <label
                      key={m.userId}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary/20 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(m.userId)}
                        onChange={e => handleToggleMember(m.userId, e.target.checked)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                    </label>
                  ))}
                  {isLoadingPendingReminders && (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">Loading pending users...</p>
                  )}
                  {!isLoadingPendingReminders && pendingReminderMembers.length === 0 && (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">All users have already submitted ratings for this cycle.</p>
                  )}
                </div>
              </div>
              {selectedUserIds.length === 0 && (
                <p className="text-xs text-destructive">Select at least one recipient to send reminders.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Deadline Date (optional)</Label>
              <Input type="date" value={reminderDeadline} onChange={e => setReminderDeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Custom Message (optional)</Label>
              <Textarea
                placeholder="Leave blank to use the default reminder message..."
                value={reminderMsg}
                onChange={e => setReminderMsg(e.target.value)}
                className="resize-none h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSendReminder}
              disabled={isSending || selectedUserIds.length === 0}
              id="confirm-send-reminder-btn"
            >
              {isSending ? "Sending..." : `Send to ${selectedUserIds.length} member(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}