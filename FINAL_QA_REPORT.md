# FINAL QA REPORT — WebScheduleAI

**Ngày kiểm định:** 2026-11-27  
**Phạm vi:** Kiểm định chất lượng tổng thể (Technical QA, Visual QA, Functional Regression) sau đợt redesign.

---

## 1. Các hạng mục đã hoàn thành

- **TypeScript Type Checking (`npm run typecheck`)**: Đã chạy `tsc --noEmit` và kiểm tra toàn bộ mã nguồn TypeScript.
- **Unit / Logic Tests**: Đã chạy đầy đủ 3 bộ kiểm thử logic hiện có:
  - `npm run test:import` (`scripts/verify-import-logic.ts`)
  - `npm run test:gpa` (`scripts/verify-gpa-logic.ts`)
  - `npm run test:validation` (`scripts/verify-validation-logic.ts`)
- **Production Build (`npm run build`)**: Đã chạy `next build` để kiểm tra biên dịch production.
- **Dev Server & Route Smoke Check**: Đã khởi động `npm run dev` (trên cổng `3005`) và kiểm tra HTTP response cho `/login` và `/`.
- **Rà soát thay đổi mã nguồn (`git diff --stat`)**: Đã kiểm kê 22 file được chỉnh sửa trong đợt redesign (gồm `globals.css`, `tailwind.config.ts`, `dashboard/page.tsx`, `exams/page.tsx`, `schedule/page.tsx`, `week-view.tsx`, `sidebar.tsx`, `topbar.tsx`, `mobile-bottom-nav.tsx`, và các UI primitives trong `src/components/ui/`).

---

## 2. Những file đã thay đổi

Trong phiên QA này **không có file mã nguồn ứng dụng nào bị sửa đổi** (chỉ tạo báo cáo `FINAL_QA_REPORT.md`).  
Các file đang có thay đổi từ đợt redesign trước đó (ghi nhận qua `git diff --stat`):
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/exams/page.tsx`
- `src/app/(app)/loading.tsx`
- `src/app/(app)/schedule/page.tsx`
- `src/app/globals.css`
- `src/components/layout/app-layout.tsx`
- `src/components/layout/mobile-bottom-nav.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/topbar.tsx`
- `src/components/schedule/week-view.tsx`
- `src/components/ui/badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `popover.tsx`, `select.tsx`, `tabs.tsx`, `toast.tsx`, `tooltip.tsx`
- `tailwind.config.ts`

---

## 3. Kết quả Build, Typecheck & Lint

| Hạng mục | Lệnh | Kết quả | Chi tiết |
| :--- | :--- | :--- | :--- |
| **Typecheck** | `npm run typecheck` | **PASS** | `tsc --noEmit` thoát với mã `0`, không có lỗi kiểu dữ liệu. |
| **Production Build** | `npm run build` | **FAIL (OOM)** | `Compiled successfully in 38.5s`, nhưng bước `Linting and checking validity of types ...` bị `FATAL ERROR: Zone Allocation failed - process out of memory` (exit code `134`). Ngoài ra có cảnh báo `@next/swc-win32-x64-msvc` không hợp lệ trên Win32. |
| **Lint** | `npm run lint` | **BLOCKED** | Dự án chưa có cấu hình ESLint (`.eslintrc.*` / `eslint.config.*`), `next lint` dừng ở prompt tương tác. |

---

## 4. Kết quả kiểm thử

| Bộ kiểm thử | Lệnh | Kết quả | Số lượng |
| :--- | :--- | :--- | :--- |
| **Timetable Import Logic** | `npm run test:import` | **PASS** | 25/25 tests passed |
| **GPA / CPA Logic** | `npm run test:gpa` | **PASS** | 11/11 tests passed |
| **Date-Time & Schema Validation** | `npm run test:validation` | **PASS** | 15/15 tests passed |
| **HTTP Route Smoke Check** | `Invoke-WebRequest` | **PARTIAL** | `/login` trả về `200 OK`; `/` bị timeout 15s khi dev server đang biên dịch lần đầu; `/register` trả về `404` (không tồn tại route này). |

---

## 5. Các lỗi đã sửa

- **Lỗi `.next` cache hỏng sau OOM build**: Khi chạy `next dev` ngay sau lần `next build` bị OOM, trang chủ trả về `404` kèm thông báo `missing required error components, refreshing...`. Đã xử lý bằng cách xóa thư mục `.next` và khởi động lại `npm run dev` sạch.

---

## 6. Những vấn đề còn tồn tại

1. **Production Build bị Out of Memory (OOM)**: `next build` biên dịch xong nhưng worker kiểm tra type/lint bị tràn bộ nhớ (`exit code 134`). Cần cấu hình tăng heap (`NODE_OPTIONS=--max-old-space-size=4096`) hoặc kiểm tra lại `@next/swc-win32-x64-msvc`.
2. **Thiếu cấu hình ESLint**: `npm run lint` chưa chạy tự động được do chưa có file cấu hình ESLint.

---

## 7. Những tính năng chưa thể kiểm tra

Do công cụ trình duyệt (`webview_browser`) trong môi trường hiện tại không có cửa sổ trình duyệt kết nối với Language Server (`no active webview browser windows connected to Language Server`), các hạng mục sau **chưa thể kiểm tra thực tế trên UI**:
- **Visual QA**: Typography, spacing, alignment, color consistency, shadows, borders, animations, empty/loading/error states, theme switching (light/dark), và responsive (desktop `1280x800` vs mobile `390x844`).
- **Functional Regression trên trình duyệt**: Tạo/sửa/xóa lịch, import hình ảnh, clipboard paste, OCR, review dữ liệu OCR, lưu dữ liệu, lịch thi, quản lý môn học, navigation, và kiểm tra console/network errors trên trình duyệt.

---

## 8. Đánh giá mức độ sẵn sàng phát hành

- **Trạng thái hiện tại:** **CHƯA SẴN SÀNG PHÁT HÀNH (Conditional / Needs Verification)**.
- **Lý do:** Dù `typecheck` và toàn bộ 51 unit test logic đều pass, quá trình `next build` production bị OOM ở bước kiểm tra type/lint và toàn bộ kiểm thử UI/UX + Functional Regression trên trình duyệt chưa thể thực hiện do thiếu kết nối `webview_browser`.
- **Khuyến nghị trước khi phát hành:**
  1. Chạy `NODE_OPTIONS="--max-old-space-size=4096" npm run build` để xác nhận production build hoàn tất 100%.
  2. Cấu hình ESLint (`.eslintrc.json` hoặc `eslint.config.mjs`) để `npm run lint` chạy non-interactive.
  3. Mở trình duyệt và kiểm tra thủ công các luồng chính (Schedule CRUD, Exams, Courses, Import/OCR, Mobile Responsive, Light/Dark theme).
