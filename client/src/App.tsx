import { useHashLocation } from "wouter/use-hash-location";
import { Router, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/context/AuthContext";
import MainApp from "@/pages/MainApp";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router hook={useHashLocation}>
          <Route path="/" component={MainApp} />
          <Route path="/:tab" component={MainApp} />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
