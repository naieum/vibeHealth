"use client";

import { useState, useEffect } from "react";

interface Notification {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// VULN [Cat 24]: Memory leaks - missing cleanup, unbounded growth
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  // VULN [Cat 24]: addEventListener without cleanup return in useEffect
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
      }
    };

    // VULN [Cat 24]: Event listener added but never removed - leaks on unmount
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", fetchNotifications);
    window.addEventListener("online", fetchNotifications);

    // VULN [Cat 24]: No cleanup return - all three listeners leak
  }, []);

  // VULN [Cat 24]: setInterval without clearInterval
  useEffect(() => {
    // VULN [Cat 24]: Interval starts but is never cleared on unmount
    setInterval(async () => {
      try {
        const res = await fetch("/api/notifications");
        if (res.ok) {
          const data = await res.json();
          // VULN [Cat 24]: Unbounded array - appends every poll, never caps or deduplicates
          setNotifications((prev) => [...prev, ...data.notifications]);
          setConnectionStatus("connected");
        }
      } catch {
        setConnectionStatus("error");
      }
    }, 3000);

    // VULN [Cat 24]: No return () => clearInterval(...)
  }, []);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        // VULN [Cat 24]: Also appends here - compounds with interval
        setNotifications((prev) => [...prev, ...data.notifications]);
      }
    } catch {
      console.error("Failed to fetch notifications");
    }
  }

  async function markAsRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <span
          className={`text-sm px-2 py-1 rounded ${
            connectionStatus === "connected"
              ? "bg-green-100 text-green-800"
              : connectionStatus === "error"
              ? "bg-red-100 text-red-800"
              : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {connectionStatus}
        </span>
      </div>

      {notifications.length === 0 ? (
        <p className="text-gray-500">No notifications yet.</p>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification, index) => (
            <div
              key={`${notification.id}-${index}`}
              className={`p-4 rounded-lg border ${
                notification.read
                  ? "bg-white border-gray-200"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-gray-900">{notification.message}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
                {!notification.read && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
