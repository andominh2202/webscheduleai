import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  GraduationCap,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: Calendar,
    title: 'Thời khóa biểu trực quan',
    description:
      'Xem lịch học theo tuần, tháng hoặc danh sách. Hỗ trợ đổi buổi học bù, phát hiện trùng lịch tự động.',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  },
  {
    icon: ClipboardList,
    title: 'Quản lý bài tập & Deadline',
    description:
      'Phân loại mức độ ưu tiên, theo dõi đếm ngược thời hạn nộp bài để không bỏ lỡ bất kỳ cột mốc quan trọng nào.',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  },
  {
    icon: GraduationCap,
    title: 'Lịch thi & Trọng số điểm',
    description:
      'Lưu trữ phòng thi, hình thức thi giữa kỳ/cuối kỳ và cơ cấu điểm thành phần cho từng học phần.',
    color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  },
  {
    icon: StickyNote,
    title: 'Ghi chú buổi học thông minh',
    description:
      'Trình soạn thảo văn bản phong phú hỗ trợ checklist công việc, đính kèm tài liệu ngay trong từng buổi học.',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  },
  {
    icon: FileSpreadsheet,
    title: 'Nhập & Đồng bộ nhanh chóng',
    description:
      'Nhập thời khóa biểu từ file CSV/Excel hoặc sao lưu JSON an toàn, xuất lịch iCal sang Google Calendar.',
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
  },
  {
    icon: BellRing,
    title: 'Nhắc lịch trước giờ lên lớp',
    description:
      'Thông báo trực tiếp trên trình duyệt trước buổi học 30 phút cùng bảng tổng hợp công việc trong ngày.',
    color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
  },
];

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-soft">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">WebSchedule</span>
          </Link>

          <nav aria-label="Điều hướng trang chủ" className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#tinh-nang" className="hover:text-foreground transition-colors">
              Tính năng
            </a>
            <a href="#quy-trinh" className="hover:text-foreground transition-colors">
              Cách hoạt động
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Đăng nhập</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login?tab=register">
                Bắt đầu ngay
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 sm:py-20 lg:py-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-96 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent blur-3xl"
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <Badge
                variant="secondary"
                className="px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Không gian quản lý học tập dành riêng cho sinh viên
              </Badge>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.15]">
                Làm chủ thời khóa biểu,{' '}
                <span className="text-primary">bài tập & kỳ thi</span> trong một nơi duy nhất
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                Tự động sinh lịch học cả học kỳ, theo dõi tiến độ từng môn, ghi chú ngay trên từng buổi học và nhận cảnh báo sớm trước mọi deadline quan trọng.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-1">
                <Button size="lg" className="w-full sm:w-auto" asChild>
                  <Link href="/login?tab=register">
                    Tạo tài khoản miễn phí
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
                  <Link href="/login">Đăng nhập tài khoản</Link>
                </Button>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-xs sm:text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Tự động kiểm tra trùng lịch
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Nhập nhanh Excel / CSV
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Hỗ trợ giao diện Sáng & Tối
                </span>
              </div>
            </div>

            {/* Interactive-style Preview Card */}
            <div className="lg:col-span-5">
              <Card className="p-5 sm:p-6 shadow-elevated border-border/90 bg-card/95 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3.5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Học kỳ 1 • Hôm nay</p>
                    <h2 className="text-base font-bold text-foreground">Lịch trình trong ngày</h2>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
                    Đúng tiến độ
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/70 p-3">
                    <div className="w-1.5 h-11 rounded-full bg-blue-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">Cấu trúc dữ liệu & Giải thuật</p>
                        <span className="text-[11px] font-medium text-primary shrink-0">07:30 - 09:30</span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        Phòng B1-302 • Đã đính kèm slide tuần 6
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/70 p-3">
                    <div className="w-1.5 h-11 rounded-full bg-violet-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">Hệ cơ sở dữ liệu</p>
                        <span className="text-[11px] font-medium text-muted-foreground shrink-0">13:00 - 15:30</span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <Clock className="w-3.5 h-3.5" />
                        Phòng Lab C2-104 • Thực hành nhóm
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      Deadline sắp tới
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      Báo cáo bài tập lớn Nhập môn AI — Còn 2 ngày
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-amber-500/30 text-amber-700 dark:text-amber-300">
                    Ưu tiên cao
                  </Badge>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="tinh-nang" className="py-16 sm:py-20 border-t border-border/60 bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Mọi công cụ cần thiết cho một học kỳ hiệu quả
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                Thiết kế tinh gọn, tốc độ phản hồi tức thì trên cả máy tính và điện thoại.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feat) => {
                const Icon = feat.icon;
                return (
                  <Card key={feat.title} className="hover:border-primary/35">
                    <CardContent className="p-6 space-y-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${feat.color}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground">{feat.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {feat.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="quy-trinh" className="py-16 sm:py-20 border-t border-border/60">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Khởi tạo học kỳ chỉ trong 3 bước
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                Bắt đầu ngay mà không cần thiết lập phức tạp.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: '01',
                  title: 'Tạo học kỳ mới',
                  desc: 'Chọn ngày bắt đầu và kết thúc học kỳ để hệ thống làm mốc sinh buổi học tự động.',
                },
                {
                  step: '02',
                  title: 'Thêm môn hoặc nhập file',
                  desc: 'Khai báo lịch học theo thứ/ca hoặc tải lên file Excel/CSV thời khóa biểu từ trường.',
                },
                {
                  step: '03',
                  title: 'Theo dõi & Ghi chú mỗi ngày',
                  desc: 'Mở bảng tổng quan xem ca học sắp tới, ghi chú bài giảng và kiểm soát deadline.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-border/80 bg-card p-5 shadow-card space-y-2.5"
                >
                  <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                    Bước {item.step}
                  </span>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 text-center space-y-4">
              <h3 className="text-xl sm:text-2xl font-bold">
                Sẵn sàng sắp xếp học kỳ khoa học hơn?
              </h3>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                Đăng nhập bằng tài khoản có sẵn hoặc đăng ký mới hoàn toàn miễn phí chỉ trong vài giây.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild>
                  <Link href="/login?tab=register">
                    Bắt đầu ngay
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/login">Trải nghiệm tài khoản mẫu</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 py-6 bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Calendar className="w-4 h-4 text-primary" />
            <span>WebSchedule</span>
          </div>
          <p>Quản lý lịch học, bài tập và kỳ thi thông minh dành cho sinh viên Việt Nam.</p>
        </div>
      </footer>
    </div>
  );
}
