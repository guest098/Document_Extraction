import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { authFetch, clearToken } from "@/lib/api";

async function fetchUser(): Promise<User | null> {
  const response = await authFetch("/api/auth/user");
  if (response.status === 401 || response.status === 404) {
    clearToken();
    return null;
  }
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
  const data = await response.json();
  return { ...data, id: data.id };
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes to prevent refetching on every navigation
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnMount: false, // Don't refetch on mount if we have cached data
  });

  const logoutMutation = useMutation({
    mutationFn: () => {
      clearToken();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: () => {
      logoutMutation.mutate();
      window.location.href = "/";
    },
    isLoggingOut: logoutMutation.isPending,
    refetch,
  };
}
