import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import {
  Rating,
  RatingQuarter,
  getListItemsQueryKey,
  getListRatingsQueryKey,
  useDeleteRating,
  useListItems,
  useListRatings,
  useSubmitRating,
  useUpdateRating,
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  ClipboardList,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Scale,
  Tag,
  Trash2,
} from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "Core Contributions": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Org Contributions": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Value Addition": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Leave Management": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Subjective Feedback": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Self Learning & Development": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

function ratingLabel(v: number) {
  if (v >= 4.5) return { text: "Exceptional", color: "text-emerald-600" };
  if (v >= 4.0) return { text: "Exceeds Expectations", color: "text-green-600" };
  if (v >= 3.0) return { text: "Meets Expectations", color: "text-blue-600" };
  if (v >= 2.0) return { text: "Improvement Needed", color: "text-amber-600" };
  if (v > 0) return { text: "Unsatisfactory", color: "text-red-600" };
  return null;
}

type ProjectRating = {
  id: string;
  ratingId?: number;
  projectName: string;
  ratingValue: string;
  comment: string;
  artifactLinks: string;
  status?: string | null;
};

function createProjectEntry(id: string, overrides: Partial<ProjectRating> = {}): ProjectRating {
  return {
    id,
    projectName: "",
    ratingValue: "",
    comment: "",
    artifactLinks: "",
    status: "pending",
    ...overrides,
  };
}

function normalizeRatingStatus(status: unknown): "saved" | "pending" | "submitted" {
  if (status === "saved" || status === "pending" || status === "submitted") {
    return status;
  }

  return "submitted";
}

function MandatoryAsterisk() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-red-600 font-bold cursor-help" aria-label="Mandatory field">*</span>
      </TooltipTrigger>
      <TooltipContent className="bg-background text-red-600 border border-red-200">
        Mandatory Fields
      </TooltipContent>
    </Tooltip>
  );
}

