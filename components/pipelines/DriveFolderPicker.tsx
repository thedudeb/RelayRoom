"use client";

import { useState } from "react";

declare global {
  interface Window {
    gapi?: {
      load: (library: string, callback: () => void) => void;
    };
    google?: {
      picker?: {
        Action: { PICKED: string };
        DocsView: new (viewId: string) => GooglePickerDocsView;
        DocsViewMode: { LIST: string };
        Feature: { MINE_ONLY: string; SUPPORT_DRIVES: string };
        PickerBuilder: new () => GooglePickerBuilder;
        Response: { ACTION: string; DOCUMENTS: string };
        ViewId: { FOLDERS: string };
        Document: { ID: string; NAME: string };
      };
    };
  }
}

interface GooglePickerDocsView {
  setIncludeFolders: (includeFolders: boolean) => GooglePickerDocsView;
  setMode: (mode: string) => GooglePickerDocsView;
  setSelectFolderEnabled: (selectFolderEnabled: boolean) => GooglePickerDocsView;
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerDocsView) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
  enableFeature: (feature: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setCallback: (callback: (data: GooglePickerResponse) => void) => GooglePickerBuilder;
  setDeveloperKey: (developerKey: string) => GooglePickerBuilder;
  setOAuthToken: (oauthToken: string) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
}

interface GooglePickerResponse {
  [key: string]: unknown;
}

interface PickerTokenResponse {
  accessToken?: string;
  apiKey?: string;
  appId?: string;
  error?: string;
}

interface PickerConfig {
  accessToken: string;
  apiKey: string;
  appId: string;
}

export function DriveFolderPicker({
  disabled,
  initialFolderId = "",
  initialFolderName = "Meet Recordings"
}: {
  disabled: boolean;
  initialFolderId?: string;
  initialFolderName?: string;
}) {
  const [folderId, setFolderId] = useState(initialFolderId);
  const [folderName, setFolderName] = useState(initialFolderName);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"error" | "info">("info");
  const [isOpening, setIsOpening] = useState(false);

  async function openPicker() {
    setIsOpening(true);
    setStatus(null);
    setStatusTone("info");

    try {
      const [config] = await Promise.all([fetchPickerToken(), loadPickerScript()]);
      const pickerApi = window.google?.picker;

      if (!pickerApi) {
        throw new Error("Google Picker did not finish loading. Please try again.");
      }

      const view = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMode(pickerApi.DocsViewMode.LIST);

      const builder = new pickerApi.PickerBuilder()
        .setAppId(config.appId)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.apiKey)
        .setOrigin(window.location.origin)
        .addView(view)
        .setTitle("Choose a Drive folder")
        .setCallback((data) => {
          const action = data[pickerApi.Response.ACTION];
          if (action !== pickerApi.Action.PICKED) {
            return;
          }

          const docs = data[pickerApi.Response.DOCUMENTS] as GooglePickerResponse[] | undefined;
          const selectedFolder = docs?.[0];
          const selectedId = selectedFolder?.[pickerApi.Document.ID];
          const selectedName = selectedFolder?.[pickerApi.Document.NAME];

          if (typeof selectedId === "string") {
            setFolderId(selectedId);
          }

          if (typeof selectedName === "string") {
            setFolderName(selectedName);
            setStatusTone("info");
            setStatus(`Selected ${selectedName}.`);
          }
        });

      const supportDrives = pickerApi.Feature.SUPPORT_DRIVES;
      if (supportDrives) {
        builder.enableFeature(supportDrives);
      }

      builder.build().setVisible(true);
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to open Google Picker.");
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <>
      <label>
        <span>Drive folder</span>
        <div className="picker-row">
          <input
            className="input"
            data-private
            disabled={disabled}
            name="sourceFolderName"
            readOnly
            required
            value={folderName}
          />
          <button
            className="button"
            disabled={disabled || isOpening}
            onClick={openPicker}
            type="button"
          >
            {isOpening ? "Opening..." : "Choose folder"}
          </button>
        </div>
        <small className="field-hint">
          Use Picker to grant RelayRoom access to the selected folder.
        </small>
      </label>
      <label>
        <span>Drive folder ID</span>
        <input
          className="input"
          data-private
          disabled={disabled}
          name="sourceFolderId"
          placeholder="Choose a folder with Picker"
          readOnly
          required
          value={folderId}
        />
        {status ? (
          <small className={`field-hint ${statusTone}`}>{status}</small>
        ) : (
          <small className="field-hint">Folder IDs are filled only by Google Picker.</small>
        )}
      </label>
    </>
  );
}

async function fetchPickerToken(): Promise<PickerConfig> {
  const response = await fetch("/api/oauth/drive/picker-token", {
    cache: "no-store"
  });
  const payload = (await response.json()) as PickerTokenResponse;

  if (!response.ok || payload.error) {
    throw new Error(pickerErrorMessage(payload.error));
  }

  if (!payload.accessToken || !payload.apiKey || !payload.appId) {
    throw new Error("Google Picker is missing required configuration.");
  }

  return {
    accessToken: payload.accessToken,
    apiKey: payload.apiKey,
    appId: payload.appId
  };
}

function loadPickerScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]'
    );

    const loadPicker = () => {
      window.gapi?.load("picker", resolve);
    };

    if (existingScript) {
      loadPicker();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = loadPicker;
    script.onerror = () => reject(new Error("Unable to load Google Picker."));
    document.body.appendChild(script);
  });
}

function pickerErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    MissingDriveConnection: "Connect Google Drive before choosing a folder.",
    MissingGooglePickerApiKey: "Add GOOGLE_PICKER_API_KEY to .env before using Picker.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing.",
    TokenRefreshFailed: "Google could not refresh the Drive token. Reconnect Drive and try again.",
    Unauthorized: "Log in before choosing a Drive folder."
  };

  return messages[error || ""] || "Unable to prepare Google Picker.";
}
