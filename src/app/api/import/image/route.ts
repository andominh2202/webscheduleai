import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-helpers';
import { handleApiError } from '@/lib/route-error';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel để nhận diện ảnh.' }, { status: 503 });
    const data = await req.formData();
    const file = data.get('file');
    if (!(file instanceof File) || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Chọn ảnh PNG/JPEG/WebP dưới 5 MB.' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const prompt = `Đọc ảnh bảng đăng ký học phần tiếng Việt. Chỉ trả JSON array (không markdown). Mỗi phần tử gồm: name (tên môn), courseCode (mã LHP), credits (số tín chỉ), dayOfWeek (0=CN, 1=T2,...6=T7), ca (số ca 1/2/3 hoặc null), room (phòng), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), firstWeek (số tuần bắt đầu), lastWeek (số tuần kết thúc). Đọc chuỗi như "Thứ 3,ca 1,tuần 1-19,D6.205". Không suy đoán giờ bắt đầu/kết thúc. Chỉ lấy dòng môn học, bỏ hàng tiêu đề và hàng hủy.`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data: bytes.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 }
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return NextResponse.json({ error: 'Dịch vụ nhận diện ảnh không khả dụng. Kiểm tra Gemini API key.' }, { status: 502 });
    const result = await res.json();
    const raw = result.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
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
