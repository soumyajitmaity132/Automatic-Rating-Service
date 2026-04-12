import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import {
  useListUsers, useListRatings, useListApprovals, useListDisputes,
  useResolveDispute, useSendReminder, useListItems,
  getListItemsQueryKey, RatingQuarter, UserProfile, Rating
} from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, CheckSquare, AlertTriangle, Bell, History, UserPlus } from "lucide-react";

function ratingLabel(v: number): string {
  if (v >= 4.5) return "Exceptional";
  if (v >= 4.0) return "Exceeds Expectations";
  if (v >= 3.0) return "Meets Expectations";
  if (v >= 2.0) return "Improvement Needed";
  return "Unsatisfactory";
}

function getRatingRowKey(itemId: number, projectName?: string | null): string {
  return `${itemId}::${(projectName ?? "").trim()}`;
}

interface TlDraft {
  draftId: number;
  ratingValue?: number | null;
  itemId: number;
  itemName?: string | null;
  projectName?: string | null;
  ratedUserId: string;
  teamLeadUserId: string;
  teamLeadDisplayName?: string | null;
  leadComment?: string | null;
  quarter?: string | null;
  year?: number | null;
  status?: "saved" | "send_to_user" | "dispute raised" | "dispute fixed" | string;
  userDisputeMessage?: string | null;
  isActive: boolean;
  updatedOn?: string | null;
}

interface ReferableTeamLead {
  userId: string;
  displayName: string;
  email: string;
  level: string;
  teamId: number | null;
  teamName: string | null;
}

interface MemberStageInfo {
  userId: string;
  displayName: string;
  level: string;
  stage: number;
  stageLabel: string;
}

async function listMemberStages(params: { teamId: number; quarter: RatingQuarter; year: number }): Promise<MemberStageInfo[]> {
  const query = new URLSearchParams({
    teamId: String(params.teamId),
    quarter: params.quarter,
    year: String(params.year),
  });
  const response = await fetch(`/api/ratings/member-stages?${query.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load member stages");
  }
  return response.json();
}

function stageBadgeClasses(stage: number): string {
  switch (stage) {
    case 1:
      return "bg-muted text-muted-foreground";
    case 2:
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case 3:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case 4:
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case 5:
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

async function listTlDrafts(params: { ratedUserId: string; quarter: RatingQuarter; year: number }): Promise<TlDraft[]> {
  const searchParams = new URLSearchParams({
    ratedUserId: params.ratedUserId,
    quarter: params.quarter,
    year: params.year.toString(),
  });
  const response = await fetch(`/api/tl-drafts?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load TL drafts");
  }
  return response.json();
}

async function listTlDraftHistory(params: {
  ratedUserId: string;
  quarter: RatingQuarter;
  year: number;
  itemId: number;
  projectName?: string | null;
}): Promise<TlDraft[]> {
  const searchParams = new URLSearchParams({
    ratedUserId: params.ratedUserId,
    quarter: params.quarter,
    year: params.year.toString(),
    itemId: params.itemId.toString(),
    includeInactive: "true",
  });
  searchParams.set("projectName", (params.projectName ?? "").trim());

  const response = await fetch(`/api/tl-drafts?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load TL draft history");
  }
  return response.json();
}

async function saveTlDraft(payload: {
  itemId: number;
  projectName?: string | null;
  ratedUserId: string;
  ratingValue: number;
  leadComment: string;
  quarter: RatingQuarter;
  year: number;
}): Promise<TlDraft> {
  const response = await fetch("/api/tl-drafts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Failed to save TL draft");
  }

  return response.json();
}

async function sendDraftsToUser(payload: {
  ratedUserId: string;
  quarter: RatingQuarter;
  year: number;
}): Promise<{ message: string; count: number }> {
  const response = await fetch("/api/tl-drafts/send-to-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Failed to send drafts to user");
  }

  return response.json();
}

async function listReferableTeamLeads(): Promise<ReferableTeamLead[]> {
  const response = await fetch("/api/ratings/referable-team-leads");
  if (!response.ok) {
    throw new Error("Failed to load Team Leads");
  }
  return response.json();
}

async function referRating(payload: { ratingId: number; referencedTlUserId: string | null }): Promise<void> {
  const response = await fetch(`/api/ratings/${payload.ratingId}/refer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ referencedTlUserId: payload.referencedTlUserId }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Failed to refer rating");
  }
}

