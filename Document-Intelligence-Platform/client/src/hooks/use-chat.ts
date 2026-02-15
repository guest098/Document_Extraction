import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { authFetch } from "@/lib/api";

export function useChatHistory(documentId: string | undefined) {
  return useQuery({
    queryKey: [api.chat.history.path, documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const url = buildUrl(api.chat.history.path, { id: documentId });
      const res = await authFetch(url);
      if (!res.ok) throw new Error("Failed to fetch chat history");
      return res.json();
    },
    enabled: !!documentId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useSendMessage(documentId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string) => {
      if (!documentId) throw new Error("No document");
      const url = buildUrl(api.chat.create.path, { id: documentId });
      const res = await authFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.chat.history.path, documentId] });
    },
  });
}
