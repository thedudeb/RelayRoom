"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// Privacy selector that gates Unlisted → Public behind a deliberate two-step
// modal (SPEC §4.3). The modal names the pipeline + destination channel, plainly
// warns about searchability, and requires either typing the pipeline name or
// pressing a labelled "Yes, make public" action — same form field name
// (publicPrivacyConfirmationText) the server checks against.

const UNLISTED = "UNLISTED";
const PUBLIC = "PUBLIC";

export function PrivacyPicker({
  defaultValue = UNLISTED,
  disabled,
  pipelineNameInputName = "name",
  destinationChannelName,
  fallbackPipelineName
}: {
  defaultValue?: "UNLISTED" | "PUBLIC";
  disabled?: boolean;
  // Form input name to read the live pipeline-name value from (so the modal
  // can echo what the user typed for "Engineering Standups", etc.).
  pipelineNameInputName?: string;
  destinationChannelName?: string;
  // Used when editing an existing pipeline that doesn't expose a name input.
  fallbackPipelineName?: string;
}) {
  const [value, setValue] = useState<"UNLISTED" | "PUBLIC">(defaultValue);
  const [confirmationText, setConfirmationText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [pipelineName, setPipelineName] = useState(fallbackPipelineName || "");
  const selectRef = useRef<HTMLSelectElement | null>(null);

  function readLivePipelineName() {
    if (!selectRef.current) return fallbackPipelineName || "";
    const form = selectRef.current.form;
    if (!form) return fallbackPipelineName || "";
    const input = form.elements.namedItem(pipelineNameInputName) as HTMLInputElement | null;
    return input?.value?.trim() || fallbackPipelineName || "";
  }

  function onSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as "UNLISTED" | "PUBLIC";
    if (next === PUBLIC && value !== PUBLIC) {
      // Hold the dropdown on UNLISTED until the modal commits.
      event.target.value = value;
      setPipelineName(readLivePipelineName());
      setModalOpen(true);
      return;
    }
    if (next === UNLISTED) {
      setConfirmationText("");
    }
    setValue(next);
  }

  function commitPublic() {
    const trimmed = confirmationText.trim();
    if (!pipelineName || trimmed.toLowerCase() !== pipelineName.toLowerCase()) {
      return;
    }
    setValue(PUBLIC);
    setModalOpen(false);
  }

  function cancelModal() {
    setConfirmationText("");
    setModalOpen(false);
  }

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancelModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  return (
    <>
      <label>
        <span>Upload privacy</span>
        <select
          className="select"
          disabled={disabled}
          name="privacyStatus"
          onChange={onSelectChange}
          ref={selectRef}
          value={value}
        >
          <option value={UNLISTED}>Unlisted (default)</option>
          <option value={PUBLIC}>Public</option>
        </select>
        {value === PUBLIC ? (
          <small className="field-hint" style={{ color: "var(--danger)" }}>
            Public — uploads will be searchable on YouTube.
          </small>
        ) : null}
      </label>
      {/* Hidden field that the server reads to verify the confirmation step
          really happened. Server still requires the typed-name match. */}
      <input type="hidden" name="publicPrivacyConfirmationText" value={value === PUBLIC ? confirmationText : ""} />

      {modalOpen ? (
        <div className="access-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) cancelModal(); }} role="presentation">
          <section
            aria-labelledby="public-privacy-title"
            aria-modal="true"
            className="access-modal"
            role="dialog"
          >
            <div className="access-modal-icon" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 28%, var(--line))", color: "var(--warning)" }}>
              <AlertTriangle aria-hidden="true" size={28} />
            </div>
            <p className="eyebrow">Step 2 of 2 — confirm</p>
            <h2 id="public-privacy-title">Make this pipeline public on YouTube?</h2>
            <p>
              <strong>Public videos are searchable on YouTube.</strong>{" "}
              {pipelineName ? <>Future uploads from <em>{pipelineName}</em></> : "Future uploads from this pipeline"}
              {destinationChannelName ? <> to <em>{destinationChannelName}</em></> : null}{" "}
              will publish as public. Existing videos aren&apos;t changed. To confirm, type the
              pipeline name exactly:
            </p>
            <label>
              <span className="sr-only">Pipeline name to confirm</span>
              <input
                aria-label={`Type the pipeline name "${pipelineName}" to confirm`}
                autoFocus
                className="input"
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={pipelineName || "Pipeline name"}
                value={confirmationText}
              />
            </label>
            <div className="access-modal-actions">
              <button className="button" onClick={cancelModal} type="button">
                <X aria-hidden="true" size={15} />
                Cancel
              </button>
              <button
                className="button primary"
                disabled={
                  !pipelineName ||
                  confirmationText.trim().toLowerCase() !== pipelineName.toLowerCase()
                }
                onClick={commitPublic}
                type="button"
              >
                Yes, make public
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
