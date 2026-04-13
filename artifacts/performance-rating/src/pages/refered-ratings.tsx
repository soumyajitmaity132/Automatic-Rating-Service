import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, ClipboardCheck, Save, Send, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface ReferredRatingRow {
  ratingId: number;
  itemId: number;
  itemName: string | null;
  projectName: string | null;
  userRating: number;
  kpiAchieved: string | null;
  artifactLinks: string | null;
  quarter: string;
  year: number;
  ratedUserId: string;
  ratedUserName: string;
  ratedUserLevel: string;
  ratedUserTeamName: string | null;
  referredByLead: string;
}

interface TlDraft {
  draftId: number;
  ratingValue?: number | null;
  itemId: number;
  itemName?: string | null;
  projectName?: string | null;
  ratedUserId: string;
  teamLeadUserId: string;
  leadComment?: string | null;
  quarter?: string | null;
  year?: number | null;
  isActive: boolean;
}

type RowStatus = "pending" | "draft" | "sent";

interface RowFormState {
  referredLeadRating: string;
  referredLeadComment: string;
}

interface DraftHistoryEntry {
  draftId: number;
  ratingValue?: number | null;
  leadComment?: string | null;
  isActive: boolean;
  updatedOn?: string | null;
  teamLeadDisplayName?: string | null;
  teamLeadUserId: string;
}

function getRowKey(row: ReferredRatingRow): string {
  return `${row.ratedUserId}-${row.ratingId}`;
}

function parseArtifactLinks(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toExternalLink(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function listReferredRatings(params: { quarter: string; year: number }): Promise<ReferredRatingRow[]> {
  const searchParams = new URLSearchParams({
    quarter: params.quarter,
    year: params.year.toString(),
  });
  const response = await fetch(`/api/ratings/referred?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load referred ratings");
  }
  return response.json();
}

async function listTlDrafts(params: { ratedUserId: string; quarter: string; year: number }): Promise<TlDraft[]> {
  const searchParams = new URLSearchParams({
    ratedUserId: params.ratedUserId,
    quarter: params.quarter,
    year: params.year.toString(),
  });
  const response = await fetch(`/api/tl-drafts?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to load drafts");
  }
  return response.json();
}

async function saveTlDraft(payload: {
  itemId: number;
  projectName?: string | null;
  ratedUserId: string;
  ratingValue: number;
  leadComment: string;
  quarter: string;
  year: number;
}): Promise<void> {
  const response = await fetch("/api/tl-drafts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Failed to save draft");
  }
}

async function listTlDraftHistory(params: {
  ratedUserId: string;
  quarter: string;
  year: number;
  itemId: number;
  projectName?: string | null;
}): Promise<DraftHistoryEntry[]> {
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
    throw new Error("Failed to load draft history");
  }
  return response.json();
}

