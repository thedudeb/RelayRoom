"use client";

import { useState } from "react";
import { DriveFolderPicker } from "@/components/pipelines/DriveFolderPicker";

interface ConnectionOption {
  id: string;
  label: string;
  detail: string;
}

export function CreateDriveSourceFields({
  disabled,
  driveConnections
}: {
  disabled: boolean;
  driveConnections: ConnectionOption[];
}) {
  const [connectionId, setConnectionId] = useState(driveConnections[0]?.id || "");

  return (
    <>
      <label>
        <span>Drive connection</span>
        <select
          className="select"
          data-private
          disabled={disabled}
          name="driveConnectionId"
          onChange={(event) => setConnectionId(event.target.value)}
          required
          value={connectionId}
        >
          {driveConnections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.label} - {connection.detail}
            </option>
          ))}
        </select>
      </label>
      <DriveFolderPicker connectionId={connectionId} disabled={disabled} />
    </>
  );
}
