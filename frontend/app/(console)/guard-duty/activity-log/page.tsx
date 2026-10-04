"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ActivityLogRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/guard-duty");
  }, [router]);

  return null;
}
