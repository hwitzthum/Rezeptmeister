import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: "admin" | "user";
    };
  }
  interface User {
    role: "admin" | "user";
  }
}


export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 }, // 24 Stunden
  pages: {
    signIn: "/auth/anmelden",
    error: "/auth/fehler",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "E-Mail und Passwort",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials?.password !== "string"
        ) {
          return null;
        }

        // Benutzer in der DB suchen
        let user;
        try {
          user = await db.query.users.findFirst({
            where: eq(users.email, credentials.email.toLowerCase().trim()),
          });
        } catch {
          // DB nicht erreichbar – kein Crash, nur null zurückgeben
          return null;
        }

        if (!user || !user.passwordHash) return null;

        // Nur freigegebene Benutzer dürfen sich einloggen
        if (user.status !== "approved") return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "admin" | "user";
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
