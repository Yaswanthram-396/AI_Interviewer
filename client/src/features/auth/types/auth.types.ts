export type UserRole = "candidate" | "recruiter" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
}

/** Response of POST /api/auth/{login,register,refresh}. */
export interface SessionPayload {
  user: AuthUser;
  accessToken: string;
}

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: AuthUser };

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name?: string;
}
