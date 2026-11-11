'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Calendar, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-blue-950 dark:to-indigo-950 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="mx-auto w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
            <Calendar className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">WebSchedule</CardTitle>
            <CardDescription className="mt-1">
              Quản lý lịch học thông minh dành cho sinh viên
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login" className="gap-1.5">
                <LogIn className="w-4 h-4" />
                Đăng nhập
              </TabsTrigger>
              <TabsTrigger value="register" className="gap-1.5">
                <UserPlus className="w-4 h-4" />
                Tạo tài khoản
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </Button>

                <div className="pt-1 space-y-2">
                  <p className="text-xs text-center text-muted-foreground">
                    Đăng nhập nhanh tài khoản có sẵn:
                  </p>
                  <div className="grid grid-cols-1 gap-2">
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
                    placeholder="VD: dominhan0612@gmail.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Mật khẩu</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-confirm">Nhập lại mật khẩu</Label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    placeholder="Nhập lại mật khẩu"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={regLoading}>
                  {regLoading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản & Bắt đầu'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