async function submitApprovalsForUser(payload: {
  ratedUserId: string;
  teamId: number;
  quarter: RatingQuarter;
  year: number;
}): Promise<{ message: string; count: number }> {
  const response = await fetch("/api/approvals/submit-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ?? errorBody?.error ?? "Failed to submit approvals");
  }

  return response.json();
}

function NotifyDialog({ member, sender, open, onClose }: {
  member: UserProfile;
  sender: UserProfile;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [message, setMessage] = useState(
    `Hi ${member.displayName},\n\nThis is a reminder to please complete your self-ratings for this quarter in the Performance Portal at your earliest convenience.\n\nThank you,\n${sender.displayName}`
  );

  const { mutate: sendReminder, isPending } = useSendReminder();

  const handleSend = () => {
    sendReminder({ data: { userId: member.userId, customMessage: message } }, {
      onSuccess: (res) => {
        toast({ title: "Notification sent", description: (res as any).message });
        onClose();
      },
      onError: () => toast({ title: "Failed to send", variant: "destructive" })
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Notification to {member.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            To: <span className="font-medium text-foreground">{member.email}</span>
          </p>
          <div className="space-y-1">
            <Label htmlFor="notify-msg">Email Message</Label>
            <Textarea
              id="notify-msg"
              rows={7}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="resize-none font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={isPending || !message.trim()}>
            <Bell className="w-4 h-4 mr-1" />
            {isPending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberPanel({ member, quarter, year, currentUser, referableLeads, stageInfo }: {
  member: UserProfile;
  quarter: RatingQuarter;
  year: number;
  currentUser: UserProfile;
  referableLeads: ReferableTeamLead[];
  stageInfo?: MemberStageInfo;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [tlVals, setTlVals] = useState<Record<string, string>>({});
  const [leadComments, setLeadComments] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<TlDraft[]>([]);
  const [isSavingAllDrafts, setIsSavingAllDrafts] = useState(false);
  const [sharedDraftsOpen, setSharedDraftsOpen] = useState(false);
  const [lastShownDraftNoticeKey, setLastShownDraftNoticeKey] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDrafts, setHistoryDrafts] = useState<TlDraft[]>([]);
  const [historyLabel, setHistoryLabel] = useState<string>("");
  const [referDialogOpen, setReferDialogOpen] = useState(false);
  const [referRatingContext, setReferRatingContext] = useState<Rating | null>(null);
  const [selectedReferLeadId, setSelectedReferLeadId] = useState<string>("");
  const [isReferring, setIsReferring] = useState(false);
  const [isSubmittingForUser, setIsSubmittingForUser] = useState(false);
  const [isSendingToUser, setIsSendingToUser] = useState(false);
  const [disputeViewOpen, setDisputeViewOpen] = useState(false);
  const [selectedDisputeDraft, setSelectedDisputeDraft] = useState<TlDraft | null>(null);
  const [isFixingDispute, setIsFixingDispute] = useState(false);

  const { data: ratings } = useListRatings(
    { userId: member.userId, quarter, year },
    { query: { enabled: open } }
  );
  const { data: approvals } = useListApprovals(
    { ratedUserId: member.userId, quarter, year },
    { query: { enabled: open } }
  );

  // Always fetch User-targeted KPI items — the members being reviewed are always Users
  const itemParams = currentUser?.teamId
    ? { teamId: currentUser.teamId, targetRole: "User" as const, level: member.level }
    : { targetRole: "User" as const, level: member.level };
  const { data: items } = useListItems(itemParams, {
    query: {
      queryKey: getListItemsQueryKey(itemParams),
      enabled: open,
    },
  });

  const approvalByItem = useMemo(
    () => new Map((approvals ?? []).map(a => [getRatingRowKey(a.itemId, (a as any).projectName), a])),
    [approvals],
  );
  const activeDraftByItem = useMemo(
    () => new Map((drafts ?? []).filter((draft) => draft.isActive).map((draft) => [getRatingRowKey(draft.itemId, draft.projectName), draft])),
    [drafts],
  );
  const otherLeadActiveDrafts = useMemo(
    () => (drafts ?? []).filter((draft) => draft.isActive && draft.teamLeadUserId !== currentUser.userId),
    [drafts, currentUser.userId],
  );
  const periodKey = `${member.userId}-${quarter}-${year}`;
  const leadNameById = useMemo(
    () => new Map(referableLeads.map((lead) => [lead.userId, lead.displayName])),
    [referableLeads],
  );

  useEffect(() => {
    setTlVals({});
    setLeadComments({});
    setDrafts([]);
    setLastShownDraftNoticeKey(null);
  }, [periodKey]);

  useEffect(() => {
    let cancelled = false;

    if (!open) {
      return () => {
        cancelled = true;
      };
    }

    listTlDrafts({ ratedUserId: member.userId, quarter, year })
      .then((data) => {
        if (!cancelled) {
          setDrafts(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast({ title: "Unable to load lead drafts", variant: "destructive" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, member.userId, quarter, year, toast]);

  useEffect(() => {
    if (!open || !ratings) {
      return;
    }

    setTlVals((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const rating of ratings) {
        const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
        const approvalValue = approvalByItem.get(rowKey)?.tlRatingValue;
        const draftValue = activeDraftByItem.get(rowKey)?.ratingValue;
        if ((next[rowKey] ?? "") === "") {
          if (approvalValue !== null && approvalValue !== undefined) {
            next[rowKey] = approvalValue.toString();
            changed = true;
          } else if (draftValue !== null && draftValue !== undefined) {
            next[rowKey] = draftValue.toString();
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });

    setLeadComments((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const rating of ratings) {
        const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
        const approvalComment = (approvalByItem.get(rowKey) as any)?.leadComment as string | null | undefined;
        const draftComment = activeDraftByItem.get(rowKey)?.leadComment;
        if ((next[rowKey] ?? "") === "") {
          const value = approvalComment ?? draftComment ?? "";
          if (value !== "") {
            next[rowKey] = value;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [open, ratings, approvalByItem, activeDraftByItem]);

  useEffect(() => {
    if (!open || otherLeadActiveDrafts.length === 0 || lastShownDraftNoticeKey === periodKey) {
      return;
    }

    setSharedDraftsOpen(true);
    setLastShownDraftNoticeKey(periodKey);
  }, [open, otherLeadActiveDrafts, lastShownDraftNoticeKey, periodKey]);

  const totalWeightedLeadRating = useMemo(() => {
    const getAverageLtRatingForItem = (itemId: number): number | null => {
      const itemRatings = (ratings ?? [])
        .filter(rating => rating.itemId === itemId)
        .map(rating => {
          const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
          const val = parseFloat(tlVals[rowKey] ?? "");
          return val;
        })
        .filter(val => Number.isFinite(val) && val >= 0.1 && val <= 5.0);

      if (itemRatings.length === 0) return null;
      return itemRatings.reduce((sum, val) => sum + val, 0) / itemRatings.length;
    };

    return (items ?? []).reduce((total, item) => {
      const itemWeight = Number(item.weight ?? 0);
      if (!Number.isFinite(itemWeight) || itemWeight <= 0) {
        return total;
      }

      const itemAverageRating = getAverageLtRatingForItem(item.itemId);
      if (itemAverageRating == null) {
        return total;
      }

      return total + itemWeight * itemAverageRating;
    }, 0);
  }, [ratings, tlVals, items]);

  const { weightedRatingBreakdown, hasAtLeastOneLeadRatedItem } = useMemo(() => {
    const getAverageLtRatingForItem = (itemId: number): number | null => {
      const itemRatings = (ratings ?? [])
        .filter(rating => rating.itemId === itemId)
        .map(rating => {
          const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
          const val = parseFloat(tlVals[rowKey] ?? "");
          return val;
        })
        .filter(val => Number.isFinite(val) && val >= 0.1 && val <= 5.0);

      if (itemRatings.length === 0) return null;
      return itemRatings.reduce((sum, val) => sum + val, 0) / itemRatings.length;
    };

    const breakdown = (items ?? [])
      .map(item => {
        const itemWeight = Number(item.weight ?? 0);
        if (!Number.isFinite(itemWeight) || itemWeight <= 0) {
          return null;
        }

        const itemAverageRating = getAverageLtRatingForItem(item.itemId);
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

    return {
      weightedRatingBreakdown: breakdown,
      hasAtLeastOneLeadRatedItem: breakdown.length > 0,
    };
  }, [ratings, tlVals, items]);

  const submittedCount = approvals?.filter(a => a.tlLgtmStatus === "Approved").length ?? 0;
  const totalCount = ratings?.length ?? 0;
  const hasPending = !open || submittedCount < totalCount || totalCount === 0;
  const alreadySubmittedForPeriod = (approvals?.length ?? 0) > 0;
  const isStage5 = stageInfo?.stage === 5 || alreadySubmittedForPeriod;

  const handleSubmitForUser = async () => {
    if (alreadySubmittedForPeriod) {
      toast({
        title: "Already submitted",
        description: `Ratings for ${member.displayName} are already submitted for ${quarter} ${year}.`,
        variant: "destructive",
      });
      return;
    }

    const memberRatings = ratings ?? [];
    if (memberRatings.length === 0) {
      toast({ title: "No self-ratings yet", description: "This member has not submitted any ratings.", variant: "destructive" });
      return;
    }

    const missingDraft = memberRatings.find((rating) => {
      const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
      const value = Number(activeDraftByItem.get(rowKey)?.ratingValue);
      return Number.isNaN(value) || value < 0.1 || value > 5.0;
    });
    if (missingDraft) {
      toast({ title: "Drafts required", description: "Save a valid draft for every row before final submit.", variant: "destructive" });
      return;
    }

    try {
      setIsSubmittingForUser(true);
      const result = await submitApprovalsForUser({
        ratedUserId: member.userId,
        teamId: currentUser.teamId!,
        quarter,
        year,
      });

      toast({
        title: `Submitted for ${member.displayName}`,
        description: result.message ?? `${result.count} row(s) processed.`,
      });
      setDrafts([]);
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ratings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ratings/member-stages"] });
    } catch (error) {
      toast({
        title: "Submission blocked",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingForUser(false);
    }
  };

  const pendingDraftRows = useMemo(() => {
    return (ratings ?? []).filter((rating) => {
      const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
      const inputRaw = tlVals[rowKey] ?? "";
      const inputNum = parseFloat(inputRaw);
      const inputHasValue = !Number.isNaN(inputNum) && inputNum >= 0.1 && inputNum <= 5.0;
      const inputComment = (leadComments[rowKey] ?? "").trim();

      const activeDraft = activeDraftByItem.get(rowKey);
      const draftNum = activeDraft?.ratingValue;
      const draftHasValue = draftNum !== null && draftNum !== undefined && Number.isFinite(Number(draftNum));
      const draftComment = (activeDraft?.leadComment ?? "").trim();

      if (!inputHasValue) {
        return false;
      }

      if (!draftHasValue) {
        return true;
      }

      const ratingChanged = Math.abs(inputNum - Number(draftNum)) > 0.000001;
      const commentChanged = inputComment !== draftComment;
      return ratingChanged || commentChanged;
    });
  }, [ratings, tlVals, leadComments, activeDraftByItem]);

  const sendableDraftCount = useMemo(
    () => (drafts ?? []).filter((draft) => draft.isActive && draft.status === "saved").length,
    [drafts],
  );

  const handleSaveAllDrafts = async () => {
    if (pendingDraftRows.length === 0) {
      toast({ title: "No changes to save", description: "Add or edit at least one rating row before saving." });
      return;
    }

    for (const rating of pendingDraftRows) {
      const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
      const leadRating = parseFloat(tlVals[rowKey] ?? "");
      if (Number.isNaN(leadRating) || leadRating < 0.1 || leadRating > 5.0) {
        toast({ title: "Invalid lead rating", description: "Enter a valid rating (0.1–5.0) for all changed rows before saving.", variant: "destructive" });
        return;
      }

      const userRating = typeof rating.ratingValue === "number"
        ? rating.ratingValue
        : parseFloat(String(rating.ratingValue ?? ""));
      if (!Number.isNaN(userRating) && leadRating !== userRating && !(leadComments[rowKey] ?? "").trim()) {
        toast({
          title: "Lead comment required",
          description: "Lead comment is mandatory when lead rating differs from user rating.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      setIsSavingAllDrafts(true);
      let savedCount = 0;

      for (const rating of pendingDraftRows) {
        const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
        const value = parseFloat(tlVals[rowKey] ?? "");
        await saveTlDraft({
          itemId: rating.itemId,
          projectName: rating.projectName,
          ratedUserId: member.userId,
          ratingValue: value,
          leadComment: leadComments[rowKey] ?? "",
          quarter,
          year,
        });
        savedCount += 1;
      }

      const refreshedDrafts = await listTlDrafts({ ratedUserId: member.userId, quarter, year });
      setDrafts(refreshedDrafts);
      toast({ title: "Drafts saved", description: `${savedCount} row(s) saved for ${member.displayName}.` });
    } catch (error) {
      toast({
        title: "Unable to save drafts",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAllDrafts(false);
    }
  };

  const handleSendToUser = async () => {
    try {
      setIsSendingToUser(true);
      const result = await sendDraftsToUser({
        ratedUserId: member.userId,
        quarter,
        year,
      });

      const refreshedDrafts = await listTlDrafts({ ratedUserId: member.userId, quarter, year });
      setDrafts(refreshedDrafts);
      toast({ title: "Sent to user", description: result.message ?? `Sent ${result.count} draft(s).` });
    } catch (error) {
      toast({
        title: "Unable to send to user",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSendingToUser(false);
    }
  };

  const handleViewHistory = async (rating: Rating) => {
    const label = `${rating.itemName ?? "Item"} — ${rating.projectName || rating.itemName || "No project name"}`;
    try {
      setHistoryLabel(label);
      setHistoryLoading(true);
      setHistoryOpen(true);
      const data = await listTlDraftHistory({
        ratedUserId: member.userId,
        quarter,
        year,
        itemId: rating.itemId,
        projectName: rating.projectName,
      });
      setHistoryDrafts(data);
    } catch (error) {
      toast({
        title: "Unable to load draft history",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setHistoryOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openDisputeView = (draft: TlDraft) => {
    setSelectedDisputeDraft(draft);
    setDisputeViewOpen(true);
  };

  const handleFixDispute = async () => {
    if (!selectedDisputeDraft?.draftId) return;
    try {
      setIsFixingDispute(true);
      const response = await fetch("/api/tl-drafts/fix-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: selectedDisputeDraft.draftId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to mark dispute as fixed");
      }
      toast({ title: "Dispute marked as fixed" });
      setDisputeViewOpen(false);
      const refreshed = await listTlDrafts({ ratedUserId: member.userId, quarter, year });
      setDrafts(refreshed);
    } catch (error) {
      toast({
        title: "Unable to fix dispute",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsFixingDispute(false);
    }
  };

  const openReferDialog = (rating: Rating) => {
    setReferRatingContext(rating);
    setSelectedReferLeadId((rating as any).referencedTlUserId ?? "");
    setReferDialogOpen(true);
  };

  const handleSaveReferral = async () => {
    if (!referRatingContext) return;

    try {
      setIsReferring(true);
      await referRating({
        ratingId: referRatingContext.ratingId,
        referencedTlUserId: selectedReferLeadId || null,
      });

      toast({
        title: selectedReferLeadId ? "Rating referred" : "Referral cleared",
        description: selectedReferLeadId
          ? "The selected Team Lead can now review this item in Referred Ratings."
          : "This item is no longer referred.",
      });

      setReferDialogOpen(false);
      setReferRatingContext(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ratings"] });
    } catch (error) {
      toast({
        title: "Unable to save referral",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsReferring(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className="w-full flex items-center justify-between p-4">
          <button
            className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
            onClick={() => setOpen(o => !o)}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              {member.displayName.charAt(0)}
            </div>
            <div>
              <p className="font-semibold">{member.displayName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm text-muted-foreground">{member.level}</p>
                {stageInfo && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageBadgeClasses(stageInfo.stage)}`}>
                    Stage {stageInfo.stage}: {stageInfo.stageLabel}
                  </span>
                )}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-2">
            {open && (
              <span className="text-sm text-muted-foreground">{submittedCount}/{totalCount} rated</span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={e => { e.stopPropagation(); setNotifyOpen(true); }}
              className="shrink-0"
              title="Send notification to this member"
            >
              <Bell className="w-4 h-4 mr-1" /> Notify
            </Button>
            <button
              className="p-1.5 hover:bg-muted rounded transition-colors"
              onClick={() => setOpen(o => !o)}
            >
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border/30 p-4 space-y-4 bg-secondary/10">
            {totalCount === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">
                This member has not submitted any ratings yet.
              </p>
            ) : (
              <>
                <Card className="p-4 bg-secondary/30 border-border/60">
                  <p className="text-sm text-muted-foreground">Total Weighted Lead Rating</p>
                  <p className="text-2xl font-semibold mt-1">
                    {hasAtLeastOneLeadRatedItem ? totalWeightedLeadRating.toFixed(2) : "0.00"}
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

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Project Name</TableHead>
                      <TableHead>User Rating</TableHead>
                      <TableHead>KPI Achieved</TableHead>
                      <TableHead>Artifacts Link</TableHead>
                      <TableHead>Lead Rating</TableHead>
                      <TableHead>Lead Comment</TableHead>
                      {!isStage5 && <TableHead>Refer</TableHead>}
                      <TableHead>Draft</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ratings ?? []).map((rating) => {
                      const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
                      const activeDraft = activeDraftByItem.get(rowKey);
                      const rawVal = tlVals[rowKey] ?? "";
                      const numVal = parseFloat(rawVal);
                      const label = !isNaN(numVal) && numVal > 0 ? ratingLabel(numVal) : null;
                      const kpiText = rating.kpiAchieved || rating.comment || "—";
                      const userRatingNum = typeof rating.ratingValue === "number" ? rating.ratingValue : parseFloat(String(rating.ratingValue ?? ""));
                      const isLeadRatingDifferent = !isNaN(numVal) && numVal > 0 && !isNaN(userRatingNum) && numVal !== userRatingNum;
                      return (
                        <TableRow key={rating.ratingId}>
                          <TableCell>{rating.itemName || "—"}</TableCell>
                          <TableCell>{rating.projectName || rating.itemName || "—"}</TableCell>
                          <TableCell className="font-medium">{rating.ratingValue?.toFixed(1)}</TableCell>
                          <TableCell className="max-w-[260px] whitespace-pre-wrap">{kpiText}</TableCell>
                          <TableCell>
                            {rating.artifactLinks ? (
                              <a
                                href={rating.artifactLinks}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline"
                              >
                                Open
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {isStage5 ? (
                              <div className="border rounded-md px-3 py-2 text-sm min-h-[38px] bg-muted/20">
                                {(approvalByItem.get(rowKey)?.tlRatingValue ?? null) != null
                                  ? Number(approvalByItem.get(rowKey)?.tlRatingValue).toFixed(1)
                                  : "—"}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  min="0.1"
                                  max="5.0"
                                  step="0.1"
                                  placeholder="0.1–5.0"
                                  value={rawVal}
                                  onChange={(e) => setTlVals((prev) => ({ ...prev, [rowKey]: e.target.value }))}
                                  className="w-28"
                                />
                                {label && <p className="text-xs text-muted-foreground">{label}</p>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {isStage5 ? (
                              <div className="border rounded-md px-3 py-2 text-sm min-h-[72px] whitespace-pre-wrap bg-muted/20">
                                {(approvalByItem.get(rowKey) as any)?.leadComment?.trim() || "—"}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-xs font-medium">
                                  Lead comment
                                  {isLeadRatingDifferent && (
                                    <span className="text-red-500 ml-0.5">*</span>
                                  )}
                                </p>
                                <Textarea
                                  value={leadComments[rowKey] ?? ""}
                                  onChange={(e) =>
                                    setLeadComments((prev) => ({ ...prev, [rowKey]: e.target.value }))
                                  }
                                  placeholder={isLeadRatingDifferent ? "Required when rating differs" : "Lead comment"}
                                  className={`min-h-[72px]${isLeadRatingDifferent && !(leadComments[rowKey] ?? "").trim() ? " border-red-500 focus-visible:ring-red-500" : ""}`}
                                />
                              </div>
                            )}
                          </TableCell>
                          {!isStage5 && (
                            <TableCell>
                              <div className="space-y-2 min-w-[170px]">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => openReferDialog(rating)}
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  Refer
                                </Button>
                                {(rating as any).referencedTlUserId && (
                                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                    Referred to: {leadNameById.get((rating as any).referencedTlUserId) ?? (rating as any).referencedTlUserId}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="space-y-2 min-w-[160px]">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => handleViewHistory(rating)}
                                >
                                  <History className="w-3.5 h-3.5" />
                                  History
                                </Button>
                                {(activeDraft?.status === "dispute raised" || activeDraft?.status === "dispute fixed") && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={activeDraft.status === "dispute fixed"
                                      ? "gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-900/40 dark:hover:bg-emerald-900/20"
                                      : "gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-900/40 dark:hover:bg-rose-900/20"}
                                    onClick={() => openDisputeView(activeDraft)}
                                  >
                                    {activeDraft.status === "dispute fixed" ? "Dispute Fixed" : "Dispute Raised"}
                                  </Button>
                                )}
                              </div>
                              {!isStage5 && activeDraft && (
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                  Active: {activeDraft.teamLeadDisplayName ?? activeDraft.teamLeadUserId}
                                  {activeDraft.teamLeadUserId === currentUser.userId ? " (you)" : ""}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {!isStage5 && (
                  <div className="flex justify-end">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={handleSaveAllDrafts}
                        disabled={isSavingAllDrafts || pendingDraftRows.length === 0}
                      >
                        {isSavingAllDrafts ? "Saving..." : `Save all changes (${pendingDraftRows.length})`}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleSendToUser}
                        disabled={isSendingToUser || sendableDraftCount === 0}
                      >
                        {isSendingToUser ? "Sending..." : `Send to ${member.displayName}`}
                      </Button>
                      <Button
                        onClick={handleSubmitForUser}
                        disabled={alreadySubmittedForPeriod || isSubmittingForUser ||
                          drafts.some((d) => d.isActive && d.status === "dispute raised") ||
                          (ratings ?? []).some((rating) => {
                            const rowKey = getRatingRowKey(rating.itemId, rating.projectName);
                            const value = Number(activeDraftByItem.get(rowKey)?.ratingValue);
                            return Number.isNaN(value) || value < 0.1 || value > 5.0;
                          })}
                        title={drafts.some((d) => d.isActive && d.status === "dispute raised")
                          ? "Resolve all disputes before submitting"
                          : undefined}
                      >
                        {isSubmittingForUser ? "Submitting..." : `Submit for ${member.displayName}`}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <NotifyDialog
        member={member}
        sender={currentUser}
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
      />

      <Dialog open={sharedDraftsOpen} onOpenChange={setSharedDraftsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Existing active drafts found</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {otherLeadActiveDrafts.map((draft) => (
              <Card key={draft.draftId} className="p-4 space-y-2">
                <div>
                  <p className="font-medium">{draft.itemName || "KPI Item"} — {draft.projectName || "No project name"}</p>
                  <p className="text-sm text-muted-foreground">Lead: {draft.teamLeadDisplayName ?? draft.teamLeadUserId}</p>
                </div>
                <p className="text-sm"><span className="font-medium">Rating:</span> {draft.ratingValue != null ? draft.ratingValue.toFixed(2) : "—"}</p>
                <p className="text-sm whitespace-pre-wrap"><span className="font-medium">Comment:</span> {draft.leadComment || "—"}</p>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setSharedDraftsOpen(false)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Draft history</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-sm font-medium">{member.displayName}</p>
            <p className="text-sm text-muted-foreground">{historyLabel}</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-3">
            {historyLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading history...</div>
            ) : historyDrafts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No draft history found.</div>
            ) : (
              historyDrafts.map((draft) => (
                <Card key={draft.draftId} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{draft.teamLeadDisplayName ?? draft.teamLeadUserId}</p>
                      <p className="text-xs text-muted-foreground">
                        {draft.updatedOn ? new Date(draft.updatedOn).toLocaleString() : "Unknown time"}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${draft.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-secondary text-secondary-foreground"}`}>
                      {draft.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="font-medium">Rating:</span> {draft.ratingValue != null ? draft.ratingValue.toFixed(2) : "—"}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    <span className="font-medium">Comment:</span> {draft.leadComment || "—"}
                  </p>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disputeViewOpen} onOpenChange={setDisputeViewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDisputeDraft?.status === "dispute fixed" ? "Dispute Fixed" : "Dispute Raised"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedDisputeDraft?.itemName || "KPI Item"} — {selectedDisputeDraft?.projectName || "No project name"}
            </p>
            <div className="rounded-md border p-3 bg-muted/20">
              <p className="text-sm font-medium mb-1">User Concern</p>
              <p className="text-sm whitespace-pre-wrap">
                {selectedDisputeDraft?.userDisputeMessage?.trim() || "No concern message provided."}
              </p>
            </div>
            {selectedDisputeDraft?.status === "dispute fixed" && (
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                ✓ This dispute has been marked as fixed.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDisputeViewOpen(false)}>Close</Button>
            {selectedDisputeDraft?.status === "dispute raised" && (
              <Button
                onClick={handleFixDispute}
                disabled={isFixingDispute}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isFixingDispute ? "Saving..." : "Dispute Fixed"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={referDialogOpen} onOpenChange={setReferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refer this rating to another Team Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {referRatingContext?.itemName || "Item"} — {referRatingContext?.projectName || "No project name"}
            </p>
            <div className="space-y-1">
              <Label>Select Team Lead</Label>
              <Select value={selectedReferLeadId} onValueChange={setSelectedReferLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose Team Lead" />
                </SelectTrigger>
                <SelectContent>
                  {referableLeads.map((lead) => (
                    <SelectItem key={lead.userId} value={lead.userId}>
                      {lead.displayName} · {lead.teamName || "No team"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReferDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => setSelectedReferLeadId("")} disabled={isReferring}>
              Clear
            </Button>
            <Button onClick={handleSaveReferral} disabled={isReferring}>
              {isReferring ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ApproveRatings() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const [quarter, setQuarter] = useState<RatingQuarter>(RatingQuarter.Q1);
  const [year, setYear] = useState<number>(currentYear);
  const [referableLeads, setReferableLeads] = useState<ReferableTeamLead[]>([]);
  const [memberStages, setMemberStages] = useState<MemberStageInfo[]>([]);

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
    if (!isLoading && user && user.role === "User") setLocation("/dashboard");
  }, [isLoading, token, user, setLocation]);

  useEffect(() => {
    let cancelled = false;

    if (!token || !user || user.role === "User") {
      setReferableLeads([]);
      return () => {
        cancelled = true;
      };
    }

    listReferableTeamLeads()
      .then((data) => {
        if (!cancelled) {
          setReferableLeads(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReferableLeads([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  useEffect(() => {
    let cancelled = false;

    if (!user?.teamId || user.role === "User") {
      setMemberStages([]);
      return () => {
        cancelled = true;
      };
    }

    listMemberStages({ teamId: user.teamId, quarter, year })
      .then((data) => {
        if (!cancelled) {
          setMemberStages(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMemberStages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.teamId, user?.role, quarter, year]);

  const { data: members } = useListUsers(
    user?.teamId ? { teamId: user.teamId } : undefined,
    { query: { enabled: !!user?.teamId } }
  );

  const { data: disputes } = useListDisputes(
    user?.teamId ? { teamId: user.teamId } : undefined,
    { query: { enabled: !!user?.teamId } }
  );

  const { mutate: resolveDispute, isPending: isResolving } = useResolveDispute();

  const handleResolve = (approvalId: number, resolution: "Approved" | "Rejected") => {
    resolveDispute({ approvalId, data: { resolution, comment: "Resolved by reviewer" } }, {
      onSuccess: () => {
        toast({ title: `Dispute ${resolution}` });
        queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      }
    });
  };

  const teamMembers = members?.filter(m => m.userId !== user?.userId && m.role === "User") ?? [];
  const stageByUserId = new Map(memberStages.map((entry) => [entry.userId, entry]));

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <CheckSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Approve Ratings</h1>
              <p className="text-muted-foreground text-sm">Review and rate your team members' self-evaluations</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={quarter} onValueChange={(v) => setQuarter(v as RatingQuarter)}>
              <SelectTrigger className="w-[110px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Q1","Q2","Q3","Q4"] as const).map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger className="w-[100px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {disputes && disputes.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-amber-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Active Disputes ({disputes.length})
            </h2>
            {disputes.map(d => (
              <Card key={d.approvalId} className="p-4 border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{d.ratedUserName} — {d.itemName}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Self: {d.selfRatingValue?.toFixed(1) ?? "—"} · TL: {d.tlRatingValue?.toFixed(1) ?? "—"}</p>
                    <p className="text-sm mt-1 text-foreground/80"><span className="font-medium">Dispute:</span> {d.disputeComment}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => handleResolve(d.approvalId, "Approved")} disabled={isResolving}>
                      <CheckCircle className="w-4 h-4 mr-1" /> Uphold
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => handleResolve(d.approvalId, "Rejected")} disabled={isResolving}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Team Members</h2>
          {teamMembers.length === 0 ? (
            <Card className="p-10 text-center border-dashed text-muted-foreground">No team members to review.</Card>
          ) : (
            teamMembers.map(m => (
              <MemberPanel
                key={m.userId}
                member={m}
                quarter={quarter}
                year={year}
                currentUser={user}
                referableLeads={referableLeads}
                stageInfo={stageByUserId.get(m.userId)}
              />
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
