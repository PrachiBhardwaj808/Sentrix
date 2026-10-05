"use client";

import React from "react";
import { SentrixIntelligenceMap, CommunityReportInput } from "@/components/map/SentrixIntelligenceMap";
import { useIBVAPStore } from "@/lib/store/useIBVAPStore";

export default function MapPage() {
  const { sectors, cameras, alerts, acknowledgeAlert, addAlert } = useIBVAPStore();

  const submitCommunityReport = (report: CommunityReportInput) => {
    const level = report.category === "fire" || report.category === "accident" ? "high" : report.category === "missing person" ? "critical" : "medium";
    addAlert({
      level,
      sourceCameraId: "COMMUNITY-REPORT",
      sourceCameraName: `Community report // ${report.reporterName}`,
      eventType: `Community ${report.category}`,
      confidence: 0,
      coordinates: report.coordinates,
      objectClass: report.category === "accident" ? "Vehicle" : "Unknown",
      evidenceUrl: report.evidenceUrl || "",
      sector: "Community Network",
      notes: `${report.description} Reported by ${report.reporterName}. Awaiting authorized operator review.`,
      evidenceSource: "community_report",
      reporterName: report.reporterName,
      reportCategory: report.category,
      requiresOperatorReview: true,
      reviewStatus: "operator_review",
      incidentStatus: "new",
      triageSeverity: level,
      operatorNotice: "Community report is unverified and must be reviewed before response action.",
      blockchainStatus: "not_anchored",
    });
  };

  return (
    <SentrixIntelligenceMap
      sectors={sectors}
      cameras={cameras}
      alerts={alerts}
      onAcknowledgeAlert={acknowledgeAlert}
      onSubmitCommunityReport={submitCommunityReport}
      className="pb-2"
    />
  );
}
