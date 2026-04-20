"use client";

import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { MessageCircle } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="page-with-nav flex-1 flex items-center justify-center px-4">
        <div className="text-center text-muted-foreground">
          <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-200" />
          <h1 className="font-heading text-2xl font-bold text-navy mb-2">
            Messages
          </h1>
          <p className="text-sm">Your conversations will appear here.</p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
