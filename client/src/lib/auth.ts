export type Role = "admin" | "user";

export interface SessionPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
  jti: string;
}