export default function SubmitRating() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const [quarter, setQuarter] = useState<RatingQuarter>(RatingQuarter.Q1);
  const [year, setYear] = useState<number>(currentYear);
  const [itemProjects, setItemProjects] = useState<Record<number, ProjectRating[]>>({});
  const [deletedRatingIds, setDeletedRatingIds] = useState<Record<number, number[]>>({});
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
  }, [isLoading, token, setLocation]);

  const itemTargetRole = user?.role === "Team Lead" || user?.role === "Manager" ? "Team Lead" : "User";
  const itemParams = user?.teamId
    ? { teamId: user.teamId, targetRole: itemTargetRole, level: user.level }
    : { targetRole: itemTargetRole, level: user?.level };
  const ratingsParams = {
    userId: user?.userId,
    quarter,
    year,
    includeDrafts: true,
  };

  const { data: items } = useListItems(itemParams, {
    query: {
      queryKey: getListItemsQueryKey(itemParams),
      enabled: !!user,
    },
  });

  const { data: ratings, isLoading: ratingsLoading } = useListRatings(ratingsParams, {
    query: {
      queryKey: getListRatingsQueryKey(ratingsParams),
      enabled: !!user,
    },
  });

  const { mutate: submitRating } = useSubmitRating();
  const { mutate: updateRating } = useUpdateRating();
  const { mutate: deleteRating } = useDeleteRating();

  const selectedPeriodRatings = ratings ?? [];
  const submittedPeriodRatings = selectedPeriodRatings.filter(
    (rating) => normalizeRatingStatus(rating.status) === "submitted"
  );
  const draftPeriodRatings = selectedPeriodRatings.filter(
    (rating) => normalizeRatingStatus(rating.status) !== "submitted"
  );
  const submittedItemIds = new Set(
    submittedPeriodRatings
      .map((rating) => Number(rating.itemId))
      .filter((itemId) => Number.isFinite(itemId))
  );
  const editableItems = (items ?? []).filter((item) => !submittedItemIds.has(Number(item.itemId)));
  const hasSubmittedForSelectedPeriod = !!items?.length && editableItems.length === 0 && submittedPeriodRatings.length > 0;

  useEffect(() => {
    if (!items) {
      return;
    }

    const draftRatingsByItem = draftPeriodRatings.reduce<Record<number, Rating[]>>((acc, rating) => {
      const itemId = Number(rating.itemId);
      if (!Number.isFinite(itemId)) {
        return acc;
      }

      if (!acc[itemId]) {
        acc[itemId] = [];
      }
      acc[itemId].push(rating);
      return acc;
    }, {});

    const nextProjects: Record<number, ProjectRating[]> = {};

    editableItems.forEach((item) => {
      const drafts = (draftRatingsByItem[item.itemId] ?? []).sort((a, b) => a.ratingId - b.ratingId);
      nextProjects[item.itemId] = drafts.length > 0
        ? drafts.map((draft, index) =>
            createProjectEntry(`${item.itemId}-${draft.ratingId ?? index}`, {
              ratingId: draft.ratingId,
              projectName: draft.projectName ?? "",
              ratingValue: draft.ratingValue != null ? String(draft.ratingValue) : "",
              comment: draft.comment ?? draft.kpiAchieved ?? "",
              artifactLinks: draft.artifactLinks ?? "",
              status: normalizeRatingStatus(draft.status),
            })
          )
        : [createProjectEntry(`${item.itemId}-default`)];
    });

    setItemProjects(nextProjects);
    setDeletedRatingIds({});
  }, [items, quarter, year, ratings]);

  const getProjectsForItem = (itemId: number): ProjectRating[] => {
    return itemProjects[itemId] ?? [createProjectEntry(`${itemId}-default`)];
  };

  const isProjectBlank = (project: ProjectRating) => {
    return (
      project.projectName.trim().length === 0 &&
      project.ratingValue.trim().length === 0 &&
      project.comment.trim().length === 0 &&
      project.artifactLinks.trim().length === 0
    );
  };

  const isProjectValid = (project: ProjectRating) => {
    const ratingNum = parseFloat(project.ratingValue);
    return (
      project.projectName.trim().length > 0 &&
      ratingNum >= 0.1 &&
      ratingNum <= 5.0 &&
      project.comment.trim().length > 0
    );
  };

  const getAverageRatingForEditableItem = (itemId: number) => {
    const projects = getProjectsForItem(itemId);
    const validRatings = projects
      .filter((project) => !isProjectBlank(project))
      .map((project) => parseFloat(project.ratingValue))
      .filter((value) => Number.isFinite(value) && value >= 0.1 && value <= 5.0);

    if (validRatings.length === 0) {
      return null;
    }

    return validRatings.reduce((sum, value) => sum + value, 0) / validRatings.length;
  };

  const getAverageRatingForSubmittedItem = (itemId: number) => {
    const submittedRatings = submittedPeriodRatings.filter((rating) => Number(rating.itemId) === itemId);
    const validRatings = submittedRatings
      .map((rating) => Number(rating.ratingValue))
      .filter((value) => Number.isFinite(value) && value >= 0.1 && value <= 5.0);

    if (validRatings.length === 0) {
      return null;
    }

    return validRatings.reduce((sum, value) => sum + value, 0) / validRatings.length;
  };

  const totalWeightedRating = (items ?? []).reduce((total, item) => {
    const itemWeight = Number(item.weight ?? 0);
    if (!Number.isFinite(itemWeight) || itemWeight <= 0) {
      return total;
    }

    const itemAverageRating = submittedItemIds.has(Number(item.itemId))
      ? getAverageRatingForSubmittedItem(item.itemId)
      : getAverageRatingForEditableItem(item.itemId);

    if (itemAverageRating == null) {
      return total;
    }

    return total + itemWeight * itemAverageRating;
  }, 0);

  const weightedRatingBreakdown = (items ?? [])
    .map((item) => {
      const itemWeight = Number(item.weight ?? 0);
      if (!Number.isFinite(itemWeight) || itemWeight <= 0) {
        return null;
      }

      const itemAverageRating = submittedItemIds.has(Number(item.itemId))
        ? getAverageRatingForSubmittedItem(item.itemId)
        : getAverageRatingForEditableItem(item.itemId);

      if (itemAverageRating == null) {
        return null;
      }

      return {
        itemId: item.itemId,
        itemName: item.itemName,
        itemWeight,
        averageRating: itemAverageRating,
        weightedContribution: itemWeight * itemAverageRating,
      };
    })
    .filter((entry): entry is {
      itemId: number;
      itemName: string;
      itemWeight: number;
      averageRating: number;
      weightedContribution: number;
    } => entry != null);

  const hasAtLeastOneRatedItem = (items ?? []).some((item) => {
    const itemAverageRating = submittedItemIds.has(Number(item.itemId))
      ? getAverageRatingForSubmittedItem(item.itemId)
      : getAverageRatingForEditableItem(item.itemId);

    return itemAverageRating != null;
  });

  const hasInvalidEnteredProjects = (itemId: number) => {
    return getProjectsForItem(itemId).some((project) => !isProjectBlank(project) && !isProjectValid(project));
  };

  const getSavableProjectsForItem = (itemId: number) => {
    return getProjectsForItem(itemId).filter((project) => !isProjectBlank(project));
  };

  const isItemComplete = (itemId: number) => {
    const projects = getProjectsForItem(itemId);
    return projects.length > 0 && projects.every(isProjectValid);
  };

  const addProject = (itemId: number) => {
    setItemProjects((prev) => {
      const current = prev[itemId] ?? [createProjectEntry(`${itemId}-default`)];
      return {
        ...prev,
        [itemId]: [...current, createProjectEntry(`${itemId}-${Date.now()}`)],
      };
    });
  };

  const updateProject = (itemId: number, projectId: string, updates: Partial<ProjectRating>) => {
    setItemProjects((prev) => {
      const current = prev[itemId] ?? [createProjectEntry(`${itemId}-default`)];
      return {
        ...prev,
        [itemId]: current.map((project) => (project.id === projectId ? { ...project, ...updates } : project)),
      };
    });
  };

  const removeProject = (itemId: number, projectId: string) => {
    setItemProjects((prev) => {
      const current = prev[itemId] ?? [createProjectEntry(`${itemId}-default`)];
      const projectToRemove = current.find((project) => project.id === projectId);
      const remaining = current.filter((project) => project.id !== projectId);

      if (projectToRemove?.ratingId) {
        setDeletedRatingIds((draftDeletes) => ({
          ...draftDeletes,
          [itemId]: [...(draftDeletes[itemId] ?? []), projectToRemove.ratingId!],
        }));
      }

      return {
        ...prev,
        [itemId]: remaining.length > 0 ? remaining : [createProjectEntry(`${itemId}-default`)],
      };
    });
  };

  const saveNewRating = (itemId: number, project: ProjectRating, status: "saved" | "submitted") => {
    return new Promise<Rating>((resolve, reject) => {
      submitRating(
        {
          data: {
            itemId,
            ratingValue: parseFloat(project.ratingValue),
            kpiAchieved: project.comment || undefined,
            projectName: project.projectName.trim(),
            quarter,
            year,
            artifactLinks: project.artifactLinks.trim() || undefined,
            status,
          },
        },
        {
          onSuccess: resolve,
          onError: reject,
        }
      );
    });
  };

  const saveExistingRating = (project: ProjectRating, status: "saved" | "submitted") => {
    return new Promise<Rating>((resolve, reject) => {
      updateRating(
        {
          ratingId: project.ratingId!,
          data: {
            ratingValue: parseFloat(project.ratingValue),
            kpiAchieved: project.comment || undefined,
            projectName: project.projectName.trim(),
            artifactLinks: project.artifactLinks.trim() || undefined,
            status,
          },
        },
        {
          onSuccess: resolve,
          onError: reject,
        }
      );
    });
  };

  const deleteExistingRating = (ratingId: number) => {
    return new Promise<void>((resolve, reject) => {
      deleteRating(
        { ratingId },
        {
          onSuccess: () => resolve(),
          onError: reject,
        }
      );
    });
  };

  const persistItem = async (itemId: number, status: "saved" | "submitted") => {
    const projects = getProjectsForItem(itemId);
    const savableProjects = getSavableProjectsForItem(itemId);

    if (savableProjects.length === 0) {
      toast({
        title: status === "saved" ? "Nothing to save" : "Incomplete ratings",
        description: status === "saved"
          ? "Add at least one project name, rating, and KPI achieved before saving this section."
          : "Each section must have at least one project with project name, rating, and KPI achieved.",
        variant: "destructive",
      });
      return false;
    }

    if (status === "submitted" && !projects.every(isProjectValid)) {
      toast({
        title: "Incomplete ratings",
        description: "Remove blank rows and provide project name, rating (0.1 to 5.0), and KPI achieved for every project before final submit.",
        variant: "destructive",
      });
      return false;
    }

    if (status === "saved" && hasInvalidEnteredProjects(itemId)) {
      toast({
        title: "Incomplete section",
        description: "Complete or clear partially filled project rows before saving this section.",
        variant: "destructive",
      });
      return false;
    }

    const removedIds = deletedRatingIds[itemId] ?? [];
    const savedProjects: Rating[] = [];

    for (const ratingId of removedIds) {
      await deleteExistingRating(ratingId);
    }

    for (const project of savableProjects) {
      const saved = project.ratingId
        ? await saveExistingRating(project, status)
        : await saveNewRating(itemId, project, status);
      savedProjects.push(saved);
    }

    setDeletedRatingIds((prev) => ({ ...prev, [itemId]: [] }));
    setItemProjects((prev) => ({
      ...prev,
      [itemId]: savedProjects.length > 0
        ? savedProjects.map((saved, index) =>
            createProjectEntry(`${itemId}-${saved.ratingId ?? index}`, {
              ratingId: saved.ratingId,
              projectName: saved.projectName ?? "",
              ratingValue: saved.ratingValue != null ? String(saved.ratingValue) : "",
              comment: saved.comment ?? saved.kpiAchieved ?? "",
              artifactLinks: saved.artifactLinks ?? "",
              status: saved.status ?? status,
            })
          )
        : [createProjectEntry(`${itemId}-default`)],
    }));

    return true;
  };

  const handleSaveDraft = async (itemId: number, itemName: string) => {
    try {
      setSavingItemId(itemId);
      const success = await persistItem(itemId, "saved");
      if (success) {
        toast({
          title: "Draft saved",
          description: `${itemName} draft saved for ${quarter} ${year}.`,
        });
      }
    } catch {
      toast({
        title: "Unable to save draft",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingItemId(null);
    }
  };

  const handleSubmit = async () => {
    if (hasSubmittedForSelectedPeriod) {
      toast({
        title: "Ratings already submitted",
        description: `You have already submitted ratings for ${quarter} ${year}.`,
        variant: "destructive",
      });
      return;
    }

    if (editableItems.length === 0) {
      toast({
        title: "No pending KPIs",
        description: `All KPIs are already submitted for ${quarter} ${year}.`,
        variant: "destructive",
      });
      return;
    }

    const hasIncompleteItems = editableItems.some((item) => !isItemComplete(item.itemId));
    if (hasIncompleteItems) {
      toast({
        title: "Incomplete ratings",
        description: `Please complete every project row for all KPI sections before submitting ${quarter} ${year}.`,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmittingAll(true);
      for (const item of editableItems) {
        const success = await persistItem(item.itemId, "submitted");
        if (!success) {
          setIsSubmittingAll(false);
          return;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/ratings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/ratings/summary"] });
      toast({ title: "All ratings submitted successfully" });
    } catch {
      toast({
        title: "Unable to submit ratings",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingAll(false);
    }
  };

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div>
            <h1 className="text-2xl font-bold">Submit Self-Ratings</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Save section drafts anytime and submit everything when complete</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={quarter} onValueChange={(v) => setQuarter(v as RatingQuarter)}>
              <SelectTrigger className="w-[110px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <SelectTrigger className="w-[100px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {draftPeriodRatings.length > 0 && (
          <Card className="p-4 bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <Save className="w-4 h-4" />
              {draftPeriodRatings.length} draft entr{draftPeriodRatings.length === 1 ? "y" : "ies"} loaded for {quarter} {year}
            </p>
          </Card>
        )}

        {submittedPeriodRatings.length > 0 && (
          <Card className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {submittedPeriodRatings.length} submitted entr{submittedPeriodRatings.length === 1 ? "y" : "ies"} found for {quarter} {year}
            </p>
          </Card>
        )}

        {items && items.length > 0 && (
          <Card className="p-4 bg-secondary/30 border-border/60">
            <p className="text-sm text-muted-foreground">Total Weighted Rating ({quarter} {year})</p>
            <p className="text-2xl font-semibold mt-1">
              {hasAtLeastOneRatedItem ? totalWeightedRating.toFixed(2) : "0.00"}
              <span className="text-sm font-normal text-muted-foreground ml-1">/ 5.00</span>
            </p>
            {weightedRatingBreakdown.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {weightedRatingBreakdown.map((entry) => (
                  <p key={entry.itemId} className="text-xs text-muted-foreground">
                    {entry.itemName}: ({Math.round(entry.itemWeight * 100)}% × {entry.averageRating.toFixed(2)}) = {entry.weightedContribution.toFixed(2)}
                  </p>
                ))}
              </div>
            )}
          </Card>
        )}

        {ratingsLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading items...</div>
        ) : !items || items.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="font-semibold text-lg mb-1">No KPI Items Set Up Yet</h3>
            <p className="text-muted-foreground text-sm">
              {itemTargetRole === "User"
                ? "Your Team Lead hasn't added any KPI items for your team yet. Please check back later."
                : "The Manager hasn't added any KPI items for Team Leads yet. Please check back later."}
            </p>
          </Card>
        ) : hasSubmittedForSelectedPeriod ? (
          <Card className="p-12 text-center border-dashed">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
            <h3 className="font-semibold text-lg mb-1">All Done!</h3>
            <p className="text-muted-foreground">You have already submitted ratings for {quarter} {year}.</p>
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              {editableItems.map((item) => {
                const projects = getProjectsForItem(item.itemId);
                const catColor = CATEGORY_COLORS[item.category ?? ""] ?? "bg-secondary text-secondary-foreground";
                const sectionHasDraft = projects.some((project) => project.ratingId);

                return (
                  <Card key={item.itemId} className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold">{item.itemName}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor}`}>
                            {item.category}
                          </span>
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                            Weight: {Math.round((item.weight ?? 0) * 100)}%
                          </span>
                          {sectionHasDraft && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              Draft saved
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => addProject(item.itemId)}
                          disabled={savingItemId === item.itemId || isSubmittingAll}
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Project
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => handleSaveDraft(item.itemId, item.itemName)}
                          disabled={savingItemId === item.itemId || isSubmittingAll}
                        >
                          {savingItemId === item.itemId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Section
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {projects.map((project) => {
                        const numericValue = parseFloat(project.ratingValue);
                        const label = !Number.isNaN(numericValue) && numericValue > 0 ? ratingLabel(numericValue) : null;

                        return (
                          <div key={project.id} className="grid md:grid-cols-4 gap-4 p-4 border rounded-xl bg-muted/20 relative group">
                            {projects.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeProject(item.itemId, project.id)}
                                className="absolute -top-3 -right-3 h-7 w-7 rounded-full bg-background border shadow-sm text-muted-foreground hover:text-destructive md:opacity-0 group-hover:opacity-100 transition-opacity"
                                disabled={savingItemId === item.itemId || isSubmittingAll}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            <div className="space-y-2 col-span-1 md:col-span-1 border-r pr-4 border-border/50">
                              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
                                <Tag className="w-3.5 h-3.5" /> Project Entry <MandatoryAsterisk />
                              </Label>
                              <Input
                                placeholder="Project name / Sub-task"
                                value={project.projectName}
                                onChange={(e) => updateProject(item.itemId, project.id, { projectName: e.target.value })}
                                className="text-sm font-medium border-none shadow-none px-0 h-8 focus-visible:ring-0 rounded-none bg-transparent"
                              />
                            </div>

                            <div className="col-span-1 md:col-span-3 grid md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                                  <Scale className="w-3.5 h-3.5" /> Rating (0.1 – 5.0) <MandatoryAsterisk />
                                </Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0.1"
                                    max="5.0"
                                    step="0.1"
                                    placeholder="e.g. 4.2"
                                    value={project.ratingValue}
                                    onChange={(e) => updateProject(item.itemId, project.id, { ratingValue: e.target.value })}
                                    className="w-24 text-center font-semibold"
                                  />
                                  {label && (
                                    <span className={`text-[10px] sm:text-xs font-medium leading-none max-w-[80px] ${label.color}`}>{label.text}</span>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                                  <MessageSquare className="w-3.5 h-3.5" /> KPI ACHIEVED <MandatoryAsterisk />
                                </Label>
                                <Textarea
                                  placeholder="Describe your contribution..."
                                  value={project.comment}
                                  onChange={(e) => updateProject(item.itemId, project.id, { comment: e.target.value })}
                                  className="resize-none h-[42px] min-h-[42px] py-2 text-sm"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-3">
                                <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                                  <LinkIcon className="w-3.5 h-3.5" /> Artifact Links
                                </Label>
                                <Input
                                  placeholder="https://docs.google.com/..."
                                  value={project.artifactLinks}
                                  onChange={(e) => updateProject(item.itemId, project.id, { artifactLinks: e.target.value })}
                                  className="text-sm h-8"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {hasInvalidEnteredProjects(item.itemId) && (
                      <p className="text-xs text-amber-600">
                        Complete or clear partially filled project rows before saving this section.
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={isSubmittingAll || editableItems.length === 0 || editableItems.some((item) => !isItemComplete(item.itemId))}
              >
                {isSubmittingAll ? "Submitting..." : "Submit All Ratings"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
