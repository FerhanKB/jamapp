import { api } from "./client";

export interface Friend {
  user_id: string;
  username: string;
  direction?: "incoming" | "outgoing";
}

export interface FriendsResponse {
  friends: Friend[];
  pending: Friend[];
}

export function getFriends(): Promise<FriendsResponse> {
  return api<FriendsResponse>("/friends");
}

export function inviteFriend(
  username: string,
): Promise<{ status: "pending" | "accepted" }> {
  return api<{ status: "pending" | "accepted" }>("/friends/invite", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function acceptFriend(userId: string): Promise<void> {
  return api<void>(`/friends/${userId}/accept`, { method: "POST" });
}

export function removeFriend(userId: string): Promise<void> {
  return api<void>(`/friends/${userId}`, { method: "DELETE" });
}
