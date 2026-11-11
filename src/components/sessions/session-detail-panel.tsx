'use client';

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
} from 'lucide-react';
import {
  cn,
  formatDate,
  formatShortDate,
  parseGradingBreakdown,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { AssignmentFormDialog } from '@/components/assignments/assignment-form-dialog';
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
    label: 'Chưa học',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200',
  },
  {
    value: 'completed',
    label: 'Đã học',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200',
  },
  {
    value: 'cancelled',
    label: 'Nghỉ học',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200',
  },
] as const;

const SESSION_TYPE_LABELS: Record<string, string> = {
  regular: 'Lịch cố định',
  makeup: 'Học bù',
  moved: 'Đổi lịch',
};

function normalizeExternalUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

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

  // Editable text fields + auto-save state
  const [content, setContent] = React.useState('');
  const [personalNote, setPersonalNote] = React.useState('');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  // Checklist form
  const [newChecklistText, setNewChecklistText] = React.useState('');
  const [addingChecklist, setAddingChecklist] = React.useState(false);

  // Resource form
  const [showResourceForm, setShowResourceForm] = React.useState(false);
  const [resourceTitle, setResourceTitle] = React.useState('');
  const [resourceUrl, setResourceUrl] = React.useState('');
  const [resourceType, setResourceType] = React.useState<'link' | 'file' | 'note'>('link');
  const [addingResource, setAddingResource] = React.useState(false);

  // Copy notes to another session
  const [copyPopoverOpen, setCopyPopoverOpen] = React.useState(false);
  const [courseSessions, setCourseSessions] = React.useState<SessionDetailData[]>([]);
  const [loadingCourseSessions, setLoadingCourseSessions] = React.useState(false);
  const [targetSessionId, setTargetSessionId] = React.useState('');
  const [copyingToSession, setCopyingToSession] = React.useState(false);

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

  // Refs for debounced auto-save
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = React.useRef<{ content: string; personalNote: string }>({
    content: '',
    personalNote: '',
  });
  const activeSessionIdRef = React.useRef<string | null>(null);

  const handleClose = React.useCallback(() => {
    onOpenChange?.(false);
    onClose?.();
  }, [onOpenChange, onClose]);

  const fetchSessionDetail = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) {
        throw new Error('Không thể tải thông tin buổi học');
      }
      const data: SessionDetailData = await res.json();
      if (activeSessionIdRef.current !== id) return;
      setSession(data);
      const initialContent = data.content || '';
      const initialNote = data.personalNote || '';
      setContent(initialContent);
      setPersonalNote(initialNote);
      lastSavedRef.current = { content: initialContent, personalNote: initialNote };
      setMetaDate(new Date(data.date).toISOString().slice(0, 10));
      setMetaStartTime(data.startTime || '');
      setMetaEndTime(data.endTime || '');
      setMetaRoom(data.room || '');
      setMetaLocation(data.location || '');
      setEditingMeta(false);
      setSaveState('idle');
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
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (isOpen && sessionId) {
      activeSessionIdRef.current = sessionId;
      setShowResourceForm(false);
      setCopyPopoverOpen(false);
      setTargetSessionId('');
      fetchSessionDetail(sessionId);
    } else {
      activeSessionIdRef.current = null;
      setSession(null);
    }

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [isOpen, sessionId, fetchSessionDetail]);

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
        setSession((prev) =>
          prev && prev.id === id
            ? { ...prev, content: nextContent, personalNote: nextNote }
            : prev
        );
        setSaveState('saved');
        notifyUpdated();
      } catch {
        setSaveState('error');
        toast.error('Lỗi tự động lưu ghi chú');
      }
    },
    [notifyUpdated]
  );

  // Debounced auto-save (500ms)
  React.useEffect(() => {
    if (!session || !sessionId || loading) return;
    if (
      content === lastSavedRef.current.content &&
      personalNote === lastSavedRef.current.personalNote
    ) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    const currentId = sessionId;
    saveTimerRef.current = setTimeout(() => {
      persistNotes(currentId, content, personalNote);
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [content, personalNote, session, sessionId, loading, persistNotes]);

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
      toast.success(`Đã chuyển trạng thái thành "${label}"`);
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

  const stripHtml = (html: string) =>
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || savingMeta) return;
    setSavingMeta(true);
    try {
      const dateChanged = metaDate !== new Date(session.date).toISOString().slice(0, 10);
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
        toast.warning(
          `Đã lưu, nhưng có trùng giờ với "${data.conflicts[0].course?.name || 'môn khác'}"`
        );
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

  const handleCopyToClipboard = async () => {
    if (!session) return;
    const parts: string[] = [];
    if (session.course?.name) {
      parts.push(`${session.course.name} (${formatShortDate(session.date)} ${session.startTime}-${session.endTime})`);
    }
    const plainContent = stripHtml(content);
    const plainNote = stripHtml(personalNote);
    if (plainContent) {
      parts.push(`Nội dung buổi học:\n${plainContent}`);
    }
    if (plainNote) {
      parts.push(`Ghi chú cá nhân:\n${plainNote}`);
    }
    if (parts.length <= 1 && !plainContent && !plainNote) {
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
    if (nextOpen && session?.courseId) {
      setLoadingCourseSessions(true);
      try {
        const res = await fetch(`/api/sessions?courseId=${session.courseId}`);
        if (res.ok) {
          const data: SessionDetailData[] = await res.json();
          const others = (Array.isArray(data) ? data : []).filter(
            (s) => s.id !== session.id
          );
          setCourseSessions(others);
        }
      } catch {
        // ignore
      } finally {
        setLoadingCourseSessions(false);
      }
    }
  };

  const handleCopyToOtherSession = async () => {
    if (!session || !targetSessionId || copyingToSession) return;
    setCopyingToSession(true);
    try {
      if (
        content !== lastSavedRef.current.content ||
        personalNote !== lastSavedRef.current.personalNote
      ) {
        await persistNotes(session.id, content, personalNote);
      }
      const res = await fetch(`/api/sessions/${session.id}/copy-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSessionId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Đã sao chép ghi chú sang buổi học đã chọn');
      setCopyPopoverOpen(false);
      setTargetSessionId('');
      notifyUpdated();
    } catch {
      toast.error('Không thể sao chép ghi chú sang buổi học khác');
    } finally {
      setCopyingToSession(false);
    }
  };

  const statusInfo =
    STATUS_OPTIONS.find((s) => s.value === session?.status) || STATUS_OPTIONS[0];
  const checklistDoneCount =
    session?.checklist?.filter((item) => item.completed).length || 0;
  const checklistTotalCount = session?.checklist?.length || 0;

  const panelBody = (
    <div className="flex h-full flex-col bg-background">
      {/* Top Header */}
      <div className="border-b px-5 py-4">
        {loading ? (
          <div className="space-y-3 animate-pulse pr-8">
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-4 w-1/3 rounded bg-muted" />
          </div>
        ) : error ? (
          <div className="pr-8">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : session ? (
          <div className="pr-8 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="h-3.5 w-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: session.course?.color || '#3b82f6' }}
              />
              <h2
                className="text-lg font-semibold leading-tight"
                style={{ color: session.course?.color || undefined }}
              >
                {session.course?.name || 'Buổi học'}
              </h2>
              {session.course?.courseCode && (
                <Badge variant="secondary" className="text-xs">
                  {session.course.courseCode}
                </Badge>
              )}
              {session.type && session.type !== 'regular' && (
                <Badge variant="outline" className="text-xs">
                  {SESSION_TYPE_LABELS[session.type] || session.type}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(session.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {session.startTime} - {session.endTime}
              </span>
              {(session.room || session.location) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {[session.room, session.location].filter(Boolean).join(' • ')}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => setEditingMeta((v) => !v)}
              >
                <Pencil className="h-3 w-3" />
                {editingMeta ? 'Đóng' : 'Đổi phòng / giờ'}
              </Button>
            </div>

            {editingMeta && (
              <form
                onSubmit={handleSaveMeta}
                className="rounded-lg border bg-muted/40 p-3 space-y-2.5 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Ngày học</Label>
                    <Input
                      type="date"
                      value={metaDate}
                      onChange={(e) => setMetaDate(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Bắt đầu</Label>
                    <Input
                      type="time"
                      value={metaStartTime}
                      onChange={(e) => setMetaStartTime(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Kết thúc</Label>
                    <Input
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
                    <Label className="text-[11px]">Phòng học mới</Label>
                    <Input
                      value={metaRoom}
                      onChange={(e) => setMetaRoom(e.target.value)}
                      placeholder="VD: B1-305"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Địa điểm / Cơ sở</Label>
                    <Input
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Badge variant="outline" className={cn('font-medium', statusInfo.badgeClass)}>
                {statusInfo.label}
              </Badge>

              <div className="flex items-center gap-2">
                {saveState === 'saving' && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Đang lưu...
                  </span>
                )}
                {saveState === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    Đã lưu
                  </span>
                )}
                {saveState === 'error' && (
                  <span className="text-xs text-destructive">Lưu thất bại</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="pr-8">
            <h2 className="text-lg font-semibold">Chi tiết buổi học</h2>
          </div>
        )}

        {!embedded && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="absolute right-4 top-4 h-8 w-8"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          </div>
        ) : error ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            {sessionId && (
              <Button variant="outline" size="sm" onClick={() => fetchSessionDetail(sessionId)}>
                Thử lại
              </Button>
            )}
          </div>
        ) : !session ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Chưa có dữ liệu buổi học
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Status Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trạng thái buổi học
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const active = session.status === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      size="sm"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange(opt.value)}
                      className={cn(
                        'w-full',
                        active && opt.value === 'completed' && 'bg-emerald-600 hover:bg-emerald-700',
                        active && opt.value === 'cancelled' && 'bg-rose-600 hover:bg-rose-700'
                      )}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {session.course &&
              (session.course.examFormat ||
                session.course.hasMajorAssignment ||
                session.course.examNotes ||
                session.course.gradingBreakdown) && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">Đánh giá môn:</span>
                    {session.course.examFormat && (
                      <Badge variant="secondary" className="text-[11px]">
                        Thi: {session.course.examFormat}
                      </Badge>
                    )}
                    <Badge
                      variant={session.course.hasMajorAssignment ? 'default' : 'outline'}
                      className="text-[11px]"
                    >
                      {session.course.hasMajorAssignment ? 'Có Bài tập lớn' : 'Không có BTL'}
                    </Badge>
                  </div>
                  {session.course.hasMajorAssignment && session.course.majorAssignmentNote && (
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">BTL:</strong> {session.course.majorAssignmentNote}
                    </p>
                  )}
                  {session.course.examNotes && (
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Cách thi:</strong> {session.course.examNotes}
                    </p>
                  )}
                  {(() => {
                    const grades = parseGradingBreakdown(session.course.gradingBreakdown);
                    if (grades.length === 0) return null;
                    return (
                      <p className="text-muted-foreground">
                        <strong className="text-foreground">Chia điểm:</strong>{' '}
                        {grades.map((g) => `${g.weight}% ${g.label}`).join(' • ')}
                      </p>
                    );
                  })()}
                </div>
              )}

            <Separator />

            {/* Notes Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ghi chép buổi học (tự động lưu)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyToClipboard}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Sao chép ghi chú
                </Button>

                <Popover open={copyPopoverOpen} onOpenChange={handleOpenCopyPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Chuyển sang buổi khác
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Sao chép sang buổi học khác</p>
                      <p className="text-xs text-muted-foreground">
                        Gửi nội dung và ghi chú của buổi này sang một buổi học cùng môn.
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
                                {formatShortDate(s.date)} ({s.startTime} - {s.endTime})
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

            {/* Content Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 font-medium">
                <FileText className="h-4 w-4 text-primary" />
                Nội dung buổi học
              </Label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Ghi lại bài giảng, kiến thức trọng tâm... (hỗ trợ Markdown)"
                minHeight="130px"
              />
            </div>

            {/* Personal Notes Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 font-medium">
                <StickyNote className="h-4 w-4 text-amber-500" />
                Ghi chú cá nhân
              </Label>
              <RichTextEditor
                value={personalNote}
                onChange={setPersonalNote}
                placeholder="Câu hỏi cần hỏi giảng viên, nhắc nhở ôn tập..."
                minHeight="95px"
              />
            </div>

            <Separator />

            {/* Checklist Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                  Checklist việc cần làm
                </h3>
                {checklistTotalCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {checklistDoneCount}/{checklistTotalCount} hoàn thành
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {(session.checklist || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">
                    Chưa có mục checklist nào
                  </p>
                ) : (
                  (session.checklist || []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 rounded-md border px-3 py-2 bg-card"
                    >
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={() => handleToggleChecklist(item)}
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
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteChecklist(item.id)}
                        aria-label="Xóa mục"
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
                  placeholder="Thêm việc cần làm (vd: Đọc trước chương 3)..."
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
            </div>

            <Separator />

            {/* Resources Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Link2 className="h-4 w-4 text-blue-600" />
                  Tài liệu & Liên kết
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowResourceForm((v) => !v)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm tài liệu
                </Button>
              </div>

              {showResourceForm && (
                <form
                  onSubmit={handleAddResource}
                  className="space-y-2.5 rounded-lg border p-3 bg-muted/40"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <Input
                        value={resourceTitle}
                        onChange={(e) => setResourceTitle(e.target.value)}
                        placeholder="Tên tài liệu / Slide bài giảng"
                        className="h-8 text-sm"
                        required
                      />
                    </div>
                    <Select
                      value={resourceType}
                      onValueChange={(v) => setResourceType(v as 'link' | 'file' | 'note')}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                    placeholder="Đường dẫn URL (tùy chọn, vd: https://...)"
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

              <div className="space-y-2">
                {(session.resources || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">
                    Chưa có tài liệu đính kèm nào
                  </p>
                ) : (
                  (session.resources || []).map((resItem) => {
                    const safeUrl = normalizeExternalUrl(resItem.url);
                    return (
                      <div
                        key={resItem.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 bg-card"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {resItem.type === 'file'
                              ? 'Tệp'
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
                              <p className="text-xs text-muted-foreground truncate">
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
                          onClick={() => handleDeleteResource(resItem.id)}
                          aria-label="Xóa tài liệu"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Separator />

            {/* Assignments Section */}
            <div className="space-y-3 pb-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4 text-orange-500" />
                  Bài tập gắn với buổi học
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setAssignmentDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm bài tập
                </Button>
              </div>

              {(session.assignments || []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">
                  Chưa có bài tập nào gắn với buổi học này
                </p>
              ) : (
                <div className="space-y-2">
                  {(session.assignments || []).map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-start gap-2.5 rounded-md border p-3 bg-card"
                    >
                      <Checkbox
                        checked={assignment.completed}
                        onCheckedChange={() => handleToggleAssignment(assignment)}
                        className="mt-0.5"
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
                          Hạn nộp: {formatShortDate(assignment.dueDate)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ScrollArea>
      {session?.course && (
        <AssignmentFormDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          courses={[session.course]}
          defaultCourseId={session.courseId}
          defaultSessionId={session.id}
          onSaved={() => {
            fetchSessionDetail(session.id);
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
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200"
        >
          <DialogPrimitive.Title className="sr-only">
            Chi tiết buổi học
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Xem và chỉnh sửa nội dung, ghi chú, checklist và tài liệu buổi học
          </DialogPrimitive.Description>
          {panelBody}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default SessionDetailPanel;
