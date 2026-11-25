'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  // Sync ?tab=register without requiring Suspense boundary around useSearchParams
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'register') {
        setTab('register');
      }
    } catch {
      // ignore
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Email chưa được đăng ký hoặc mật khẩu không đúng.');
      } else {
        toast.success('Đăng nhập thành công!');
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      toast.error('Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regName.trim().length < 2) {
      toast.error('Vui lòng nhập họ và tên (tối thiểu 2 ký tự)');
      return;
    }
    if (regPassword.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (regPassword !== regConfirm) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Tạo tài khoản thất bại');
        return;
      }

      toast.success('Tạo tài khoản thành công! Đang đăng nhập...');
      const signInRes = await signIn('credentials', {
        email: regEmail.trim(),
        password: regPassword,
        redirect: false,
      });

      if (signInRes?.error) {
        setTab('login');
        setEmail(regEmail.trim());
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      toast.error('Lỗi kết nối khi tạo tài khoản');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen flex flex-col justify-center bg-background relative overflow-hidden p-4 sm:p-6 focus:outline-none"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-indigo-500/10 dark:from-primary/10 dark:via-background dark:to-blue-950/30"
      />

      <div className="w-full max-w-5xl mx-auto">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Trang chủ
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left brand panel on desktop */}
          <div className="hidden lg:flex lg:col-span-6 flex-col space-y-6 pr-4">
            <div className="inline-flex items-center gap-3">
              <BrandLogo size={44} className="w-11 h-11" />
              <div>
                <p className="text-xl font-bold tracking-tight text-foreground">WebSchedule</p>
                <p className="text-xs text-muted-foreground">Trợ lý quản lý lịch học cá nhân</p>
              </div>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-foreground">
              Tổ chức học kỳ gọn gàng, chủ động trước mọi kỳ thi và hạn nộp bài.
            </h1>

            <div className="space-y-3.5 text-sm text-muted-foreground">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>
                  Thời khóa biểu trực quan theo tuần, tháng và danh sách, hỗ trợ đăng ký buổi học bù an toàn.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>
                  Ghi chú bài giảng, checklist ôn tập và đính kèm tài liệu ngay trên từng buổi học.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>
                  Cảnh báo sớm bài tập sắp quá hạn, nhắc giờ lên lớp và đồng bộ lịch dễ dàng.
                </span>
              </div>
            </div>
          </div>

          {/* Auth Card */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto">
            <Card className="shadow-elevated border-border/90">
              <CardHeader className="text-center space-y-3 pb-4">
                <div className="mx-auto w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-soft lg:hidden">
                  <Calendar className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-bold">
                    {tab === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}
                  </CardTitle>
                  <CardDescription>
                    {tab === 'login'
                      ? 'Đăng nhập để tiếp tục quản lý lịch học của bạn'
                      : 'Khởi tạo không gian học tập cá nhân chỉ trong vài giây'}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
                  <TabsList className="grid w-full grid-cols-2 mb-5">
                    <TabsTrigger value="login">
                      <LogIn className="w-4 h-4" />
                      Đăng nhập
                    </TabsTrigger>
                    <TabsTrigger value="register">
                      <UserPlus className="w-4 h-4" />
                      Tạo tài khoản
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="email@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="password">Mật khẩu</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            placeholder="Nhập mật khẩu"
                            className="pr-10"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Đang đăng nhập...
                          </>
                        ) : (
                          'Đăng nhập'
                        )}
                      </Button>

                      <div className="pt-2 border-t border-border/70 space-y-2">
                        <p className="text-xs text-center text-muted-foreground">
                          Điền nhanh tài khoản trải nghiệm:
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            disabled={loading}
                            onClick={() => {
                              setEmail('dominhan0612@gmail.com');
                              setPassword('123456');
                            }}
                          >
                            Đỗ Minh An (dominhan0612@gmail.com)
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-muted-foreground"
                            disabled={loading}
                            onClick={() => {
                              setEmail('student@webschedule.vn');
                              setPassword('123456');
                            }}
                          >
                            Tài khoản mẫu (student@webschedule.vn)
                          </Button>
                        </div>
                      </div>
                    </form>
                  </TabsContent>

                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-name">Họ và tên</Label>
                        <Input
                          id="reg-name"
                          autoComplete="name"
                          placeholder="VD: Đỗ Minh An"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-email">Email</Label>
                        <Input
                          id="reg-email"
                          type="email"
                          autoComplete="email"
                          placeholder="VD: sinhvien@truong.edu.vn"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-password">Mật khẩu</Label>
                        <div className="relative">
                          <Input
                            id="reg-password"
                            type={showRegPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Tối thiểu 6 ký tự"
                            className="pr-10"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword((prev) => !prev)}
                            aria-label={showRegPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showRegPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-confirm">Nhập lại mật khẩu</Label>
                        <Input
                          id="reg-confirm"
                          type={showRegPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Nhập lại mật khẩu xác nhận"
                          value={regConfirm}
                          onChange={(e) => setRegConfirm(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={regLoading}>
                        {regLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Đang tạo tài khoản...
                          </>
                        ) : (
                          'Tạo tài khoản & Bắt đầu'
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
