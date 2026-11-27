# Báo cáo Audit UI/UX Toàn Dự Án — WebScheduleAI

> **Phạm vi:** Audit toàn bộ giao diện, kiến trúc frontend, trải nghiệm người dùng (UX), khả năng truy cập (Accessibility), và tính nhất quán hệ thống trước khi tiến hành redesign.  
> **Nguyên tắc thực hiện:** Chỉ audit, không chỉnh sửa source code.

---

## 1. Kiến trúc Frontend & Công nghệ

- **Framework:** Next.js `15.1.0` (App Router), React `19.0.0`, TypeScript `5.7.0`.
- **Styling System:** Tailwind CSS `3.4.0` + `@tailwindcss/typography`, CSS Variables HSL trong `src/app/globals.css` (`--background`, `--foreground`, `--primary`, `--card`, `--muted`, `--destructive`, `--border`, `--radius: 0.75rem`). Hỗ trợ Light/Dark mode qua `next-themes` (`darkMode: ['class']`).
- **UI Libraries:** Radix UI Primitives (kiểu shadcn/ui), `lucide-react`, `sonner` / custom `toast`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- **Thư viện chuyên biệt:**
  - Lịch: `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`, `@fullcalendar/react` (`6.1.15`).
  - Rich Text Editor: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`.
  - Date Picker: `react-day-picker` (`9.4.0`).
  - Forms & Validation: `react-hook-form`, `zod`, `@hookform/resolvers`.
  - State Management: `zustand` (`5.0.0`).
  - Mobile Wrapper: `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` (`8.6.2`).

---

## 2. Danh sách Routes, Pages, Layouts & Components

### 2.1. Routes & Pages (`src/app/`)
| Route | File | Mô tả |
|---|---|---|
| `/` | `src/app/page.tsx` | Landing Page giới thiệu WebScheduleAI |
| `/login` | `src/app/(auth)/login/page.tsx` | Đăng nhập / Đăng ký |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | Tổng quan lịch học, bài tập, lịch thi, tiến độ |
| `/schedule` | `src/app/(app)/schedule/page.tsx` | Thời khóa biểu (Tuần, Tháng, Danh sách), tạo lịch, import |
| `/courses` | `src/app/(app)/courses/page.tsx` | Quản lý môn học |
| `/notes` | `src/app/(app)/notes/page.tsx` | Ghi chú theo môn / buổi học |
| `/assignments` | `src/app/(app)/assignments/page.tsx` | Quản lý bài tập & deadline |
| `/exams` | `src/app/(app)/exams/page.tsx` | Lịch thi, import ảnh & OCR |
| `/gpa` | `src/app/(app)/gpa/page.tsx` | Tính điểm GPA |
| `/settings` | `src/app/(app)/settings/page.tsx` | Cài đặt tài khoản, học kỳ, đồng bộ lịch, backup |
| `/widget` | `src/app/widget/page.tsx` | Widget hiển thị nhanh lịch học |

### 2.2. Layouts (`src/app/` & `src/components/layout/`)
- `src/app/layout.tsx`: Root layout (Providers, Theme, Fonts).
- `src/app/(app)/layout.tsx` & `src/app/(app)/loading.tsx`: App shell bọc các trang sau đăng nhập.
- `src/components/layout/app-layout.tsx`: Quản lý `Sidebar` (desktop collapsible + mobile drawer), `Topbar`, `MobileBottomNav`, `PwaInstallBanner`.
- `src/components/layout/sidebar.tsx` (361 dòng): Thanh điều hướng bên trái (8 mục chính).
- `src/components/layout/topbar.tsx` (870 dòng): Thanh trên cùng (chọn học kỳ, tìm kiếm toàn cục, thông báo, quick add, theme toggle, user menu).
- `src/components/layout/mobile-bottom-nav.tsx` (92 dòng): Thanh điều hướng cố định dưới đáy trên mobile (4 mục + nút "Thêm").

### 2.3. Feature Components (`src/components/`)
- **Lịch học (`schedule/`):** `week-view.tsx` (1100 dòng), `month-view.tsx` (748 dòng), `list-view.tsx` (641 dòng), `schedule-import-dialog.tsx` (956 dòng), `makeup-session-dialog.tsx` (429 dòng).
- **Buổi học (`sessions/`):** `session-detail-panel.tsx` (1646 dòng).
- **Môn học (`courses/`):** `course-form-dialog.tsx` (1216 dòng).
- **Lịch thi (`exams/`):** `exam-form-dialog.tsx` (388 dòng), `exam-calendar-view.tsx` (196 dòng), `exam-detail-dialog.tsx` (206 dòng), `exam-image-import-dialog.tsx` (329 dòng), `exam-ocr-dialog.tsx` (723 dòng).
- **Bài tập (`assignments/`):** `assignment-form-dialog.tsx` (374 dòng).
- **Học kỳ (`semesters/`):** `semester-form-dialog.tsx` (289 dòng).
- **UI Primitives (`ui/`):** 21 components (`avatar`, `badge`, `brand-logo`, `button`, `card`, `checkbox`, `confirm-dialog`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `progress`, `rich-text-editor`, `scroll-area`, `select`, `separator`, `switch`, `tabs`, `textarea`, `toast`, `tooltip`).

---

## 3. Kết quả kiểm tra thực tế trên Browser & Môi trường

- **Landing Page (`/`):** Render được trên cả Desktop (`1280x800`) và Mobile (`390x844`).
  - **Phát hiện nghiêm trọng:** Các nút CTA chính (`"Bắt đầu ngay"` trên header và `"Tạo tài khoản miễn phí"` ở hero section) gần như **tàng hình** (chữ trắng/rất nhạt trên nền trắng), tạo khoảng trống bất thường.
  - **Text truncation:** Tên môn học `"Cấu trúc dữ liệu & Giải th..."` trên mobile preview card và dòng `"Báo cáo bài tập lớn Nhập môn AI — Còn 2 ..."` trên desktop preview card bị cắt ngắn.
  - **Mobile header:** Hai link `"Tính năng"` và `"Cách hoạt động"` bị ẩn trên mobile, chỉ còn logo, `"Đăng nhập"` và nút CTA bị lỗi contrast.
- **Các route bên trong (`/dashboard`, `/login`):** Khi kiểm tra trên `localhost:3000`, server trả về `HTTP 500 Internal Server Error` với lỗi `ENOENT: no such file or directory, open '.next/routes-manifest.json'` (xung đột thư mục `.next` giữa `next dev` và `next build` trước đó). Các đánh giá chi tiết dưới đây kết hợp giữa quan sát thực tế trên `/` và phân tích toàn diện mã nguồn.

---

## 4. Các Vấn Đề UI/UX Phát Hiện (Phân loại theo mức độ)

### 4.1. Critical (Lỗi nghiêm trọng)

1. **Nút CTA chính bị tàng hình / lỗi contrast trên Landing Page**
   - **Vị trí:** `src/app/page.tsx` (Header CTA `"Bắt đầu ngay"` và Hero CTA `"Tạo tài khoản miễn phí"`).
   - **Hiện trạng:** Khi render thực tế trên browser, chữ nút màu trắng/nhạt trên nền trắng, gần như không nhìn thấy nút.
   - **Nguyên nhân:** Lớp CSS hoặc biến `--primary` không được áp dụng đúng hoặc bị ghi đè/thiếu fallback khi render ở chế độ hiện tại.
   - **Giải pháp:** Kiểm tra lại class `bg-primary text-primary-foreground` trên `Button` / `Link` ở `src/app/page.tsx`, đảm bảo CSS variables được nạp đầy đủ và có độ tương phản tối thiểu `4.5:1`.
   - **Mức độ ưu tiên:** Critical.

2. **Kiến trúc Component quá lớn (Monolithic UI Components)**
   - **Vị trí:** `session-detail-panel.tsx` (1646 dòng), `course-form-dialog.tsx` (1216 dòng), `schedule/page.tsx` (1157 dòng), `dashboard/page.tsx` (1147 dòng), `settings/page.tsx` (1105 dòng), `week-view.tsx` (1100 dòng), `schedule-import-dialog.tsx` (956 dòng), `topbar.tsx` (870 dòng).
   - **Hiện trạng:** Một file chứa cả state management, API calls, business logic, validation, và hàng trăm dòng JSX lồng nhau.
   - **Nguyên nhân:** Thiếu tách lớp (separation of concerns) giữa UI components, custom hooks, và sub-views.
   - **Giải pháp:** Tách nhỏ theo domain (ví dụ: `SessionChecklist`, `SessionResources`, `SessionNotes` từ `session-detail-panel.tsx`; tách các tab của `settings/page.tsx` thành từng component riêng).
   - **Mức độ ưu tiên:** Critical (ảnh hưởng trực tiếp đến tốc độ redesign và bảo trì).

---

### 4.2. High (Ảnh hưởng lớn đến trải nghiệm)

3. **Trùng lặp và phân mảnh luồng Import hình ảnh / OCR / Clipboard Paste**
   - **Vị trí:** `src/components/schedule/schedule-import-dialog.tsx`, `src/components/exams/exam-image-import-dialog.tsx`, `src/components/exams/exam-ocr-dialog.tsx`, `src/app/(app)/courses/page.tsx` (hoặc `page.tsx`).
   - **Hiện trạng:** Có tới 3 dialog khác nhau xử lý import/OCR/paste ảnh (`schedule-import-dialog`, `exam-image-import-dialog`, `exam-ocr-dialog`). Mỗi nơi xử lý `onPaste` (`event.clipboardData?.items` vs `event.clipboardData.files`), preview ảnh, trạng thái loading OCR và sửa kết quả theo cách khác nhau.
   - **Nguyên nhân:** Phát triển tính năng theo từng module riêng lẻ mà không có component `ImageDropzoneWithPaste` dùng chung.
   - **Giải pháp:** Chuẩn hóa một component `ImageImportDropzone` hỗ trợ thống nhất: kéo-thả, chọn file, `Ctrl+V` (clipboard paste) với hướng dẫn trực quan, preview ảnh, và bước review/chỉnh sửa dữ liệu OCR trước khi lưu.
   - **Mức độ ưu tiên:** High.

4. **Touch targets quá nhỏ trên Mobile**
   - **Vị trí:** Toàn bộ `src/app/` và `src/components/` (phát hiện 40 vị trí dùng `h-6 w-6`, `h-7 w-7`, `h-8 w-8` cho các nút bấm/icon action).
   - **Hiện trạng:** Các nút xóa, sửa, đóng modal, chuyển tuần, đánh dấu hoàn thành có kích thước `24px–32px`, nhỏ hơn chuẩn tối thiểu `44x44px` trên thiết bị cảm ứng (đặc biệt quan trọng vì app có Capacitor Android/iOS).
   - **Nguyên nhân:** Thiết kế ưu tiên mật độ desktop, chưa có responsive sizing cho touch targets.
   - **Giải pháp:** Tăng vùng chạm tối thiểu `min-h-[44px] min-w-[44px]` (hoặc `h-10 w-10` / `p-2.5`) trên mobile cho mọi interactive elements.
   - **Mức độ ưu tiên:** High.

5. **Rủi ro tràn ngang (Horizontal Overflow) & Bảng/Lịch trên màn hình nhỏ**
   - **Vị trí:** `week-view.tsx`, `month-view.tsx`, `exams/page.tsx`, `gpa/page.tsx` (phát hiện 25 vị trí dùng `min-w-[...]` hoặc `w-[...px]` cố định).
   - **Hiện trạng:** Lưới thời khóa biểu tuần và bảng điểm/lịch thi có chiều rộng tối thiểu cố định, dễ gây cuộn ngang khó kiểm soát trên mobile (`390px`).
   - **Nguyên nhân:** Chưa có chiến lược chuyển đổi layout thực sự cho mobile (ví dụ: tự động chuyển sang Day View / Agenda List trên `< 640px`).
   - **Giải pháp:** Trên mobile, mặc định hiển thị `ListView` hoặc `DayView` thay vì cố nén `WeekView` 7 cột.
   - **Mức độ ưu tiên:** High.

6. **Màu sắc Hardcoded phá vỡ Dark Mode & Tính nhất quán**
   - **Vị trí:** 16 vị trí trong `src/app/` và `src/components/` sử dụng `bg-white`, `text-black`, `bg-slate-*`, `text-gray-*`.
   - **Hiện trạng:** Một số card, badge hoặc text không tự động thích ứng khi chuyển sang Dark Mode, gây chói hoặc mất độ tương phản.
   - **Nguyên nhân:** Dùng màu Tailwind cố định thay vì semantic tokens (`bg-card`, `text-foreground`, `bg-muted`, `text-muted-foreground`).
   - **Giải pháp:** Thay thế toàn bộ màu hardcoded bằng CSS variables/semantic tokens.
   - **Mức độ ưu tiên:** High.

---

### 4.3. Medium (Cần cải thiện)

7. **Text Truncation (Cắt chữ) làm mất thông tin quan trọng**
   - **Vị trí:** `src/app/page.tsx` (Landing preview cards), `sidebar.tsx`, `mobile-bottom-nav.tsx`, `week-view.tsx`.
   - **Hiện trạng:** Tên môn học và tiêu đề bài tập bị cắt bằng `...` quá sớm (ví dụ `"Cấu trúc dữ liệu & Giải th..."`).
   - **Nguyên nhân:** Đặt `truncate` trên cùng một hàng với badge/giờ học mà không cho phép wrap 2 dòng (`line-clamp-2`).
   - **Giải pháp:** Cho phép `line-clamp-2` đối với tên môn học/bài tập ở các card hẹp, chỉ dùng `truncate` cho nhãn ngắn.
   - **Mức độ ưu tiên:** Medium.

8. **Topbar quá tải chức năng (Information Overload)**
   - **Vị trí:** `src/components/layout/topbar.tsx` (870 dòng).
   - **Hiện trạng:** Topbar gánh cùng lúc: Mobile menu button, Page title, Semester selector, Global Search (kèm dropdown kết quả), Notifications popover, Quick Add dropdown, Theme toggle, User profile menu.
   - **Nguyên nhân:** Nhồi nhét quá nhiều action vào một thanh ngang `h-14`/`h-16`.
   - **Giải pháp:** Đơn giản hóa Topbar: giữ Page title, Command Palette (`Cmd+K` / Search button), Notifications, và Quick Add. Chuyển Theme toggle & User profile gọn vào Sidebar footer hoặc User menu.
   - **Mức độ ưu tiên:** Medium.

9. **Visual Hierarchy trên Dashboard & Các trang danh sách**
   - **Vị trí:** `src/app/(app)/dashboard/page.tsx`, `courses/page.tsx`, `exams/page.tsx`, `settings/page.tsx`.
   - **Hiện trạng:** Nhiều card có cùng độ nổi (border + shadow giống nhau), thiếu sự phân cấp rõ ràng giữa thông tin khẩn cấp (lịch học sắp tới, bài tập quá hạn, kỳ thi gần) và thông tin phụ.
   - **Nguyên nhân:** Chưa áp dụng hệ thống elevation và typography scale rõ ràng (Display / H1 / H2 / Body / Caption).
   - **Giải pháp:** Chuẩn hóa Typography scale, dùng màu nhấn/accent hợp lý cho "Next Up" card trên Dashboard, và nhóm các cài đặt trong `settings/page.tsx` theo dạng Tabs hoặc Sidebar Settings thay vì cuộn dọc 1100 dòng.
   - **Mức độ ưu tiên:** Medium.

---

### 4.4. Low (Tinh chỉnh)

10. **Accessibility (A11y) & Keyboard Navigation**
    - **Vị trí:** Toàn dự án.
    - **Hiện trạng:** `globals.css` đã có `focus-visible` tốt, `app-layout.tsx` có `Escape` cho mobile drawer. Tuy nhiên, các thao tác kéo-thả/click trên lịch và một số icon-only buttons cần kiểm tra kỹ `aria-label` và thứ tự `Tab`.
    - **Giải pháp:** Bổ sung `aria-label` đầy đủ cho mọi icon button và kiểm tra keyboard navigation cho các dialog.
    - **Mức độ ưu tiên:** Low.

11. **Sử dụng `h-screen` thay vì `h-dvh` trên Mobile**
    - **Vị trí:** `src/components/layout/sidebar.tsx` (`h-screen`), `app-layout.tsx` (`min-h-screen`).
    - **Hiện trạng:** Trên trình duyệt mobile (Safari/Chrome), `100vh` (`h-screen`) thường bị thanh địa chỉ che mất phần dưới.
    - **Giải pháp:** Chuyển sang `h-dvh` / `min-h-dvh`.
    - **Mức độ ưu tiên:** Low.

---

## 5. Đánh giá Trải nghiệm theo từng Chức năng

| Chức năng | Đánh giá hiện trạng | Điểm cần cải thiện chính |
|---|---|---|
| **Dashboard** | Đầy đủ thông tin (lịch hôm nay, bài tập, lịch thi) nhưng file quá lớn (1147 dòng), các khối thông tin cạnh tranh sự chú ý. | Làm nổi bật khối "Sắp diễn ra" (Next Up), thêm Empty State có nút CTA rõ ràng khi chưa có dữ liệu. |
| **Thời khóa biểu** | Có đủ Week/Month/List view, hỗ trợ FullCalendar và học bù. | Tối ưu mobile (tự chuyển List/Day view), làm mượt thao tác chuyển tuần và xem chi tiết buổi học (`session-detail-panel.tsx` đang quá nặng). |
| **Tạo lịch** | Hỗ trợ tạo thủ công, lặp lịch, học bù. | Giảm số trường nhập liệu hiển thị cùng lúc, dùng Progressive Disclosure (tùy chọn nâng cao ẩn gọn). |
| **Import hình ảnh & Clipboard Paste** | Đã hỗ trợ `onPaste` và chọn file ở cả lịch học và lịch thi. | Thống nhất UX giữa các modal import, hiển thị rõ phím tắt `Ctrl+V` / vùng dán ảnh trực quan hơn. |
| **OCR** | Có luồng nhận diện và sửa kết quả (`exam-ocr-dialog.tsx`). | Tách rõ 3 bước (Stepper): 1. Tải/Dán ảnh → 2. Đang nhận diện (Skeleton/Progress) → 3. Kiểm tra & Chỉnh sửa bảng trước khi lưu. |
| **Lịch thi** | Có cả dạng danh sách và dạng lịch (`exam-calendar-view.tsx`). | Đồng bộ bộ lọc và countdown ngày thi rõ ràng hơn. |
| **Quản lý môn học** | Form tạo/sửa môn học (`course-form-dialog.tsx` 1216 dòng) quá dài và phức tạp. | Chia form thành các bước hoặc nhóm rõ ràng (Thông tin cơ bản, Lịch học, Màu sắc). |
| **Cài đặt** | Trang `settings/page.tsx` (1105 dòng) chứa quá nhiều mục trên một trang cuộn dài. | Chuyển sang bố cục Tabs (Tài khoản, Học kỳ, Đồng bộ & Export, Giao diện). |

---

## 6. Đề xuất Thứ tự Triển khai 9 Nhiệm vụ Tiếp theo

Để đảm bảo quá trình redesign diễn ra an toàn, không vỡ logic nghiệp vụ và tối ưu tốc độ:

1. **Task 02 — Design System & Tokens Foundation:** Chuẩn hóa `globals.css`, `tailwind.config.ts`, bảng màu semantic (sửa lỗi contrast nút CTA và hardcoded colors), typography scale, spacing và touch targets (`44px`).
2. **Task 03 — App Shell & Navigation Redesign:** Tái thiết kế `AppLayout`, `Sidebar`, `Topbar` (tinh gọn, thêm Command Palette), và `MobileBottomNav` (`h-dvh`).
3. **Task 04 — Landing Page & Auth (`/`, `/login`):** Sửa triệt để lỗi nút CTA tàng hình, tối ưu hero, responsive mobile và form đăng nhập/đăng ký.
4. **Task 05 — Dashboard Redesign (`/dashboard`):** Chia nhỏ `dashboard/page.tsx`, thiết kế lại visual hierarchy (Next Up card, Quick Stats, Empty States).
5. **Task 06 — Schedule & Session Detail Redesign (`/schedule`):** Tách nhỏ `week-view`, `month-view`, `list-view`, tối ưu mobile agenda view và refactor `session-detail-panel.tsx` (1646 dòng) thành các sub-components gọn nhẹ.
6. **Task 07 — Unified Image Import, Clipboard Paste & OCR Flow:** Xây dựng component `ImageImportDropzone` dùng chung cho cả Lịch học và Lịch thi, chuẩn hóa Stepper 3 bước cho OCR.
7. **Task 08 — Courses & Assignments Redesign (`/courses`, `/assignments`):** Refactor `course-form-dialog.tsx` (1216 dòng) với Progressive Disclosure, làm mới card môn học và danh sách bài tập.
8. **Task 09 — Exams, Notes & GPA Redesign (`/exams`, `/notes`, `/gpa`):** Đồng bộ giao diện Lịch thi, Ghi chú và Bảng tính GPA trên cả desktop và mobile.
9. **Task 10 — Settings, Accessibility & Final QA (`/settings`):** Chuyển `settings/page.tsx` sang layout Tabs, kiểm tra toàn bộ A11y, Dark Mode, và test hồi quy trên browser (Desktop + Mobile).
