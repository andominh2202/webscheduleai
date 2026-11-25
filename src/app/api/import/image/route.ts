import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import {
  isValidDateRange,
  isValidTimeRange,
  normalizeTime24,
  parseDateToIso,
} from '@/lib/date-time-validation';
import { parseOcrDay } from '@/lib/schedule-import';

export const runtime = 'nodejs';

type OcrMode = 'schedule' | 'exam';
type ExamType = 'quiz' | 'midterm' | 'final' | 'other';

const SCHEDULE_PROMPT = `Đọc ảnh bảng thời khóa biểu hoặc bảng danh sách đăng ký học phần tiếng Việt. Chỉ trả JSON array (không markdown). Mỗi phần tử gồm:
- name: tên môn học / tên lớp học phần
- courseCode: mã học phần / mã lớp học phần (nếu không có thì để rỗng "")
- credits: số tín chỉ (số nguyên, mặc định 0)
- dayText: chép nguyên văn thứ học như "Thứ 2", "Thứ 3", "Thứ 7", "Chủ nhật"; KHÔNG đổi thành số; nếu bảng không có cột thứ học thì để ""
- ca: số ca 1/2/3/4 hoặc null nếu không có
- startTime: giờ bắt đầu dạng HH:mm (24h) nếu ảnh ghi rõ giờ, ngược lại để ""
- endTime: giờ kết thúc dạng HH:mm (24h) nếu ảnh ghi rõ giờ, ngược lại để ""
- room: phòng học nếu có, ngược lại để ""
- startDate: chép nguyên văn DD/MM/YYYY từ cột Từ ngày / Ngày bắt đầu (nếu không có thì để "")
- endDate: chép nguyên văn DD/MM/YYYY từ cột Đến ngày / Ngày kết thúc (nếu không có thì để "")
- firstWeek: số tuần bắt đầu (mặc định 1)
- lastWeek: số tuần kết thúc (mặc định 0)
Hỗ trợ cả bảng đầy đủ có chuỗi như "Thứ 3,ca 1,tuần 1-19,D6.205" lẫn bảng danh sách đăng ký học phần chỉ có Mã lớp, Tên lớp, Ngày bắt đầu, Ngày kết thúc (không có Thứ/Ca/Phòng). Tuyệt đối không đảo ngày và tháng, không chuyển ngày sang định dạng Mỹ (ví dụ 04/01/2027 là ngày 4 tháng 1 năm 2027). Chỉ lấy dòng môn học, bỏ hàng tiêu đề và hàng hủy.`;

const EXAM_PROMPT = `Đọc ảnh bảng lịch thi tiếng Việt. Chỉ trả JSON array (không markdown). Mỗi phần tử gồm:
- courseName: tên môn học / tên học phần
- courseCode: mã học phần / mã môn (nếu không có để "")
- title: tên kỳ thi ngắn gọn (ví dụ "Thi cuối kỳ", "Thi giữa kỳ", "Kiểm tra quá trình")
- type: một trong "quiz" | "midterm" | "final" | "other" (cuối kỳ/kết thúc học phần -> "final", giữa kỳ -> "midterm", kiểm tra -> "quiz", khác -> "other")
- date: chép nguyên văn ngày thi DD/MM/YYYY (tuyệt đối không đảo ngày và tháng, không chuyển sang định dạng Mỹ)
- startTime: giờ bắt đầu thi dạng HH:mm (24h) nếu có, ngược lại để ""
- endTime: giờ kết thúc thi dạng HH:mm (24h) nếu có, ngược lại để ""
- room: phòng thi (ví dụ "A2.301", "Hội trường A") hoặc ""
- location: địa điểm / cơ sở thi nếu có, ngược lại để ""
- notes: ghi chú quan trọng như hình thức thi, số báo danh, ca thi, ghi chú khác (hoặc "")
Chỉ lấy các dòng lịch thi thực tế, bỏ hàng tiêu đề và dòng ghi chú chung.`;

