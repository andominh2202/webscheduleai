import { z } from 'zod';
import {
  isValidDateRange,
  isValidTime24,
  isValidTimeRange,
  parseDateToIso,
} from '@/lib/date-time-validation';

const DATE_INVALID_MSG = 'Ngày không hợp lệ (định dạng dd/MM/yyyy hoặc yyyy-MM-dd)';
const TIME_INVALID_MSG = 'Giờ phải đúng định dạng HH:mm (00:00–23:59)';

function dateStringSchema(requiredMessage: string) {
  return z
    .string()
    .min(1, requiredMessage)
    .refine((value) => parseDateToIso(value) !== null, {
      message: DATE_INVALID_MSG,
    })
    .transform((value) => parseDateToIso(value)!);
}

function requiredTimeSchema(requiredMessage: string) {
  return z
    .string()
    .min(1, requiredMessage)
    .refine((value) => isValidTime24(value), {
      message: TIME_INVALID_MSG,
    })
    .transform((value) => value.trim());
}

const optionalTimeSchema = z
  .string()
  .optional()
  .refine((value) => value === undefined || value.trim() === '' || isValidTime24(value), {
    message: TIME_INVALID_MSG,
  })
  .transform((value) => (value === undefined ? undefined : value.trim()));

// ==================== Semester ====================
export const semesterSchema = z
  .object({
    name: z.string().min(1, 'Tên học kỳ không được trống'),
    startDate: dateStringSchema('Chọn ngày bắt đầu'),
    endDate: dateStringSchema('Chọn ngày kết thúc'),
    isActive: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (!isValidDateRange(data.startDate, data.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
        path: ['endDate'],
      });
    }
  });

export type SemesterFormData = z.infer<typeof semesterSchema>;

// ==================== Course ====================
export const courseSchema = z.object({
  name: z.string().min(1, 'Tên môn học không được trống'),
  courseCode: z.string().min(1, 'Mã học phần không được trống'),
  instructor: z.string().optional(),
  color: z.string().default('#3b82f6'),
  notes: z.string().optional(),
  credits: z.number().int().min(0).optional(),
  semesterId: z.string().min(1, 'Chọn học kỳ'),
  hasMajorAssignment: z.boolean().default(false),
  majorAssignmentNote: z.string().optional(),
  examFormat: z.string().optional(),
  examNotes: z.string().optional(),
  gradingBreakdown: z.string().optional(),
});

export type CourseFormData = z.infer<typeof courseSchema>;

// ==================== Schedule ====================
export const scheduleSchema = z
  .object({
    courseId: z.string().min(1, 'Chọn môn học'),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: requiredTimeSchema('Nhập giờ bắt đầu'),
    endTime: requiredTimeSchema('Nhập giờ kết thúc'),
    startPeriod: z.number().int().min(1).optional(),
    numPeriods: z.number().int().min(1).optional(),
    room: z.string().optional(),
    location: z.string().optional(),
    startDate: dateStringSchema('Chọn ngày bắt đầu'),
    endDate: dateStringSchema('Chọn ngày kết thúc'),
    weekType: z.enum(['all', 'even', 'odd']).default('all'),
  })
  .superRefine((data, ctx) => {
    if (!isValidTimeRange(data.startTime, data.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Giờ kết thúc phải sau giờ bắt đầu',
        path: ['endTime'],
      });
    }
    if (!isValidDateRange(data.startDate, data.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
        path: ['endDate'],
      });
    }
  });

export type ScheduleFormData = z.infer<typeof scheduleSchema>;

// ==================== Session ====================
export const sessionUpdateSchema = z
  .object({
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
    content: z.string().optional(),
    personalNote: z.string().optional(),
    room: z.string().optional(),
    location: z.string().optional(),
    startTime: optionalTimeSchema,
    endTime: optionalTimeSchema,
    type: z.enum(['regular', 'makeup', 'moved']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime && !isValidTimeRange(data.startTime, data.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Giờ kết thúc phải sau giờ bắt đầu',
        path: ['endTime'],
      });
    }
  });

export type SessionUpdateData = z.infer<typeof sessionUpdateSchema>;

// ==================== Assignment ====================
export const assignmentSchema = z.object({
  title: z.string().min(1, 'Tên bài tập không được trống'),
  description: z.string().optional(),
  dueDate: dateStringSchema('Chọn hạn nộp'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  courseId: z.string().min(1, 'Chọn môn học'),
  sessionId: z.string().optional(),
});

export type AssignmentFormData = z.infer<typeof assignmentSchema>;

// ==================== Exam ====================
export const examSchema = z
  .object({
    title: z.string().min(1, 'Tên lịch thi không được trống'),
    type: z.enum(['quiz', 'midterm', 'final', 'other']).default('midterm'),
    date: dateStringSchema('Chọn ngày thi'),
    startTime: optionalTimeSchema,
    endTime: optionalTimeSchema,
    room: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
    courseId: z.string().min(1, 'Chọn môn học'),
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime && !isValidTimeRange(data.startTime, data.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Giờ kết thúc phải sau giờ bắt đầu',
        path: ['endTime'],
      });
    }
  });

export type ExamFormData = z.infer<typeof examSchema>;

// ==================== Checklist ====================
export const checklistItemSchema = z.object({
  text: z.string().min(1, 'Nội dung không được trống'),
  completed: z.boolean().default(false),
  order: z.number().int().default(0),
  sessionId: z.string(),
});

// ==================== Resource ====================
export const resourceSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được trống'),
  url: z.string().optional(),
  type: z.enum(['link', 'file', 'note']).default('link'),
  sessionId: z.string(),
});
