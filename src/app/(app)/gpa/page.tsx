'use client';

import * as React from 'react';
import {
  Award,
  BookOpen,
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  GraduationCap,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DEGREE_TARGETS,
  GPA_STORAGE_KEY,
  GRADE_SCALE,
  calculateGpaMetrics,
  canImproveGrade,
  getDegreeClassification,
  getGradeInfo,
  mergeImportedGpaSemesters,
  mergeWebScheduleCourses,
  type GpaSemester,
  type GpaSemesterMode,
  type GpaSubject,
  type WebScheduleCourseInput,
  type WebScheduleSemesterInput,
} from '@/lib/gpa';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

function createEmptySemester(index: number): GpaSemester {
  return {
    id: `sem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    semesterName: `Học kỳ ${index + 1}`,
    mode: 'subject',
    summaryCredits: '',
    summaryGPA: '',
    subjects: [],
  };
}

function createEmptySubject(): GpaSubject {
  return {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    credits: 2,
    grade10: '',
    improvedGrade10: null,
    isImproving: false,
  };
}

function getGradeBadgeClass(letter: string): string {
  if (letter === 'A+' || letter === 'A') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (letter === 'B+' || letter === 'B') {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  }
  if (letter === 'C+' || letter === 'C') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
}

export default function GpaPage() {
  const [semesters, setSemesters] = React.useState<GpaSemester[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [targetCPA, setTargetCPA] = React.useState<number>(3.2);
  const [showGradeScale, setShowGradeScale] = React.useState(false);
  const [importingWebSchedule, setImportingWebSchedule] = React.useState(false);
  const [confirmDeleteSemId, setConfirmDeleteSemId] = React.useState<string | number | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(GPA_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSemesters(mergeImportedGpaSemesters(parsed));
        }
      }
    } catch {
      // Ignore malformed localStorage data and start clean
    } finally {
      setHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(GPA_STORAGE_KEY, JSON.stringify(semesters));
    } catch {
      // Ignore quota errors
    }
  }, [semesters, hydrated]);

  const metrics = React.useMemo(
    () => calculateGpaMetrics(semesters, targetCPA),
    [semesters, targetCPA]
  );

  const classification = React.useMemo(
    () => getDegreeClassification(metrics.currentCPA, metrics.totalCredits),
    [metrics.currentCPA, metrics.totalCredits]
  );

  const handleAddSemester = () => {
    setSemesters((prev) => [...prev, createEmptySemester(prev.length)]);
  };

  const handleRemoveSemester = (semIndex: number) => {
    setSemesters((prev) => prev.filter((_, idx) => idx !== semIndex));
    setConfirmDeleteSemId(null);
    toast.success('Đã xóa học kỳ');
  };

  const handleUpdateSemester = <K extends keyof GpaSemester>(
    semIndex: number,
    field: K,
    value: GpaSemester[K]
  ) => {
    setSemesters((prev) =>
      prev.map((sem, idx) => (idx === semIndex ? { ...sem, [field]: value } : sem))
    );
  };

  const handleChangeMode = (semIndex: number, mode: GpaSemesterMode) => {
    handleUpdateSemester(semIndex, 'mode', mode);
  };

  const handleAddSubject = (semIndex: number) => {
    setSemesters((prev) =>
      prev.map((sem, idx) =>
        idx === semIndex
          ? { ...sem, subjects: [...sem.subjects, createEmptySubject()] }
          : sem
      )
    );
  };

  const handleRemoveSubject = (semIndex: number, subIndex: number) => {
    setSemesters((prev) =>
      prev.map((sem, idx) =>
        idx === semIndex
          ? { ...sem, subjects: sem.subjects.filter((_, sIdx) => sIdx !== subIndex) }
          : sem
      )
    );
  };

  const handleUpdateSubject = <K extends keyof GpaSubject>(
    semIndex: number,
    subIndex: number,
    field: K,
    value: GpaSubject[K]
  ) => {
    setSemesters((prev) =>
      prev.map((sem, idx) => {
        if (idx !== semIndex) return sem;
        return {
          ...sem,
          subjects: sem.subjects.map((sub, sIdx) =>
            sIdx === subIndex ? { ...sub, [field]: value } : sub
          ),
        };
      })
    );
  };

  const handleToggleImprovement = (semIndex: number, subIndex: number) => {
    setSemesters((prev) =>
      prev.map((sem, idx) => {
        if (idx !== semIndex) return sem;
        return {
          ...sem,
          subjects: sem.subjects.map((sub, sIdx) => {
            if (sIdx !== subIndex) return sub;
            const nextImproving = !sub.isImproving;
            return {
              ...sub,
              isImproving: nextImproving,
              improvedGrade10: nextImproving ? sub.improvedGrade10 : null,
            };
          }),
        };
      })
    );
  };

  const handleExportJson = () => {
    try {
      const json = JSON.stringify(semesters, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'cpa_data.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('Đã xuất tệp cpa_data.json');
    } catch {
      toast.error('Không thể xuất tệp JSON');
    }
  };

  const handleImportJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = typeof e.target?.result === 'string' ? e.target.result : '';
        const parsed: unknown = JSON.parse(text);
        const normalized = mergeImportedGpaSemesters(parsed);
        setSemesters(normalized);
        toast.success(`Đã nhập thành công ${normalized.length} học kỳ từ JSON`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Không thể phân tích tệp dữ liệu JSON.';
        toast.error(message);
      }
    };
    reader.onerror = () => {
      toast.error('Không thể đọc tệp JSON.');
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleImportFromWebSchedule = async () => {
    setImportingWebSchedule(true);
    try {
      const [semRes, courseRes] = await Promise.all([
        fetch('/api/semesters'),
        fetch('/api/courses'),
      ]);

      if (!semRes.ok || !courseRes.ok) {
        throw new Error('Không thể tải dữ liệu học kỳ hoặc môn học từ WebSchedule');
      }

      const apiSemesters: WebScheduleSemesterInput[] = await semRes.json();
      const apiCourses: WebScheduleCourseInput[] = await courseRes.json();

      if (!Array.isArray(apiCourses) || apiCourses.length === 0) {
        toast.info('Chưa có môn học nào trong WebSchedule để nhập.');
        return;
      }

      const result = mergeWebScheduleCourses(
        semesters,
        Array.isArray(apiSemesters) ? apiSemesters : [],
        apiCourses
      );

      if (result.addedSemesters === 0 && result.addedSubjects === 0) {
        toast.info('Tất cả môn học từ WebSchedule đã có trong bảng GPA.');
        return;
      }

      setSemesters(result.semesters);
      toast.success(
        `Đã nhập thêm ${result.addedSubjects} môn học (${result.addedSemesters} học kỳ mới) từ WebSchedule.`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Lỗi khi nhập dữ liệu từ WebSchedule';
      toast.error(message);
    } finally {
      setImportingWebSchedule(false);
    }
  };

  const renderRequiredGpaDisplay = () => {
    switch (metrics.status) {
      case 'achieved':
        return (
          <div className="space-y-1">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metrics.unstudiedCredits > 0 ? '0.00 — Đã đạt' : 'Đã đạt mục tiêu'}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.unstudiedCredits > 0
                ? 'Bạn đã đủ điểm tích lũy để đạt mục tiêu bằng cấp này.'
                : `CPA hiện tại (${metrics.currentCPA.toFixed(2)}) đã đạt mức ≥ ${targetCPA.toFixed(1)}.`}
            </p>
          </div>
        );
      case 'impossible':
        return (
          <div className="space-y-1">
            <div className="text-2xl font-bold text-destructive">
              Bất khả thi (&gt; 4.0)
            </div>
            <p className="text-xs text-muted-foreground">
              Cần trung bình {metrics.requiredGPA?.toFixed(2)} cho {metrics.unstudiedCredits} TC còn lại. Hãy cân nhắc cải thiện điểm các môn thấp.
            </p>
          </div>
        );
      case 'need_credits':
        return (
          <div className="space-y-1">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              Cần thêm tín chỉ
            </div>
            <p className="text-xs text-muted-foreground">
              Thêm học kỳ ở chế độ &ldquo;Nhập tổng kết&rdquo; và để trống GPA để tính mục tiêu phần còn lại.
            </p>
          </div>
        );
      case 'in_progress':
        return (
          <div className="space-y-1">
            <div className="text-2xl font-bold text-primary">
              {metrics.requiredGPA?.toFixed(2)} / 4.0
            </div>
            <p className="text-xs text-muted-foreground">
              GPA trung bình cần đạt cho {metrics.unstudiedCredits} tín chỉ chưa học.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Tính GPA / CPA
              </h1>
              <p className="text-sm text-muted-foreground">
                Theo dõi điểm tích lũy hệ 10 → 4, lập kế hoạch cải thiện điểm và mục tiêu tốt nghiệp.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportJson}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportFromWebSchedule}
            disabled={importingWebSchedule}
          >
            {importingWebSchedule ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            Nhập từ WebSchedule
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Nhập JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            disabled={semesters.length === 0}
          >
            <Download className="h-4 w-4" />
            Xuất JSON
          </Button>
          <Button size="sm" onClick={handleAddSemester}>
            <Plus className="h-4 w-4" />
            Thêm học kỳ
          </Button>
        </div>
      </div>

      {/* Dashboard Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              CPA hiện tại
            </CardTitle>
            <GraduationCap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-primary">
                {metrics.currentCPA.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">/ 4.0</span>
            </div>
            <Badge variant="secondary" className="font-medium">
              {classification}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tín chỉ tích lũy
            </CardTitle>
            <Award className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="text-3xl font-bold tracking-tight">
              {metrics.totalCredits}
            </div>
            <p className="text-xs text-muted-foreground">
              Tín chỉ chưa học:{' '}
              <span className="font-semibold text-foreground">
                {metrics.unstudiedCredits}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mục tiêu loại bằng
            </CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Select
              value={String(targetCPA)}
              onValueChange={(val) => setTargetCPA(parseFloat(val))}
            >
              <SelectTrigger aria-label="Chọn mục tiêu loại bằng">
                <SelectValue placeholder="Chọn loại bằng" />
              </SelectTrigger>
              <SelectContent>
                {DEGREE_TARGETS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Mục tiêu CPA tối thiểu: ≥ {targetCPA.toFixed(1)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              GPA cần đạt còn lại
            </CardTitle>
            <Calculator className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>{renderRequiredGpaDisplay()}</CardContent>
        </Card>
      </div>

      {/* Collapsible Grade Scale Reference */}
      <Card>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowGradeScale((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowGradeScale((prev) => !prev);
            }
          }}
          className="flex cursor-pointer items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/40 sm:px-6"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="h-4 w-4 text-primary" />
            <span>Bảng quy đổi thang điểm hệ 10 → hệ 4</span>
          </div>
          {showGradeScale ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {showGradeScale && (
          <CardContent className="border-t border-border/70 pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {GRADE_SCALE.map((entry) => (
                <div
                  key={entry.letter}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm"
                >
                  <div>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-semibold',
                        getGradeBadgeClass(entry.letter)
                      )}
                    >
                      {entry.letter}
                    </span>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.min.toFixed(1)} – {entry.max.toFixed(1)}
                    </div>
                  </div>
                  <span className="font-semibold">{entry.gpa4.toFixed(1)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              * Lưu ý: Bỏ qua các môn không tính vào GPA (GDQP, GDTC, Tiếng Anh...). Điểm hệ 10 được làm tròn đến 1 chữ số thập phân trước khi quy đổi. Dữ liệu tự động lưu trên trình duyệt.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Semesters List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Danh sách học kỳ ({semesters.length})
          </h2>
          {semesters.length > 0 && (
            <p className="hidden text-xs text-muted-foreground sm:block">
              Dữ liệu tự động lưu vào bộ nhớ trình duyệt (tương thích cpa_data.json)
            </p>
          )}
        </div>

        {semesters.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="text-base font-semibold">Chưa có học kỳ nào</h3>
                <p className="text-sm text-muted-foreground">
                  Thêm học kỳ mới, nhập từ danh sách môn học WebSchedule hoặc tải lên tệp{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">cpa_data.json</code>{' '}
                  để bắt đầu tính GPA/CPA.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={handleAddSemester}>
                  <Plus className="h-4 w-4" />
                  Thêm học kỳ đầu tiên
                </Button>
                <Button
                  variant="outline"
                  onClick={handleImportFromWebSchedule}
                  disabled={importingWebSchedule}
                >
                  <BookOpen className="h-4 w-4" />
                  Nhập từ WebSchedule
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          semesters.map((sem, semIndex) => {
            const semMetric = metrics.semesterMetrics[semIndex];
            const isConfirmingDelete = confirmDeleteSemId === sem.id;

            return (
              <Card key={sem.id} className="overflow-hidden">
                <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 flex-wrap items-center gap-2.5">
                      <Input
                        value={sem.semesterName}
                        onChange={(e) =>
                          handleUpdateSemester(semIndex, 'semesterName', e.target.value)
                        }
                        placeholder="Nhập tên học kỳ..."
                        className="max-w-xs font-semibold"
                        aria-label="Tên học kỳ"
                      />
                      {semMetric && semMetric.credits > 0 && (
                        <Badge variant="secondary">
                          {semMetric.credits} TC
                          {semMetric.gpa4 !== null
                            ? ` • GPA ${semMetric.gpa4.toFixed(2)}`
                            : ''}
                        </Badge>
                      )}
                      {semMetric && semMetric.unstudiedCredits > 0 && (
                        <Badge variant="outline">
                          Chưa học: {semMetric.unstudiedCredits} TC
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                        <button
                          type="button"
                          onClick={() => handleChangeMode(semIndex, 'subject')}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                            sem.mode === 'subject'
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Nhập từng môn
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeMode(semIndex, 'summary')}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                            sem.mode === 'summary'
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Nhập tổng kết
                        </button>
                      </div>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemoveSemester(semIndex)}
                          >
                            Xác nhận xóa
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteSemId(null)}
                          >
                            Hủy
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirmDeleteSemId(sem.id)}
                          aria-label={`Xóa ${sem.semesterName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden sm:inline">Xóa kỳ</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4">
                  {sem.mode === 'summary' ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Số tín chỉ học kỳ
                          </label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="VD: 18"
                            value={sem.summaryCredits}
                            onChange={(e) =>
                              handleUpdateSemester(
                                semIndex,
                                'summaryCredits',
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            GPA hệ 4 (Để trống nếu chưa học)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={4}
                            step={0.01}
                            placeholder="VD: 3.45"
                            value={sem.summaryGPA}
                            onChange={(e) =>
                              handleUpdateSemester(semIndex, 'summaryGPA', e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <CardDescription className="text-xs">
                        Để trống GPA nếu học kỳ này chưa có điểm — số tín chỉ sẽ được tự động cộng vào phần <strong>Tín chỉ chưa học</strong> để tính GPA mục tiêu.
                      </CardDescription>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sem.subjects.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/80 py-6 text-center text-sm text-muted-foreground">
                          Chưa có môn học nào trong học kỳ này. Nhấn &ldquo;+ Thêm môn&rdquo; bên dưới.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-border/70 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <th className="pb-2.5 pr-3">Môn học</th>
                                <th className="w-24 pb-2.5 pr-3">Số TC</th>
                                <th className="w-28 pb-2.5 pr-3">Điểm hệ 10</th>
                                <th className="w-32 pb-2.5 pr-3">Hệ 4 / Chữ</th>
                                <th className="w-44 pb-2.5 text-right">Hành động</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {sem.subjects.map((sub, subIndex) => {
                                const info = getGradeInfo(sub.grade10);
                                const improveAction = canImproveGrade(info);
                                const impInfo = getGradeInfo(sub.improvedGrade10);
                                const actionLabel =
                                  improveAction === 'retake' ? 'Học lại' : 'Nâng điểm';

                                return (
                                  <React.Fragment key={sub.id}>
                                    <tr className="group">
                                      <td className="py-2.5 pr-3">
                                        <Input
                                          type="text"
                                          placeholder="Tên môn học (tùy chọn)"
                                          value={sub.name}
                                          onChange={(e) =>
                                            handleUpdateSubject(
                                              semIndex,
                                              subIndex,
                                              'name',
                                              e.target.value
                                            )
                                          }
                                          className="h-9"
                                        />
                                      </td>
                                      <td className="py-2.5 pr-3">
                                        <Input
                                          type="number"
                                          min={1}
                                          max={20}
                                          value={sub.credits}
                                          onChange={(e) =>
                                            handleUpdateSubject(
                                              semIndex,
                                              subIndex,
                                              'credits',
                                              e.target.value
                                            )
                                          }
                                          className="h-9"
                                          aria-label="Số tín chỉ"
                                        />
                                      </td>
                                      <td className="py-2.5 pr-3">
                                        <Input
                                          type="number"
                                          min={0}
                                          max={10}
                                          step={0.1}
                                          placeholder="0.0 - 10"
                                          value={sub.grade10}
                                          onChange={(e) =>
                                            handleUpdateSubject(
                                              semIndex,
                                              subIndex,
                                              'grade10',
                                              e.target.value
                                            )
                                          }
                                          className="h-9"
                                          aria-label="Điểm hệ 10"
                                        />
                                      </td>
                                      <td className="py-2.5 pr-3">
                                        {info ? (
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              'font-semibold',
                                              getGradeBadgeClass(info.letter),
                                              sub.isImproving &&
                                                impInfo &&
                                                'line-through opacity-60'
                                            )}
                                          >
                                            {info.gpa4.toFixed(1)} ({info.letter})
                                          </Badge>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {improveAction && (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant={
                                                sub.isImproving ? 'secondary' : 'outline'
                                              }
                                              onClick={() =>
                                                handleToggleImprovement(
                                                  semIndex,
                                                  subIndex
                                                )
                                              }
                                              className="h-8 px-2.5 text-xs"
                                            >
                                              <RotateCcw className="h-3.5 w-3.5" />
                                              {sub.isImproving
                                                ? `Hủy ${actionLabel.toLowerCase()}`
                                                : actionLabel}
                                            </Button>
                                          )}
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() =>
                                              handleRemoveSubject(semIndex, subIndex)
                                            }
                                            aria-label="Xóa môn học"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>

                                    {sub.isImproving && (
                                      <tr className="bg-amber-500/5">
                                        <td
                                          colSpan={2}
                                          className="py-2 pl-4 pr-3 text-right text-xs font-medium italic text-amber-700 dark:text-amber-300"
                                        >
                                          Nhập điểm sau khi cải thiện:
                                        </td>
                                        <td className="py-2 pr-3">
                                          <Input
                                            type="number"
                                            min={0}
                                            max={10}
                                            step={0.1}
                                            placeholder="Điểm mới"
                                            value={sub.improvedGrade10 ?? ''}
                                            onChange={(e) =>
                                              handleUpdateSubject(
                                                semIndex,
                                                subIndex,
                                                'improvedGrade10',
                                                e.target.value
                                              )
                                            }
                                            className="h-8 border-amber-500/40"
                                            aria-label="Điểm cải thiện hệ 10"
                                          />
                                        </td>
                                        <td className="py-2 pr-3">
                                          {impInfo ? (
                                            <Badge
                                              variant="outline"
                                              className={cn(
                                                'font-semibold',
                                                getGradeBadgeClass(impInfo.letter)
                                              )}
                                            >
                                              {impInfo.gpa4.toFixed(1)} ({impInfo.letter})
                                            </Badge>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </td>
                                        <td className="py-2 text-right text-xs text-muted-foreground">
                                          Thay thế điểm cũ trong CPA
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddSubject(semIndex)}
                        >
                          <Plus className="h-4 w-4" />
                          Thêm môn
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
