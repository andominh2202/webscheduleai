'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  CheckSquare,
  Link2,
  ClipboardList,
  Copy,
  Trash2,
  Plus,
  ExternalLink,
  FileText,
  StickyNote,
  Check,
  Loader2,
  Share2,
  Pencil,
  User,
  ChevronDown,
  ChevronUp,
  GraduationCap,
} from 'lucide-react';
import {
  cn,
  formatDate,
  formatShortDate,
  parseGradingBreakdown,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from '@/lib/utils';
import { toVnDateString } from '@/lib/timezone';
import { dedupeRequest } from '@/lib/client-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';

const RichTextEditor = dynamic(
  () => import('@/components/ui/rich-text-editor').then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-input bg-background overflow-hidden animate-pulse">
        <div className="h-9 border-b bg-muted/40" />
        <div className="h-[110px] p-3 space-y-2">
          <div className="h-3.5 w-2/5 rounded bg-muted/60" />
          <div className="h-3.5 w-3/5 rounded bg-muted/40" />
        </div>
      </div>
    ),
  }
);

const AssignmentFormDialog = dynamic(
  () =>
    import('@/components/assignments/assignment-form-dialog').then(
      (m) => m.AssignmentFormDialog
    ),
  { ssr: false }
);

export interface SessionCourse {
  id: string;
  name: string;
  courseCode: string;
  color: string;
  instructor?: string | null;
  hasMajorAssignment?: boolean;
  majorAssignmentNote?: string | null;
  examFormat?: string | null;
  examNotes?: string | null;
  gradingBreakdown?: string | null;
}

export interface SessionChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order: number;
  sessionId: string;
}

export interface SessionResourceItem {
  id: string;
  title: string;
  url?: string | null;
  type: 'link' | 'file' | 'note' | string;
  sessionId: string;
}

export interface SessionAssignmentItem {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent' | string;
  courseId: string;
  sessionId?: string | null;
}

export interface SessionDetailData {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  location?: string | null;
  status: 'upcoming' | 'completed' | 'cancelled' | string;
  type: 'regular' | 'makeup' | 'moved' | string;
  content?: string | null;
  personalNote?: string | null;
  courseId: string;
  scheduleId?: string | null;
  course?: SessionCourse;
  checklist?: SessionChecklistItem[];
  resources?: SessionResourceItem[];
  assignments?: SessionAssignmentItem[];
}

export interface SessionDetailPanelProps {
  sessionId: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  onUpdated?: () => void;
  onUpdate?: () => void;
  embedded?: boolean;
}

