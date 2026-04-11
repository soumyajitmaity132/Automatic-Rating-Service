import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import {
  useListItems, useCreateItem, useUpdateItem, useDeleteItem,
  useListTeams,
  RatingItem
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClipboardList, Plus, Pencil, Trash2, AlertTriangle, CheckCircle } from "lucide-react";

const CATEGORIES = [
  "Core Contributions",
  "Org Contributions",
  "Value Addition",
  "Leave Management",
  "Subjective Feedback",
  "Self Learning & Development",
];

const LEVELS = ["L1", "L2", "L3"] as const;
type ItemLevel = (typeof LEVELS)[number];

interface ItemFormData {
  itemName: string;
  description: string;
  weight: string;
  category: string;
  level: ItemLevel;
}

const emptyForm: ItemFormData = {
  itemName: "",
  description: "",
  weight: "",
  category: CATEGORIES[0],
  level: "L1",
};

function ItemFormDialog({
  open, onClose, onSave, initial, isPending, title
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: ItemFormData) => void;
  initial: ItemFormData;
  isPending: boolean;
  title: string;
}) {
  const [form, setForm] = useState<ItemFormData>(initial);
  useEffect(() => { setForm(initial); }, [initial]);

  const weightNum = parseFloat(form.weight);
  const validWeight = !isNaN(weightNum) && weightNum > 0 && weightNum <= 1;

  const set = (field: keyof ItemFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="kpi-name">Item Name <span className="text-destructive">*</span></Label>
            <Input
              id="kpi-name"
              placeholder="e.g. Core Contributions"
              maxLength={50}
              value={form.itemName}
              onChange={e => set("itemName", e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-right">{form.itemName.length}/50</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="kpi-desc">Description</Label>
            <Textarea
              id="kpi-desc"
              placeholder="Optional description of the KPI criteria"
              maxLength={200}
              rows={3}
              value={form.description}
              onChange={e => set("description", e.target.value)}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{form.description.length}/200</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="kpi-weight">Weight (0.01–1.0) <span className="text-destructive">*</span></Label>
              <Input
                id="kpi-weight"
                type="number"
                placeholder="e.g. 0.55"
                min="0.01" max="1.0" step="0.01"
                value={form.weight}
                onChange={e => set("weight", e.target.value)}
                className={!form.weight || validWeight ? "" : "border-destructive"}
              />
              {form.weight && !validWeight && (
                <p className="text-xs text-destructive">Must be between 0.01 and 1.0</p>
              )}
              {form.weight && validWeight && (
                <p className="text-xs text-muted-foreground">= {(weightNum * 100).toFixed(0)}%</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Level <span className="text-destructive">*</span></Label>
              <Select value={form.level} onValueChange={v => set("level", v as ItemLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map(level => <SelectItem key={level} value={level}>{level}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={isPending || !form.itemName.trim() || !validWeight}
          >
            {isPending ? "Saving..." : "Save Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ManageKPIs() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isManager = user?.role === "Manager";
  const targetRole = isManager ? "Team Lead" : "User";

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<RatingItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<ItemLevel>("L1");

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role === "User") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  const { data: teams } = useListTeams({ query: { enabled: isManager } });

  const activeTeamId = isManager ? selectedTeamId : (user?.teamId ?? null);

  const { data: items, isLoading: itemsLoading } = useListItems(
    activeTeamId ? { teamId: activeTeamId, targetRole, level: selectedLevel } : { targetRole, level: selectedLevel },
    { query: { enabled: !!user } }
  );

  const { mutate: createItem, isPending: isCreating } = useCreateItem();
  const { mutate: updateItem, isPending: isUpdating } = useUpdateItem();
  const { mutate: deleteItem, isPending: isDeleting } = useDeleteItem();

  const totalWeight = (items ?? []).reduce((sum, i) => sum + (i.weight ?? 0), 0);
  const totalPct = Math.round(totalWeight * 100);
  const weightOk = Math.abs(totalWeight - 1) < 0.005;

  const resolvedTeamId = isManager ? (selectedTeamId ?? null) : (user?.teamId ?? null);

  const handleCreate = (form: ItemFormData) => {
    if (!resolvedTeamId) {
      toast({ title: "Select a team first", variant: "destructive" });
      return;
    }
    createItem({
      data: {
        itemName: form.itemName.trim(),
        description: form.description.trim() || undefined,
        teamId: resolvedTeamId,
        weight: parseFloat(form.weight),
        category: form.category,
        level: form.level,
        targetRole,
      }
    }, {
      onSuccess: () => {
        toast({ title: "KPI item added" });
        setAddOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      },
      onError: (err: any) => toast({ title: "Failed to add item", description: err?.message, variant: "destructive" })
    });
  };

  const handleUpdate = (form: ItemFormData) => {
    if (!editItem) return;
    updateItem({
      itemId: editItem.itemId,
      data: {
        itemName: form.itemName.trim(),
        description: form.description.trim() || undefined,
        weight: parseFloat(form.weight),
        category: form.category,
        level: form.level,
      }
    }, {
      onSuccess: () => {
        toast({ title: "KPI item updated" });
        setEditItem(null);
        queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      },
      onError: (err: any) => toast({ title: "Failed to update item", description: err?.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!deleteItemId) return;
    deleteItem({ itemId: deleteItemId }, {
      onSuccess: () => {
        toast({ title: "KPI item deleted" });
        setDeleteItemId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      },
      onError: () => toast({ title: "Failed to delete item", variant: "destructive" })
    });
  };

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  const canAdd = isManager ? !!selectedTeamId : !!user?.teamId;

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Items to Rate</h1>
              <p className="text-muted-foreground text-sm">
                {isManager
                  ? "Manage KPI items Team Leads are rated on"
                  : "Manage KPI items your team members are rated on"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isManager && teams && (
              <Select
                value={selectedTeamId?.toString() ?? ""}
                onValueChange={v => setSelectedTeamId(v ? Number(v) : null)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.teamId} value={t.teamId.toString()}>{t.teamName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={selectedLevel} onValueChange={v => setSelectedLevel(v as ItemLevel)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map(level => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setAddOpen(true)} disabled={!canAdd}>
              <Plus className="w-4 h-4 mr-1" /> Add KPI Item
            </Button>
          </div>
        </div>

        {isManager && !selectedTeamId && (
          <Card className="p-8 text-center border-dashed text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>Select a team above to manage their KPI items by level.</p>
          </Card>
        )}

        {/* Weight Summary Banner */}
        {(!isManager || selectedTeamId) && items && items.length > 0 && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-medium ${
            weightOk
              ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
          }`}>
            {weightOk
              ? <CheckCircle className="w-5 h-5 shrink-0" />
              : <AlertTriangle className="w-5 h-5 shrink-0" />
            }
            <div>
              <span>Total Weight: <strong>{totalPct}%</strong></span>
              {!weightOk && (
                <span className="ml-2">— KPI weights should sum to 100%. Currently {totalPct > 100 ? "over" : "under"} by {Math.abs(100 - totalPct)}%.</span>
              )}
              {weightOk && <span className="ml-2">— Weights are correctly balanced.</span>}
            </div>
          </div>
        )}

        {/* Items List */}
        {(!isManager || selectedTeamId) && <div className="space-y-3">
          {itemsLoading ? (
            <Card className="p-10 text-center text-muted-foreground">Loading items...</Card>
          ) : !items || items.length === 0 ? (
            <Card className="p-10 text-center border-dashed text-muted-foreground">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No KPI items yet. Add your first item to get started.</p>
            </Card>
          ) : (
            items.map(item => (
              <Card key={item.itemId} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{item.itemName}</h3>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {((item.weight ?? 0) * 100).toFixed(0)}%
                      </span>
                      {!!item.level && (
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          {item.level}
                        </span>
                      )}
                      {item.category && (
                        <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                          {item.category}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditItem(item)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteItemId(item.itemId)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>}
      </div>

      {/* Add Dialog */}
      <ItemFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleCreate}
        initial={{ ...emptyForm, level: selectedLevel }}
        isPending={isCreating}
        title="Add KPI Item"
      />

      {/* Edit Dialog */}
      <ItemFormDialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSave={handleUpdate}
        initial={editItem ? {
          itemName: editItem.itemName,
          description: editItem.description ?? "",
          weight: editItem.weight?.toString() ?? "",
          category: editItem.category ?? CATEGORIES[0],
          level: (editItem.level as ItemLevel | undefined) ?? selectedLevel,
        } : { ...emptyForm, level: selectedLevel }}
        isPending={isUpdating}
        title="Edit KPI Item"
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItemId} onOpenChange={v => { if (!v) setDeleteItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete KPI Item</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this rating item. Existing ratings linked to it will not be deleted but will no longer show the item name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
