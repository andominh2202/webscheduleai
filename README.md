# WebSchedule — Website Quản Lý Lịch Học Thông Minh

Ứng dụng web quản lý thời khóa biểu, môn học, ghi chú từng buổi học, bài tập và lịch thi dành cho sinh viên. Hỗ trợ đầy đủ tiếng Việt, chế độ Sáng/Tối, múi giờ `Asia/Ho_Chi_Minh` và PWA.

## Tính năng chính

- **Quản lý học kỳ & môn học**: Thêm/sửa/xóa nhiều học kỳ, môn học với mã học phần, giảng viên, tín chỉ, màu sắc nhận diện, nhiều buổi/tuần.
- **Lịch học lặp lại & phát hiện xung đột**:
  - Tự động sinh các buổi học hàng tuần theo khoảng ngày, hỗ trợ **tuần chẵn / tuần lẻ / hàng tuần**.
  - Tự động phát hiện và cảnh báo trùng thời gian giữa các môn học.
  - Hỗ trợ tạo **buổi học bù**, **đổi phòng/đổi giờ**, **nghỉ học** và **kéo thả** để điều chỉnh lịch trực tiếp trên lưới tuần.
- **Thời khóa biểu 3 chế độ**:
  - **Theo tuần**: Lưới Thứ Hai → Chủ nhật, khối màu theo môn, chuyển trục thời gian **Theo giờ / Theo tiết**, làm nổi bật ngày hiện tại.
  - **Theo tháng**: Calendar hiển thị buổi học, hạn bài tập và lịch thi; nhấn ngày để xem chi tiết.
  - **Theo danh sách**: Lọc theo môn học, trạng thái, sắp xếp theo thời gian.
- **Ghi chú riêng cho từng buổi học**:
  - Trình soạn thảo **Rich Text hỗ trợ Markdown** (Tiptap), tự động lưu sau 500ms.
  - Ghi chú riêng cho từng buổi, không ghi đè các buổi khác của cùng môn.
  - Kèm **Checklist công việc**, **Tài liệu & liên kết**, **Bài tập được giao**, trạng thái (*Chưa học / Đã học / Nghỉ học*), và **sao chép ghi chú sang buổi học khác**.
- **Bài tập & Lịch thi**: Phân loại mức độ ưu tiên, cảnh báo bài tập quá hạn, đếm ngược kỳ thi, hiển thị trực tiếp trên lịch tháng.
- **Dashboard tổng quan**: Thống kê số môn, buổi học tuần, lịch hôm nay, buổi học tiếp theo với đếm ngược, deadline gần nhất, ghi chú gần đây và tiến độ học tập.
- **Tính năng nâng cao**:
  - Tìm kiếm toàn cục (môn học, ghi chú, bài tập, lịch thi).
  - Nhắc lịch & thông báo deadline (kèm Web Notification).
  - Nhập/Xuất thời khóa biểu bằng **Excel (.xlsx)**, **CSV (.csv)**, **iCalendar (.ics)**.
  - Xuất lịch tuần thành **Ảnh (.png)** hoặc **In / PDF**.
  - Tích hợp **Google Calendar OAuth** (khi cấu hình biến môi trường).
  - **Sao lưu & Khôi phục** toàn bộ dữ liệu dạng JSON.
  - Hỗ trợ cài đặt ứng dụng **PWA**.

## Công nghệ sử dụng

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Radix UI / shadcn-style, Lucide Icons, FullCalendar, Tiptap, React Hook Form + Zod.
- **Backend & Database**: Next.js API Routes, Prisma ORM, SQLite (mặc định local, dễ chuyển sang PostgreSQL), NextAuth v5 (Auth.js).

## Hướng dẫn cài đặt và chạy dự án

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình biến môi trường

Dự án đã có sẵn file `.env` mặc định dùng SQLite (`file:./dev.db`). Nếu muốn dùng PostgreSQL hoặc bật Google OAuth, chỉnh sửa file `.env`:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Tùy chọn: Bật Google Calendar OAuth
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

### 3. Khởi tạo cơ sở dữ liệu và dữ liệu mẫu

```bash
npm run db:push
npm run db:seed
```

Tài khoản mẫu sau khi seed:
- **Email**: `student@webschedule.vn`
- **Mật khẩu**: `123456`

*(Hoặc nhập bất kỳ email/mật khẩu mới nào ở trang đăng nhập, hệ thống sẽ tự tạo tài khoản mới.)*

### 4. Chạy ứng dụng

Chế độ phát triển:
```bash
npm run dev
```

Build và chạy production:
```bash
npm run build
npm run start
```

Mở trình duyệt tại `http://localhost:3000`.

### 5. Kiểm thử logic lịch học

```bash
npx tsx scripts/verify-logic.ts
```