const STATUS_OPTIONS = [
  {
    value: 'upcoming',
    label: 'Sắp học',
    badgeClass:
      'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  },
  {
    value: 'completed',
    label: 'Đã học',
    badgeClass:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  },
  {
    value: 'cancelled',
    label: 'Nghỉ học',
    badgeClass:
      'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border-rose-200 dark:border-rose-800',
  },
] as const;

const SESSION_TYPE_LABELS: Record<string, string> = {
  regular: 'Lịch cố định',
  makeup: 'Học bù',
  moved: 'Đổi lịch',
};

/**
 * Strictly validates external HTTP/HTTPS URLs to prevent XSS via javascript: or data: URIs.
 */
function normalizeExternalUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface SessionNotesSectionProps {
  sessionId: string;
  courseId: string;
  courseName?: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  initialContent: string;
  initialPersonalNote: string;
  onPersisted: (content: string, personalNote: string) => void;
}

/**
 * Isolated memoized Notes section so typing in RichTextEditor never re-renders
 * the parent SessionDetailPanel (header, checklist, resources, assignments).
 */
const SessionNotesSection = React.memo(function SessionNotesSection({
  sessionId,
  courseId,
  courseName,
  sessionDate,
  startTime,
  endTime,
  initialContent,
  initialPersonalNote,
  onPersisted,
}: SessionNotesSectionProps) {
  const [content, setContent] = React.useState(initialContent);
  const [personalNote, setPersonalNote] = React.useState(initialPersonalNote);
  const [noteTab, setNoteTab] = React.useState<'both' | 'lecture' | 'personal'>('both');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [copyPopoverOpen, setCopyPopoverOpen] = React.useState(false);
  const [courseSessions, setCourseSessions] = React.useState<SessionDetailData[]>([]);
  const [loadingCourseSessions, setLoadingCourseSessions] = React.useState(false);
  const [targetSessionId, setTargetSessionId] = React.useState('');
  const [copyingToSession, setCopyingToSession] = React.useState(false);

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = React.useRef({
    content: initialContent,
    personalNote: initialPersonalNote,
  });
  const latestDraftRef = React.useRef({
    content: initialContent,
    personalNote: initialPersonalNote,
  });
  const onPersistedRef = React.useRef(onPersisted);

  React.useEffect(() => {
    onPersistedRef.current = onPersisted;
  }, [onPersisted]);

  // Reset local editor state when switching to a different sessionId
  React.useEffect(() => {
    setContent(initialContent);
    setPersonalNote(initialPersonalNote);
    lastSavedRef.current = {
      content: initialContent,
      personalNote: initialPersonalNote,
    };
    latestDraftRef.current = {
      content: initialContent,
      personalNote: initialPersonalNote,
    };
    setSaveState('idle');
    setCopyPopoverOpen(false);
    setTargetSessionId('');
  }, [sessionId, initialContent, initialPersonalNote]);

  React.useEffect(() => {
    latestDraftRef.current = { content, personalNote };
  }, [content, personalNote]);

  const persistNotes = React.useCallback(
    async (id: string, nextContent: string, nextNote: string) => {
      setSaveState('saving');
      try {
        const res = await fetch(`/api/sessions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: nextContent,
            personalNote: nextNote,
          }),
        });
        if (!res.ok) {
          throw new Error('Không thể lưu ghi chú');
        }
        lastSavedRef.current = { content: nextContent, personalNote: nextNote };
        setSaveState('saved');
        onPersistedRef.current(nextContent, nextNote);
      } catch {
        setSaveState('error');
        toast.error('Lỗi tự động lưu ghi chú');
      }
    },
    []
  );

  // Debounced auto-save (550ms)
  React.useEffect(() => {
    if (
      content === lastSavedRef.current.content &&
      personalNote === lastSavedRef.current.personalNote
    ) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistNotes(sessionId, content, personalNote);
    }, 550);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [content, personalNote, sessionId, persistNotes]);

  // Flush unsaved draft on unmount or session switch so quick panel closes never lose edits
  React.useEffect(() => {
    const activeId = sessionId;
    return () => {
      const draft = latestDraftRef.current;
      const saved = lastSavedRef.current;
      if (draft.content !== saved.content || draft.personalNote !== saved.personalNote) {
        void fetch(`/api/sessions/${activeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: draft.content,
            personalNote: draft.personalNote,
          }),
          keepalive: true,
        });
      }
    };
  }, [sessionId]);

  const handleCopyToClipboard = async () => {
    const parts: string[] = [];
    if (courseName) {
      parts.push(
        `${courseName} (${formatShortDate(sessionDate)} ${startTime}-${endTime})`
      );
    }
    const plainContent = stripHtml(content);
    const plainNote = stripHtml(personalNote);
    if (plainContent) {
      parts.push(`Nội dung buổi học:\n${plainContent}`);
    }
    if (plainNote) {
      parts.push(`Ghi chú cá nhân:\n${plainNote}`);
    }
    if (!plainContent && !plainNote) {
      toast.info('Chưa có nội dung ghi chú để sao chép');
      return;
    }
    try {
      await navigator.clipboard.writeText(parts.join('\n\n'));
      toast.success('Đã sao chép ghi chú vào clipboard');
    } catch {
      toast.error('Trình duyệt không cho phép sao chép');
    }
  };

  const handleOpenCopyPopover = async (nextOpen: boolean) => {
    setCopyPopoverOpen(nextOpen);
    if (nextOpen && courseId) {
      setLoadingCourseSessions(true);
      try {
        const res = await fetch(`/api/sessions?courseId=${courseId}`);
        if (res.ok) {
          const data: SessionDetailData[] = await res.json();
          const others = (Array.isArray(data) ? data : []).filter(
            (s) => s.id !== sessionId
          );
          setCourseSessions(others);
        }
      } catch {
        // Ignore transient error
      } finally {
        setLoadingCourseSessions(false);
      }
    }
  };

  const handleCopyToOtherSession = async () => {
    if (!targetSessionId || copyingToSession) return;
    setCopyingToSession(true);
    try {
      if (
        content !== lastSavedRef.current.content ||
        personalNote !== lastSavedRef.current.personalNote
      ) {
        await persistNotes(sessionId, content, personalNote);
      }
      const res = await fetch(`/api/sessions/${sessionId}/copy-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSessionId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Đã sao chép ghi chú sang buổi học đã chọn');
      setCopyPopoverOpen(false);
      setTargetSessionId('');
      onPersistedRef.current(content, personalNote);
    } catch {
      toast.error('Không thể sao chép ghi chú sang buổi học khác');
    } finally {
      setCopyingToSession(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card/60 p-3.5 sm:p-4 space-y-3.5">
      {/* Section Header + Save Status + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ghi chép buổi học
          </h3>
          {saveState === 'saving' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang lưu...
            </span>
          )}
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Đã lưu tự động
            </span>
          )}
          {saveState === 'error' && (
            <button
              type="button"
              onClick={() => void persistNotes(sessionId, content, personalNote)}
              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive hover:underline"
            >
              Lưu lỗi – Thử lại
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyToClipboard}
            className="h-7 gap-1 px-2 text-xs"
          >
            <Copy className="h-3 w-3" />
            <span>Sao chép</span>
          </Button>

          <Popover open={copyPopoverOpen} onOpenChange={handleOpenCopyPopover}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
              >
                <Share2 className="h-3 w-3" />
                <span className="hidden sm:inline">Chuyển buổi khác</span>
                <span className="sm:hidden">Gửi</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Sao chép sang buổi học khác</p>
                <p className="text-xs text-muted-foreground">
                  Gửi nội dung bài giảng và ghi chú cá nhân sang một buổi cùng môn.
                </p>
              </div>
              {loadingCourseSessions ? (
                <p className="text-xs text-muted-foreground">Đang tải danh sách buổi...</p>
              ) : courseSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Không có buổi học khác cùng môn.</p>
              ) : (
                <>
                  <Select value={targetSessionId} onValueChange={setTargetSessionId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Chọn buổi học đích" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseSessions.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {formatShortDate(s.date)} ({s.startTime} – {s.endTime})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full h-8 text-xs"
                    disabled={!targetSessionId || copyingToSession}
                    onClick={handleCopyToOtherSession}
                  >
                    {copyingToSession ? 'Đang sao chép...' : 'Xác nhận sao chép'}
                  </Button>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Compact Note Mode Switcher (helpful on small mobile screens) */}
      <div
        role="group"
        aria-label="Chọn phần ghi chú hiển thị"
        className="inline-flex sm:hidden w-full rounded-lg border bg-background p-0.5 text-xs"
      >
        {(
          [
            { id: 'both', label: 'Cả hai' },
            { id: 'lecture', label: 'Bài giảng' },
            { id: 'personal', label: 'Cá nhân' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={noteTab === tab.id}
            onClick={() => setNoteTab(tab.id)}
            className={cn(
              'flex-1 rounded-md py-1 font-medium transition-colors',
              noteTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lecture Content Editor */}
      {(noteTab === 'both' || noteTab === 'lecture') && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs sm:text-sm font-medium">
            <FileText className="h-3.5 w-3.5 text-primary" />
            Nội dung bài giảng
          </Label>
          <RichTextEditor
            value={content}
            onChange={setContent}
            ariaLabel="Nội dung bài giảng"
            placeholder="Ghi lại bài giảng, kiến thức trọng tâm... (hỗ trợ Markdown)"
            minHeight="125px"
          />
        </div>
      )}

      {/* Personal Note Editor */}
      {(noteTab === 'both' || noteTab === 'personal') && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs sm:text-sm font-medium">
            <StickyNote className="h-3.5 w-3.5 text-amber-500" />
            Ghi chú cá nhân
          </Label>
          <RichTextEditor
            value={personalNote}
            onChange={setPersonalNote}
            ariaLabel="Ghi chú cá nhân"
            placeholder="Câu hỏi cần trao đổi với giảng viên, nhắc nhở ôn tập..."
            minHeight="90px"
          />
        </div>
      )}
    </section>
  );
});

export function SessionDetailPanel({
  sessionId,
  open,
  onOpenChange,
  onClose,
  onUpdated,
  onUpdate,
  embedded = false,
}: SessionDetailPanelProps) {
  const isOpen = open !== undefined ? open : Boolean(sessionId);
  const notifyUpdated = React.useCallback(() => {
    onUpdated?.();
    onUpdate?.();
  }, [onUpdated, onUpdate]);

  const [session, setSession] = React.useState<SessionDetailData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [showCourseGrading, setShowCourseGrading] = React.useState(false);

  // Checklist form
  const [newChecklistText, setNewChecklistText] = React.useState('');
  const [addingChecklist, setAddingChecklist] = React.useState(false);

  // Resource form
  const [showResourceForm, setShowResourceForm] = React.useState(false);
  const [resourceTitle, setResourceTitle] = React.useState('');
  const [resourceUrl, setResourceUrl] = React.useState('');
  const [resourceType, setResourceType] = React.useState<'link' | 'file' | 'note'>('link');
  const [addingResource, setAddingResource] = React.useState(false);

  // Edit room/location/time inline form
  const [editingMeta, setEditingMeta] = React.useState(false);
  const [metaDate, setMetaDate] = React.useState('');
  const [metaStartTime, setMetaStartTime] = React.useState('');
  const [metaEndTime, setMetaEndTime] = React.useState('');
  const [metaRoom, setMetaRoom] = React.useState('');
  const [metaLocation, setMetaLocation] = React.useState('');
  const [savingMeta, setSavingMeta] = React.useState(false);

  // Add assignment dialog from session
  const [assignmentDialogOpen, setAssignmentDialogOpen] = React.useState(false);

  const activeSessionIdRef = React.useRef<string | null>(null);

  const handleClose = React.useCallback(() => {
    onOpenChange?.(false);
    onClose?.();
  }, [onOpenChange, onClose]);

  const fetchSessionDetail = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await dedupeRequest(`session-detail:${id}`, async () => {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) {
          throw new Error('Không thể tải thông tin buổi học');
        }
        return (await res.json()) as SessionDetailData;
      });
      if (activeSessionIdRef.current !== id) return;
      setSession(data);
      setMetaDate(toVnDateString(data.date));
      setMetaStartTime(data.startTime || '');
      setMetaEndTime(data.endTime || '');
      setMetaRoom(data.room || '');
      setMetaLocation(data.location || '');
      setEditingMeta(false);
    } catch (err) {
      if (activeSessionIdRef.current !== id) return;
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      if (activeSessionIdRef.current === id) {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    if (isOpen && sessionId) {
      activeSessionIdRef.current = sessionId;
      setShowResourceForm(false);
      void fetchSessionDetail(sessionId);
    } else {
      activeSessionIdRef.current = null;
      setSession(null);
    }
  }, [isOpen, sessionId, fetchSessionDetail]);

  const handleNotesPersisted = React.useCallback(
    (savedContent: string, savedPersonalNote: string) => {
      setSession((prev) =>
        prev
          ? { ...prev, content: savedContent, personalNote: savedPersonalNote }
          : prev
      );
      notifyUpdated();
    },
    [notifyUpdated]
  );

  const handleStatusChange = async (newStatus: 'upcoming' | 'completed' | 'cancelled') => {
    if (!session || session.status === newStatus || updatingStatus) return;
    const prevStatus = session.status;
    setUpdatingStatus(true);
    setSession((prev) => (prev ? { ...prev, status: newStatus } : prev));
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Không thể cập nhật trạng thái');
      const label = STATUS_OPTIONS.find((s) => s.value === newStatus)?.label || newStatus;
      toast.success(`Đã chuyển trạng thái sang ${label}`);
      notifyUpdated();
    } catch {
      setSession((prev) => (prev ? { ...prev, status: prevStatus } : prev));
      toast.error('Cập nhật trạng thái thất bại');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !newChecklistText.trim() || addingChecklist) return;
    setAddingChecklist(true);
    try {
      const order = session.checklist?.length || 0;
      const res = await fetch(`/api/sessions/${session.id}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newChecklistText.trim(),
          completed: false,
          order,
          sessionId: session.id,
        }),
      });
      if (!res.ok) throw new Error('Không thể thêm mục checklist');
      const created: SessionChecklistItem = await res.json();
      setSession((prev) =>
        prev
          ? { ...prev, checklist: [...(prev.checklist || []), created] }
          : prev
      );
      setNewChecklistText('');
      toast.success('Đã thêm việc cần làm');
      notifyUpdated();
    } catch {
      toast.error('Không thể thêm việc cần làm');
    } finally {
      setAddingChecklist(false);
    }
  };

  const handleToggleChecklist = async (item: SessionChecklistItem) => {
    if (!session) return;
    const nextCompleted = !item.completed;
    setSession((prev) =>
      prev
        ? {
            ...prev,
            checklist: (prev.checklist || []).map((c) =>
              c.id === item.id ? { ...c, completed: nextCompleted } : c
            ),
          }
        : prev
    );
    try {
      const res = await fetch(`/api/sessions/${session.id}/checklist/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!res.ok) throw new Error();
      notifyUpdated();
    } catch {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              checklist: (prev.checklist || []).map((c) =>
                c.id === item.id ? { ...c, completed: item.completed } : c
              ),
            }
          : prev
      );
      toast.error('Không thể cập nhật mục checklist');
    }
  };

  const handleDeleteChecklist = async (itemId: string) => {
    if (!session) return;
    const previous = session.checklist || [];
    setSession((prev) =>
      prev
        ? { ...prev, checklist: (prev.checklist || []).filter((c) => c.id !== itemId) }
        : prev
    );
    try {
      const res = await fetch(`/api/sessions/${session.id}/checklist/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success('Đã xóa mục checklist');
      notifyUpdated();
    } catch {
      setSession((prev) => (prev ? { ...prev, checklist: previous } : prev));
      toast.error('Không thể xóa mục checklist');
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !resourceTitle.trim() || addingResource) return;
    setAddingResource(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: resourceTitle.trim(),
          url: resourceUrl.trim() || undefined,
          type: resourceType,
          sessionId: session.id,
        }),
      });
      if (!res.ok) throw new Error();
      const created: SessionResourceItem = await res.json();
      setSession((prev) =>
        prev
          ? { ...prev, resources: [...(prev.resources || []), created] }
          : prev
      );
      setResourceTitle('');
      setResourceUrl('');
      setResourceType('link');
      setShowResourceForm(false);
      toast.success('Đã thêm tài liệu');
      notifyUpdated();
    } catch {
      toast.error('Không thể thêm tài liệu');
    } finally {
      setAddingResource(false);
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    if (!session) return;
    const previous = session.resources || [];
    setSession((prev) =>
      prev
        ? { ...prev, resources: (prev.resources || []).filter((r) => r.id !== resourceId) }
        : prev
    );
    try {
      const res = await fetch(`/api/sessions/${session.id}/resources/${resourceId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success('Đã xóa tài liệu');
      notifyUpdated();
    } catch {
      setSession((prev) => (prev ? { ...prev, resources: previous } : prev));
      toast.error('Không thể xóa tài liệu');
    }
  };

  const handleToggleAssignment = async (assignment: SessionAssignmentItem) => {
    if (!session) return;
    const nextCompleted = !assignment.completed;
    setSession((prev) =>
      prev
        ? {
            ...prev,
            assignments: (prev.assignments || []).map((a) =>
              a.id === assignment.id ? { ...a, completed: nextCompleted } : a
            ),
          }
        : prev
    );
    try {
      const res = await fetch(`/api/assignments/${assignment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!res.ok) throw new Error();
      toast.success(nextCompleted ? 'Đã hoàn thành bài tập' : 'Đã mở lại bài tập');
      notifyUpdated();
    } catch {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              assignments: (prev.assignments || []).map((a) =>
                a.id === assignment.id ? { ...a, completed: assignment.completed } : a
              ),
            }
          : prev
      );
      toast.error('Không thể cập nhật bài tập');
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || savingMeta) return;
    if (metaStartTime >= metaEndTime) {
      toast.error('Giờ kết thúc phải sau giờ bắt đầu');
      return;
    }
    setSavingMeta(true);
    try {
      const dateChanged = metaDate !== toVnDateString(session.date);
      const timeChanged =
        metaStartTime !== session.startTime || metaEndTime !== session.endTime;
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: metaDate,
          startTime: metaStartTime,
          endTime: metaEndTime,
          room: metaRoom.trim() || null,
          location: metaLocation.trim() || null,
          ...(dateChanged || timeChanged ? { type: 'moved' } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể cập nhật thông tin buổi học');
      }
      setSession((prev) => (prev ? { ...prev, ...data } : prev));
      setEditingMeta(false);
      if (Array.isArray(data.conflicts) && data.conflicts.length > 0) {
        const conflictName = data.conflicts[0].course?.name || 'môn khác';
        toast.warning(`Đã lưu, nhưng bị trùng giờ với ${conflictName}`);
      } else {
        toast.success('Đã cập nhật phòng / thời gian buổi học');
      }
      notifyUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setSavingMeta(false);
    }
  };

  const statusInfo =
    STATUS_OPTIONS.find((s) => s.value === session?.status) || STATUS_OPTIONS[0];
  const checklistDoneCount =
    session?.checklist?.filter((item) => item.completed).length || 0;
  const checklistTotalCount = session?.checklist?.length || 0;
  const checklistPercent =
    checklistTotalCount > 0
      ? Math.round((checklistDoneCount / checklistTotalCount) * 100)
      : 0;

  const hasGradingMetadata = Boolean(
    session?.course &&
      (session.course.examFormat ||
        session.course.hasMajorAssignment ||
        session.course.examNotes ||
        session.course.gradingBreakdown)
  );

  const courseColor = session?.course?.color || '#3b82f6';

  const panelBody = (
    <div className="flex h-full flex-col bg-background">
      {/* Top Course Color Strip */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{ backgroundColor: courseColor }}
      />

      {/* Sticky Header */}
      <div className="relative shrink-0 border-b px-4 sm:px-5 py-3.5">
        {loading ? (
          <div className="space-y-2.5 animate-pulse pr-9">
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted/80" />
          </div>
        ) : error ? (
          <div className="pr-9">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : session ? (
          <div className="pr-9 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="h-3 w-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background"
                style={{ backgroundColor: courseColor }}
              />
              <h2 className="text-base sm:text-lg font-bold leading-snug text-foreground">
                {session.course?.name || 'Buổi học'}
              </h2>
              {session.course?.courseCode && (
                <Badge variant="secondary" className="text-[11px] font-medium">
                  {session.course.courseCode}
                </Badge>
              )}
              {session.type && session.type !== 'regular' && (
                <Badge variant="outline" className="text-[11px]">
                  {SESSION_TYPE_LABELS[session.type] || session.type}
                </Badge>
              )}
              <Badge variant="outline" className={cn('text-[11px] font-medium', statusInfo.badgeClass)}>
                {statusInfo.label}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs sm:text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground/90">
                <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                {formatDate(session.date)}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {session.startTime} – {session.endTime}
              </span>
              {(session.room || session.location) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {[
                    session.room ? `P.${session.room}` : null,
                    session.location,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </span>
              )}
              {session.course?.instructor && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {session.course.instructor}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => setEditingMeta((v) => !v)}
              >
                <Pencil className="h-3 w-3" />
                {editingMeta ? 'Đóng' : 'Sửa giờ / phòng'}
              </Button>
            </div>

            {editingMeta && (
              <form
                onSubmit={handleSaveMeta}
                className="rounded-xl border bg-muted/40 p-3 space-y-2.5 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="session-meta-date" className="text-[11px]">
                      Ngày học
                    </Label>
                    <Input
                      id="session-meta-date"
                      type="date"
                      value={metaDate}
                      onChange={(e) => setMetaDate(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="session-meta-start" className="text-[11px]">
                      Bắt đầu
                    </Label>
                    <Input
                      id="session-meta-start"
                      type="time"
                      value={metaStartTime}
                      onChange={(e) => setMetaStartTime(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="session-meta-end" className="text-[11px]">
                      Kết thúc
                    </Label>
                    <Input
                      id="session-meta-end"
                      type="time"
                      value={metaEndTime}
                      onChange={(e) => setMetaEndTime(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="session-meta-room" className="text-[11px]">
                      Phòng học
                    </Label>
                    <Input
                      id="session-meta-room"
                      value={metaRoom}
                      onChange={(e) => setMetaRoom(e.target.value)}
                      placeholder="VD: B1-305"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="session-meta-location" className="text-[11px]">
                      Địa điểm / Cơ sở
                    </Label>
                    <Input
                      id="session-meta-location"
                      value={metaLocation}
                      onChange={(e) => setMetaLocation(e.target.value)}
                      placeholder="VD: Cơ sở 2"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditingMeta(false)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" size="sm" className="h-7 text-xs" disabled={savingMeta}>
                    {savingMeta ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="pr-9">
            <h2 className="text-base sm:text-lg font-semibold">Chi tiết buổi học</h2>
          </div>
        )}

        {!embedded && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="absolute right-3 top-3 h-8 w-8 rounded-full"
            aria-label="Đóng bảng chi tiết"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Main Scrollable Content */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 sm:p-5 space-y-4 animate-pulse">
            <div className="h-10 rounded-xl bg-muted/60" />
            <div className="h-48 rounded-xl bg-muted/50" />
            <div className="h-32 rounded-xl bg-muted/40" />
          </div>
        ) : error ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            {sessionId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchSessionDetail(sessionId)}
              >
                Thử lại
              </Button>
            )}
          </div>
        ) : !session ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Chọn một buổi học trên lịch để xem chi tiết và viết ghi chú.
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Quick Status Segmented Control */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trạng thái điểm danh / học tập
              </Label>
              <div
                role="group"
                aria-label="Chọn trạng thái buổi học"
                className="grid grid-cols-3 gap-1.5 rounded-xl border bg-muted/30 p-1"
              >
                {STATUS_OPTIONS.map((opt) => {
                  const isActive = session.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={isActive}
                      disabled={updatingStatus}
                      onClick={() => void handleStatusChange(opt.value)}
                      className={cn(
                        'rounded-lg py-1.5 px-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                        !isActive && 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                        isActive && opt.value === 'upcoming' && 'bg-primary text-primary-foreground shadow-sm',
                        isActive && opt.value === 'completed' && 'bg-emerald-600 text-white shadow-sm',
                        isActive && opt.value === 'cancelled' && 'bg-rose-600 text-white shadow-sm'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Collapsible Course Assessment Info */}
            {hasGradingMetadata && session.course && (
              <div className="rounded-xl border bg-muted/25 px-3.5 py-2.5 text-xs">
                <button
                  type="button"
                  aria-expanded={showCourseGrading}
                  onClick={() => setShowCourseGrading((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-left font-medium text-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 text-primary" />
                    <span>Thông tin đánh giá học phần</span>
                    {session.course.examFormat && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {session.course.examFormat}
                      </Badge>
                    )}
                  </span>
                  {showCourseGrading ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showCourseGrading && (
                  <div className="mt-2.5 space-y-1.5 border-t pt-2.5 text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={session.course.hasMajorAssignment ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {session.course.hasMajorAssignment ? 'Có Bài tập lớn' : 'Không có BTL'}
                      </Badge>
                    </div>
                    {session.course.hasMajorAssignment && session.course.majorAssignmentNote && (
                      <p>
                        <strong className="text-foreground">BTL:</strong>{' '}
                        {session.course.majorAssignmentNote}
                      </p>
                    )}
                    {session.course.examNotes && (
                      <p>
                        <strong className="text-foreground">Hình thức thi:</strong>{' '}
                        {session.course.examNotes}
                      </p>
                    )}
                    {(() => {
                      const grades = parseGradingBreakdown(session.course.gradingBreakdown);
                      if (grades.length === 0) return null;
                      return (
                        <p>
                          <strong className="text-foreground">Trọng số điểm:</strong>{' '}
                          {grades.map((g) => `${g.weight}% ${g.label}`).join(' • ')}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Isolated Rich Text Notes Section */}
            <SessionNotesSection
              sessionId={session.id}
              courseId={session.courseId}
              courseName={session.course?.name}
              sessionDate={session.date}
              startTime={session.startTime}
              endTime={session.endTime}
              initialContent={session.content || ''}
              initialPersonalNote={session.personalNote || ''}
              onPersisted={handleNotesPersisted}
            />

            {/* Checklist Progress Section */}
            <section className="rounded-xl border bg-card/60 p-3.5 sm:p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <CheckSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Checklist tiến độ
                  </h3>
                  {checklistTotalCount > 0 && (
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {checklistDoneCount}/{checklistTotalCount} ({checklistPercent}%)
                    </span>
                  )}
                </div>

                {checklistTotalCount > 0 && (
                  <div
                    role="progressbar"
                    aria-valuenow={checklistPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Tiến độ checklist buổi học"
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        checklistPercent === 100 ? 'bg-emerald-500' : 'bg-primary'
                      )}
                      style={{ width: `${checklistPercent}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                {(session.checklist || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">
                    Chưa có việc cần làm nào cho buổi học này.
                  </p>
                ) : (
                  (session.checklist || []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 transition-colors hover:bg-accent/30"
                    >
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={() => void handleToggleChecklist(item)}
                        id={`checklist-${item.id}`}
                      />
                      <label
                        htmlFor={`checklist-${item.id}`}
                        className={cn(
                          'flex-1 text-sm cursor-pointer select-none',
                          item.completed && 'line-through text-muted-foreground'
                        )}
                      >
                        {item.text}
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => void handleDeleteChecklist(item.id)}
                        aria-label={`Xóa mục ${item.text}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddChecklist} className="flex gap-2">
                <Input
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  placeholder="Thêm việc cần làm (VD: Đọc trước chương 3)..."
                  aria-label="Nội dung việc cần làm mới"
                  className="h-9 text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!newChecklistText.trim() || addingChecklist}
                  className="h-9 px-3 shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Thêm
                </Button>
              </form>
            </section>

            {/* Attached Resources Section */}
            <section className="rounded-xl border bg-card/60 p-3.5 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Tài liệu đính kèm ({session.resources?.length || 0})
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowResourceForm((v) => !v)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showResourceForm ? 'Đóng' : 'Thêm tài liệu'}
                </Button>
              </div>

              {showResourceForm && (
                <form
                  onSubmit={handleAddResource}
                  className="space-y-2.5 rounded-lg border p-3 bg-background"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <Input
                        value={resourceTitle}
                        onChange={(e) => setResourceTitle(e.target.value)}
                        placeholder="Tên tài liệu / Slide bài giảng"
                        aria-label="Tên tài liệu"
                        className="h-8 text-sm"
                        required
                      />
                    </div>
                    <Select
                      value={resourceType}
                      onValueChange={(v) => setResourceType(v as 'link' | 'file' | 'note')}
                    >
                      <SelectTrigger className="h-8 text-xs" aria-label="Loại tài liệu">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="link">Liên kết</SelectItem>
                        <SelectItem value="file">Tệp / Slide</SelectItem>
                        <SelectItem value="note">Ghi chú</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={resourceUrl}
                    onChange={(e) => setResourceUrl(e.target.value)}
                    placeholder="Đường dẫn URL (tùy chọn, https://...)"
                    aria-label="Đường dẫn URL tài liệu"
                    className="h-8 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowResourceForm(false)}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!resourceTitle.trim() || addingResource}
                    >
                      {addingResource ? 'Đang lưu...' : 'Lưu tài liệu'}
                    </Button>
                  </div>
                </form>
              )}

              <div className="space-y-1.5">
                {(session.resources || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">
                    Chưa có slide hay liên kết tài liệu đính kèm.
                  </p>
                ) : (
                  (session.resources || []).map((resItem) => {
                    const safeUrl = normalizeExternalUrl(resItem.url);
                    return (
                      <div
                        key={resItem.id}
                        className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {resItem.type === 'file'
                              ? 'Slide/Tệp'
                              : resItem.type === 'note'
                                ? 'Ghi chú'
                                : 'Link'}
                          </Badge>
                          <div className="min-w-0">
                            {safeUrl ? (
                              <a
                                href={safeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline truncate max-w-full"
                              >
                                <span className="truncate">{resItem.title}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              <p className="text-sm font-medium truncate">{resItem.title}</p>
                            )}
                            {resItem.url && (
                              <p className="text-[11px] text-muted-foreground truncate">
                                {resItem.url}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => void handleDeleteResource(resItem.id)}
                          aria-label={`Xóa tài liệu ${resItem.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Session Assignments Section */}
            <section className="rounded-xl border bg-card/60 p-3.5 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4 text-orange-500" />
                  Bài tập giao trong buổi ({session.assignments?.length || 0})
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setAssignmentDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Giao bài tập
                </Button>
              </div>

              {(session.assignments || []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">
                  Chưa có bài tập nào gắn với buổi học này.
                </p>
              ) : (
                <div className="space-y-2">
                  {(session.assignments || []).map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-start gap-2.5 rounded-lg border bg-background p-3"
                    >
                      <Checkbox
                        checked={assignment.completed}
                        onCheckedChange={() => void handleToggleAssignment(assignment)}
                        className="mt-0.5"
                        aria-label={`Đánh dấu hoàn thành ${assignment.title}`}
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={cn(
                              'text-sm font-medium',
                              assignment.completed && 'line-through text-muted-foreground'
                            )}
                          >
                            {assignment.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px]',
                              PRIORITY_COLORS[assignment.priority] || ''
                            )}
                          >
                            {PRIORITY_LABELS[assignment.priority] || assignment.priority}
                          </Badge>
                        </div>
                        {assignment.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {assignment.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Hạn nộp: <strong className="text-foreground/85">{formatShortDate(assignment.dueDate)}</strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </ScrollArea>

      {session?.course && assignmentDialogOpen && (
        <AssignmentFormDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          courses={[session.course]}
          defaultCourseId={session.courseId}
          defaultSessionId={session.id}
          onSaved={() => {
            void fetchSessionDetail(session.id);
            notifyUpdated();
          }}
        />
      )}
    </div>
  );

  if (embedded) {
    return panelBody;
  }

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
        else onOpenChange?.(true);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-xl border-l bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200">
          <DialogPrimitive.Title className="sr-only">
            Chi tiết buổi học
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Xem và chỉnh sửa nội dung, ghi chú cá nhân, checklist tiến độ, tài liệu đính kèm và bài tập của buổi học
          </DialogPrimitive.Description>
          {panelBody}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default SessionDetailPanel;