function normalizeExamType(rawType: unknown, title: string, notes: string): ExamType {
  const t = String(rawType ?? '').trim().toLowerCase();
  if (t === 'quiz' || t === 'midterm' || t === 'final' || t === 'other') return t;
  const combined = `${title} ${notes}`.toLowerCase();
  if (combined.includes('giữa kỳ') || combined.includes('giua ky') || combined.includes('midterm')) {
    return 'midterm';
  }
  if (combined.includes('kiểm tra') || combined.includes('kiem tra') || combined.includes('quiz')) {
    return 'quiz';
  }
  if (combined.includes('cuối kỳ') || combined.includes('cuoi ky') || combined.includes('kết thúc') || combined.includes('final')) {
    return 'final';
  }
  return 'final';
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chưa cấu hình OPENROUTER_API_KEY trên Vercel để nhận diện ảnh.' },
        { status: 503 }
      );
    }

    const data = await req.formData();
    const file = data.get('file');
    const rawMode = String(data.get('mode') || 'schedule').trim().toLowerCase();
    const mode: OcrMode = rawMode === 'exam' ? 'exam' : 'schedule';

    if (!(file instanceof File) || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Chọn ảnh PNG/JPEG/WebP dưới 5 MB.' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const prompt = mode === 'exam' ? EXAM_PROMPT : SCHEDULE_PROMPT;
    const model = process.env.OPENROUTER_MODEL?.trim();
    if (!model || !model.endsWith(':free')) {
      return NextResponse.json(
        { error: 'Cấu hình OPENROUTER_MODEL bằng model :free hỗ trợ ảnh để tránh phát sinh phí.' },
        { status: 503 }
      );
    }

    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt + ' Không giải thích, không suy luận thành lời. Xuất ngay JSON array ngắn gọn hợp lệ.',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${file.type};base64,${bytes.toString('base64')}` },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 8000,
      reasoning: { effort: 'none' },
    };

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errorBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const reason = (errorBody?.error?.message || '').slice(0, 300);
      console.error('[OpenRouter OCR] upstream failure', { model, mode, status: res.status, reason });
      const message =
        res.status === 401 || res.status === 403
          ? 'OpenRouter từ chối API key hoặc quyền truy cập.'
          : res.status === 402
            ? 'OpenRouter yêu cầu credits hoặc hạn mức key 0 USD đang chặn yêu cầu.'
            : res.status === 404
              ? 'OpenRouter không tìm thấy model đã chọn. Kiểm tra OPENROUTER_MODEL.'
              : res.status === 429
                ? 'OpenRouter hết hạn mức miễn phí. Thử lại sau.'
                : `OpenRouter trả lỗi HTTP ${res.status}.`;
      return NextResponse.json({ error: message }, { status: res.status === 429 ? 429 : 502 });
    }

    const result = (await res.json()) as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    const choice = result.choices?.[0];
    const content = choice?.message?.content;
    const rawText =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((p) => p.text || '').join('')
          : '';
    const raw = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    if (!raw) {
      console.error('[OpenRouter OCR] empty completion', {
        model,
        mode,
        finishReason: choice?.finish_reason,
        upstreamError: result.error?.message,
      });
      return NextResponse.json(
        {
          error:
            choice?.finish_reason === 'length'
              ? 'Model đã hết token trước khi xuất kết quả OCR. Thử lại hoặc đổi model vision không suy luận.'
              : 'Model không trả nội dung nhận diện. Thử model vision khác hoặc ảnh rõ hơn.',
        },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      try {
        if (start < 0 || end <= start) throw new Error('No JSON array');
        parsed = JSON.parse(raw.slice(start, end + 1));
      } catch {
        console.error('[OpenRouter OCR] invalid completion JSON', {
          model,
          mode,
          finishReason: choice?.finish_reason,
          length: raw.length,
          preview: raw.slice(0, 120),
        });
        return NextResponse.json(
          {
            error:
              choice?.finish_reason === 'length'
                ? 'Model trả dữ liệu quá dài và bị cắt. Hãy thử ảnh ít dòng hơn.'
                : 'Model trả kết quả không đúng định dạng JSON. Hãy thử lại hoặc đổi model vision.',
          },
          { status: 502 }
        );
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error(mode === 'exam' ? 'Không đọc được bảng lịch thi' : 'Không đọc được bảng học phần');
    }

    if (mode === 'exam') {
      const rows = parsed
        .slice(0, 80)
        .map((item: Record<string, unknown>) => {
          const courseName = String(item.courseName || item.name || '').trim().slice(0, 150);
          const courseCode = String(item.courseCode || '').trim().slice(0, 80);
          const notes = String(item.notes || '').trim().slice(0, 300);
          const rawTitle = String(item.title || '').trim().slice(0, 150);
          const title = rawTitle || (courseName ? `Thi ${courseName}` : '');
          const type = normalizeExamType(item.type, title, notes);
          const date = parseDateToIso(item.date) || '';
          const startTime = normalizeTime24(item.startTime) || '';
          let endTime = normalizeTime24(item.endTime) || '';
          if (startTime && endTime && !isValidTimeRange(startTime, endTime)) {
            endTime = '';
          }
          const room = String(item.room || '').trim().slice(0, 80);
          const location = String(item.location || '').trim().slice(0, 120);

          return {
            courseName,
            courseCode,
            title,
            type,
            date,
            startTime,
            endTime,
            room,
            location,
            notes,
          };
        })
        .filter((row) => row.courseName || row.title);

      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Không tìm thấy lịch thi nào trong ảnh. Hãy thử ảnh rõ hơn hoặc cắt sát vùng bảng.' },
          { status: 422 }
        );
      }

      return NextResponse.json({ rows });
    }

    // mode === 'schedule'
    const rows = parsed
      .slice(0, 80)
      .map((item: Record<string, unknown>) => {
        const name = String(item.name || '').trim().slice(0, 150);
        const courseCode = String(item.courseCode || '').trim().slice(0, 80);
        const dayOfWeek = parseOcrDay(item.dayText) ?? -1;
        const ca = Number(item.ca) || 0;
        const startDate = parseDateToIso(item.startDate) || '';
        const endDate = parseDateToIso(item.endDate) || '';
        const startTime = normalizeTime24(item.startTime) || '';
        let endTime = normalizeTime24(item.endTime) || '';
        if (startTime && endTime && !isValidTimeRange(startTime, endTime)) {
          endTime = '';
        }

        return {
          name,
          courseCode,
          credits: Number(item.credits) || 0,
          dayOfWeek,
          ca,
          room: String(item.room || '').trim().slice(0, 80),
          startDate,
          endDate,
          firstWeek: Number(item.firstWeek) || 1,
          lastWeek: Number(item.lastWeek) || 0,
          startTime,
          endTime,
          needsSchedule: dayOfWeek < 0 || (!ca && (!startTime || !endTime)),
        };
      })
      .filter((r) => r.name || r.courseCode);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy học phần nào trong ảnh. Hãy thử ảnh rõ hơn hoặc cắt sát vùng bảng.' },
        { status: 422 }
      );
    }

    if (rows.some((row) => row.startDate && row.endDate && !isValidDateRange(row.startDate, row.endDate))) {
      return NextResponse.json(
        { error: 'OCR đọc khoảng ngày không hợp lệ (ngày bắt đầu sau ngày kết thúc). Kiểm tra lại định dạng dd/MM/yyyy trong ảnh.' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      rows,
      hasMissingSchedule: rows.some((row) => row.needsSchedule),
    });
  } catch (error) {
    return handleApiError(error, 'Không thể nhận diện dữ liệu từ ảnh');
  }
}
