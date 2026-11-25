import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';
import { parseImportedDate, parseImportedTime } from '@/lib/schedule-import';

export const runtime = 'nodejs';

const EXAM_TYPES = new Set(['quiz', 'midterm', 'final', 'other']);

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chưa cấu hình OPENROUTER_API_KEY để nhận diện ảnh.' },
        { status: 503 }
      );
    }

    const data = await req.formData();
    const file = data.get('file');
    if (
      !(file instanceof File) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: 'Chọn ảnh PNG/JPEG/WebP hợp lệ, dung lượng tối đa 5 MB.' },
        { status: 400 }
      );
    }

    const model = process.env.OPENROUTER_MODEL?.trim();
    if (!model || !model.endsWith(':free')) {
      return NextResponse.json(
        { error: 'Cấu hình OPENROUTER_MODEL bằng model :free hỗ trợ ảnh để tránh phát sinh phí.' },
        { status: 503 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const prompt = `Đọc ảnh lịch thi / danh sách lịch kiểm tra của trường đại học bằng tiếng Việt. Chỉ trả về JSON array hợp lệ, không markdown hay giải thích. Mỗi phần tử gồm:
- title: tên kỳ thi hoặc tên môn kèm loại kỳ thi nếu nhìn thấy
- courseName: tên môn học
- courseCode: mã môn học nếu có
- type: chỉ một trong quiz, midterm, final, other. Dùng quiz cho kiểm tra/đánh giá thường xuyên, midterm cho giữa kỳ, final cho cuối kỳ; nếu không đủ căn cứ dùng other.
- date: ngày thi, chép theo DD/MM/YYYY
- startTime và endTime: giờ HH:mm nếu ảnh có ghi
- room: phòng thi
- location: cơ sở/địa điểm
- notes: hình thức thi, số báo danh, ghi chú hoặc quy định khác
Không tự suy đoán ngày, giờ, phòng, môn hoặc mã môn. Không tự tạo dữ liệu còn thiếu; trường không đọc được để chuỗi rỗng. Tách từng dòng lịch thi thành một phần tử. Bỏ tiêu đề bảng và ghi chú chung không gắn với kỳ thi.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${file.type};base64,${bytes.toString('base64')}` } },
          ],
        }],
        temperature: 0,
        max_tokens: 6000,
        reasoning: { effort: 'none' },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      const reason = (errorBody?.error?.message || '').slice(0, 300);
      console.error('[OpenRouter exam OCR] upstream failure', {
        model,
        status: response.status,
        reason,
      });
      const message =
        response.status === 401 || response.status === 403
          ? 'OpenRouter từ chối API key hoặc quyền truy cập.'
          : response.status === 402
            ? 'OpenRouter yêu cầu credits hoặc hạn mức key 0 USD đang chặn yêu cầu.'
            : response.status === 404
              ? 'Không tìm thấy model OCR đã cấu hình.'
              : response.status === 429
                ? 'OpenRouter hết hạn mức miễn phí. Thử lại sau.'
                : `OpenRouter trả lỗi HTTP ${response.status}.`;
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }

    const result = await response.json() as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | Array<{ text?: string }> } }>;
    };
    const messageContent = result.choices?.[0]?.message?.content;
    const rawText =
      typeof messageContent === 'string'
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent.map((part) => part.text || '').join('')
          : '';
    const raw = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'Model không trả kết quả OCR. Hãy thử lại với ảnh rõ hơn.' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start < 0 || end <= start) {
        return NextResponse.json({ error: 'Kết quả OCR không đúng định dạng. Hãy thử lại.' }, { status: 502 });
      }
      try {
        parsed = JSON.parse(raw.slice(start, end + 1));
      } catch {
        return NextResponse.json({ error: 'Không thể phân tích kết quả OCR. Hãy thử ảnh rõ hơn.' }, { status: 502 });
      }
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Ảnh không chứa danh sách lịch thi có thể nhận diện.' }, { status: 422 });
    }

    const rows = parsed.slice(0, 60).map((item: Record<string, unknown>) => {
      const rawType = String(item.type || '').trim().toLowerCase();
      return {
        title: String(item.title || item.courseName || '').trim().slice(0, 150),
        courseName: String(item.courseName || '').trim().slice(0, 150),
        courseCode: String(item.courseCode || '').trim().slice(0, 80),
        type: EXAM_TYPES.has(rawType) ? rawType : 'other',
        date: parseImportedDate(item.date) || '',
        startTime: parseImportedTime(item.startTime) || '',
        endTime: parseImportedTime(item.endTime) || '',
        room: String(item.room || '').trim().slice(0, 80),
        location: String(item.location || '').trim().slice(0, 120),
        notes: String(item.notes || '').trim().slice(0, 500),
      };
    }).filter((row) => row.title || row.courseName);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy dòng lịch thi nào trong ảnh.' }, { status: 422 });
    }

    return NextResponse.json({ rows });
  } catch (error) {
    return handleApiError(error, 'Không thể nhận diện lịch thi từ ảnh');
  }
}
