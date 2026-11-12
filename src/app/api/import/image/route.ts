import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Chưa cấu hình OPENROUTER_API_KEY trên Vercel để nhận diện ảnh.' }, { status: 503 });
    const data = await req.formData();
    const file = data.get('file');
    if (!(file instanceof File) || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Chọn ảnh PNG/JPEG/WebP dưới 5 MB.' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const prompt = `Đọc ảnh bảng đăng ký học phần tiếng Việt. Chỉ trả JSON array (không markdown). Mỗi phần tử gồm: name (tên môn), courseCode (mã LHP), credits (số tín chỉ), dayOfWeek (0=CN, 1=T2,...6=T7), ca (số ca 1/2/3 hoặc null), room (phòng), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), firstWeek (số tuần bắt đầu), lastWeek (số tuần kết thúc). Đọc chuỗi như "Thứ 3,ca 1,tuần 1-19,D6.205". Không suy đoán giờ bắt đầu/kết thúc. Chỉ lấy dòng môn học, bỏ hàng tiêu đề và hàng hủy.`;
    const model = process.env.OPENROUTER_MODEL?.trim();
    if (!model || !model.endsWith(':free')) {
      return NextResponse.json({ error: 'Cấu hình OPENROUTER_MODEL bằng model :free hỗ trợ ảnh để tránh phát sinh phí.' }, { status: 503 });
    }
    const requestBody = {
      model,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt + ' Trả về duy nhất JSON array hợp lệ.' },
        { type: 'image_url', image_url: { url: `data:${file.type};base64,${bytes.toString('base64')}` } },
      ] }],
      temperature: 0,
      max_tokens: 3000,
    };
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      const reason = (errorBody?.error?.message || '').slice(0, 300);
      console.error('[OpenRouter OCR] upstream failure', { model, status: res.status, reason });
      const message = res.status === 401 || res.status === 403 ? 'OpenRouter từ chối API key hoặc quyền truy cập.' :
        res.status === 402 ? 'OpenRouter yêu cầu credits hoặc hạn mức key 0 USD đang chặn yêu cầu.' :
        res.status === 404 ? 'OpenRouter không tìm thấy model đã chọn. Kiểm tra OPENROUTER_MODEL.' :
        res.status === 429 ? 'OpenRouter hết hạn mức miễn phí. Thử lại sau.' :
        `OpenRouter trả lỗi HTTP ${res.status}.`;
      return NextResponse.json({ error: message }, { status: res.status === 429 ? 429 : 502 });
    }
    const result = await res.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
    const content = result.choices?.[0]?.message?.content;
    const rawText = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => p.text || '').join('') : '';
    const raw = rawText.replace(/^\\s*```(?:json)?\\s*/i, '').replace(/\\s*```\\s*$/, '').trim();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Không đọc được bảng học phần');
    const rows = parsed.slice(0, 80).map((item: Record<string, unknown>) => ({
      name: String(item.name || '').slice(0, 150),
      courseCode: String(item.courseCode || '').slice(0, 80),
      credits: Number(item.credits) || 0,
      dayOfWeek: Number(item.dayOfWeek) || 0,
      ca: Number(item.ca) || 0,
      room: String(item.room || '').slice(0, 80),
      startDate: String(item.startDate || ''),
      endDate: String(item.endDate || ''),
      firstWeek: Number(item.firstWeek) || 1,
      lastWeek: Number(item.lastWeek) || 0,
      startTime: '',
      endTime: '',
    })).filter((r: { name: string; courseCode: string }) => r.name && r.courseCode);
    return NextResponse.json({ rows });
  } catch (error) {
    return handleApiError(error, 'Không thể nhận diện thời khóa biểu từ ảnh');
  }
}
