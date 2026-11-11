import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '@/lib/password';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';

const providers = [
  Credentials({
    name: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Mật khẩu', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      const email = (credentials.email as string).trim().toLowerCase();
      const password = credentials.password as string;

      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return null;
      }

      const passwordCheck = await verifyPassword(password, user.password);
      if (!passwordCheck.valid) return null;
      if (passwordCheck.legacy) {
        await prisma.user.update({
          where: { id: user.id, password: user.password },
          data: { password: await hashPassword(password) },
        });
      }

      if (!user.calendarToken) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { calendarToken: crypto.randomBytes(16).toString('hex') },
        });
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
          authorization: {
            params: {
              scope:
                'openid email profile https://www.googleapis.com/auth/calendar.events',
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