async function sendBackToOriginalTeamLead(ratingId: number): Promise<void> {
  const response = await fetch(`/api/ratings/${ratingId}/refer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ referencedTlUserId: null }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Failed to send back to original Team Lead");
  }
}

function StatusBadge({ status }: { status: RowStatus }) {
  const map = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    draft: "bg-secondary text-muted-foreground",
    sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

function MemberAccordion({
  memberName,
  level,
  teamName,
  referredByLead,
  rows,
  rowState,
  rowStatus,
  onRowChange,
  onSaveDraft,
  onSendToOriginalTl,
  onViewHistory,
}: {
  memberName: string;
  level: string;
  teamName: string;
  referredByLead: string;
  rows: ReferredRatingRow[];
  rowState: Record<string, RowFormState>;
  rowStatus: Record<string, RowStatus>;
  onRowChange: (key: string, patch: Partial<RowFormState>) => void;
  onSaveDraft: (row: ReferredRatingRow) => void;
  onSendToOriginalTl: (row: ReferredRatingRow) => void;
  onViewHistory: (row: ReferredRatingRow) => void;
}) {
  const [open, setOpen] = useState(true);

  const submittedCount = rows.filter((row) => rowStatus[getRowKey(row)] === "sent").length;

  return (
    <Card className="overflow-visible border border-border/50 rounded-xl shadow-sm">
      <div className="w-full flex flex-wrap items-center justify-between gap-3 p-4">
        <button
          className="flex items-center gap-3 flex-1 text-left min-w-0 hover:opacity-80 transition-opacity"
          onClick={() => setOpen((prev) => !prev)}
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base shrink-0">
            {memberName.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold truncate">{memberName}</p>
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full shrink-0">{teamName}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {level} · Referred by <span className="font-medium text-foreground">{referredByLead}</span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {open && (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {submittedCount}/{rows.length} submitted
            </span>
          )}
          <button
            className="p-1.5 hover:bg-muted rounded transition-colors"
            onClick={() => setOpen((prev) => !prev)}
          >
            {open
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/30 p-4 space-y-4 bg-secondary/10">
          <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Total Weighted Referral Rating</p>
              <p className="text-xs text-muted-foreground mt-0.5">Calculated from submitted referral rows</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-primary">0.00</span>
              <span className="text-sm text-muted-foreground"> / 5.00</span>
            </div>
          </Card>

          <div className="overflow-x-scroll rounded-xl border border-border/50 bg-card" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/30">
                  {[
                    "Employee Name", "Team", "Referring Lead",
                    "Item Name", "Project Name", "User Rating",
                    "KPI Achieved", "Artifacts Link",
                    "Referred Lead Rating", "Referred Lead Comment",
                    "Status", "Actions",
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap text-xs"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {rows.map((row, rowIdx) => {
                  const key = getRowKey(row);
                  const form = rowState[key] ?? { referredLeadRating: "", referredLeadComment: "" };
                  const status = rowStatus[key] ?? "pending";
                  const isSubmitted = status === "sent";
                  const artifactLinks = parseArtifactLinks(row.artifactLinks);
                  const parsedReferredLeadRating = parseFloat(form.referredLeadRating);
                  const isReferredLeadRatingDifferent =
                    !Number.isNaN(parsedReferredLeadRating) &&
                    Math.abs(parsedReferredLeadRating - row.userRating) > 0.000001;

                  return (
                    <tr key={row.ratingId} className="hover:bg-secondary/20 transition-colors align-top">
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {rowIdx === 0 ? memberName : ""}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {rowIdx === 0 ? (
                          <span className="text-xs bg-secondary px-2 py-0.5 rounded-full font-medium">{teamName}</span>
                        ) : ""}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {rowIdx === 0 ? referredByLead : ""}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {row.itemName || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold text-muted-foreground">⌞ {row.projectName || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-base font-bold text-primary">{row.userRating.toFixed(1)}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px] whitespace-pre-wrap text-xs text-muted-foreground">
                        {row.kpiAchieved || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {artifactLinks.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {artifactLinks.map((link, index) => (
                              <a
                                key={`${row.ratingId}-${link}-${index}`}
                                href={toExternalLink(link)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary text-xs underline underline-offset-2 hover:opacity-70 transition-opacity"
                              >
                                Link {index + 1}
                              </a>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1 min-w-[100px]">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide sr-only">
                            Referred Lead Rating
                          </Label>
                          <Input
                            type="number"
                            min="0.1"
                            max="5.0"
                            step="0.1"
                            placeholder="0.1–5.0"
                            disabled={isSubmitted}
                            value={form.referredLeadRating}
                            onChange={(event) =>
                              onRowChange(key, { referredLeadRating: event.target.value })
                            }
                            className="w-24 text-center font-semibold h-9"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1 min-w-[200px]">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Referred Lead Comment
                            {isReferredLeadRatingDifferent && (
                              <span className="text-destructive ml-0.5">*</span>
                            )}
                          </Label>
                          <Textarea
                            placeholder="Add referral comment..."
                            disabled={isSubmitted}
                            value={form.referredLeadComment}
                            onChange={(event) =>
                              onRowChange(key, { referredLeadComment: event.target.value })
                            }
                            rows={2}
                            className="resize-none text-xs w-full"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isSubmitted ? (
                          <span className="text-xs text-emerald-600 font-medium">✓ Done</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2.5 text-xs gap-1"
                              onClick={() => onViewHistory(row)}
                            >
                              <History className="w-3.5 h-3.5" />
                              History
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs gap-1"
                              onClick={() => onSaveDraft(row)}
                            >
                              <Save className="w-3.5 h-3.5" />
                              Draft
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 px-2.5 text-xs gap-1"
                              onClick={() => onSendToOriginalTl(row)}
                            >
                              <Send className="w-3.5 h-3.5" />
                              Send Back
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ReferedRatings() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const [quarter, setQuarter] = useState("Q1");
  const [year, setYear] = useState(currentYear);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rows, setRows] = useState<ReferredRatingRow[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowFormState>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<DraftHistoryEntry[]>([]);
  const [historyLabel, setHistoryLabel] = useState("");

  const handleRowChange = (key: string, patch: Partial<RowFormState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { referredLeadRating: "", referredLeadComment: "" }), ...patch } }));
  };

  useEffect(() => {
    let cancelled = false;

    if (!user || isLoading) {
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      try {
        setLoadingRows(true);
        const referredRows = await listReferredRatings({ quarter, year });
        if (cancelled) return;

        setRows(referredRows);

        const ratedUsers = Array.from(new Set(referredRows.map((row) => row.ratedUserId)));
        const draftResponses = await Promise.all(
          ratedUsers.map((ratedUserId) => listTlDrafts({ ratedUserId, quarter, year }))
        );
        if (cancelled) return;

        const draftMap = new Map<string, TlDraft>();
        for (const draftList of draftResponses) {
          for (const draft of draftList) {
            if (!draft.isActive || draft.teamLeadUserId !== user.userId) {
              continue;
            }
            const match = referredRows.find((row) =>
              row.ratedUserId === draft.ratedUserId &&
              row.itemId === draft.itemId &&
              (row.projectName ?? "") === (draft.projectName ?? "")
            );
            if (match) {
              draftMap.set(getRowKey(match), draft);
            }
          }
        }

        const nextRowState: Record<string, RowFormState> = {};
        const nextStatus: Record<string, RowStatus> = {};
        for (const row of referredRows) {
          const key = getRowKey(row);
          const draft = draftMap.get(key);
          nextRowState[key] = {
            referredLeadRating: draft?.ratingValue != null ? draft.ratingValue.toString() : "",
            referredLeadComment: draft?.leadComment ?? "",
          };
          nextStatus[key] = draft ? "draft" : "pending";
        }

        setRowState(nextRowState);
        setRowStatus(nextStatus);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Unable to load referred ratings",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "destructive",
          });
          setRows([]);
          setRowState({});
          setRowStatus({});
        }
      } finally {
        if (!cancelled) {
          setLoadingRows(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [quarter, year, user, isLoading, toast]);

  const handleSaveDraftOnly = async (row: ReferredRatingRow): Promise<boolean> => {
    const key = getRowKey(row);
    const form = rowState[key] ?? { referredLeadRating: "", referredLeadComment: "" };
    const rating = parseFloat(form.referredLeadRating);
    const comment = form.referredLeadComment.trim();

    if (!form.referredLeadRating || Number.isNaN(rating) || rating < 0.1 || rating > 5.0) {
      toast({
        title: "Invalid Rating",
        description: "Please enter a rating between 0.1 and 5.0.",
        variant: "destructive",
      });
      return false;
    }

    if (Math.abs(rating - row.userRating) > 0.000001 && !comment) {
      toast({
        title: "Referred Lead Comment required",
        description: "Referred Lead Comment is mandatory when Referred Lead Rating differs from User Rating.",
        variant: "destructive",
      });
      return false;
    }

    try {
      await saveTlDraft({
        itemId: row.itemId,
        projectName: row.projectName,
        ratedUserId: row.ratedUserId,
        ratingValue: rating,
        leadComment: form.referredLeadComment,
        quarter,
        year,
      });

      setRowStatus((prev) => ({
        ...prev,
        [key]: "draft",
      }));

      toast({
        title: "Draft Saved",
        description: `${row.itemName || "Item"} for ${row.ratedUserName}`,
      });
      return true;
    } catch (error) {
      toast({
        title: "Unable to save",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleSendBackToOriginalTl = async (row: ReferredRatingRow) => {
    const key = getRowKey(row);

    const saved = await handleSaveDraftOnly(row);
    if (!saved) {
      return;
    }

    try {
      await sendBackToOriginalTeamLead(row.ratingId);
      setRows((prev) => prev.filter((entry) => entry.ratingId !== row.ratingId));
      setRowStatus((prev) => ({ ...prev, [key]: "sent" }));
      toast({
        title: "Sent to original Team Lead",
        description: `${row.itemName || "Item"} for ${row.ratedUserName} is now back with the original Team Lead for final submit.`,
      });
    } catch (error) {
      toast({
        title: "Unable to send back",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleViewHistory = async (row: ReferredRatingRow) => {
    try {
      setHistoryOpen(true);
      setHistoryLoading(true);
      setHistoryLabel(`${row.itemName || "Item"} — ${row.projectName || "No project name"}`);
      const data = await listTlDraftHistory({
        ratedUserId: row.ratedUserId,
        quarter,
        year,
        itemId: row.itemId,
        projectName: row.projectName,
      });
      setHistoryRows(data);
    } catch (error) {
      toast({
        title: "Unable to load history",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setHistoryOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const groupedMembers = useMemo(() => {
    const memberMap = new Map<string, {
      ratedUserId: string;
      name: string;
      level: string;
      teamName: string;
      referredByLead: string;
      rows: ReferredRatingRow[];
    }>();

    for (const row of rows) {
      const key = row.ratedUserId;
      if (!memberMap.has(key)) {
        memberMap.set(key, {
          ratedUserId: row.ratedUserId,
          name: row.ratedUserName,
          level: row.ratedUserLevel,
          teamName: row.ratedUserTeamName || "No Team",
          referredByLead: row.referredByLead || "Team Lead",
          rows: [],
        });
      }
      memberMap.get(key)!.rows.push(row);
    }

    return Array.from(memberMap.values());
  }, [rows]);

  const stats = useMemo(() => {
    const statuses = rows.map((row) => rowStatus[getRowKey(row)] ?? "pending");
    return {
      total: statuses.length,
      pending: statuses.filter((status) => status === "pending").length,
      draft: statuses.filter((status) => status === "draft").length,
      sent: statuses.filter((status) => status === "sent").length,
    };
  }, [rows, rowStatus]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-card p-5 rounded-2xl shadow-sm border border-border/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">Referral Ratings</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Ratings referred by other Team Leads for your review
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger className="w-[110px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <SelectTrigger className="w-[100px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((optionYear) => (
                  <SelectItem key={optionYear} value={optionYear.toString()}>{optionYear}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            { label: "Total Referred", value: stats.total, color: "text-foreground" },
            { label: "Pending", value: stats.pending, color: "text-amber-600" },
            { label: "Draft", value: stats.draft, color: "text-muted-foreground" },
            { label: "Sent", value: stats.sent, color: "text-emerald-600" },
          ].map((stat) => (
            <Card key={stat.label} className="flex-1 min-w-[120px] p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </Card>
          ))}
        </div>

        {loadingRows ? (
          <Card className="p-10 text-center text-muted-foreground">Loading referred ratings...</Card>
        ) : groupedMembers.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No referred ratings found for selected period.</Card>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Referred Members</h2>
            {groupedMembers.map((member) => (
              <MemberAccordion
                key={member.ratedUserId}
                memberName={member.name}
                level={member.level}
                teamName={member.teamName}
                referredByLead={member.referredByLead}
                rows={member.rows}
                rowState={rowState}
                rowStatus={rowStatus}
                onRowChange={handleRowChange}
                onSaveDraft={handleSaveDraftOnly}
                onSendToOriginalTl={handleSendBackToOriginalTl}
                onViewHistory={handleViewHistory}
              />
            ))}
          </div>
        )}

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>History</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{historyLabel}</p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-3">
              {historyLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading history...</div>
              ) : historyRows.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No history found.</div>
              ) : (
                historyRows.map((entry) => (
                  <Card key={entry.draftId} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{entry.teamLeadDisplayName ?? entry.teamLeadUserId}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.updatedOn ? new Date(entry.updatedOn).toLocaleString() : "Unknown time"}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-secondary text-secondary-foreground"}`}>
                        {entry.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm"><span className="font-medium">Rating:</span> {entry.ratingValue != null ? entry.ratingValue.toFixed(2) : "—"}</p>
                    <p className="text-sm whitespace-pre-wrap"><span className="font-medium">Comment:</span> {entry.leadComment || "—"}</p>
                  </Card>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
