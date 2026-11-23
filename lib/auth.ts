import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "@auth/core/providers";
import { createServerSupabaseClient } from "./supabase-server";

const GUILD_ID = process.env.DISCORD_GUILD_ID!;
const REQUIRED_ROLE_ID = process.env.DISCORD_REQUIRED_ROLE_ID!;

const EXTRA_ALLOWED_DISCORD_IDS = (process.env.EXTRA_ALLOWED_DISCORD_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const FRIEND_DISCORD_IDS = (process.env.FRIEND_DISCORD_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const DEV_TEST_DISCORD_ID = "dev-test-0000000000000000";
const DEV_FRIEND_DISCORD_ID = "dev-friend-000000000000";
const isDevEnvironment = process.env.NODE_ENV !== "production";

const DEV_LOGIN_PROFILES: Record<string, { discordId: string; name: string; appRole: string }> = {
  "dev-test-login": { discordId: DEV_TEST_DISCORD_ID, name: "DevTest", appRole: "admin" },
  "dev-friend-login": { discordId: DEV_FRIEND_DISCORD_ID, name: "DevFriend", appRole: "friend" },
};

const providers: Provider[] = [
  Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "identify guilds.members.read",
        },
      },
      profile(profile) {
        let imageUrl: string;
        if (profile.avatar === null) {
          const defaultAvatarNumber =
            profile.discriminator === "0"
              ? Number(BigInt(profile.id) >> BigInt(22)) % 6
              : parseInt(profile.discriminator) % 5;
          imageUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNumber}.png`;
        } else {
          const format = profile.avatar.startsWith("a_") ? "gif" : "png";
          imageUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
        }
        return {
          id: profile.id,
          name: profile.username,
          email: profile.email,
          image: imageUrl,
        };
      },
    }),
];

if (isDevEnvironment) {
  for (const [providerId, profile] of Object.entries(DEV_LOGIN_PROFILES)) {
    providers.push(
      Credentials({
        id: providerId,
        name: `Login de prueba (dev, ${profile.appRole})`,
        credentials: {},
        async authorize() {
          if (process.env.NODE_ENV === "production") return null;
          return { id: profile.discordId, name: profile.name, email: null, image: null };
        },
      })
    );
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  callbacks: {
    async signIn({ user, account }) {
      const devProfile = account?.provider ? DEV_LOGIN_PROFILES[account.provider] : undefined;
      if (devProfile) {
        const supabase = createServerSupabaseClient();
        const { data: existingDevUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("discord_id", devProfile.discordId)
          .maybeSingle();

        if (!existingDevUser) {
          const { error: insertError } = await supabase.from("app_users").insert({
            discord_id: devProfile.discordId,
            discord_username: devProfile.name,
            nickname: devProfile.name,
            app_role: devProfile.appRole,
          });
          if (insertError) {
            console.error("ERROR creando app_user de prueba:", JSON.stringify(insertError, null, 2));
          }
        }

        return true;
      }

      if (!account?.access_token) return false;

      const discordId = account.providerAccountId;
      const isExtraAllowed = EXTRA_ALLOWED_DISCORD_IDS.includes(discordId);
      const isFriend = FRIEND_DISCORD_IDS.includes(discordId);

      try {
        if (!isExtraAllowed && !isFriend) {
          const memberRes = await fetch(
            `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
            {
              headers: {
                Authorization: `Bearer ${account.access_token}`,
              },
            }
          );

          if (!memberRes.ok) {
            console.warn("No es miembro del guild o token inválido");
            return false;
          }

          const member = await memberRes.json();
          const roles: string[] = member.roles ?? [];

          const hasRequiredRole = roles.includes(REQUIRED_ROLE_ID);

          if (!hasRequiredRole) {
            console.warn(`Usuario ${discordId} no tiene el rol requerido`);
            return false;
          }
        }

        const supabase = createServerSupabaseClient();
        const { data: existingUser, error: selectError } = await supabase
          .from("app_users")
          .select("*")
          .eq("discord_id", discordId)
          .maybeSingle();

        if (selectError) {
          console.error(
            "ERROR buscando app_user existente:",
            JSON.stringify(selectError, null, 2)
          );
        }

        if (!existingUser) {
          const { error: insertError } = await supabase
            .from("app_users")
            .insert({
              discord_id: discordId,
              discord_username: user.name,
              avatar_url: user.image,
              app_role: isFriend ? "friend" : isExtraAllowed ? "guest" : "member",
            });

          if (insertError) {
            console.error(
              "ERROR insertando en app_users:",
              JSON.stringify(insertError, null, 2)
            );
          }
        } else if (existingUser.removed_at) {
          console.warn(`Usuario ${discordId} está eliminado del portal, login bloqueado`);
          return false;
        } else {
          const { error: updateError } = await supabase
            .from("app_users")
            .update({
              discord_username: user.name,
              avatar_url: user.image,
            })
            .eq("discord_id", discordId);

          if (updateError) {
            console.error(
              "ERROR actualizando app_users:",
              JSON.stringify(updateError, null, 2)
            );
          }
        }

        return true;
      } catch (err) {
        console.error("Error verificando membresía/rol de Discord:", err);
        return false;
      }
    },

    async jwt({ token, user, account }) {
      if (user && account) {
        const discordId = account.providerAccountId;
        token.discordId = discordId;

        const supabase = createServerSupabaseClient();
        const { data } = await supabase
          .from("app_users")
          .select("id, app_role, nickname")
          .eq("discord_id", discordId)
          .maybeSingle();

        token.appUserId = data?.id;
        token.appRole = data?.app_role ?? "member";
        token.nickname = data?.nickname ?? null;
        token.revalidatedAt = Date.now();
      } else if (token.discordId && !token.nickname) {
        const supabase = createServerSupabaseClient();
        const { data } = await supabase
          .from("app_users")
          .select("nickname")
          .eq("discord_id", token.discordId)
          .maybeSingle();

        token.nickname = data?.nickname ?? null;
      } else if (token.discordId) {
        const REVALIDATE_INTERVAL_MS = 60_000;
        const lastRevalidated = token.revalidatedAt ?? 0;
        if (Date.now() - lastRevalidated < REVALIDATE_INTERVAL_MS) {
          return token;
        }

        const supabase = createServerSupabaseClient();
        const { data } = await supabase
          .from("app_users")
          .select("id, app_role, removed_at")
          .eq("discord_id", token.discordId)
          .maybeSingle();

        if (!data || data.removed_at) {
          return null;
        }

        token.appUserId = data.id;
        token.appRole = data.app_role;
        token.revalidatedAt = Date.now();
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.discordId = token.discordId;
        session.user.appRole = token.appRole;
        session.user.nickname = token.nickname ?? null;
        session.user.appUserId = token.appUserId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
