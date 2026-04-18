import { api } from "./client";

export function inviteToJam(
  roomId: string,
  friendId: string,
): Promise<void> {
  return api<void>(`/jam/${roomId}/invite`, {
    method: "POST",
    body: JSON.stringify({ friend_id: friendId }),
  });
}
